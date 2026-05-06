const axios = require('axios');
const { User } = require('../../models');
const AppError = require('../../utils/AppError');
const { catchAsyncService } = require('../../utils/catchAsync.util');
const chatwootClient = require('../../providers/chatwoot/chatwoot.client');
const openaiService = require('../openai/openai.service');
const anthropicService = require('../anthropic/anthropic.service');

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

function extractPayloadShape(body) {
  const envelope = typeof body?.payload !== 'undefined' ? body.payload : body;
  return envelope || {};
}

function isIncomingVisitorMessage(parsed) {
  const msg = parsed.message || parsed;
  const type = msg?.message_type ?? msg?.type;
  if (type === 'outgoing' || type === 1 || type === '1') return false;
  const sender = parsed.sender || msg?.sender;
  if (sender?.type && sender.type !== 'contact') return false;
  return true;
}

function extractContactId(parsed) {
  const fromSender =
    parsed.sender?.id ??
    parsed.sender?.identifier ??
    parsed.contact?.source_id ??
    parsed.contact?.identifier;
  if (fromSender != null && fromSender !== '') return String(fromSender);
  const fromConv = parsed.conversation?.meta?.sender?.id;
  if (fromConv != null) return String(fromConv);
  const contactBlock = parsed.conversation?.contacts?.[0]?.id;
  if (contactBlock != null) return String(contactBlock);
  return null;
}

function extractConversationId(parsed) {
  const c = parsed.conversation;
  const id =
    c?.id ?? parsed.conversation_id ?? parsed.message?.conversation_id ?? parsed.conversationId;
  if (id != null && id !== '') return String(id);
  return null;
}

function extractInboundText(parsed) {
  const msg = parsed.message || parsed;
  if (typeof msg?.content === 'string') return msg.content;
  if (Array.isArray(msg?.attachments) && msg.attachments.length) {
    const first = msg.attachments[0];
    if (first?.fallback_title) return first.fallback_title;
  }
  if (parsed.content) return String(parsed.content);
  return '';
}

function resolveActiveAiProvider() {
  const raw = (process.env.ACTIVE_AI_PROVIDER || 'anthropic').trim().toLowerCase();
  if (raw === 'openai' || raw === 'anthropic') return raw;
  throw new AppError(
    `Configuração ACTIVE_AI_PROVIDER inválida ("${process.env.ACTIVE_AI_PROVIDER}"). Use openai ou anthropic.`,
    500,
    null,
    true
  );
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
    if (turn) mapped.push(turn);
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

/**
 * Fluxo webhook Chatwoot → IA (OpenAI **ou** Anthropic, Strategy via env) → resposta ao canal.
 */
async function processWebhookEnvelopeImpl(rawBody) {
  const envelope = typeof rawBody === 'object' ? rawBody : {};
  const event = envelope.event || envelope.meta?.event;
  if (!event || !/^message_/i.test(String(event))) {
    return { skipped: true, reason: 'evento não é tipo message_*' };
  }

  const parsed = extractPayloadShape(envelope);
  const textContent = extractInboundText(parsed).trim();
  const conversationId = extractConversationId(parsed);
  const contactId = extractContactId(parsed);

  if (!conversationId || !contactId) {
    return { skipped: true, reason: 'ids ausentes' };
  }
  if (!isIncomingVisitorMessage(parsed)) {
    return { skipped: true, reason: 'ignoramos mensagens de agente/outgoing' };
  }
  if (!textContent) {
    return { skipped: true, reason: 'mensagem sem texto utilizável' };
  }

  const user = await User.findOne({
    where: {
      chatwoot_contact_id: contactId,
    },
  });

  if (!user) {
    console.warn('[chatwoot.service] usuário não mapeado contact_id=', contactId);
    return { skipped: true, reason: 'sem User com chatwoot_contact_id igual' };
  }

  await user.update({ chatwoot_conversation_id: conversationId });

  const accountId = `${process.env.CHATWOOT_ACCOUNT_ID || ''}`.trim();
  if (!accountId) {
    throw new AppError('CHATWOOT_ACCOUNT_ID não configurado.', 500, null, true);
  }

  const provider = resolveActiveAiProvider();
  let reply;

  if (provider === 'openai') {
    reply = await openaiService.replyForUserPlainText(user, textContent);
  } else {
    const rows = await fetchChatwootHistoryForAnthropic(accountId, conversationId);
    const turns = buildAnthropicTurnsFromChatwootRows(rows, textContent);
    reply = await anthropicService.generateReplyFromMessages(turns);
  }

  try {
    await chatwootClient.postTextReply(accountId, conversationId, reply);
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err;
    throw new AppError(
      'Não conseguimos publicar a resposta da IA nesta conversa do Chatwoot.',
      502,
      null,
      true
    );
  }

  return {
    replied: true,
    provedor_ia: provider,
    userId: user.id,
    conversationId,
  };
}

const processWebhookEnvelope = catchAsyncService(processWebhookEnvelopeImpl);

module.exports = {
  processWebhookEnvelope,
};
