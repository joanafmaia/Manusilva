/**
 * Funções e constantes partilhadas — perfis RH / Admin (Joana, Filipa, etc.)
 */

import { UTILIZADORES } from './mock_data.js';

/** Valores aceites em user_metadata.role ou sessão local */
export const RH_ADMIN_ROLE_VALUES = new Set([
  'RH',
  'rh',
  'admin',
  'Admin',
  'ADMIN',
  'administracao',
  'Administracao',
]);

/**
 * E-mails com acesso total de RH/Admin (fallback se metadata.role estiver em falta).
 * Exclui e-mails que também existem como Técnico no catálogo local.
 */
export function getRhAdminEmails() {
  const tecnicoEmails = new Set(
    UTILIZADORES.filter((u) => u.role === 'Tecnico').map((u) => u.email.toLowerCase()),
  );
  return [
    ...new Set(
      UTILIZADORES.filter((u) => u.role === 'RH')
        .map((u) => u.email.toLowerCase())
        .filter((email) => email && !tecnicoEmails.has(email)),
    ),
  ];
}

export const RH_ADMIN_EMAILS = getRhAdminEmails();

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

const RH_ADMIN_NAMES = new Set(
  UTILIZADORES.filter((u) => u.role === 'RH').map((u) => u.nome.toLowerCase()),
);

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
