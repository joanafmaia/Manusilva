/**
 * UI partilhada — modal de revisão RH (fotos + PDF)
 */

import { escapeHtml, formatDateLong } from './app.js';
import { resolveJobFotos, isValidFotoUrl } from './job-fotos.js';

export function formatOrdemLabel(job) {
  if (job?.numeroOrdem == null) return '—';
  return `OP-2026-${String(job.numeroOrdem).padStart(2, '0')}`;
}

/**
 * Corpo da modal de revisão — grelha 2 colunas (info | fotos + ações).
 */
export function buildReviewModalContent({
  job,
  report,
  client,
  tech,
  fieldsHTML,
  showWorkflow = true,
  statusLabel = null,
}) {
  const data = report?.data || {};
  const submittedDate = report?.submittedAt
    ? String(report.submittedAt).split('T')[0]
    : job?.date || '';
  const dateLabel = submittedDate ? formatDateLong(submittedDate) : '—';
  const contact = client?.email || client?.['E-mail'] || '—';

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="btn-danger btn-touch review-action-btn" id="modal-reject">Rejeitar</button>
        <button type="button" class="btn-success btn-touch review-action-btn" id="modal-approve">Aprovar</button>
      `
    : `<button type="button" class="btn-secondary btn-touch review-action-btn" id="modal-close-review">Fechar</button>`;

  return `
    <div class="review-detail review-detail--grid">
      <div class="review-col review-col--info">
        <header class="review-meta-card">
          <div class="review-ordem-block">
            <span class="review-ordem-kicker">Ordem Nº</span>
            <span class="review-ordem-num">${escapeHtml(formatOrdemLabel(job))}</span>
          </div>
          ${statusLabel ? `<p class="review-meta-row"><strong>Estado:</strong> ${escapeHtml(statusLabel)}</p>` : ''}
          <p class="review-meta-row"><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</p>
          <p class="review-meta-row"><strong>Técnico:</strong> ${escapeHtml(tech?.name || '—')}</p>
          <p class="review-meta-row"><strong>Contacto:</strong> ${escapeHtml(contact)}</p>
          <p class="review-meta-row"><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>
          ${report?.forkliftSerial ? `<p class="review-meta-row"><strong>Máquina:</strong> ${escapeHtml(report.forkliftSerial)}</p>` : ''}
        </header>

        <section class="review-block">
          <h4 class="review-section-title">Dados do Relatório</h4>
          <div class="review-fields-wrap">${fieldsHTML}</div>
        </section>

        <section class="review-block review-block--compact">
          <h4 class="review-section-title">Assinaturas</h4>
          <p class="review-signatures">
            Técnico: ${data.signatures?.technician ? '✓ Assinado' : '✗ Pendente'}
            · Cliente: ${data.signatures?.client ? '✓ Assinado' : '✗ Pendente'}
          </p>
        </section>

        ${renderReviewPdfSection(job)}

        <div class="review-col-footer">
          <button type="button" class="btn-primary btn-touch review-btn-pdf" id="modal-pdf-preview">Pré-visualizar PDF</button>
        </div>
      </div>

      <div class="review-col review-col--media">
        ${renderReviewFotosSection(job, report)}
        <div class="review-workflow-actions">
          ${workflowHtml}
        </div>
      </div>
    </div>
  `;
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
        <p class="review-pdf-status review-pdf-status--ok">PDF oficial já aprovado no arquivo. «Pré-visualizar PDF» gera sempre uma versão atualizada com o layout mais recente.</p>
      </section>`;
  }
  return `
    <section class="review-section review-section--pdf">
      <p class="review-pdf-status review-pdf-status--pending">PDF indisponível — será gerado automaticamente após aprovação. Use «Pré-visualizar PDF» para ver o relatório com os dados atuais.</p>
    </section>`;
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
