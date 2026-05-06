const { getAnthropicClient } = require('../../providers/anthropic/anthropic.client');
const prompts = require('../../providers/anthropic/anthropic.prompts');
const { messagesApiToolDefinitions } = require('../../providers/anthropic/anthropic.tools');
const { execByName } = require('../openai/openai.functionBridge');

function defaultModelId() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
}

function maxTokens() {
  const raw = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2048;
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
 * Ciclo Messages API + Tool Use: até `end_turn`, `max_tokens` ou limite de voltas por ferramentas.
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} seedMessages já normalizadas (texto corrido por turno).
 * @returns {Promise<string>}
 */
async function generateReplyFromMessages(seedMessages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return prompts.FALLBACK_IA_UNAVAILABLE;
  }

  try {
    const client = getAnthropicClient();
    const tools = messagesApiToolDefinitions();
    /** Cópia mutável durante o diálogo (blocos multimodais + tool UX). */
    let messages = seedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const system = `${prompts.CLAUDE_SYSTEM_INSTRUCTIONS}\n\n(Reforço contextual: ${prompts.CLAUDE_RUN_APPEND_INSTRUCTIONS_PT})`;

    const maxToolRounds = Number(process.env.ANTHROPIC_MAX_TOOL_ROUNDS) || 10;

    let lastAssistantText = '';

    for (let round = 0; round < maxToolRounds; round += 1) {
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
  } catch (err) {
    console.error('[anthropic.service]', err?.message || err);
    return prompts.FALLBACK_IA_UNAVAILABLE;
  }
}

module.exports = {
  generateReplyFromMessages,
};
