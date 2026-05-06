const prompts = require('../../providers/openai/openai.prompts');
const workflow = require('./openai.workflow');

/**
 * Façade usada pelos outros módulos (ex.: webhook Chatwoot).
 * Delega Threads + Runs ao `openai.workflow`.
 */
async function replyForUserPlainText(userRecord, plaintext) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return prompts.FALLBACK_IA_UNAVAILABLE;
    }
    return await workflow.generateAssistantReply(userRecord, plaintext);
  } catch (err) {
    console.error('[openai.service]', err.message);
    return prompts.FALLBACK_IA_UNAVAILABLE;
  }
}

module.exports = {
  replyForUserPlainText,
};
