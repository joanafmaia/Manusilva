/**
 * Variáveis Supabase nas rotas API — env do deploy ou supabase-public-config.js (build).
 */

let publicConfig = null;
let publicConfigLoaded = false;

function loadPublicConfig() {
  if (publicConfigLoaded) return publicConfig;
  publicConfigLoaded = true;
  try {
    publicConfig = require('./supabase-public-config');
  } catch {
    publicConfig = null;
  }
  return publicConfig;
}

function getSupabaseUrl() {
  const fallback = loadPublicConfig();
  const url = String(process.env.SUPABASE_URL || fallback?.supabaseUrl || '').trim();
  if (!url) {
    throw new Error(
      'SUPABASE_URL em falta. Configure na Vercel ou execute npm run sync:api-config.',
    );
  }
  return url;
}

function getSupabaseAnonKey() {
  const fallback = loadPublicConfig();
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      fallback?.supabaseAnonKey ||
      '',
  ).trim();
  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY em falta. Configure na Vercel ou execute npm run sync:api-config.',
    );
  }
  return key;
}

module.exports = {
  getSupabaseUrl,
  getSupabaseAnonKey,
};
