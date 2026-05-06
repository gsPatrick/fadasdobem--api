/**
 * Domínios de e-mail descartáveis (R14). Atualizar periodicamente.
 * Comparação case-insensitive; subdomínios de um domínio bloqueado também são bloqueados.
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'trashmail.com',
  'yopmail.com',
  'getnada.com',
  'maildrop.cc',
  'sharklasers.com',
  'dispostable.com',
  'temp-mail.org',
  'throwaway.email',
  'mailnesia.com',
  'fakeinbox.com',
  'trashmail.net',
  'emailondeck.com',
  'mailcatch.com',
];

const DISPOSABLE_SET = new Set(DISPOSABLE_EMAIL_DOMAINS.map((d) => d.toLowerCase()));

/**
 * @param {string} domain — domínio já em minúsculas (ex.: `mailinator.com`)
 */
function isDisposableEmailDomain(domain) {
  const d = `${domain || ''}`.trim().toLowerCase();
  if (!d) return false;
  if (DISPOSABLE_SET.has(d)) return true;
  for (const blocked of DISPOSABLE_EMAIL_DOMAINS) {
    const b = blocked.toLowerCase();
    if (d === b || d.endsWith(`.${b}`)) return true;
  }
  return false;
}

/**
 * @param {string} normalizedEmail — e-mail já normalizado (`trim` + `toLowerCase`)
 */
function isDisposableEmailAddress(normalizedEmail) {
  const at = `${normalizedEmail || ''}`.lastIndexOf('@');
  if (at < 1) return false;
  return isDisposableEmailDomain(normalizedEmail.slice(at + 1));
}

module.exports = {
  DISPOSABLE_EMAIL_DOMAINS,
  isDisposableEmailDomain,
  isDisposableEmailAddress,
};
