/**
 * Helpers de autenticação Supabase — rotas serverless (CommonJS).
 */

const { isRhOrAdminAuthUser } = require('./auth-roles');

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://zhfbezrevosmbmcbyskw.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZmJlenJldm9zbWJtY2J5c2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTQxMTMsImV4cCI6MjA5NTk3MDExM30.eUXiUiBVxoULll4LICBLLmEtBWZ0zqBHuW_W7-nB4Wc';

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
