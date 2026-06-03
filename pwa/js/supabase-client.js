/**
 * Cliente Supabase (browser) — requer o script CDN em index.html / admin.html / dashboard.html
 */

const SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';
/** Chave anon (public) — Supabase → Settings → API. Não uses a secret key aqui. */
const SUPABASE_KEY = 'COLOQUE_AQUI_A_CHAVE_ANON_DO_SUPABASE';

let supabaseClient = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined' || !window.supabase?.createClient) {
    throw new Error(
      'SDK Supabase não carregado. Adicione o script CDN antes dos módulos da app.',
    );
  }
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}
