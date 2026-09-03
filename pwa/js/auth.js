/**
 * Manusilva PWA — Autenticação Supabase Auth (técnicos e RH)
 */

import { getSupabaseClient } from './supabase-client.js';
import { clearAuthStorage, clearSession, getRawSession, normalizeSession, setRawSession } from './session.js';

/** Página de login da PWA (não existe login.html separado). */
export const LOGIN_URL = 'index.html';
import { UTILIZADORES } from './mock_data.js';
import {
  isRhOrAdminEmail,
  isRhOrAdminRole,
  normalizeDbRole,
  resolveRoleForLoginFilter,
} from './auth-roles-core.js';

export const AUTH_BUILD = '2026-08-06-rh-rls-align';

/** Domínio fictício para login só com nome de utilizador (sem e-mail real). */
export const SYSTEM_LOGIN_EMAIL_DOMAIN = 'sistema.com';

/** Sufixo legado RH (contas antigas no Supabase Auth). */
export const LEGACY_RH_LOGIN_EMAIL_DOMAIN = 'rh.manusilva.internal';

const TECHNICIAN_IDS = {
  'filipasilvahugo2013@gmail.com': 'tech-1',
  'filipeg409@gmail.com': 'tech-2',
  'adeltonair@gmail.com': 'tech-3',
};

