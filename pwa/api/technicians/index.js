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
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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
