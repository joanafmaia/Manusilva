/**
 * Gera config pública para rotas API (Supabase URL + anon key).
 * Usa variáveis de ambiente no deploy; em local, lê de supabase-client.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.join(__dirname, '../js/supabase-client.js');
const outPath = path.join(__dirname, '../api/lib/runtime-public.json');

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

const fromClient = !fromEnv.supabaseUrl || !fromEnv.supabaseAnonKey ? readFromClientSource() : {};

const config = {
  supabaseUrl: fromEnv.supabaseUrl || fromClient.supabaseUrl,
  supabaseAnonKey: fromEnv.supabaseAnonKey || fromClient.supabaseAnonKey,
};

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.warn('[API runtime] Supabase URL/key em falta — /api/enviar-email pode falhar.');
} else {
  console.log('[API runtime] runtime-public.json gerado.');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
