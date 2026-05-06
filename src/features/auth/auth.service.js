const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, User, Client, OTP, RefreshToken } = require('../../models');
const {
  assertJwtSecretsLoaded,
  jwtSignOptionsAccess,
  jwtSignOptionsRefresh,
  jwtVerifyOptions,
} = require('../../config/auth.config');
const AppError = require('../../utils/AppError');
const mailService = require('../../providers/mail/mail.service');

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email) {
  return `${email || ''}`.trim().toLowerCase();
}

function tokenExpiresInSecondsFromJwt(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) return null;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, decoded.exp - now);
}

function sanitizeUserRecord(userInstance) {
  if (!userInstance) return null;
  const plain = userInstance.get({ plain: true });
  delete plain.password_hash;
  return plain;
}

async function assertPasswordPolicy(plainPassword) {
  const pw = `${plainPassword ?? ''}`;
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
      400,
      null,
      true
    );
  }
}

async function issueTokenPairForUser(userRecord) {
  assertJwtSecretsLoaded();
  const subject = userRecord.id;
  const accessToken = jwt.sign(
    { sub: subject, token_use: 'access' },
    process.env.JWT_SECRET,
    jwtSignOptionsAccess()
  );
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { sub: subject, token_use: 'refresh', jti },
    process.env.JWT_REFRESH_SECRET,
    jwtSignOptionsRefresh()
  );
  const decodedRefresh = jwt.decode(refreshToken);
  const expiresAt = new Date(decodedRefresh.exp * 1000);

  await RefreshToken.create({
    user_id: subject,
    jti,
    expires_at: expiresAt,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    access_expires_in: tokenExpiresInSecondsFromJwt(accessToken),
    refresh_expires_in: tokenExpiresInSecondsFromJwt(refreshToken),
  };
}

async function revokeRefreshByJti(jti) {
  const [affected] = await RefreshToken.update(
    { revoked_at: new Date() },
    {
      where: {
        jti,
        revoked_at: null,
      },
    }
  );
  return affected;
}

async function revokeAllRefreshTokensForUser(userId) {
  await RefreshToken.update(
    { revoked_at: new Date() },
    {
      where: {
        user_id: userId,
        revoked_at: null,
      },
    }
  );
}

/**
 * POST /register
 */
