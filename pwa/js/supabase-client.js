/**
 * Cliente Supabase (browser) — requer o script CDN em index.html / admin.html / dashboard.html
 */

import { clearAuthStorage, clearSession, getRawSession, setRawSession } from './session.js';

const SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';
/** Chave anon (public) — Supabase → Settings → API. Não uses a secret key aqui. */
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZmJlenJldm9zbWJtY2J5c2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTQxMTMsImV4cCI6MjA5NTk3MDExM30.eUXiUiBVxoULll4LICBLLmEtBWZ0zqBHuW_W7-nB4Wc';

const LOGIN_URL = 'index.html';

let supabaseClient = null;
let redirectingToLogin = false;

function waitForSupabaseSdk(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) {
      resolve(window.supabase);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase?.createClient) {
        clearInterval(timer);
        resolve(window.supabase);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            'SDK Supabase não carregou. Confirme o script CDN antes dos módulos.',
          ),
        );
      }
    }, 50);
  });
}

function isLoginPage() {
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  return page === '' || page === 'index.html';
}

/** Erros irrecuperáveis de sessão (refresh token revogado / expirado). */
export function isFatalAuthSessionError(error) {
  if (!error) return false;

  const msg = String(
    error.message || error.error_description || error.msg || '',
  ).toLowerCase();
  const status = Number(error.status ?? error.statusCode ?? 0);

  if (
    msg.includes('refresh token') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found')
  ) {
    return true;
  }

  if (
    (status === 400 || status === 401) &&
    (msg.includes('session') || msg.includes('jwt') || msg.includes('token'))
  ) {
    return true;
  }

  return false;
}

/**
 * Limpa storage morto e redireciona para login (evita app em estado quebrado).
 * @param {string} [reason]
 */
export function handleFatalAuthSessionError(reason) {
  if (redirectingToLogin) return;

  console.warn(
    '[Supabase] Sessão expirada totalmente. A redirecionar para o login...',
    reason || '',
  );

  redirectingToLogin = true;
  supabaseClient = null;

  try {
    clearAuthStorage();
  } catch (err) {
    console.warn('[Supabase] clearSession:', err);
  }

  if (isLoginPage()) {
    redirectingToLogin = false;
    return;
  }

  window.location.href = LOGIN_URL;
}

/** Mantém `app_session.token` alinhado com o JWT ativo do Supabase (após refresh). */
function persistAppSessionTokens(session) {
  if (!session?.access_token) return;
  const raw = getRawSession();
  if (!raw) return;
  const refreshToken = session.refresh_token || raw.refreshToken || '';
  if (raw.token === session.access_token && raw.refreshToken === refreshToken) return;
  setRawSession({
    ...raw,
    token: session.access_token,
    refreshToken,
  });
}

export async function getSupabaseClient() {
  const sdk = await waitForSupabaseSdk();
  if (!supabaseClient) {
    supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

async function validateSupabaseSession(supabase, session) {
  if (!session?.access_token) return session;

  const { error: userError } = await supabase.auth.getUser();
  if (userError && isFatalAuthSessionError(userError)) {
    handleFatalAuthSessionError(userError.message);
    return null;
  }
  if (userError) return null;

  const { data } = await supabase.auth.getSession();
  return data?.session || session;
}

/** Garante que o JWT da sessão local está ativo no cliente Supabase (RLS authenticated). */
export async function ensureSupabaseAuthSession() {
  const supabase = await getSupabaseClient();

  const { data: existing, error: getError } = await supabase.auth.getSession();
  if (getError && isFatalAuthSessionError(getError)) {
    handleFatalAuthSessionError(getError.message);
    return null;
  }

  if (existing?.session?.access_token) {
    const validated = await validateSupabaseSession(supabase, existing.session);
    if (validated?.access_token) {
      persistAppSessionTokens(validated);
    }
    return validated;
  }

  const appSession = getRawSession();
  const token = appSession?.token;
  const refreshToken = appSession?.refreshToken;
  if (!token || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: refreshToken,
  });

  if (error) {
    console.warn('[Supabase] setSession a partir de app_session:', error.message);
    if (isFatalAuthSessionError(error)) {
      handleFatalAuthSessionError(error.message);
    }
    return null;
  }

  const validated = await validateSupabaseSession(supabase, data?.session || null);
  if (validated?.access_token) {
    persistAppSessionTokens(validated);
  }
  return validated;
}

/** JWT válido para APIs serverless (`/api/enviar-email`, etc.). */
export async function getFreshAccessToken() {
  const session = await ensureSupabaseAuthSession();
  if (!session?.access_token) return null;
  persistAppSessionTokens(session);
  return session.access_token;
}

/**
 * Cliente Supabase com sessão authenticated ativa (obrigatório após lockdown RLS anon).
 */
export async function getAuthenticatedSupabaseClient() {
  const session = await ensureSupabaseAuthSession();
  const supabase = await getSupabaseClient();

  if (!session?.access_token) {
    if (!redirectingToLogin) {
      handleFatalAuthSessionError('Sessão Supabase em falta ou inválida.');
    }
    const err = new Error(
      'Sessão Supabase em falta. A redirecionar para o login…',
    );
    err.code = 'AUTH_SESSION_MISSING';
    throw err;
  }

  return supabase;
}
