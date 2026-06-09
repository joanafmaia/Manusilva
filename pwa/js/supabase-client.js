/**
 * Cliente Supabase (browser) — requer o script CDN em index.html / admin.html / dashboard.html
 */

import { getRawSession } from './session.js';

const SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';
/** Chave anon (public) — Supabase → Settings → API. Não uses a secret key aqui. */
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZmJlenJldm9zbWJtY2J5c2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTQxMTMsImV4cCI6MjA5NTk3MDExM30.eUXiUiBVxoULll4LICBLLmEtBWZ0zqBHuW_W7-nB4Wc';

let supabaseClient = null;

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

export async function getSupabaseClient() {
  const sdk = await waitForSupabaseSdk();
  if (!supabaseClient) {
    supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

/** Garante que o JWT da sessão local está ativo no cliente Supabase (RLS authenticated). */
export async function ensureSupabaseAuthSession() {
  const supabase = await getSupabaseClient();
  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session?.access_token) return existing.session;

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
    return null;
  }

  return data?.session || null;
}
