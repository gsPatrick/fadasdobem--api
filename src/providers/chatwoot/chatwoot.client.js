const axios = require('axios');

/** Base sanitizada (.env pode ou não incluir slash final). */
function baseChatwootUrl() {
  const raw = process.env.CHATWOOT_BASE_URL || '';
  return raw.replace(/\/+$/, '');
}

function buildHttp() {
  const token = process.env.CHATWOOT_API_ACCESS_TOKEN;
  const baseURL = `${baseChatwootUrl()}/api/v1`;
  return axios.create({
    baseURL,
    headers: {
      ...(token ? { api_access_token: token } : {}),
    },
    timeout: 20_000,
  });
}

/**
 * POST mensagem numa conversa Chatwoot (App API — token do usuário bot/agente).
 */
async function postOutboundMessage(accountId, conversationId, body) {
  const http = buildHttp();
  const path = `/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(
    conversationId
  )}/messages`;
  return http.post(path, body);
}

/** Resposta de agente para o visitante (`outgoing`). */
async function postTextReply(accountId, conversationId, plainText) {
  return postOutboundMessage(accountId, conversationId, {
    content: plainText,
    message_type: 'outgoing',
    private: false,
  });
}

/**
 * GET `/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`
 * — params `after` / `before` conforme MessageFinder do Chatwoot.
 */
async function listConversationMessages(accountId, conversationId, query = {}) {
  const http = buildHttp();
  const path = `/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(
    conversationId
  )}/messages`;
  return http.get(path, { params: query });
}

function dedupeMessagesById(list) {
  const map = new Map();
  for (const m of list) {
    if (m && m.id != null) map.set(m.id, m);
  }
  return [...map.values()];
}

/**
 * Monta janela cronológica (mais antiga → mais recente) com até `targetCount` mensagens.
 * Mesma semântica do `MessageFinder` backend: sem params = últimas 20 asc; `before` = lote mais antigo.
 */
async function fetchRecentConversationMessagesAscending(accountId, conversationId, targetCount) {
  const collected = [];
  let beforeId;
  const maxPages = 40;

  for (let page = 0; page < maxPages && collected.length < targetCount; page += 1) {
    const params = beforeId != null ? { before: beforeId } : {};
    // eslint-disable-next-line no-await-in-loop
    const { data } = await listConversationMessages(accountId, conversationId, params);
    const chunk = Array.isArray(data.payload) ? data.payload : [];
    if (!chunk.length) break;

    const sortedChunk = [...chunk].sort((a, b) => a.created_at - b.created_at);
    collected.unshift(...sortedChunk);
    beforeId = sortedChunk[0].id;
    if (chunk.length < 20) break;
  }

  const deduped = dedupeMessagesById(collected);
  deduped.sort((a, b) => a.created_at - b.created_at);
  return deduped.slice(-targetCount);
}

module.exports = {
  baseChatwootUrl,
  buildHttp,
  postOutboundMessage,
  postTextReply,
  listConversationMessages,
  fetchRecentConversationMessagesAscending,
};
