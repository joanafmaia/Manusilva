/**
 * Token HMAC para links de avaliação no e-mail (sem login).
 */

const crypto = require('crypto');

const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 dias

function getSecret() {
  const secret = String(
    process.env.AVALIACAO_TOKEN_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '',
  ).trim();
  if (!secret) {
    throw new Error('AVALIACAO_TOKEN_SECRET ou SUPABASE_SERVICE_ROLE_KEY em falta.');
  }
  return secret;
}

function sign(payloadBody) {
  return crypto.createHmac('sha256', getSecret()).update(payloadBody).digest('base64url');
}

/**
 * @param {{ servicoId: string, clienteId?: string | number | null }} params
 */
function createAvaliacaoToken({ servicoId, clienteId }) {
  const sid = String(servicoId || '').trim();
  if (!sid) return null;

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = {
    s: sid,
    c: clienteId != null && clienteId !== '' ? String(clienteId) : null,
    e: exp,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * @param {string} token
 * @returns {{ servicoId: string, clienteId: string | null, exp: number } | null}
 */
function verifyAvaliacaoToken(token) {
  const raw = String(token || '').trim();
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(body);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const servicoId = String(payload.s || '').trim();
    const exp = Number(payload.e);
    if (!servicoId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const clienteId =
      payload.c != null && payload.c !== '' ? String(payload.c) : null;
    return { servicoId, clienteId, exp };
  } catch {
    return null;
  }
}

function getAppBaseUrl() {
  const explicit = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = String(process.env.VERCEL_URL || '').trim();
  if (vercel) return `https://${vercel}`;
  return 'https://manusilva.vercel.app';
}

module.exports = {
  createAvaliacaoToken,
  verifyAvaliacaoToken,
  getAppBaseUrl,
  TOKEN_TTL_SEC,
};
