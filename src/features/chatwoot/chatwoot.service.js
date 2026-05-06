const axios = require('axios');
const crypto = require('crypto');
const { UniqueConstraintError } = require('sequelize');
const { User } = require('../../models');
const AppError = require('../../utils/AppError');
const { catchAsyncService } = require('../../utils/catchAsync.util');
const chatwootClient = require('../../providers/chatwoot/chatwoot.client');
const openaiService = require('../openai/openai.service');
const anthropicService = require('../anthropic/anthropic.service');

function extractPayloadShape(body) {
  const envelope = typeof body?.payload !== 'undefined' ? body.payload : body;
  return envelope || {};
}

/**
 * Tipos de sender reportados pelo Chatwoot (payload varia por canal / versão).
 */
function resolveSenderTypes(parsed, envelope) {
  const msgBlock = parsed.message || parsed;
  const senderDirect = parsed.sender || msgBlock?.sender;
  return {
    messageSenderType: msgBlock?.sender?.type ?? null,
    topLevelSenderType: senderDirect?.type ?? null,
    conversationMetaSenderType:
      parsed.conversation?.meta?.sender?.type ?? envelope?.conversation?.meta?.sender?.type ?? null,
  };
}

function isMessageCreatedEvent(eventStr) {
  return `${eventStr}`.trim().toLowerCase() === 'message_created';
}

function isIncomingVisitorMessage(parsed) {
  const msg = parsed.message || parsed;
  const mt = msg?.message_type ?? msg?.type;
  if (mt === 'outgoing' || mt === 1 || mt === '1') return false;
  const senderType =
    msg?.sender?.type ?? parsed.sender?.type ?? parsed.conversation?.meta?.sender?.type;
  if (String(senderType || '').toLowerCase() !== 'contact') return false;
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

/** Liga/desliga envio da resposta IA ao Chatwoot (`true`/`1`/`yes`/`on` = ativo). Vazio ou `false` = inativo (útil em dev). */
function isChatwootIaAutoReplyEnabled() {
  const raw = `${process.env.CHATWOOT_IA_AUTO_REPLY || ''}`.trim().toLowerCase();
  if (!raw) return false;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return ['true', '1', 'yes', 'on'].includes(raw);
}

/** E-mail sintético único: modelo `User` exige email + validação isEmail até haver cadastro completo. */
function buildProvisionalEmailForChatwoot(contactId) {
  const h = crypto.createHash('sha256').update(String(contactId), 'utf8').digest('hex');
  return `chatwoot.${h.slice(0, 48)}@provisional.fadasdobem.app`;
}

/**
 * Garante mapeamento contact_id ↔ User: cadastro provisório CLIENTE se ainda não existir.
 */
async function findOrCreateUserByChatwootContact(contactId, conversationId) {
  const cid = String(contactId);
  let user = await User.findOne({
    where: { chatwoot_contact_id: cid },
  });

  if (user) {
    await user.update({ chatwoot_conversation_id: String(conversationId) });
    return user;
  }

  const email = buildProvisionalEmailForChatwoot(cid);

  try {
    user = await User.create({
      email,
      password_hash: null,
      role: 'CLIENTE',
      chatwoot_contact_id: cid,
      chatwoot_conversation_id: String(conversationId),
    });
    console.log('[ChatwootService] Cadastro provisório CLIENTE criado.', {
      userId: user.id,
      chatwoot_contact_id: cid,
    });
    return user;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      user = await User.findOne({ where: { chatwoot_contact_id: cid } });
      if (user) {
        await user.update({ chatwoot_conversation_id: String(conversationId) });
        return user;
      }
    }
    throw err;
  }
}

/**
 * Fluxo webhook Chatwoot → IA (OpenAI **ou** Anthropic, Strategy via env) → resposta ao canal.
 */
async function processWebhookEnvelopeImpl(rawBody) {
  const envelope = typeof rawBody === 'object' ? rawBody : {};
  const event = envelope.event || envelope.meta?.event;
  const parsed = extractPayloadShape(envelope);
  const senderInfo = resolveSenderTypes(parsed, envelope);

  console.log('[ChatwootService] Webhook recebido:', {
    event: event ?? null,
    sender: senderInfo,
  });

  if (!event || !isMessageCreatedEvent(event)) {
    return { skipped: true, reason: 'evento não é message_created' };
  }

  const textContent = extractInboundText(parsed).trim();
  const conversationId = extractConversationId(parsed);
  const contactId = extractContactId(parsed);

  if (!conversationId || !contactId) {
    return { skipped: true, reason: 'ids ausentes' };
  }
  if (!isIncomingVisitorMessage(parsed)) {
    return { skipped: true, reason: 'ignoramos mensagens de agente/outgoing ou sender ≠ contact' };
  }
  if (!textContent) {
    return { skipped: true, reason: 'mensagem sem texto utilizável' };
  }

  if (!isChatwootIaAutoReplyEnabled()) {
    console.log(
      '[ChatwootService] Resposta automática pela IA desligada (CHATWOOT_IA_AUTO_REPLY≠true); nada será enviado ao Chatwoot.'
    );
    return {
      skipped: true,
      reason: 'CHATWOOT_IA_AUTO_REPLY não habilitado (defina true no .env para a IA responder)',
      ia_auto_reply: false,
    };
  }

  console.log('[ChatwootService] Mensagem de humano recebida. Chamando IA...', {
    conversationId,
    contactId,
  });

  const user = await findOrCreateUserByChatwootContact(contactId, conversationId);

  const accountId = `${process.env.CHATWOOT_ACCOUNT_ID || ''}`.trim();
  if (!accountId) {
    throw new AppError('CHATWOOT_ACCOUNT_ID não configurado.', 500, null, true);
  }

  const provider = resolveActiveAiProvider();
  let reply;

  if (provider === 'openai') {
    reply = await openaiService.replyForUserPlainText(user, textContent);
  } else {
    reply = await anthropicService.generateReplyFromChatwootConversation(
      accountId,
      conversationId,
      textContent
    );
  }

  try {
    await chatwootClient.postTextReply(accountId, conversationId, reply);
    console.log('[ChatwootClient] Resposta enviada com sucesso!');
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
