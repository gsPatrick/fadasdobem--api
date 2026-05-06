const axios = require('axios');
const { getAnthropicClient } = require('../../providers/anthropic/anthropic.client');
const prompts = require('../../providers/anthropic/anthropic.prompts');
const { messagesApiToolDefinitions } = require('../../providers/anthropic/anthropic.tools');
const chatwootClient = require('../../providers/chatwoot/chatwoot.client');
const AppError = require('../../utils/AppError');
const { execByName } = require('../openai/openai.functionBridge');

function defaultModelId() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
}

function maxTokens() {
  const raw = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2048;
}

function stripHtml(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(s) {
  return stripHtml(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function mergeAdjacentSameRole(items) {
  const out = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev && prev.role === item.role) {
      prev.content = `${prev.content}\n\n${item.content}`.trim();
    } else {
      out.push({ role: item.role, content: item.content });
    }
  }
  return out;
}

function mapChatwootRowToClaudeTurn(m) {
  if (!m || m.private) return null;
  if (Number(m.message_type) === 2) return null;
  const body = stripHtml(m.content || m.processed_message_content || '');
  if (!body.trim()) return null;
  if (Number(m.message_type) === 0) {
    return { role: 'user', content: body.trim() };
  }
  if (Number(m.message_type) === 1) {
    return { role: 'assistant', content: body.trim() };
  }
  return null;
}

function ensureClaudeOpensWithUser(turns) {
  const cloned = [...turns];
  while (cloned.length && cloned[0].role === 'assistant') {
    cloned.shift();
  }
  if (!cloned.length) {
    cloned.push({
      role: 'user',
      content: '[Sistema] Início da conversa — contextualize com acolhimento até o próximo texto do visitante.',
    });
  }
  return cloned;
}

async function fetchChatwootHistoryForAnthropic(accountId, conversationId) {
  const n = Number(process.env.CHATWOOT_IA_HISTORY_N);
  const targetCount = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : 30;
  try {
    return await chatwootClient.fetchRecentConversationMessagesAscending(
      accountId,
      conversationId,
      targetCount
    );
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err;
    const st = err.response?.status;
    const hint =
      st === 401 || st === 403
        ? 'Token ou permissões insuficientes para ler mensagens no Chatwoot.'
        : 'Não foi possível obter o histórico desta conversa no Chatwoot.';
    const statusCode = typeof st === 'number' && st >= 400 && st < 600 ? (st === 404 ? 404 : 502) : 502;
    throw new AppError(hint, statusCode, null, true);
  }
}

function buildAnthropicTurnsFromChatwootRows(rows, latestInboundPlaintext) {
  const mapped = [];
  for (const row of rows) {
    const turn = mapChatwootRowToClaudeTurn(row);
    if (turn && (turn.role === 'user' || turn.role === 'assistant')) mapped.push(turn);
  }
  let merged = mergeAdjacentSameRole(mapped);
  merged = ensureClaudeOpensWithUser(merged);

  const target = normalizeWhitespace(latestInboundPlaintext);
  const lastUser = [...merged].reverse().find((m) => m.role === 'user');
  if (!lastUser || normalizeWhitespace(lastUser.content) !== target) {
    merged.push({ role: 'user', content: latestInboundPlaintext.trim() });
    merged = mergeAdjacentSameRole(merged);
  }

  return ensureClaudeOpensWithUser(merged);
}

function extractAssistantPlainText(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n').trim();
}

/**
 * Lista mensagens no Chatwoot, monta turnos só com `user` / `assistant` e chama Claude.
 * O system prompt fica apenas no campo `system` da API (nunca no array `messages`).
 */
async function generateReplyFromChatwootConversation(accountId, conversationId, latestInboundPlaintext) {
  const rows = await fetchChatwootHistoryForAnthropic(accountId, conversationId);
  console.log('[AnthropicService] Histórico Chatwoot carregado:', {
    accountId,
    conversationId,
    mensagens_crudas: rows.length,
  });
  const turns = buildAnthropicTurnsFromChatwootRows(rows, latestInboundPlaintext);
  return generateReplyFromMessages(turns);
}

/**
 * Ciclo Messages API + Tool Use: ferramentas sempre enviadas em `tools` (obrigatório para o modelo com tool_use).
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} seedMessages — só user/assistant, texto corrido por turno.
 * @returns {Promise<string>}
 */
async function generateReplyFromMessages(seedMessages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return prompts.FALLBACK_IA_UNAVAILABLE;
  }

  const toolsRaw = messagesApiToolDefinitions();
  const tools = Array.isArray(toolsRaw) ? toolsRaw : [];

  try {
    const client = getAnthropicClient();
    /** Cópia mutável durante o diálogo (tool_use / tool_result). */
    let messages = (seedMessages || [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const system = `${prompts.CLAUDE_SYSTEM_INSTRUCTIONS}\n\n(Reforço contextual: ${prompts.CLAUDE_RUN_APPEND_INSTRUCTIONS_PT})`;

    const maxToolRounds = Number(process.env.ANTHROPIC_MAX_TOOL_ROUNDS) || 10;

    let lastAssistantText = '';

    for (let round = 0; round < maxToolRounds; round += 1) {
      console.log('[AnthropicService] Chamando API Anthropic / messages.create', {
        round,
        model: defaultModelId(),
        max_tokens: maxTokens(),
        toolsCount: tools.length,
        seedTurnCount: seedMessages?.length ?? 0,
        currentMessagesCount: messages.length,
      });
      // eslint-disable-next-line no-await-in-loop
      const response = await client.messages.create({
        model: defaultModelId(),
        max_tokens: maxTokens(),
        system,
        tools,
        messages,
      });

      lastAssistantText = extractAssistantPlainText(response.content) || lastAssistantText;

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
        return lastAssistantText || prompts.FALLBACK_IA_UNAVAILABLE;
      }

      if (response.stop_reason === 'max_tokens') {
        return lastAssistantText || prompts.FALLBACK_IA_UNAVAILABLE;
      }

      if (response.stop_reason !== 'tool_use') {
        console.warn('[anthropic.service] stop_reason inesperado:', response.stop_reason);
        return lastAssistantText || prompts.FALLBACK_IA_UNAVAILABLE;
      }

      const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
      if (!toolUses.length) {
        return lastAssistantText || prompts.FALLBACK_IA_UNAVAILABLE;
      }

      messages = messages.concat([{ role: 'assistant', content: response.content }]);

      const toolResultBlocks = [];
      for (const tu of toolUses) {
        const name = tu.name;
        let input = tu.input;
        if (typeof input === 'string') {
          try {
            input = JSON.parse(input || '{}');
          } catch (_) {
            input = {};
          }
        }
        // eslint-disable-next-line no-await-in-loop
        const payload = await execByName(name, input);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(payload),
        });
      }

      messages = messages.concat([{ role: 'user', content: toolResultBlocks }]);
    }

    console.error('[anthropic.service] Limite de voltas de Tool Use excedido.');
    return lastAssistantText || prompts.FALLBACK_IA_UNAVAILABLE;
  } catch (error) {
    console.error(
      '[AnthropicService] Erro na API do Claude:',
      error.response ? error.response.data : error.message
    );
    return prompts.FALLBACK_IA_UNAVAILABLE;
  }
}

module.exports = {
  generateReplyFromMessages,
  generateReplyFromChatwootConversation,
};
