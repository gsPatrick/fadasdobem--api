/**
 * Tool Use (Claude) — equivalente semântico a `openai.tools.js` / function calling.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 */

const check_balance = {
  name: 'check_balance',
  description:
    'Consulta o saldo aproximado da carteira em BRL para o cliente autenticado no contexto operacional atual (ficcional até integrar ledger).',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

function messagesApiToolDefinitions() {
  return [check_balance];
}

module.exports = {
  messagesApiToolDefinitions,
  check_balance,
};
