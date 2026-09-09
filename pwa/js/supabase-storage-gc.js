/**
 * Remove objectos antigos do Storage quando se substitui PDF/foto.
 */

import { getSupabaseClient } from './supabase-client.js';

export function storagePathFromPublicUrl(publicUrl, bucket) {
  const url = String(publicUrl || '');
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return '';
  try {
    return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  } catch {
    return url.slice(index + marker.length).split('?')[0];
  }
}

/**
 * @param {string} bucket
 * @param {string} pathOrUrl
 */
export async function removeStorageObject(bucket, pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw || !bucket) return false;
  const path = raw.includes('://') ? storagePathFromPublicUrl(raw, bucket) : raw;
  if (!path || path.includes('..')) return false;

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      console.warn('[Storage GC]', bucket, path, error.message || error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Storage GC]', err);
    return false;
  }
}
