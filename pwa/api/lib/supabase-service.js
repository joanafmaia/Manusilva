/**
 * Pedidos REST Supabase com service role (rotas serverless).
 */

const { getSupabaseUrl } = require('./supabase-env');

const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function requireServiceRoleKey() {
  if (!SERVICE_ROLE_KEY) {
    const err = new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Adicione-a nas variáveis de ambiente da Vercel.',
    );
    err.status = 500;
    throw err;
  }
  return SERVICE_ROLE_KEY;
}

function serviceHeaders(prefer) {
  const key = requireServiceRoleKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function serviceGet(path) {
  const res = await fetch(`${getSupabaseUrl()}${path}`, {
    method: 'GET',
    headers: serviceHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function servicePost(path, body, prefer = 'return=minimal') {
  const res = await fetch(`${getSupabaseUrl()}${path}`, {
    method: 'POST',
    headers: serviceHeaders(prefer),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.responseText = text;
    throw err;
  }
  if (prefer.includes('representation')) {
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows[0] || null : rows;
  }
  return null;
}

module.exports = {
  serviceGet,
  servicePost,
  hasServiceRoleKey: () => Boolean(SERVICE_ROLE_KEY),
};
