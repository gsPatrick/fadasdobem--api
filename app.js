const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./src/routes');
const { sequelize } = require('./src/config/database');
const notFoundMiddleware = require('./src/middlewares/notFound.middleware');
const errorHandlerMiddleware = require('./src/middlewares/errorHandler.middleware');
const { responderSucesso } = require('./src/utils/response.util');
const { warmupAssistantsSilent } = require('./src/providers/openai/openai.setup');
const { API_VERSION_SEMVER } = require('./src/config/version');
require('./src/models');

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api', routes);

app.get('/ping', (_req, res) => {
  return responderSucesso(
    res,
    { pong: true, versao: API_VERSION_SEMVER },
    'pong',
    200
  );
});

app.get('/health', (_req, res) => {
  return responderSucesso(
    res,
    { servico: 'fadasdobem-api', versao: API_VERSION_SEMVER, porta: Number(port) },
    'API disponível.',
    200
  );
});

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

async function start() {
  try {
    await sequelize.authenticate();
    if (process.env.SEQUELIZE_SYNC === 'true') {
      await sequelize.sync({ alter: false });
    }
    warmupAssistantsSilent().catch((e) =>
      console.warn('[openai.setup] Aquecimento do assistente ignorado:', e.message)
    );

    app.listen(port, () => {
      console.log(`API escutando na porta ${port}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar a API:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
