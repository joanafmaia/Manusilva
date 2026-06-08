/**
 * UI partilhada — secções de revisão (fotos, PDF, ações da modal)
 */

import { escapeHtml } from './app.js';
import { resolveJobFotos, isValidFotoUrl } from './job-fotos.js';

export function formatOrdemLabel(job) {
  if (job?.numeroOrdem == null) return '—';
  return `OP-2026-${String(job.numeroOrdem).padStart(2, '0')}`;
}

/** Fotos compactas para cartões do painel RH (lado a lado, 80px). */
export function renderRhPanelFotos(job, report) {
  const { antes, depois } = resolveJobFotos(job, report);
  if (!antes && !depois) return '';

  const thumb = (url, label) => `
    <figure class="rh-card__foto">
      <button type="button" class="rh-card__foto-btn" data-foto-url="${escapeHtml(url)}" title="Abrir foto ${escapeHtml(label)}" aria-label="Abrir foto ${escapeHtml(label)}">
        <img src="${escapeHtml(url)}" alt="Foto ${escapeHtml(label)}" loading="lazy" class="rh-card__foto-img">
      </button>
      <figcaption class="rh-card__foto-label">${escapeHtml(label)}</figcaption>
    </figure>`;

  const blocks = [];
  if (antes) blocks.push(thumb(antes, 'Antes'));
  if (depois) blocks.push(thumb(depois, 'Depois'));

  return `<div class="rh-card__fotos" role="group" aria-label="Fotos do trabalho">${blocks.join('')}</div>`;
}

export function renderReviewFotosSection(job, report) {
  const { antes, depois } = resolveJobFotos(job, report);

  if (!antes && !depois) {
    return `
      <section class="review-section review-section--fotos">
        <h4 class="review-section-title">Fotos do Trabalho</h4>
        <p class="review-empty-hint">Nenhuma foto anexada.</p>
      </section>`;
  }

  const imgBlock = (url, label) => `
    <figure class="review-foto-thumb">
      <button type="button" class="review-foto-open" data-foto-url="${escapeHtml(url)}" title="Abrir ${escapeHtml(label)} em tamanho real" aria-label="Abrir foto ${escapeHtml(label)}">
        <img src="${escapeHtml(url)}" alt="Foto ${escapeHtml(label)}" loading="lazy" class="review-foto-img">
      </button>
      <figcaption class="review-foto-caption">${escapeHtml(label)}</figcaption>
    </figure>`;

  const blocks = [];
  if (antes) blocks.push(imgBlock(antes, 'Antes'));
  if (depois) blocks.push(imgBlock(depois, 'Depois'));

  return `
    <section class="review-section review-section--fotos">
      <h4 class="review-section-title">Fotos do Trabalho</h4>
      <div class="review-fotos-grid">${blocks.join('')}</div>
      <p class="review-foto-hint text-muted">Clique numa foto para ver em tamanho real.</p>
    </section>`;
}

export function renderReviewPdfSection(job) {
  const urlPdf = job?.urlPdf && isValidFotoUrl(job.urlPdf) ? job.urlPdf : null;
  if (urlPdf) {
    return `
      <section class="review-section review-section--pdf">
        <p class="review-pdf-status review-pdf-status--ok">PDF oficial disponível para consulta.</p>
      </section>`;
  }
  return `
    <section class="review-section review-section--pdf">
      <p class="review-pdf-status review-pdf-status--pending">PDF indisponível — será gerado automaticamente após aprovação. Use «Pré-visualizar PDF» para ver o relatório com os dados atuais.</p>
    </section>`;
}

/** Rodapé da modal (layout simples — histórico de clientes, etc.) */
export function buildReviewModalActions({ showWorkflow = true } = {}) {
  return `
    <button type="button" class="btn-primary review-btn-pdf" id="modal-pdf-preview">Pré-visualizar PDF</button>
    ${showWorkflow ? '<button type="button" class="btn-danger" id="modal-reject">Rejeitar</button>' : ''}
    ${showWorkflow ? '<button type="button" class="btn-success" id="modal-approve">Aprovar</button>' : ''}
    <button type="button" class="btn-secondary" id="modal-close-review">Fechar</button>
  `;
}

export function bindReviewFotoClicks(root) {
  root?.querySelectorAll('[data-foto-url]').forEach((el) => {
    el.addEventListener('click', () => {
      const url = el.dataset.fotoUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
}

/**
 * @param {HTMLElement} overlay
 * @param {{ job: object|null, report: object }} ctx
 */
export function bindReviewPdfButton(overlay, { job, report }) {
  const btn = overlay?.querySelector('#modal-pdf-preview');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const urlPdf = job?.urlPdf && isValidFotoUrl(job.urlPdf) ? job.urlPdf : null;

    if (urlPdf) {
      window.open(urlPdf, '_blank', 'noopener,noreferrer');
      return;
    }

    btn.disabled = true;
    try {
      const { previewReportPDF } = await import('./pdf-preview.js');
      const { showToast } = await import('./app.js');
      showToast('A gerar pré-visualização do relatório…', 'info', 2500);
      await previewReportPDF(report);
    } catch (err) {
      console.error('[Revisão] PDF:', err);
      const { showToast } = await import('./app.js');
      showToast('Não foi possível gerar a pré-visualização do PDF.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
