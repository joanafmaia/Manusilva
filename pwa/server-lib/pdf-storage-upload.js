/**
 * Upload de PDFs para o bucket público pdfs_trabalhos (service role).
 * Cria o bucket se faltar — a aprovação não depende de SQL no dashboard.
 */

const { getSupabaseUrl } = require('./supabase-env');

const PDF_BUCKET = 'pdfs_trabalhos';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
let bucketReadyPromise = null;

function requireServiceRoleKey() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) {
    const err = new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Adicione-a nas variáveis de ambiente (Railway).',
    );
    err.status = 500;
    throw err;
  }
  return key;
}

function sanitizePdfStorageFilename(name) {
  const base = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withExt = /\.pdf$/i.test(base) ? base : `${base || 'relatorio'}.pdf`;
  return withExt.slice(0, 180);
}

function decodePdfBase64(raw) {
  const text = String(raw || '')
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s/g, '');
  if (!text) {
    const err = new Error('PDF em falta.');
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(text, 'base64');
  if (buf.length < 5 || buf.subarray(0, 4).toString('latin1') !== '%PDF') {
    const err = new Error('PDF inválido.');
    err.status = 400;
    throw err;
  }
  if (buf.length > MAX_PDF_BYTES) {
    const err = new Error('PDF demasiado grande (máx. 8 MB).');
    err.status = 413;
    throw err;
  }
  return buf;
}

function publicPdfUrl(filename) {
  const encoded = String(filename)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${getSupabaseUrl().replace(/\/$/, '')}/storage/v1/object/public/${PDF_BUCKET}/${encoded}`;
}

function storageHeaders(extra = {}) {
  const key = requireServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function readErrorBody(res) {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text);
    return json.message || json.error || json.msg || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function ensurePdfBucket() {
  if (bucketReadyPromise) return bucketReadyPromise;

  bucketReadyPromise = (async () => {
    const url = `${getSupabaseUrl().replace(/\/$/, '')}/storage/v1/bucket`;
    const createRes = await fetch(url, {
      method: 'POST',
      headers: storageHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: PDF_BUCKET,
        name: PDF_BUCKET,
        public: true,
        file_size_limit: MAX_PDF_BYTES,
      }),
    });
    if (createRes.ok || createRes.status === 409) {
      if (createRes.status === 409) {
        await fetch(`${url}/${PDF_BUCKET}`, {
          method: 'PUT',
          headers: storageHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ public: true, file_size_limit: MAX_PDF_BYTES }),
        }).catch(() => {});
      }
      return;
    }
    const detail = await readErrorBody(createRes);
    const err = new Error(detail || `Não foi possível criar o bucket ${PDF_BUCKET}.`);
    err.status = createRes.status >= 400 ? createRes.status : 500;
    throw err;
  })().catch((err) => {
    bucketReadyPromise = null;
    throw err;
  });

  return bucketReadyPromise;
}

async function removePdfObject(path) {
  const clean = String(path || '').trim();
  if (!clean || clean.includes('..')) return false;
  const res = await fetch(`${getSupabaseUrl().replace(/\/$/, '')}/storage/v1/object/${PDF_BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [clean] }),
  });
  return res.ok;
}

function pathFromPublicUrl(publicUrl) {
  const url = String(publicUrl || '');
  const marker = `/storage/v1/object/public/${PDF_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return '';
  try {
    return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  } catch {
    return url.slice(index + marker.length).split('?')[0];
  }
}

async function uploadPdfBuffer(filename, buffer, { replaceUrl } = {}) {
  await ensurePdfBucket();
  const path = sanitizePdfStorageFilename(filename);
  const uploadUrl = `${getSupabaseUrl().replace(/\/$/, '')}/storage/v1/object/${PDF_BUCKET}/${encodeURIComponent(path)}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: storageHeaders({
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
      'cache-control': '3600',
    }),
    body: buffer,
  });
  if (!res.ok) {
    const detail = await readErrorBody(res);
    const err = new Error(detail || 'Falha ao guardar o PDF no Storage.');
    err.status = res.status >= 400 ? res.status : 500;
    throw err;
  }

  const oldPath = pathFromPublicUrl(replaceUrl);
  if (oldPath && oldPath !== path) {
    await removePdfObject(oldPath).catch(() => false);
  }

  return { path, publicUrl: publicPdfUrl(path) };
}

module.exports = {
  PDF_BUCKET,
  MAX_PDF_BYTES,
  sanitizePdfStorageFilename,
  decodePdfBase64,
  publicPdfUrl,
  uploadPdfBuffer,
};
