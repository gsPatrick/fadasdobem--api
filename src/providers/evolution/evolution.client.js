const axios = require('axios');

function sanitizeBase(raw) {
  return (raw || '').replace(/\/+$/, '');
}

/** Cliente Axios pré-configurado com `apikey` global Evolution. */
function buildHttp() {
  const baseURL = sanitizeBase(process.env.EVOLUTION_API_BASE_URL || '');
  const apikey = process.env.EVOLUTION_GLOBAL_API_KEY || '';
  return axios.create({
    baseURL,
    headers: {
      ...(apikey ? { apikey } : {}),
    },
    timeout: 30_000,
  });
}

async function rawRequest(method, path, data = undefined, extraHeaders = {}) {
  const http = buildHttp();
  return http.request({
    url: path.replace(/^\//, ''),
    method,
    data,
    headers: { ...extraHeaders },
  });
}

/** Lista instâncias visíveis à API-key (útil ao painel admin). */
async function fetchInstances() {
  const { data } = await rawRequest('get', '/instance/fetchInstances');
  return data;
}

async function instanceCreate(payload) {
  const { data } = await rawRequest('post', '/instance/create', payload);
  return data;
}

async function restartInstance(instanceName) {
  const { data } = await rawRequest(
    'put',
    `/instance/restart/${encodeURIComponent(instanceName)}`
  );
  return data;
}

async function qrCodeReconnect(instanceName) {
  const { data } = await rawRequest(
    'get',
    `/instance/connect/${encodeURIComponent(instanceName)}`
  );
  return data;
}

module.exports = {
  buildHttp,
  rawRequest,
  fetchInstances,
  instanceCreate,
  restartInstance,
  qrCodeReconnect,
};
