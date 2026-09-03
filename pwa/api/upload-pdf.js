/**
 * POST /api/upload-pdf — guarda o PDF no Storage com service role (ignora RLS do browser).
 */

const { requireAuthenticatedUser } = require('../../server-lib/supabase-auth');
const { hasServiceRoleKey } = require('../../server-lib/supabase-service');
const {
  decodePdfBase64,
  uploadPdfBuffer,
} = require('../../server-lib/pdf-storage-upload');

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message });
  }

  if (!hasServiceRoleKey()) {
    return res.status(503).json({
      error: 'Upload de PDF indisponível: SUPABASE_SERVICE_ROLE_KEY em falta no Railway.',
    });
  }

  try {
    const body = parseBody(req);
    const buffer = decodePdfBase64(body.pdfBase64);
    const stored = await uploadPdfBuffer(body.filename, buffer, {
      replaceUrl: body.replaceUrl,
    });
    return res.status(200).json(stored);
  } catch (err) {
    const status = Number(err?.status) || 500;
    console.error('[API /api/upload-pdf]', err);
    return res.status(status).json({
      error: err?.message || 'Falha ao guardar o PDF no Storage.',
    });
  }
};
