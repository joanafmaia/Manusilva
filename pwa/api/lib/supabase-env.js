/**
 * Variáveis Supabase nas rotas API — env do deploy ou runtime-public.json (build).
 */

const fs = require('fs');
const path = require('path');

let runtimePublic = null;
let runtimePublicLoaded = false;

function loadRuntimePublic() {
  if (runtimePublicLoaded) return runtimePublic;
  runtimePublicLoaded = true;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'runtime-public.json'), 'utf8');
    runtimePublic = JSON.parse(raw);
  } catch {
    runtimePublic = null;
  }
  return runtimePublic;
}

function getSupabaseUrl() {
  const runtime = loadRuntimePublic();
  const url = String(process.env.SUPABASE_URL || runtime?.supabaseUrl || '').trim();
  if (!url) {
    throw new Error(
      'SUPABASE_URL em falta. Configure na Vercel ou execute o build (write-api-runtime-config).',
    );
  }
  return url;
}

function getSupabaseAnonKey() {
  const runtime = loadRuntimePublic();
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      runtime?.supabaseAnonKey ||
      '',
  ).trim();
  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY em falta. Configure na Vercel ou execute o build (write-api-runtime-config).',
    );
  }
  return key;
}

module.exports = {
  getSupabaseUrl,
  getSupabaseAnonKey,
};
