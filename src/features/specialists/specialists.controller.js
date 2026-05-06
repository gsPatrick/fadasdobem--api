const specialistsService = require('./specialists.service');
const { responderSucesso } = require('../../utils/response.util');
const { catchAsyncRoute } = require('../../utils/catchAsync.util');

module.exports = {
  list: catchAsyncRoute(async (req, res) => {
    const dados = await specialistsService.listForVitrine(req.query);
    return responderSucesso(res, dados, 'Listagem de especialistas.', 200);
  }),
};
