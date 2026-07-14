/**
 * Gera config pública para rotas API (Supabase URL + anon key).
 * Ficheiro versionado em server-lib — a Vercel não inclui ficheiros do .gitignore no deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.join(__dirname, '../js/supabase-client.js');
const outPath = path.join(__dirname, '../server-lib/supabase-public-config.js');

function readFromClientSource() {
  const src = fs.readFileSync(clientPath, 'utf8');
  const urlMatch = src.match(/const SUPABASE_URL = '([^']+)'/);
  const keyMatch = src.match(/const SUPABASE_KEY = '([^']+)'/);
  return {
    supabaseUrl: urlMatch?.[1]?.trim() || '',
    supabaseAnonKey: keyMatch?.[1]?.trim() || '',
  };
}

const fromEnv = {
  supabaseUrl: String(process.env.SUPABASE_URL || '').trim(),
  supabaseAnonKey: String(
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '',
  ).trim(),
};

const fromClient =
  !fromEnv.supabaseUrl || !fromEnv.supabaseAnonKey ? readFromClientSource() : {};

const config = {
  supabaseUrl: fromEnv.supabaseUrl || fromClient.supabaseUrl,
  supabaseAnonKey: fromEnv.supabaseAnonKey || fromClient.supabaseAnonKey,
};

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.warn('[API runtime] Supabase URL/key em falta — /api/enviar-email pode falhar.');
} else {
  console.log('[API runtime] supabase-public-config.js gerado.');
}

const content = `/** Gerado automaticamente — não editar manualmente (npm run sync:api-config) */
module.exports = ${JSON.stringify(config, null, 2)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
