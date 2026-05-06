const authService = require('./auth.service');
const { responderSucesso } = require('../../utils/response.util');
const { catchAsyncRoute } = require('../../utils/catchAsync.util');

function reqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

module.exports = {
  register: catchAsyncRoute(async (req, res) => {
    const dados = await authService.register(req.body, reqMeta(req));
    return responderSucesso(res, dados, 'Conta criada com sucesso.', 201);
  }),

  login: catchAsyncRoute(async (req, res) => {
    const dados = await authService.login(req.body, reqMeta(req));
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
    const dados = await authService.forgotPassword(req.body, reqMeta(req));
    return responderSucesso(
      res,
      dados,
      'Se o e-mail existir, enviaremos instruções de recuperação em instantes.',
      200
    );
  }),

  resetPassword: catchAsyncRoute(async (req, res) => {
    const dados = await authService.resetPassword(req.body, reqMeta(req));
    return responderSucesso(res, dados, 'Senha redefinida com sucesso.', 200);
  }),

  verifyEmail: catchAsyncRoute(async (req, res) => {
    const dados = await authService.verifyEmailFromToken(req.query.token, reqMeta(req));
    return responderSucesso(res, dados, dados.mensagem || 'E-mail confirmado.', 200);
  }),

  resendVerification: catchAsyncRoute(async (req, res) => {
    const dados = await authService.resendVerificationEmail(req.user, reqMeta(req));
    return responderSucesso(res, dados, 'Se aplicável, reenviamos o e-mail de confirmação.', 200);
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
