const { getResend } = require('./resend.client');
const otpEmailHtml = require('./templates/otp.template');
const welcomeEmailHtml = require('./templates/welcome.template');

function resolveFromHeader() {
  return (process.env.EMAIL_FROM || '').trim();
}

/**
 * OTP de recuperação — falhas apenas em log (nunca propaga erro).
 */
async function sendOtpEmail(to, code) {
  try {
    const resend = getResend();
    const from = resolveFromHeader();
    if (!resend || !from) {
      console.error('[mail.service] Envio OTP não configurado — defina RESEND_API_KEY e EMAIL_FROM.');
      return;
    }

    const toAddress = `${to ?? ''}`.trim();
    if (!toAddress) {
      console.error('[mail.service] Destinatário OTP vazio.');
      return;
    }

    const html = otpEmailHtml(code, '10 minutos');
    await resend.emails.send({
      from,
      to: toAddress,
      subject: 'Fadas do Bem — código para redefinir sua senha',
      html,
    });
  } catch (err) {
    console.error('[mail.service] Falha ao enviar e-mail de OTP:', err?.message || err);
  }
}

/**
 * Boas-vindas — falhas apenas em log.
 */
async function sendWelcomeEmail(to) {
  try {
    const resend = getResend();
    const from = resolveFromHeader();
    if (!resend || !from) {
      console.error('[mail.service] Envio de boas-vindas não configurado — RESEND_API_KEY ou EMAIL_FROM ausente.');
      return;
    }

    const toAddress = `${to ?? ''}`.trim();
    if (!toAddress) {
      console.error('[mail.service] Destinatário welcome vazio.');
      return;
    }

    const html = welcomeEmailHtml(toAddress);
    await resend.emails.send({
      from,
      to: toAddress,
      subject: 'Bem-vinda às Fadas do Bem',
      html,
    });
  } catch (err) {
    console.error('[mail.service] Falha ao enviar e-mail de boas-vindas:', err?.message || err);
  }
}

module.exports = {
  sendOtpEmail,
  sendWelcomeEmail,
};
