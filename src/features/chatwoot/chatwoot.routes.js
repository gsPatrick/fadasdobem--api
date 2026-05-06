const { Router } = require('express');
const chatwootController = require('./chatwoot.controller');

const router = Router();

router.post('/webhook', chatwootController.handleWebhook);

module.exports = router;
