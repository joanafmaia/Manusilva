/**
 * Variáveis Supabase obrigatórias nas rotas API (sem fallback hardcoded).
 */

function getSupabaseUrl() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  if (!url) {
    throw new Error('SUPABASE_URL em falta nas variáveis de ambiente.');
  }
  return url;
}

function getSupabaseAnonKey() {
  const key = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
  if (!key) {
    throw new Error('SUPABASE_ANON_KEY em falta nas variáveis de ambiente.');
  }
  return key;
}

module.exports = {
  getSupabaseUrl,
  getSupabaseAnonKey,
};
