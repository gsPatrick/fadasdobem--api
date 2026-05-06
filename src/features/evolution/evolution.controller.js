const evolutionService = require('./evolution.service');
const { responderSucesso } = require('../../utils/response.util');

async function listInstances(_req, res, next) {
  try {
    const snapshot = await evolutionService.summarizeInstancesSafe();
    return responderSucesso(res, { instancias: snapshot }, 'Instâncias resumidas com sucesso.', 200);
  } catch (err) {
    return next(err);
  }
}

async function reconnectInstance(req, res, next) {
  try {
    const { instanceName } = req.params;
    const raw = await evolutionService.refreshQrArtifacts(instanceName);
    return responderSucesso(res, raw, 'Solicitação de reconexão disparada.', 202);
  } catch (err) {
    return next(err);
  }
}

async function probeIntegration(_req, res, next) {
  try {
    const snapshot = await evolutionService.summarizeInstancesSafe();
    return responderSucesso(
      res,
      { alcancavel: true, resumoInstancias: snapshot },
      'Integração Evolution alcançada.',
      200
    );
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listInstances,
  reconnectInstance,
  probeIntegration,
};
