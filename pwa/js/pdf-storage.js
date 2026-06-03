/**
 * Upload de PDFs para Supabase Storage (bucket público pdfs_trabalhos)
 */

import { getSupabaseClient } from './supabase-client.js';

export const PDF_BUCKET = 'pdfs_trabalhos';

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
