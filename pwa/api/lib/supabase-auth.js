/**
 * Helpers de autenticação Supabase — rotas serverless (CommonJS).
 */

const { isRhOrAdminAuthUser } = require('./auth-roles');
const { getSupabaseUrl, getSupabaseAnonKey } = require('./supabase-env');

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = getSupabaseAnonKey();

function getBearerToken(req) {
  const auth = String(req.headers?.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : '';
}

async function getAuthenticatedUser(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function requireRhUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: { status: 401, message: 'Autenticação obrigatória (Authorization: Bearer <JWT>).' } };
  }

  const user = await getAuthenticatedUser(token);
  if (!user) {
    return { error: { status: 401, message: 'Sessão inválida ou expirada.' } };
  }
  if (!isRhOrAdminAuthUser(user)) {
    return {
      error: { status: 403, message: 'Acesso reservado a Recursos Humanos ou Admin autenticados.' },
    };
  }

  return { token, user };
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getBearerToken,
  getAuthenticatedUser,
  requireRhUser,
};
