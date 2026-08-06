/**
 * Sessão do utilizador (localStorage) — sem dependências pesadas.
 */

import { ARMAZEM_AUTH_EMAIL } from './mock_data.js';
import { mapDbRoleToUi } from './auth-roles-core.js';

export const APP_SESSION_KEY = 'app_session';
const LEGACY_SESSION_KEY = 'manusilva_session';
export const AUTH_STORAGE_KEYS = [APP_SESSION_KEY, LEGACY_SESSION_KEY];

const TECHNICIAN_IDS = {
  'filipasilvahugo2013@gmail.com': 'tech-1',
  'filipeg409@gmail.com': 'tech-2',
  'adeltonair@gmail.com': 'tech-3',
};

export function normalizeSession(sessao) {
  if (!sessao) return null;
  const role = mapDbRoleToUi(sessao.role);
  const email = (sessao.email || '').toLowerCase();
  return {
    username: sessao.email,
    name: sessao.nome,
    role,
    technicianId:
      sessao.technicianId ??
      (role === 'technician'
        ? TECHNICIAN_IDS[email] || null
        : role === 'warehouse' && email && email !== ARMAZEM_AUTH_EMAIL.toLowerCase()
          ? TECHNICIAN_IDS[email] || null
          : null),
    token: sessao.token,
    refreshToken: sessao.refreshToken,
    loginAt: sessao.loginAt,
  };
}

export function getRawSession() {
  const raw = localStorage.getItem(APP_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[ManuSilva] Sessão corrompida no localStorage; a limpar.', err);
    clearSession();
    return null;
  }
}

export function getSession() {
  const parsed = getRawSession();
  return parsed ? normalizeSession(parsed) : null;
}

export function clearSession() {
  localStorage.removeItem(APP_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
}

export function clearAuthStorage() {
  clearSession();
}

export function setRawSession(sessao) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify(sessao));
}