async function register({ email, password, accepted_terms_version }) {
  const mail = normalizeEmail(email);
  await assertPasswordPolicy(password);
  const terms = `${accepted_terms_version ?? ''}`.trim();
  if (!terms) {
    throw new AppError('Aceite de termos (`accepted_terms_version`) é obrigatório.', 400, null, true);
  }

  const exists = await User.findOne({ where: { email: mail } });
  if (exists) {
    throw new AppError('Este e-mail já está cadastrado.', 409, null, true);
  }

  const password_hash = await bcrypt.hash(password, 12);

  let user;
  try {
    await sequelize.transaction(async (t) => {
      user = await User.create(
        {
          email: mail,
          password_hash,
          role: 'CLIENTE',
          accepted_terms_version: terms,
          accepted_terms_at: new Date(),
          onboarding_step: 1,
          is_active: true,
        },
        { transaction: t }
      );

      await Client.create(
        {
          user_id: user.id,
        },
        { transaction: t }
      );
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError || err.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('Este e-mail já está cadastrado.', 409, null, true);
    }
    throw err;
  }

  user = await User.findByPk(user.id, {
    include: [{ model: Client, as: 'client_profile', required: false }],
  });

  void mailService.sendWelcomeEmail(mail);

  const tokens = await issueTokenPairForUser(user);
  return {
    ...tokens,
    usuario: sanitizeUserRecord(user),
  };
}

/**
 * POST /login
 */
async function login({ email, password }) {
  const mail = normalizeEmail(email);
  const user = await User.findOne({
    where: { email: mail },
    include: [{ model: Client, as: 'client_profile', required: false }],
  });

  if (!user || !user.password_hash) {
    throw new AppError('Credenciais inválidas.', 401, null, true);
  }
  if (!user.is_active || user.blocked_at) {
    throw new AppError('Conta indisponível para login.', 403, null, true);
  }

  const ok = await bcrypt.compare(`${password ?? ''}`, user.password_hash);
  if (!ok) {
    throw new AppError('Credenciais inválidas.', 401, null, true);
  }

  await user.update({ last_login_at: new Date() });

  const tokens = await issueTokenPairForUser(user);
  return {
    ...tokens,
    usuario: sanitizeUserRecord(user),
  };
}

/**
 * POST /refresh-token
 */
async function refreshToken({ refresh_token }) {
  const raw = `${refresh_token ?? ''}`.trim();
  if (!raw) {
    throw new AppError('Refresh token é obrigatório.', 400, null, true);
  }

  assertJwtSecretsLoaded();
  let payload;
  try {
    payload = jwt.verify(raw, process.env.JWT_REFRESH_SECRET, jwtVerifyOptions());
  } catch (_) {
    throw new AppError('Refresh token inválido ou expirado.', 401, null, true);
  }

  if (payload.token_use !== 'refresh' || !payload.jti) {
    throw new AppError('Token de renovação malformado.', 401, null, true);
  }

  const row = await RefreshToken.findOne({
    where: {
      jti: payload.jti,
      user_id: payload.sub,
      revoked_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!row) {
    throw new AppError('Sessão de refresh inválida ou revogada.', 401, null, true);
  }

  await row.update({ revoked_at: new Date() });

  const user = await User.findByPk(payload.sub, {
    include: [{ model: Client, as: 'client_profile', required: false }],
  });

  if (!user || !user.is_active || user.blocked_at) {
    throw new AppError('Conta indisponível para renovar sessão.', 403, null, true);
  }

  const tokens = await issueTokenPairForUser(user);
  return {
    ...tokens,
    usuario: sanitizeUserRecord(user),
  };
}

/**
 * POST /logout — exige access válido (middleware) + corpo com refresh.
 */
async function logout({ refresh_token }, accessUser) {
  const raw = `${refresh_token ?? ''}`.trim();
  if (!raw) {
    throw new AppError('Informe o refresh token no corpo para encerrar a sessão com segurança.', 400, null, true);
  }

  assertJwtSecretsLoaded();
  let payload;
  try {
    payload = jwt.verify(raw, process.env.JWT_REFRESH_SECRET, jwtVerifyOptions());
  } catch (_) {
    throw new AppError('Refresh token inválido.', 401, null, true);
  }

  if (payload.token_use !== 'refresh' || `${payload.sub}` !== `${accessUser.id}`) {
    throw new AppError('Refresh token não pertence à sessão atual.', 403, null, true);
  }

  await revokeRefreshByJti(payload.jti);
  return { encerrado: true };
}

function buildNumericOtpSixDigits() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * POST /forgot-password — sempre resposta genérica.
 */
async function forgotPassword({ email }, reqMeta = {}) {
  const mail = normalizeEmail(email);
  if (!mail) {
    return {
      enviado: true,
      mensagem_simulada:
        'Se o e-mail existir em nossa base, você receberá instruções para redefinir a senha.',
    };
  }

  const user = await User.findOne({ where: { email: mail } });
  if (user && user.is_active && !user.blocked_at) {
    await OTP.update(
      { consumed_at: new Date() },
      {
        where: {
          user_id: user.id,
          purpose: 'RESET_PASSWORD',
          consumed_at: null,
        },
      }
    );

    const plainOtp = buildNumericOtpSixDigits();
    const codeHash = await bcrypt.hash(plainOtp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({
      user_id: user.id,
      purpose: 'RESET_PASSWORD',
      code: codeHash,
      expires_at: expiresAt,
      attempts_count: 0,
      max_attempts: 5,
      delivery_channel: 'EMAIL',
      ip_address_created: reqMeta.ip || null,
      user_agent_created: reqMeta.userAgent || null,
    });

    void mailService.sendOtpEmail(mail, plainOtp);
  }

  return {
    enviado: true,
    mensagem_simulada:
      'Se o e-mail existir em nossa base, você receberá instruções para redefinir a senha nos próximos minutos.',
  };
}

/**
 * POST /reset-password
 */
async function resetPassword({ email, otp, new_password }) {
  const mail = normalizeEmail(email);
  const plainOtp = `${otp ?? ''}`.trim();
  await assertPasswordPolicy(new_password);

  if (!mail || !plainOtp) {
    throw new AppError('Dados insuficientes para redefinir a senha.', 400, null, true);
  }

  const user = await User.findOne({ where: { email: mail } });
  if (!user) {
    throw new AppError('Código inválido ou expirado.', 400, null, true);
  }
  if (!user.is_active || user.blocked_at) {
    throw new AppError('Código inválido ou expirado.', 400, null, true);
  }

  const otpRow = await OTP.findOne({
    where: {
      user_id: user.id,
      purpose: 'RESET_PASSWORD',
      consumed_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
    order: [['created_at', 'DESC']],
  });

  if (!otpRow) {
    throw new AppError('Código inválido ou expirado.', 400, null, true);
  }

  if (otpRow.attempts_count >= otpRow.max_attempts) {
    throw new AppError('Número máximo de tentativas para este código foi excedido.', 429, null, true);
  }

  const match = await bcrypt.compare(plainOtp, otpRow.code);
  if (!match) {
    await otpRow.increment('attempts_count');
    await otpRow.reload();
    if (otpRow.attempts_count >= otpRow.max_attempts) {
      throw new AppError('Número máximo de tentativas para este código foi excedido.', 429, null, true);
    }
    throw new AppError('Código inválido ou expirado.', 400, null, true);
  }

  const password_hash = await bcrypt.hash(new_password, 12);
  await sequelize.transaction(async (t) => {
    await user.update({ password_hash }, { transaction: t });
    await otpRow.update({ consumed_at: new Date() }, { transaction: t });
  });

  await revokeAllRefreshTokensForUser(user.id);

  return { redefinido: true };
}

/**
 * GET /me
 */
async function getMe(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: Client, as: 'client_profile', required: false }],
  });
  if (!user) {
    throw new AppError('Usuário não encontrado.', 404, null, true);
  }
  return { usuario: sanitizeUserRecord(user) };
}

/**
 * PATCH /me — cadastro progressivo no perfil Client.
 */
async function patchMeProfile(userId, body) {
  const user = await User.findByPk(userId, {
    include: [{ model: Client, as: 'client_profile', required: false }],
  });
  if (!user) {
    throw new AppError('Usuário não encontrado.', 404, null, true);
  }
  if (user.role !== 'CLIENTE' || !user.client_profile) {
    throw new AppError('Esta conta não possui perfil de cliente editável por esta rota.', 403, null, true);
  }

  const allowed = {};
  if (typeof body.nome !== 'undefined') allowed.nome = body.nome == null ? null : `${body.nome}`.trim().slice(0, 160);
  if (typeof body.tratar_por !== 'undefined') {
    allowed.tratar_por = body.tratar_por == null ? null : `${body.tratar_por}`.trim().slice(0, 120);
  }
  if (typeof body.data_nascimento !== 'undefined') {
    allowed.data_nascimento = body.data_nascimento == null || body.data_nascimento === '' ? null : body.data_nascimento;
  }

  if (Object.keys(allowed).length === 0) {
    throw new AppError('Nenhum campo permitido enviado (nome, tratar_por, data_nascimento).', 400, null, true);
  }

  await user.client_profile.update(allowed);

  await user.reload({
    include: [{ model: Client, as: 'client_profile', required: false }],
  });

  return { usuario: sanitizeUserRecord(user) };
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  patchMeProfile,
};
