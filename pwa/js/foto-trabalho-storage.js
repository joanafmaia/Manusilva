/**
 * Upload de fotos Antes/Depois — bucket público fotos_trabalhos
 */

import { getSupabaseClient } from './supabase-client.js';
import { patchTrabalho } from './trabalhos-db.js';
import { compressImageFile } from './image-compress.js';

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
  if (/permission|policy|403|401|row-level security/i.test(msg)) {
    return 'Sem permissão no Storage de fotos. No Supabase → SQL Editor, executa o ficheiro pwa/supabase-storage-fotos.sql (políticas para role authenticated).';
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
    upsert: false,
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

/** Garante URLs nas colunas trabalhos.foto_antes / foto_depois (ex.: após submissão) */
export async function ensureFotoUrlsOnTrabalho(jobId, fotoAntesUrl, fotoDepoisUrl) {
  if (!jobId) return;
  const patch = {};
  if (fotoAntesUrl) patch.fotoAntes = fotoAntesUrl;
  if (fotoDepoisUrl) patch.fotoDepois = fotoDepoisUrl;
  if (Object.keys(patch).length > 0) {
    await patchTrabalho(jobId, patch);
  }
}

function isHttpFotoUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

/** @param {File|Blob} file — comprime para JPEG antes de devolver data URL */
export async function readFileAsDataUrl(file) {
  const { dataUrl } = await compressImageFile(file, { filename: file.name || 'foto' });
  return dataUrl;
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Imagem em base64 inválida.');
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Embute fotos locais em base64 no payload do relatório (submissão offline).
 */
export async function attachOfflineFotosToReportData(data, opts = {}) {
  const out = { ...(data || {}) };

  if (opts.clearAntes) {
    out.fotoAntesUrl = null;
    out.fotoAntesBase64 = null;
  } else if (opts.antesFile) {
    const { dataUrl } = await compressImageFile(opts.antesFile, { filename: 'antes' });
    out.fotoAntesBase64 = dataUrl;
    out.fotoAntesUrl = dataUrl;
  } else if (opts.fotoAntesUrl) {
    out.fotoAntesUrl = opts.fotoAntesUrl;
  }

  if (opts.clearDepois) {
    out.fotoDepoisUrl = null;
    out.fotoDepoisBase64 = null;
  } else if (opts.depoisFile) {
    const { dataUrl } = await compressImageFile(opts.depoisFile, { filename: 'depois' });
    out.fotoDepoisBase64 = dataUrl;
    out.fotoDepoisUrl = dataUrl;
  } else if (opts.fotoDepoisUrl) {
    out.fotoDepoisUrl = opts.fotoDepoisUrl;
  }

  return out;
}

/** Envia fotos guardadas em base64 quando a fila offline sincroniza. */
export async function uploadPendingFotosFromReport(report) {
  const data = { ...(report?.data || {}) };
  let changed = false;

  if (data.fotoAntesBase64 && !isHttpFotoUrl(data.fotoAntesUrl)) {
    const blob = dataUrlToBlob(data.fotoAntesBase64);
    const uploaded = await uploadFotoTrabalho(blob, `antes_${Date.now()}.jpg`);
    data.fotoAntesUrl = uploaded.publicUrl;
    delete data.fotoAntesBase64;
    changed = true;
  }

  if (data.fotoDepoisBase64 && !isHttpFotoUrl(data.fotoDepoisUrl)) {
    const blob = dataUrlToBlob(data.fotoDepoisBase64);
    const uploaded = await uploadFotoTrabalho(blob, `depois_${Date.now()}.jpg`);
    data.fotoDepoisUrl = uploaded.publicUrl;
    delete data.fotoDepoisBase64;
    changed = true;
  }

  return changed ? { ...report, data } : report;
}
