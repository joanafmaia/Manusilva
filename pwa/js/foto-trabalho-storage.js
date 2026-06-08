/**
 * Upload de fotos Antes/Depois — bucket público fotos_trabalhos
 */

import { getSupabaseClient } from './supabase-client.js';
import { patchTrabalho } from './trabalhos-db.js';

export const FOTOS_BUCKET = 'fotos_trabalhos';

function extFromFile(file) {
  const t = String(file?.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  return 'jpg';
}

export function formatFotoStorageError(err) {
  if (!err) return 'Erro ao guardar a foto no Storage.';
  const msg = String(err.message || err.error || err.statusText || '').trim();
  if (/Bucket not found|404/i.test(msg)) {
    return 'Bucket "fotos_trabalhos" não encontrado. Cria o bucket público no Supabase Storage.';
  }
  if (/permission|policy|403|401/i.test(msg)) {
    return 'Sem permissão no Storage de fotos. Executa pwa/supabase-storage-fotos.sql no Supabase.';
  }
  return msg || 'Erro ao guardar a foto no Storage.';
}

/**
 * @param {File|Blob} file
 * @param {string} [filename]
 */
export async function uploadFotoTrabalho(file, filename) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('Ficheiro de imagem inválido.');
  }

  const path = filename || `foto_${Date.now()}.${extFromFile(file)}`;
  const contentType = file.type || 'image/jpeg';
  const supabase = await getSupabaseClient();

  const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, file, {
    contentType,
    cacheControl: '3600',
    upsert: true,
  });

  if (uploadError) {
    console.error('[ManuSilva] Upload foto:', uploadError);
    throw new Error(formatFotoStorageError(uploadError));
  }

  const { data } = supabase.storage.from(FOTOS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Não foi possível obter o URL público da foto.');
  }

  return { path, publicUrl: data.publicUrl };
}

/**
 * Envia fotos novas e atualiza trabalhos.foto_antes / foto_depois
 * @param {string} jobId
 * @param {{ antesFile?: File|null, depoisFile?: File|null, fotoAntesUrl?: string|null, fotoDepoisUrl?: string|null, clearAntes?: boolean, clearDepois?: boolean }} opts
 */
export async function syncJobFotosAntesDepois(jobId, opts = {}) {
  if (!jobId) return { fotoAntes: null, fotoDepois: null };

  const patch = {};
  let fotoAntes = opts.fotoAntesUrl || null;
  let fotoDepois = opts.fotoDepoisUrl || null;

  if (opts.clearAntes) {
    patch.fotoAntes = null;
    fotoAntes = null;
  } else if (opts.antesFile) {
    const uploaded = await uploadFotoTrabalho(opts.antesFile, `antes_${Date.now()}.${extFromFile(opts.antesFile)}`);
    patch.fotoAntes = uploaded.publicUrl;
    fotoAntes = uploaded.publicUrl;
  }

  if (opts.clearDepois) {
    patch.fotoDepois = null;
    fotoDepois = null;
  } else if (opts.depoisFile) {
    const uploaded = await uploadFotoTrabalho(opts.depoisFile, `depois_${Date.now()}.${extFromFile(opts.depoisFile)}`);
    patch.fotoDepois = uploaded.publicUrl;
    fotoDepois = uploaded.publicUrl;
  }

  if (Object.keys(patch).length > 0) {
    await patchTrabalho(jobId, patch);
  }

  return { fotoAntes, fotoDepois };
}
