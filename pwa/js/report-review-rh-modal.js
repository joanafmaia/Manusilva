/**
 * Revisão RH — painel lateral e modal (painel admin)
 */

import { escapeHtml, formatDateLong } from './app.js';
import { formatOrdemLabel, renderReviewFotosSection } from './report-review-ui.js';

function compactFotosSection(job, report) {
  const full = renderReviewFotosSection(job, report);
  return full.replace('review-fotos-grid', 'review-fotos-grid review-fotos-grid--compact');
}

/**
 * Painel lateral sticky (split-screen) — cartão de revisão RH.
 */
export function buildRhReviewPanelHtml({
  job,
  report,
  client,
  tech,
  service,
  fieldsHTML,
  showWorkflow = true,
}) {
  const data = report?.data || {};
  const submittedDate = report?.submittedAt
    ? String(report.submittedAt).split('T')[0]
    : job?.date || '';
  const dateLabel = submittedDate ? formatDateLong(submittedDate) : '—';

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="btn-danger btn-touch rh-panel-action-btn" data-panel-reject="${escapeHtml(report.id)}">Rejeitar</button>
        <button type="button" class="btn-success btn-touch rh-panel-action-btn" data-panel-approve="${escapeHtml(report.id)}">Aprovar</button>
      `
    : '';

  return `
    <article class="rh-review-panel-content rh-review-stack-card" data-job-id="${escapeHtml(job?.id || '')}" data-report-id="${escapeHtml(report.id)}">
      <header class="rh-review-panel-head">
        <span class="rh-review-panel-ordem">${escapeHtml(formatOrdemLabel(job))}</span>
        <h3 class="rh-review-panel-client">${escapeHtml(client?.name || client?.Nome || '—')}</h3>
        <p class="rh-review-panel-meta text-muted">
          ${escapeHtml(service?.icon || '📋')} ${escapeHtml(service?.label || report.serviceType || '—')}
          · ${escapeHtml(tech?.name || '—')} · ${escapeHtml(dateLabel)}
        </p>
      </header>

      <div class="rh-review-panel-body">
        <div class="review-fields-wrap rh-review-panel-fields">${fieldsHTML}</div>
        ${compactFotosSection(job, report)}
        <p class="rh-review-panel-signatures text-muted">
          Assinaturas — Técnico: ${data.signatures?.technician ? '✓' : '✗'}
          · Cliente: ${data.signatures?.client ? '✓' : '✗'}
        </p>
      </div>

      <footer class="rh-review-panel-footer">
        <button type="button" class="btn-outline btn-touch rh-panel-action-btn" data-panel-pdf="${escapeHtml(report.id)}">Pré-visualizar PDF</button>
        ${workflowHtml}
      </footer>
    </article>
  `;
}

/**
 * Corpo da modal de revisão RH — grelha 2 colunas (info | fotos + ações).
 */
export function buildRhReviewModalContent({
  job,
  report,
  client,
  tech,
  fieldsHTML,
  showWorkflow = true,
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

        <section class="review-section review-section--pdf">
          <p class="review-pdf-status review-pdf-status--pending">Use «Pré-visualizar PDF» para ver o relatório com os dados atuais. O PDF oficial é gerado na aprovação.</p>
        </section>

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
