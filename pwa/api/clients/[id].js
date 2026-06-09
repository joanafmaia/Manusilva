/**
 * PUT /api/clients/[id] — atualiza dados cadastrais (requer JWT Supabase de RH).
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://zhfbezrevosmbmcbyskw.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZmJlenJldm9zbWJtY2J5c2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTQxMTMsImV4cCI6MjA5NTk3MDExM30.eUXiUiBVxoULll4LICBLLmEtBWZ0zqBHuW_W7-nB4Wc';

const { isRhOrAdminAuthUser } = require('../lib/auth-roles');

const ALLOWED_FIELDS = [
  'email',
  'morada',
  'telemovel',
  'codigo_postal',
  'localidade',
  'condicao_pagamento',
];

function getBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : '';
}

function normalizePatch(body = {}) {
  const patch = {};
  if (body.email !== undefined) patch.email = String(body.email ?? '').trim() || null;
  if (body.morada !== undefined) patch.morada = String(body.morada ?? '').trim() || null;
  if (body.telemovel !== undefined) patch.telemovel = String(body.telemovel ?? '').trim() || null;
  if (body.codigo_postal !== undefined) {
    patch.codigo_postal = String(body.codigo_postal ?? '').trim() || null;
  }
  if (body.localidade !== undefined) patch.localidade = String(body.localidade ?? '').trim() || null;
  if (body.condicao_pagamento !== undefined) {
    patch.condicao_pagamento = String(body.condicao_pagamento ?? '').trim() || null;
  }
  return patch;
}

async function verifyRhUser(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!isRhOrAdminAuthUser(user)) return null;
  return user;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  const rhUser = await verifyRhUser(token);
  if (!rhUser) {
    return res.status(403).json({ error: 'Acesso reservado a Recursos Humanos autenticados.' });
  }

  const id = String(req.query?.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'ID do cliente em falta.' });
  }

  const patch = normalizePatch(req.body || {});
  const keys = Object.keys(patch).filter((k) => ALLOWED_FIELDS.includes(k));
  if (!keys.length) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
  }

  const row = {};
  keys.forEach((k) => {
    row[k] = patch[k];
  });

  const queryId = /^\d+$/.test(id) ? id : encodeURIComponent(id);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${queryId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (Array.isArray(data) ? null : data?.message) ||
        (typeof data === 'string' ? data : null) ||
        `Supabase error (${response.status})`;
      return res.status(response.status).json({ error: message });
    }

    const record = Array.isArray(data) ? data[0] : data;
    if (!record) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    return res.status(200).json({ ok: true, record });
  } catch (err) {
    console.error('[API /api/clients/[id]]', err);
    return res.status(500).json({ error: 'Falha ao atualizar cliente.' });
  }
};
