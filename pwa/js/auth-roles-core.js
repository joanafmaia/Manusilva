/**
 * Funções e constantes partilhadas — perfis RH / Admin (Joana, Filipa, etc.)
 * E-mails/nomes sincronizados com a API via pwa/shared/rh-admin-config.json.
 */

// >>> RH_CONFIG_START (npm run sync:rh-config)
const RH_CONFIG = {
  roleValues: [
    'RH',
    'rh',
    'admin',
    'Admin',
    'ADMIN',
    'administracao',
    'Administracao',
  ],
  emails: ['joanamaia97@gmail.com', 'filipa@sistema.com', 'filipa@rh.manusilva.internal'],
  names: ['joana', 'filipa'],
};
// <<< RH_CONFIG_END

/** Valores aceites em user_metadata.role ou sessão local */
export const RH_ADMIN_ROLE_VALUES = new Set(RH_CONFIG.roleValues);

export const RH_ADMIN_EMAILS = RH_CONFIG.emails.map((email) => email.toLowerCase());

const RH_ADMIN_NAMES = new Set(RH_CONFIG.names.map((name) => name.toLowerCase()));

/** @deprecated usar RH_ADMIN_EMAILS (lista sincronizada com a API) */
export function getRhAdminEmails() {
  return [...RH_ADMIN_EMAILS];
}

export function normalizeDbRole(role) {
  const raw = String(role ?? '').trim();
  if (!raw) return null;
  if (RH_ADMIN_ROLE_VALUES.has(raw) || raw.toLowerCase() === 'rh') return 'RH';
  if (raw === 'Tecnico' || raw.toLowerCase() === 'tecnico' || raw === 'technician') {
    return 'Tecnico';
  }
  return raw;
}

export function isRhOrAdminRole(role) {
  return normalizeDbRole(role) === 'RH';
}

export function isRhOrAdminEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  return normalized ? RH_ADMIN_EMAILS.includes(normalized) : false;
}

export function isRhOrAdminName(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  return normalized ? RH_ADMIN_NAMES.has(normalized) : false;
}

/** Utilizador Supabase Auth (resposta /auth/v1/user) */
export function isRhOrAdminAuthUser(user) {
  if (!user) return false;
  const meta = user.user_metadata || {};
  if (isRhOrAdminRole(meta.role)) return true;
  if (isRhOrAdminName(meta.nome || meta.name)) return true;
  return isRhOrAdminEmail(user.email);
}

/** Sessão normalizada (session.js → role admin | technician) */
export function isRhOrAdminSession(session) {
  if (!session) return false;
  if (session.role === 'admin') return true;
  if (isRhOrAdminRole(session.role)) return true;
  if (isRhOrAdminName(session.name)) return true;
  return isRhOrAdminEmail(session.username || session.email);
}

/** Exposto para testes de sincronização com a API */
export function getRhAdminConfigSnapshot() {
  return {
    roleValues: [...RH_CONFIG.roleValues],
    emails: [...RH_CONFIG.emails],
    names: [...RH_CONFIG.names],
  };
}
