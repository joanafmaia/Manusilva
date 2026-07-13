/**
 * Perfis RH / Admin — rotas serverless (CommonJS).
 * Config sincronizada com npm run sync:rh-config.
 */

// >>> RH_CONFIG_START (npm run sync:rh-config)
const RH_CONFIG = {
  "roleValues": [
    "RH",
    "rh",
    "admin",
    "Admin",
    "ADMIN",
    "administracao",
    "Administracao"
  ],
  "emails": [
    "joanamaia97@gmail.com",
    "filipa@sistema.com",
    "filipa@rh.manusilva.internal"
  ],
  "names": [
    "joana",
    "filipa"
  ]
};
// <<< RH_CONFIG_END

const RH_ADMIN_ROLE_VALUES = new Set(RH_CONFIG.roleValues);
const RH_ADMIN_EMAILS = RH_CONFIG.emails.map((email) => email.toLowerCase());
const RH_ADMIN_NAMES = new Set(RH_CONFIG.names.map((name) => name.toLowerCase()));

function normalizeDbRole(role) {
  const raw = String(role ?? '').trim();
  if (!raw) return null;
  if (RH_ADMIN_ROLE_VALUES.has(raw) || raw.toLowerCase() === 'rh') return 'RH';
  if (raw === 'Tecnico' || raw.toLowerCase() === 'tecnico' || raw === 'technician') {
    return 'Tecnico';
  }
  if (raw === 'Armazem' || raw.toLowerCase() === 'armazem' || raw === 'warehouse') {
    return 'Armazem';
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
  return isRhOrAdminEmail(user.email);
}

module.exports = {
  RH_ADMIN_EMAILS,
  isRhOrAdminAuthUser,
  isRhOrAdminRole,
  isRhOrAdminEmail,
  normalizeDbRole,
};