function technicianIdFor(user) {
  if (user.role === 'Armazem') {
    if (user.technicianId) return user.technicianId;
    return null;
  }
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
    semEmailPessoal: Boolean(u.semEmailPessoal),
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
        semEmailPessoal: Boolean(u.semEmailPessoal),
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
 * Lista de e-mails a tentar no Supabase Auth (por ordem).
 * O perfil (Técnico/RH) valida-se depois do login — não bloqueia a resolução do e-mail.
 *
 * @param {string} identifier
 * @returns {string[]}
 */
export function resolveLoginEmailCandidates(identifier) {
  const term = String(identifier || '').trim();
  if (!term) return [];

  const seen = new Set();
  const out = [];
  const push = (email) => {
    const e = String(email || '').trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  };

  if (term.includes('@')) {
    push(term);
    return out;
  }

  const slug = term.toLowerCase().replace(/\s+/g, '');
  const matches = buildLoginPool().filter((u) => u.nome.toLowerCase() === term.toLowerCase());

  for (const m of matches) {
    if (m.email) push(m.email);
  }

  if (slug) {
    push(`${slug}@${SYSTEM_LOGIN_EMAIL_DOMAIN}`);
    if (matches.some((m) => m.semEmailPessoal)) {
      push(`${slug}@${LEGACY_RH_LOGIN_EMAIL_DOMAIN}`);
    }
  }

  return out;
}

/**
 * Primeiro e-mail candidato para login (compatibilidade).
 * @param {string} identifier
 */
export function resolveLoginEmail(identifier, _roleFiltro = null) {
  const candidates = resolveLoginEmailCandidates(identifier);
  return candidates[0] || null;
}

/** Utilizador RH sem e-mail pessoal — login só por nome; sem recuperação por e-mail. */
export function userUsesNameOnlyLogin(identifier, roleFiltro = null) {
  const candidates = resolveLoginEmailCandidates(identifier);
  if (!candidates.length) return false;
  const pool = buildLoginPool();
  return candidates.some((email) =>
    pool.some(
      (u) =>
        u.email?.toLowerCase() === email &&
        (!roleFiltro || u.role === roleFiltro) &&
        u.semEmailPessoal === true,
    ),
  );
}

export function resolveDisplayNameForHint(identifier, _roleFiltro = null) {
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
  const normalizedFilter = normalizeDbRole(roleFiltro);
  const fromPool = buildLoginPool().find(
    (u) =>
      u.email.toLowerCase() === email &&
      (!normalizedFilter || normalizeDbRole(u.role) === normalizedFilter),
  );
  const normalizedMetaRole = normalizeDbRole(meta.role);
  const poolMatch = buildLoginPool().find((u) => u.email.toLowerCase() === email);
  // RH só por metadata.role ou e-mail allowlist (igual a public.is_rh_admin / migração 036).
  // Nome («Filipa») resolve o e-mail no login — não concede role sozinho.
  const baseRole = isRhOrAdminRole(meta.role)
    ? 'RH'
    : isRhOrAdminEmail(email)
      ? 'RH'
      : normalizedMetaRole === 'Armazem' || normalizeDbRole(poolMatch?.role) === 'Armazem'
        ? 'Armazem'
        : normalizedMetaRole === 'Tecnico'
          ? 'Tecnico'
          : technicianIdFor({ email, role: 'Tecnico' })
            ? 'Tecnico'
            : null;
  let role = resolveRoleForLoginFilter(baseRole, normalizedFilter);
  const nome = meta.nome || meta.name || fromPool?.nome || email;
  const technicianId = meta.technician_id || meta.technicianId || null;

  if (normalizedFilter === 'RH' && role === 'RH') {
    /* RH/Admin — OK */
  } else if (normalizedFilter === 'Armazem' && role === 'Armazem') {
    /* Armazém usa as mesmas contas técnicas */
  } else if (normalizedFilter && role && role !== normalizedFilter) {
    return {
      error:
        normalizedFilter === 'RH'
          ? 'Esta conta não tem acesso de Recursos Humanos.'
          : normalizedFilter === 'Armazem'
            ? 'Esta conta não tem acesso de Armazém.'
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

const TRANSIENT_AUTH_RETRY_MS = 800;

const MSG_TRANSIENT_AUTH =
  'O servidor de autenticação não respondeu a tempo. A palavra-passe não foi recusada — tente novamente daqui a uns segundos.';

function isInvalidCredentialsError(err) {
  const msg = String(err?.message || err?.code || '').toLowerCase();
  return msg.includes('invalid login credentials') || msg.includes('invalid_credentials');
}

/** Timeout, 5xx ou falha de rede — não é palavra-passe errada. */
export function isTransientAuthError(err) {
  if (!err) return false;
  if (isInvalidCredentialsError(err)) return false;
  const status = Number(err.status ?? err.statusCode ?? 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const name = String(err.name || '');
  if (name === 'AuthRetryableFetchError' || name === 'AbortError') return true;
  const msg = String(err.message || err.error_description || err.code || '').toLowerCase();
  if (msg.includes('email not confirmed')) return false;
  return /(?:\b|http\s)(?:408|425|429|500|502|503|504)\b|gateway|timeout|timed out|failed to fetch|networkerror|load failed|authretryable|temporarily unavailable|overloaded|sdk supabase não carregou/.test(
    msg,
  );
}

export function formatAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (isInvalidCredentialsError(err)) {
    return 'Utilizador ou palavra-passe incorretos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme o seu e-mail antes de entrar.';
  }
  if (msg.includes('too many requests') || Number(err?.status) === 429) {
    return 'Demasiadas tentativas. Aguarde alguns minutos.';
  }
  if (isTransientAuthError(err)) {
    return MSG_TRANSIENT_AUTH;
  }
  return err?.message || 'Não foi possível iniciar sessão.';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signInWithPasswordOnce(supabase, email, password) {
  try {
    return await supabase.auth.signInWithPassword({ email, password });
  } catch (err) {
    return { data: { user: null, session: null }, error: err };
  }
}

async function signInWithPasswordRetry(supabase, email, password) {
  const first = await signInWithPasswordOnce(supabase, email, password);
  if (!first.error || !isTransientAuthError(first.error)) return first;
  await delay(TRANSIENT_AUTH_RETRY_MS);
  return signInWithPasswordOnce(supabase, email, password);
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
    const candidates = resolveLoginEmailCandidates(identifier);

    if (!candidates.length || !pass) {
      return {
        success: false,
        error: 'Utilizador ou palavra-passe incorretos.',
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        success: false,
        error: 'Sem ligação à internet. Verifique a rede e tente novamente.',
        transient: true,
      };
    }

    let supabase;
    try {
      supabase = await getSupabaseClient();
    } catch (err) {
      return {
        success: false,
        error: formatAuthError(err),
        transient: true,
      };
    }

    let data = null;
    let lastError = null;
    let usedEmail = candidates[0];

    for (const email of candidates) {
      const result = await signInWithPasswordRetry(supabase, email, pass);
      if (!result.error && result.data?.user) {
        data = result.data;
        usedEmail = email;
        break;
      }
      lastError = result.error;
      if (!isInvalidCredentialsError(result.error)) break;
    }

    if (!data?.user) {
      return {
        success: false,
        error: formatAuthError(lastError),
        email: usedEmail,
        transient: isTransientAuthError(lastError),
      };
    }

    const profile = profileFromAuthUser(data.user, roleFiltro);
    if (profile.error) {
      await supabase.auth.signOut();
      return { success: false, error: profile.error, email: usedEmail };
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
      email: usedEmail,
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
    await forceLogout();
  },

  getSessao() {
    return getRawSession();
  },

  buildLoginPool,
};

const LOGOUT_REMOTE_TIMEOUT_MS = 3000;

/**
 * Termina sessão de forma à prova de falhas: limpa storage e redireciona sempre.
 */
export async function forceLogout() {
  try {
    let supabase = null;
    try {
      if (window.supabase?.createClient) {
        supabase = await Promise.race([
          getSupabaseClient(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao obter cliente Supabase')), LOGOUT_REMOTE_TIMEOUT_MS),
          ),
        ]);
      }
    } catch (innerErr) {
      console.warn('Erro ao obter cliente Supabase no logout:', innerErr);
    }

    if (supabase?.auth) {
      try {
        const { teardownAdminRealtime } = await import('./admin-realtime.js');
        await teardownAdminRealtime();
      } catch {
        /* painel técnico não carrega este módulo */
      }
      try {
        const { teardownTechRealtime } = await import('./tech-realtime.js');
        await teardownTechRealtime();
      } catch {
        /* painel RH não carrega este módulo */
      }

      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout signOut Supabase')), LOGOUT_REMOTE_TIMEOUT_MS),
        ),
      ]);
    }
  } catch (err) {
    console.warn('Erro ao limpar sessão no Supabase, a forçar limpeza local...', err);
  } finally {
    try {
      clearAuthStorage();
    } catch (storageErr) {
      console.warn('[Auth] Limpeza de storage falhou, a tentar clearSession:', storageErr);
      try {
        clearSession();
      } catch {
        /* ignorar — o redirect abaixo continua */
      }
    }
    window.location.href = LOGIN_URL;
  }
}

export function initLogoutButton() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    void forceLogout();
  });
}

export function renderUserGreeting(containerId) {
  const session = normalizeSession(AuthService.getSessao());
  const el = document.getElementById(containerId);
  if (el && session) {
    el.textContent = session.name;
  }
}
