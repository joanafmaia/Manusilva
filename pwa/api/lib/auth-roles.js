/**
 * Perfis RH / Admin — rotas serverless (CommonJS).
 * E-mails/nomes: pwa/shared/rh-admin-config.json (gerar com npm run sync:rh-config).
 */

const rhConfig = require('../../shared/rh-admin-config.json');

const RH_ADMIN_ROLE_VALUES = new Set(rhConfig.roleValues);
const RH_ADMIN_EMAILS = rhConfig.emails.map((email) => email.toLowerCase());
const RH_ADMIN_NAMES = new Set(rhConfig.names.map((name) => name.toLowerCase()));

function normalizeDbRole(role) {
  const raw = String(role ?? '').trim();
  if (!raw) return null;
  if (RH_ADMIN_ROLE_VALUES.has(raw) || raw.toLowerCase() === 'rh') return 'RH';
  if (raw === 'Tecnico' || raw.toLowerCase() === 'tecnico' || raw === 'technician') {
    return 'Tecnico';
  }
  return raw;
}

function isRhOrAdminRole(role) {
  return normalizeDbRole(role) === 'RH';
}

function isRhOrAdminEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  return normalized ? RH_ADMIN_EMAILS.includes(normalized) : false;
}

function isRhOrAdminName(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  return normalized ? RH_ADMIN_NAMES.has(normalized) : false;
}

function isRhOrAdminAuthUser(user) {
  if (!user) return false;
  const meta = user.user_metadata || {};
  if (isRhOrAdminRole(meta.role)) return true;
  if (isRhOrAdminName(meta.nome || meta.name)) return true;
  return isRhOrAdminEmail(user.email);
}

module.exports = {
  RH_ADMIN_EMAILS,
  isRhOrAdminAuthUser,
  isRhOrAdminRole,
  isRhOrAdminEmail,
  normalizeDbRole,
};
