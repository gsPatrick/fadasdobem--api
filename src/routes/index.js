const { Router } = require('express');
const authRoutes = require('../features/auth/auth.routes');
const chatwootRoutes = require('../features/chatwoot/chatwoot.routes');
const evolutionRoutes = require('../features/evolution/evolution.routes');
const { responderSucesso } = require('../utils/response.util');

const router = Router();

router.use('/v1/auth', authRoutes);
router.use('/v1/chatwoot', chatwootRoutes);
router.use('/v1/evolution-admin', evolutionRoutes);

router.get('/health', (_req, res) => {
  return responderSucesso(res, { modulo: 'api', agrupamento: '/' }, 'Rota de pré-vôo disponível.', 200);
});

router.get('/v1/health', (_req, res) => {
  return responderSucesso(
    res,
    { ok: true, servico: 'fadasdobem-api', versao: 'v1' },
    'Confirmação de rotas versionadas bem-sucedida.',
    200
  );
});

module.exports = router;
