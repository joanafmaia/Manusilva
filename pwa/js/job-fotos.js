/**
 * Fotos Antes/Depois — leitura a partir de trabalhos + fallback no relatório
 */

import { escapeHtml } from './html-utils.js';

export function isValidFotoUrl(url) {
  if (url == null) return false;
  const s = String(url).trim();
  return (
    s.length > 0 &&
    (s.startsWith('http://') ||
      s.startsWith('https://') ||
      s.startsWith('blob:') ||
      s.startsWith('data:image'))
  );
}

function isHttpFotoUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function isDataImageUrl(url) {
  return String(url || '').trim().startsWith('data:image');
}

/**
 * Resolve fontes de imagem utilizáveis no PDF (HTTP, data URL ou base64 embutido).
 * Ignora blob: quando existe base64 equivalente no relatório.
 */
export function resolvePdfFotoSources(job, data = {}) {
  const pick = (slot) => {
    const urlKey = slot === 'antes' ? 'fotoAntesUrl' : 'fotoDepoisUrl';
    const base64Key = slot === 'antes' ? 'fotoAntesBase64' : 'fotoDepoisBase64';
    const jobKey = slot === 'antes' ? 'fotoAntes' : 'fotoDepois';

    const http = [data[urlKey], job?.[jobKey]].find((u) => isHttpFotoUrl(u));
    if (http) return String(http).trim();

    const embedded = [data[base64Key], data[urlKey], job?.[jobKey]].find((u) => isDataImageUrl(u));
    if (embedded) return String(embedded).trim();

    const blob = String(data[urlKey] || '').trim();
    if (blob.startsWith('blob:')) return blob;

    return null;
  };

  return {
    fotoAntesUrl: pick('antes'),
    fotoDepoisUrl: pick('depois'),
  };
}

/** Alias legado — alguns imports antigos usavam este nome por engano. */
export { resolvePdfFotoSources as resolvedPdfSources };

/**
 * @param {object|null} job — trabalho (fotoAntes / fotoDepois)
 * @param {object|null} [report] — relatório (data.fotoAntesUrl / fotoDepoisUrl)
 */
export function resolveJobFotos(job, report) {
  const { fotoAntesUrl, fotoDepoisUrl } = resolvePdfFotoSources(job, report?.data || {});
  return {
    antes: isValidFotoUrl(fotoAntesUrl) ? String(fotoAntesUrl).trim() : null,
    depois: isValidFotoUrl(fotoDepoisUrl) ? String(fotoDepoisUrl).trim() : null,
  };
}

export function countJobFotos(job, report) {
  const { antes, depois } = resolveJobFotos(job, report);
  return (antes ? 1 : 0) + (depois ? 1 : 0);
}

export function formatFotoCountLabel(count) {
  if (count === 0) return '0 fotos';
  if (count === 1) return '1 foto anexada';
  return `${count} fotos anexadas`;
}

/** HTML miniaturas para modal de revisão RH */
export function renderJobFotosReviewHtml(job, report) {
  const { antes, depois } = resolveJobFotos(job, report);
  if (!antes && !depois) {
    return '<p class="review-empty-hint">Nenhuma foto anexada.</p>';
  }

  const blocks = [];
  if (antes) {
    blocks.push(`
      <figure class="review-foto-thumb">
        <img src="${escapeHtml(antes)}" alt="Foto Antes" loading="lazy" class="review-foto-img">
        <figcaption class="review-foto-caption">Antes</figcaption>
      </figure>`);
  }
  if (depois) {
    blocks.push(`
      <figure class="review-foto-thumb">
        <img src="${escapeHtml(depois)}" alt="Foto Depois" loading="lazy" class="review-foto-img">
        <figcaption class="review-foto-caption">Depois</figcaption>
      </figure>`);
  }

  return `<div class="review-fotos-grid">${blocks.join('')}</div>`;
}
