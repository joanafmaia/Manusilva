/**
 * Fotos Antes/Depois — leitura a partir de trabalhos + fallback no relatório
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function isValidFotoUrl(url) {
  if (url == null) return false;
  const s = String(url).trim();
  return s.length > 0 && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:'));
}

/**
 * @param {object|null} job — trabalho (fotoAntes / fotoDepois)
 * @param {object|null} [report] — relatório (data.fotoAntesUrl / fotoDepoisUrl)
 */
export function resolveJobFotos(job, report) {
  const data = report?.data || {};
  const antes = job?.fotoAntes || data.fotoAntesUrl || null;
  const depois = job?.fotoDepois || data.fotoDepoisUrl || null;
  return {
    antes: isValidFotoUrl(antes) ? String(antes).trim() : null,
    depois: isValidFotoUrl(depois) ? String(depois).trim() : null,
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
    return '<p class="text-muted">Sem fotos anexadas.</p>';
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
