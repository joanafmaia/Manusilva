/**
 * Cliente Supabase (browser) — requer o script CDN antes dos módulos.
 * Use a chave **publishable** (`sb_publishable_...`) ou **anon** (`eyJ...`).
 * Nunca uses `sb_secret_` aqui (só servidor).
 */

const SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';

/** Cola aqui a chave publishable/anon do painel Supabase → Settings → API Keys */
const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.MANUSILVA_SUPABASE_ANON_KEY) ||
  'COLOQUE_AQUI_A_CHAVE_PUBLISHABLE_OU_ANON';

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
            'SDK Supabase não carregou. Confirme o script CDN em index.html / admin.html / dashboard.html.',
          ),
        );
      }
    }, 50);
  });
}

export function validateSupabaseConfig() {
  const key = String(SUPABASE_ANON_KEY || '').trim();

  if (!key || key.includes('COLOQUE')) {
    throw new Error(
      'Chave Supabase em falta. Em pwa/js/supabase-client.js define SUPABASE_ANON_KEY com a chave publishable (sb_publishable_...) ou anon (eyJ...).',
    );
  }

  if (key.startsWith('sb_secret_')) {
    throw new Error(
      'Estás a usar sb_secret_ no browser. Copia a chave publishable (sb_publishable_...) ou anon (eyJ...) em Settings → API Keys.',
    );
  }

  return { url: SUPABASE_URL, key };
}

export async function getSupabaseClient() {
  const { url, key } = validateSupabaseConfig();
  const sdk = await waitForSupabaseSdk();

  if (!supabaseClient) {
    supabaseClient = sdk.createClient(url, key);
  }
  return supabaseClient;
}
