/**
 * POST /api/technicians — cria conta Supabase Auth para novo técnico (só RH).
 * Requer SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.
 */

const { buildInitialPassword } = require('../lib/auth-password');
const { SUPABASE_URL, requireRhUser } = require('../lib/supabase-auth');

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

function normalizeTechnicianRecord(user = {}, index = 0) {
  const meta = user.user_metadata || {};
  const name = String(meta.nome || meta.name || user.email || '').trim();
  const email = String(user.email || '').trim().toLowerCase();
  const technicianId = String(meta.technician_id || meta.technicianId || '').trim();
  const phone = meta.telemovel != null ? String(meta.telemovel).trim() : '';
  const nif = meta.nif != null ? String(meta.nif).trim() : '';
  const colorPalette = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
  return {
    id: technicianId || `tech-auth-${index + 1}`,
    name,
    email,
    phone,
    nif,
    color: colorPalette[index % colorPalette.length],
    authUserId: user.id || null,
  };
}

async function listAuthTechnicians() {
  if (!SERVICE_ROLE_KEY) {
    const err = new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Adicione-a nas variáveis de ambiente da Vercel.',
    );
    err.status = 500;
    throw err;
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    method: 'GET',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.msg || data.message || 'Falha ao listar técnicos no Supabase Auth.');
    err.status = res.status >= 400 && res.status < 600 ? res.status : 500;
    throw err;
  }

  const users = Array.isArray(data?.users) ? data.users : [];
  return users
    .filter((user) => String(user?.user_metadata?.role || '').trim().toLowerCase() === 'tecnico')
    .map((user, index) => normalizeTechnicianRecord(user, index))
    .filter((tech) => tech.name && tech.email);
}

async function createAuthTechnician({ email, nome, technicianId, telemovel, nif }) {
  if (!SERVICE_ROLE_KEY) {
    const err = new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Adicione-a nas variáveis de ambiente da Vercel.',
    );
    err.status = 500;
    throw err;
  }

  const password = buildInitialPassword(nome);
  const normalizedEmail = String(email).trim().toLowerCase();

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'Tecnico',
        nome: String(nome).trim(),
        technician_id: String(technicianId),
        technicianId: String(technicianId),
        telemovel: telemovel ? String(telemovel).trim() : null,
        nif: nif ? String(nif).trim() : null,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  const message = String(data.msg || data.message || data.error_description || '').toLowerCase();

  if (!res.ok) {
    if (res.status === 422 || message.includes('already') || message.includes('registered')) {
      const err = new Error('Já existe uma conta Supabase Auth com este e-mail.');
      err.status = 409;
      throw err;
    }
    const err = new Error(data.msg || data.message || 'Falha ao criar conta no Supabase Auth.');
    err.status = res.status >= 400 && res.status < 600 ? res.status : 500;
    throw err;
  }

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const auth = await requireRhUser(req);
    if (auth.error) {
      return res.status(auth.error.status).json({ error: auth.error.message });
    }

    try {
      const technicians = await listAuthTechnicians();
      return res.status(200).json({ ok: true, technicians });
    } catch (err) {
      console.error('[API /api/technicians GET]', err);
      const status = err.status && Number.isFinite(err.status) ? err.status : 500;
      return res.status(status).json({ error: err.message || 'Falha ao listar técnicos.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const auth = await requireRhUser(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message });
  }

  try {
    const body = parseBody(req);
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim();
    const technicianId = String(body.technicianId || '').trim();
    const telemovel = body.telemovel != null ? String(body.telemovel).trim() : '';
    const nif = body.nif != null ? String(body.nif).trim() : '';

    if (!nome || !email || !technicianId) {
      return res.status(400).json({ error: 'nome, email e technicianId são obrigatórios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const created = await createAuthTechnician({
      email,
      nome,
      technicianId,
      telemovel,
      nif,
    });

    return res.status(200).json({
      ok: true,
      userId: created.id || created.user?.id || null,
    });
  } catch (err) {
    console.error('[API /api/technicians]', err);
    const status = err.status && Number.isFinite(err.status) ? err.status : 500;
    return res.status(status).json({ error: err.message || 'Falha ao criar técnico no Supabase Auth.' });
  }
};
