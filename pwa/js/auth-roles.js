/**
 * Funções e constantes partilhadas — perfis RH / Admin (Joana, Filipa, etc.)
 * E-mails/nomes sincronizados com a API via pwa/shared/rh-admin-config.json.
 */

import rhConfig from './rh-admin-config.js';

/** Valores aceites em user_metadata.role ou sessão local */
export const RH_ADMIN_ROLE_VALUES = new Set(rhConfig.roleValues);

export const RH_ADMIN_EMAILS = rhConfig.emails.map((email) => email.toLowerCase());

const RH_ADMIN_NAMES = new Set(rhConfig.names.map((name) => name.toLowerCase()));

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
