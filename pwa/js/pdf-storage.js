/**
 * Upload de PDFs para Supabase Storage (bucket público pdfs_trabalhos)
 */

import { getSupabaseClient } from './supabase-client.js';
import { resolvePdfNumeroOrdem } from './pdf-header-blocks.js';

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

export function formatPdfStorageError(err) {
  if (!err) return 'Erro ao guardar o PDF no Storage.';
  const msg = String(err.message || err.error || err.statusText || '').trim();
  if (/Bucket not found|404/i.test(msg)) {
    return 'Bucket "pdfs_trabalhos" não encontrado. Cria o bucket público no Supabase Storage.';
  }
  if (/permission|policy|403|401/i.test(msg)) {
    return 'Sem permissão no Storage. Executa pwa/supabase-storage-pdfs.sql no Supabase.';
  }
  return msg || 'Erro ao guardar o PDF no Storage.';
}

/**
 * @param {Blob} blob
 * @param {string} [filename] ex.: trabalho_1712345678901.pdf
 * @returns {Promise<{ path: string, publicUrl: string }>}
 */
export async function uploadTrabalhoPdf(blob, filename) {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('PDF inválido para upload.');
  }

  const path = filename || `trabalho_${Date.now()}.pdf`;
  const supabase = await getSupabaseClient();

  const { error: uploadError } = await supabase.storage.from(PDF_BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    cacheControl: '3600',
    upsert: true,
  });

  if (uploadError) {
    console.error('[ManuSilva] Upload PDF:', uploadError);
    throw new Error(formatPdfStorageError(uploadError));
  }

  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) {
    throw new Error('Não foi possível obter o URL público do PDF.');
  }

  return { path, publicUrl };
}
