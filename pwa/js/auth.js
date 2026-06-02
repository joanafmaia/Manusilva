/**
 * Manusilva PWA — Autenticação (mock de desenvolvimento)
 * Validação por nome ou e-mail.
 */

import { APP_SESSION_KEY, clearSession, normalizeSession, setRawSession } from './session.js';

export const AUTH_BUILD = '2026-05-30-v3';

/** Dados reais da equipa para simulação em desenvolvimento */
const EQUIPA_MOCK = [
  { nome: 'Hugo', email: 'filipasilvahugo2013@gmail.com', password: '12345', role: 'Tecnico' },
  { nome: 'Filipe', email: 'filipeg409@gmail.com', password: '12345', role: 'Tecnico' },
  { nome: 'Adelton', email: 'adeltonair@gmail.com', password: '12345', role: 'Tecnico' },
  { nome: 'Joana', email: 'joanamaia97@gmail.com', password: '12345', role: 'RH' },
  { nome: 'Filipa', email: 'filipasilvahugo2013@gmail.com', password: '12345', role: 'RH' },
];

const TECHNICIAN_IDS = {
  'filipasilvahugo2013@gmail.com': 'tech-1',
  'filipeg409@gmail.com': 'tech-2',
  'adeltonair@gmail.com': 'tech-3',
};

function technicianIdFor(user) {
  if (user.role !== 'Tecnico') return null;
  if (user.technicianId) return user.technicianId;
  return TECHNICIAN_IDS[user.email.toLowerCase()] || null;
}

/** Equipa base + técnicos/RH registados no painel (localStorage) */
function buildLoginPool() {
  const pool = EQUIPA_MOCK.map((u) => ({ ...u }));

  try {
    const raw = localStorage.getItem('manusilva_db');
    if (!raw) return pool;
    const db = JSON.parse(raw);
    (db.utilizadores || []).forEach((u) => {
      if (!u?.email || !u.password) return;
      const entry = {
        nome: u.nome,
        email: u.email,
        password: u.password,
        role: u.role,
        technicianId: u.technicianId || null,
      };
      const idx = pool.findIndex(
        (p) =>
          p.email.toLowerCase() === entry.email.toLowerCase() && p.role === entry.role,
      );
      if (idx >= 0) pool[idx] = { ...pool[idx], ...entry };
      else pool.push(entry);
    });
  } catch {
    /* mantém pool demo */
  }

  return pool;
}

function findUtilizador(termoNormalizado, password, roleFiltro) {
  const pass = password.trim();
  const matches = buildLoginPool().filter(
    (u) =>
      (u.email.toLowerCase() === termoNormalizado || u.nome.toLowerCase() === termoNormalizado) &&
      u.password === pass,
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  if (roleFiltro) return matches.find((u) => u.role === roleFiltro) || null;
  return matches[0];
}

export const AuthService = {
  /**
   * Simula a validação de login no cliente (aceita nome ou e-mail).
   * @param {string} identifier Nome ou e-mail
   * @param {string} password
   * @param {string} [roleFiltro] `Tecnico` ou `RH` — necessário quando o e-mail é partilhado
   */
  async login(identifier, password, roleFiltro = null) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const termoNormalizado = String(identifier || '').trim().toLowerCase();
    const pass = String(password || '').trim();

    if (!termoNormalizado || !pass) {
      return {
        success: false,
        error: 'Utilizador ou palavra-passe incorretos.',
      };
    }

    const utilizador = findUtilizador(termoNormalizado, pass, roleFiltro);

    if (!utilizador) {
      return {
        success: false,
        error: 'Utilizador ou palavra-passe incorretos.',
      };
    }

    const sessao = {
      nome: utilizador.nome,
      email: utilizador.email,
      role: utilizador.role,
      technicianId: utilizador.technicianId || technicianIdFor(utilizador),
      token: `demo-jwt-token-id-${Math.random().toString(36).slice(2)}`,
      loginAt: new Date().toISOString(),
      authBuild: AUTH_BUILD,
    };

    setRawSession(sessao);

    return {
      success: true,
      user: sessao,
    };
  },

  logout() {
    clearSession();
  },

  getSessao() {
    const sessao = localStorage.getItem(APP_SESSION_KEY);
    return sessao ? JSON.parse(sessao) : null;
  },
};

export function initLogoutButton() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    AuthService.logout();
    window.location.href = 'index.html';
  });
}

export function renderUserGreeting(containerId) {
  const session = normalizeSession(AuthService.getSessao());
  const el = document.getElementById(containerId);
  if (el && session) {
    el.textContent = session.name;
  }
}
