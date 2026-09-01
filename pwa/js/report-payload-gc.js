/**
 * Remove blobs redundantes do JSON `relatorios.dados` antes de gravar na BD
 * (base64 de fotos quando já existe URL no Storage).
 */

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isDataUrl(value) {
  return String(value || '').startsWith('data:');
}

function slimPhotoEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const url = entry.url || entry.src || entry.publicUrl || '';
  if (!isHttpUrl(url)) return entry;
  const next = { ...entry };
  delete next.base64;
  delete next.dataUrl;
  delete next.data_url;
  if (isDataUrl(next.url)) delete next.url;
  return next;
}

/**
 * @param {object} dados
 * @returns {object}
 */
export function stripHeavyReportDados(dados = {}) {
  const next = { ...dados };

  if (isHttpUrl(next.fotoAntesUrl)) delete next.fotoAntesBase64;
  if (isHttpUrl(next.fotoDepoisUrl)) delete next.fotoDepoisBase64;

  if (Array.isArray(next.photos)) {
    next.photos = next.photos.map(slimPhotoEntry);
  }

  delete next.pdfBase64;
  delete next.pdfAttachments;

  return next;
}
