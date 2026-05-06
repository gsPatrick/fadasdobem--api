const authService = require('./auth.service');
const { responderSucesso } = require('../../utils/response.util');
const { catchAsyncRoute } = require('../../utils/catchAsync.util');

module.exports = {
  register: catchAsyncRoute(async (req, res) => {
    const dados = await authService.register(req.body);
    return responderSucesso(res, dados, 'Conta criada com sucesso.', 201);
  }),

  login: catchAsyncRoute(async (req, res) => {
    const dados = await authService.login(req.body);
    return responderSucesso(res, dados, 'Login realizado com sucesso.', 200);
  }),

  refreshToken: catchAsyncRoute(async (req, res) => {
    const dados = await authService.refreshToken(req.body);
    return responderSucesso(res, dados, 'Tokens renovados com sucesso.', 200);
  }),

  logout: catchAsyncRoute(async (req, res) => {
    const dados = await authService.logout(req.body, req.user);
    return responderSucesso(res, dados, 'Sessão encerrada com sucesso.', 200);
  }),

  forgotPassword: catchAsyncRoute(async (req, res) => {
    const dados = await authService.forgotPassword(req.body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return responderSucesso(
      res,
      dados,
      'Se o e-mail existir, enviaremos instruções de recuperação em instantes.',
      200
    );
  }),

  resetPassword: catchAsyncRoute(async (req, res) => {
    const dados = await authService.resetPassword(req.body);
    return responderSucesso(res, dados, 'Senha redefinida com sucesso.', 200);
  }),

  getMe: catchAsyncRoute(async (req, res) => {
    const dados = await authService.getMe(req.user.id);
    return responderSucesso(res, dados, 'Perfil carregado.', 200);
  }),

  patchMe: catchAsyncRoute(async (req, res) => {
    const dados = await authService.patchMeProfile(req.user.id, req.body);
    return responderSucesso(res, dados, 'Perfil atualizado.', 200);
  }),
};
