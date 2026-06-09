/**
 * Manusilva PWA — Autenticação Supabase Auth (técnicos e RH)
 */

import { getSupabaseClient } from './supabase-client.js';
import { APP_SESSION_KEY, clearSession, normalizeSession, setRawSession } from './session.js';
import { UTILIZADORES } from './mock_data.js';
import { isRhOrAdminRole, normalizeDbRole } from './auth-roles.js';

export const AUTH_BUILD = '2026-06-03-supabase-auth';

const TECHNICIAN_IDS = {
  'filipasilvahugo2013@gmail.com': 'tech-1',
  'filipeg409@gmail.com': 'tech-2',
  'adeltonair@gmail.com': 'tech-3',
};

function technicianIdFor(user) {
  if (user.role !== 'Tecnico') return null;
  if (user.technicianId) return user.technicianId;
  return TECHNICIAN_IDS[String(user.email || '').toLowerCase()] || null;
}

/** Catálogo local para resolver nome → e-mail e metadados de perfil */
function buildLoginPool() {
  const pool = UTILIZADORES.map((u) => ({
    nome: u.nome,
    email: u.email,
    role: u.role,
    technicianId: u.technicianId || null,
  }));

  try {
    const raw = localStorage.getItem('manusilva_db');
    if (!raw) return pool;
    const db = JSON.parse(raw);
    (db.utilizadores || []).forEach((u) => {
      if (!u?.email) return;
      const entry = {
        nome: u.nome,
        email: u.email,
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
    /* mantém pool base */
  }

  return pool;
}

/**
 * Resolve nome ou e-mail para o e-mail usado no Supabase Auth.
 * @param {string} identifier
 * @param {string|null} roleFiltro `Tecnico` | `RH`
 */
export function resolveLoginEmail(identifier, roleFiltro = null) {
  const term = String(identifier || '').trim().toLowerCase();
  if (!term) return null;

  if (term.includes('@')) return term;

  const matches = buildLoginPool().filter((u) => u.nome.toLowerCase() === term);
  if (!matches.length) return null;
  if (roleFiltro) {
    const filtered = matches.find((u) => u.role === roleFiltro);
    return filtered?.email.toLowerCase() || null;
  }
  return matches[0].email.toLowerCase();
}

/** Utilizador RH sem e-mail pessoal — login só por nome; sem recuperação por e-mail. */
export function userUsesNameOnlyLogin(identifier, roleFiltro = null) {
  const email = resolveLoginEmail(identifier, roleFiltro);
  if (!email) return false;
  const pool = buildLoginPool();
  const match = pool.find(
    (u) =>
      u.email?.toLowerCase() === email &&
      (!roleFiltro || u.role === roleFiltro) &&
      u.semEmailPessoal === true,
  );
  return Boolean(match);
}

export function resolveDisplayNameForHint(identifier, roleFiltro = null) {
  const term = String(identifier || '').trim();
  if (!term) return '';
  if (term.includes('@')) {
    const pool = buildLoginPool();
    const match = pool.find((u) => u.email.toLowerCase() === term.toLowerCase());
    return match?.nome || term.split('@')[0];
  }
  return term;
}

function profileFromAuthUser(user, roleFiltro) {
  const meta = user.user_metadata || {};
  const email = (user.email || '').toLowerCase();
  const fromPool = buildLoginPool().find((u) => u.email.toLowerCase() === email);

  const rawRole = meta.role || fromPool?.role;
  const role = normalizeDbRole(rawRole) || rawRole;
  const nome = meta.nome || meta.name || fromPool?.nome || email;
  const technicianId =
    meta.technician_id || meta.technicianId || fromPool?.technicianId || null;

  if (roleFiltro === 'RH' && isRhOrAdminRole(rawRole)) {
    /* RH/Admin — OK */
  } else if (roleFiltro && role && role !== roleFiltro) {
    return {
      error:
        roleFiltro === 'RH'
          ? 'Esta conta não tem acesso de Recursos Humanos.'
          : 'Esta conta não tem acesso de Técnico.',
    };
  }

  if (!role) {
    return { error: 'Perfil não configurado. Contacte o RH.' };
  }

  return {
    nome,
    email: user.email,
    role,
    technicianId: technicianId || technicianIdFor({ email, role, technicianId }),
  };
}

function formatAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Utilizador ou palavra-passe incorretos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme o seu e-mail antes de entrar.';
  }
  if (msg.includes('too many requests')) {
    return 'Demasiadas tentativas. Aguarde alguns minutos.';
  }
  return err?.message || 'Não foi possível iniciar sessão.';
}

export const AuthService = {
  /**
   * Login Supabase Auth (e-mail + palavra-passe).
   * @param {string} identifier Nome ou e-mail
   * @param {string} password
   * @param {string|null} [roleFiltro] `Tecnico` ou `RH`
   */
  async login(identifier, password, roleFiltro = null) {
    const pass = String(password || '').trim();
    const email = resolveLoginEmail(identifier, roleFiltro);

    if (!email || !pass) {
      return {
        success: false,
        error: 'Utilizador ou palavra-passe incorretos.',
      };
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      return {
        success: false,
        error: formatAuthError(error),
        email,
      };
    }

    const profile = profileFromAuthUser(data.user, roleFiltro);
    if (profile.error) {
      await supabase.auth.signOut();
      return { success: false, error: profile.error, email };
    }

    const sessao = {
      nome: profile.nome,
      email: profile.email,
      role: profile.role,
      technicianId: profile.technicianId,
      token: data.session?.access_token || '',
      refreshToken: data.session?.refresh_token || '',
      loginAt: new Date().toISOString(),
      authBuild: AUTH_BUILD,
    };

    setRawSession(sessao);

    return {
      success: true,
      user: sessao,
      email,
    };
  },

  async requestPasswordReset(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return { success: false, error: 'E-mail inválido para redefinição.' };
    }

    const supabase = await getSupabaseClient();
    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}index.html`;

    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo,
    });

    if (error) {
      console.error('[Auth] resetPasswordForEmail:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  async logout() {
    try {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] signOut:', err);
    }
    clearSession();
  },

  getSessao() {
    const sessao = localStorage.getItem(APP_SESSION_KEY);
    return sessao ? JSON.parse(sessao) : null;
  },

  buildLoginPool,
};

export function initLogoutButton() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await AuthService.logout();
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
