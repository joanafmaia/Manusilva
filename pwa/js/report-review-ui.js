/**
 * UI partilhada — secções de revisão (fotos, PDF, ações da modal)
 */

import { escapeHtml } from './app.js';
import { getClient } from './app.js';
import { isTestClient, TEST_JOB_ORDEM_LABEL } from './client-test-utils.js';
import { resolveJobFotos, isValidFotoUrl } from './job-fotos.js';

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

/**
 * Campo de e-mail do cliente na revisão — editável antes da aprovação.
 */
export function renderReviewClientEmailField(client, { editable = false, inputId = 'review-client-email' } = {}) {
  const email = client?.email || client?.['E-mail'] || '';
  if (!editable) {
    return `<p class="review-meta-row"><strong>Contacto:</strong> ${escapeHtml(email || '—')}</p>`;
  }
  return `
    <div class="review-email-field form-group">
      <label class="form-label" for="${escapeHtml(inputId)}">E-mail do Cliente</label>
      <input type="email" class="form-input client-profile-edit-input" id="${escapeHtml(inputId)}" name="review-client-email"
        value="${escapeAttr(email)}" autocomplete="email" placeholder="email@empresa.pt">
      <p class="text-muted review-email-hint">Se alterar o e-mail, a base de dados do cliente será atualizada na aprovação.</p>
    </div>
  `;
}

export function readReviewClientEmail(root, inputId = 'review-client-email') {
  return root?.querySelector(`#${CSS.escape(inputId)}`)?.value?.trim() || '';
}

/** Valida e-mail antes de aprovar; devolve mensagem de erro ou null. */
export async function validateReviewClientEmail(root, inputId = 'review-client-email') {
  const { isValidEmail } = await import('./validators.js');
  const email = readReviewClientEmail(root, inputId);
  if (!email) return null;
  if (!isValidEmail(email)) return 'Introduza um e-mail de cliente válido antes de aprovar.';
  return null;
}

export function formatOrdemLabel(job, clientHint = null) {
  if (job?.numeroOrdem != null) {
    return `OP-2026-${String(job.numeroOrdem).padStart(2, '0')}`;
  }
  const client = clientHint || (job?.clientId ? getClient(job.clientId) : null);
  if (isTestClient(client)) return TEST_JOB_ORDEM_LABEL;
  return '—';
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
  const buttons = overlay?.querySelectorAll('#modal-pdf-preview, #modal-pdf-preview-footer, .review-btn-pdf');
  if (!buttons?.length) return;

  const onClick = async () => {
    const urlPdf = job?.urlPdf && isValidFotoUrl(job.urlPdf) ? job.urlPdf : null;

    if (urlPdf) {
      window.open(urlPdf, '_blank', 'noopener,noreferrer');
      return;
    }

    buttons.forEach((b) => {
      b.disabled = true;
    });
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
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', onClick);
  });
}
