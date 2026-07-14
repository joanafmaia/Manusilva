/**
 * Política de destinatários para /api/enviar-email.
 * Relatórios técnicos: só e-mail do cliente ou mesmo domínio corporativo na BD.
 * Propostas MS.015: RH indica o destinatário manualmente — qualquer e-mail válido.
 */

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.pt',
  'live.com',
  'live.pt',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'sapo.pt',
  'mail.ru',
  'protonmail.com',
  'proton.me',
  'aol.com',
]);

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function isValidEmailAddress(email) {
  const v = normalizeEmail(email);
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function extractEmailDomain(email) {
  const norm = normalizeEmail(email);
  const at = norm.lastIndexOf('@');
  return at >= 0 ? norm.slice(at + 1) : '';
}

function isFreeEmailDomain(domain) {
  return FREE_EMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

/**
 * @param {string} to
 * @param {string|null|undefined} registeredEmail — e-mail na ficha do cliente
 * @param {Set<string>} clientDomains — domínios corporativos de clientes na BD
 * @param {{ allowManualRecipients?: boolean }} [options]
 */
function isRecipientAllowed(to, registeredEmail, clientDomains, options = {}) {
  const toNorm = normalizeEmail(to);
  if (!isValidEmailAddress(toNorm)) return false;

  if (options.allowManualRecipients) return true;

  const regNorm = normalizeEmail(registeredEmail);
  if (regNorm && toNorm === regNorm) return true;

  if (!regNorm) return false;

  const toDomain = extractEmailDomain(toNorm);
  const regDomain = extractEmailDomain(regNorm);
  if (!toDomain || !regDomain || toDomain !== regDomain) return false;
  if (isFreeEmailDomain(toDomain)) return false;

  return clientDomains.has(toDomain);
}

module.exports = {
  FREE_EMAIL_DOMAINS,
  normalizeEmail,
  isValidEmailAddress,
  extractEmailDomain,
  isFreeEmailDomain,
  isRecipientAllowed,
};
