/**
 * Sessão do utilizador (localStorage) — sem dependências pesadas.
 */

export const APP_SESSION_KEY = 'app_session';
const LEGACY_SESSION_KEY = 'manusilva_session';

const TECHNICIAN_IDS = {
  'filipasilvahugo2013@gmail.com': 'tech-1',
  'filipeg409@gmail.com': 'tech-2',
  'adeltonair@gmail.com': 'tech-3',
};

export function normalizeSession(sessao) {
  if (!sessao) return null;
  const role =
    sessao.role === 'Tecnico' ? 'technician' : sessao.role === 'RH' ? 'admin' : sessao.role;
  const email = (sessao.email || '').toLowerCase();
  return {
    username: sessao.email,
    name: sessao.nome,
    role,
    technicianId:
      sessao.technicianId ?? (role === 'technician' ? TECHNICIAN_IDS[email] || null : null),
    token: sessao.token,
    loginAt: sessao.loginAt,
  };
}

export function getSession() {
  const raw = localStorage.getItem(APP_SESSION_KEY);
  return raw ? normalizeSession(JSON.parse(raw)) : null;
}

export function clearSession() {
  localStorage.removeItem(APP_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
}

export function setRawSession(sessao) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify(sessao));
}
