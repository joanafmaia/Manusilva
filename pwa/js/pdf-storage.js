/**
 * Upload de PDFs para Supabase Storage (bucket público pdfs_trabalhos)
 */

import { getAuthenticatedSupabaseClient, getFreshAccessToken } from './supabase-client.js';
import { arrayBufferToBase64 } from './base64-utils.js';
import { resolvePdfNumeroOrdem } from './pdf-header-blocks.js';
import { removeStorageObject, storagePathFromPublicUrl } from './supabase-storage-gc.js';

export const PDF_BUCKET = 'pdfs_trabalhos';

/** Segmento seguro para nome de ficheiro (espaços → underscores) */
export function sanitizePdfFilenameSegment(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/** Sufixo OP para nomes de ficheiro, ex.: OP-2026-35 */
export function formatOpPdfFilenameSuffix(numeroOrdem) {
  if (numeroOrdem == null || !Number.isFinite(Number(numeroOrdem))) return null;
  return `OP-2026-${String(numeroOrdem).padStart(2, '0')}`;
}

/**
 * Nome canónico do PDF: título do relatório + número OP.
 * Ex.: Relatorio_Manutencao_Preventiva_Bateria_OP-2026-35.pdf
 * @param {{ numeroOrdem?: number | null }} job
 * @param {{ serviceType?: string, jobId?: string, id?: string }} report
 * @param {{ serviceTitle?: string, tipoTrabalhoLabel?: string }} [options]
 */
export function buildReportPdfFilename(job, report, options = {}) {
  const tipo = sanitizePdfFilenameSegment(
    options.serviceTitle || options.tipoTrabalhoLabel || report?.serviceType || 'relatorio',
  );
  const opNum =
    options.numeroOrdem != null
      ? options.numeroOrdem
      : resolvePdfNumeroOrdem(report, job, report?.data?.values);
  const op = formatOpPdfFilenameSuffix(opNum);
  const machineTag = options.machineTag
    ? sanitizePdfFilenameSegment(options.machineTag)
    : '';
  if (op) {
    return machineTag ? `${tipo}_${op}_${machineTag}.pdf` : `${tipo}_${op}.pdf`;
  }
  const stamp = String(job?.id || report?.jobId || report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  const base = `Teste_${tipo}_${stamp}`;
  return machineTag ? `${base}_${machineTag}.pdf` : `${base}.pdf`;
}

/**
 * @deprecated Preferir buildReportPdfFilename — mantido para compatibilidade.
 */
export function buildOrdemPdfStorageFilename(job, report, tipoTrabalhoLabel) {
  return buildReportPdfFilename(job, report, { tipoTrabalhoLabel });
}

export function isPdfStoragePermissionError(err) {
  const msg = String(err?.message || err?.error || err?.statusText || err || '').trim();
  const status = Number(err?.statusCode ?? err?.status ?? 0);
  return (
    status === 401 ||
    status === 403 ||
    /permission|policy|row-level security|not allowed|unauthorized|403|401|bucket not found/i.test(
      msg,
    )
  );
}

export function formatPdfStorageError(err) {
  if (!err) return 'Erro ao guardar o PDF no Storage.';
  const msg = String(err.message || err.error || err.statusText || '').trim();
  if (/Bucket not found|404/i.test(msg)) {
    return 'Bucket "pdfs_trabalhos" não encontrado. Cria o bucket público no Supabase Storage.';
  }
  if (isPdfStoragePermissionError(err)) {
    return 'Sem permissão no Storage. A app tenta gravar pelo servidor; se persistir, executa pwa/supabase-storage-pdfs.sql no Supabase.';
  }
  return msg || 'Erro ao guardar o PDF no Storage.';
}

async function uploadTrabalhoPdfViaApi(blob, filename, options = {}) {
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sessão expirada. Inicie sessão novamente para guardar o PDF.');
  }

  const pdfBase64 = arrayBufferToBase64(await blob.arrayBuffer());
  const response = await fetch('/api/upload-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename,
      pdfBase64,
      replaceUrl: options.replaceUrl || null,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || `Falha no upload do PDF (HTTP ${response.status}).`);
    err.status = response.status;
    throw err;
  }
  if (!payload?.publicUrl) {
    throw new Error('O servidor não devolveu o URL do PDF.');
  }
  return { path: payload.path || filename, publicUrl: payload.publicUrl };
}

async function uploadTrabalhoPdfDirect(blob, filename, options = {}) {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error: uploadError } = await supabase.storage.from(PDF_BUCKET).upload(filename, blob, {
    contentType: 'application/pdf',
    cacheControl: '3600',
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(filename);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) {
    throw new Error('Não foi possível obter o URL público do PDF.');
  }

  const oldPath = storagePathFromPublicUrl(options.replaceUrl, PDF_BUCKET);
  if (oldPath && oldPath !== filename) {
    await removeStorageObject(PDF_BUCKET, oldPath);
  }

  return { path: filename, publicUrl };
}

/**
 * @param {Blob} blob
 * @param {string} [filename] ex.: trabalho_1712345678901.pdf
 * @param {{ replaceUrl?: string }} [options] — apaga o objecto anterior se o path mudou
 * @returns {Promise<{ path: string, publicUrl: string }>}
 */
export async function uploadTrabalhoPdf(blob, filename, options = {}) {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('PDF inválido para upload.');
  }

  const path = filename || `trabalho_${Date.now()}.pdf`;

  try {
    return await uploadTrabalhoPdfDirect(blob, path, options);
  } catch (directErr) {
    console.warn('[ManuSilva] Upload PDF direto falhou, a tentar API:', directErr);
    try {
      return await uploadTrabalhoPdfViaApi(blob, path, options);
    } catch (apiErr) {
      console.error('[ManuSilva] Upload PDF API:', apiErr);
      throw new Error(formatPdfStorageError(directErr || apiErr));
    }
  }
}
