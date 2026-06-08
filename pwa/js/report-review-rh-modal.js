/**
 * Revisão RH — painel lateral e modal (painel admin)
 */

import { escapeHtml, formatDateLong } from './app.js';
import { formatOrdemLabel, renderRhPanelFotos, renderReviewFotosSection } from './report-review-ui.js';

function formatSubmittedShort(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const REPORT_STATUS_PANEL_META = {
  pending_review: { label: 'Pendente', cardClass: 'rh-card--pending' },
  draft: { label: 'Rascunho', cardClass: 'rh-card--draft' },
  approved: { label: 'Aprovado', cardClass: 'rh-card--approved' },
  rejected: { label: 'Recusado', cardClass: 'rh-card--rejected' },
};

export function getReportStatusPanelMeta(status) {
  return REPORT_STATUS_PANEL_META[status] || { label: status || '—', cardClass: 'rh-card--draft' };
}

const RH_FILTER_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending_review', label: 'Pendentes', icon: '🟡' },
  { id: 'draft', label: 'Rascunhos', icon: '⚪' },
  { id: 'approved', label: 'Aprovados', icon: '🟢' },
  { id: 'rejected', label: 'Recusados', icon: '🔴' },
];

/** Barra de filtros rápidos no topo do painel RH */
export function buildRhReviewFilterBar(counts, activeFilter = 'pending_review') {
  const chips = RH_FILTER_TABS.map(({ id, label, icon }) => {
    const count = counts[id] ?? 0;
    const isActive = activeFilter === id;
    const text = id === 'all' ? `${label} (${count})` : `${label} ${icon || ''} (${count})`.trim();
    return `
      <button
        type="button"
        class="rh-filter-chip${isActive ? ' is-active' : ''}"
        data-rh-filter="${escapeHtml(id)}"
        role="tab"
        aria-selected="${isActive ? 'true' : 'false'}"
      >${escapeHtml(text)}</button>`;
  }).join('');

  return `<div class="rh-review-filters" role="tablist" aria-label="Filtrar relatórios">${chips}</div>`;
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
  const submittedLabel = formatSubmittedShort(
    report?.submittedAt || report?.approvedAt || job?.date,
  );
  const statusMeta = getReportStatusPanelMeta(report?.status);
  const statusClass = statusMeta.cardClass;

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="rh-card__btn rh-card__btn--approve" data-panel-approve="${escapeHtml(report.id)}">
          <svg class="rh-card__btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
          Aprovar
        </button>
        <button type="button" class="rh-card__btn rh-card__btn--reject" data-panel-reject="${escapeHtml(report.id)}">
          <svg class="rh-card__btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          Rejeitar
        </button>
      `
    : '';

  return `
    <article class="rh-card rh-review-stack-card ${statusClass}" data-job-id="${escapeHtml(job?.id || '')}" data-report-id="${escapeHtml(report.id)}" data-report-status="${escapeHtml(report?.status || '')}">
      <header class="rh-card__header">
        <div class="rh-card__header-row">
          <span class="rh-card__ordem-badge">${escapeHtml(formatOrdemLabel(job))}</span>
          <span class="rh-card__status-pill">${escapeHtml(statusMeta.label)}</span>
          <time class="rh-card__date" datetime="${escapeHtml(report?.submittedAt || report?.approvedAt || '')}">${escapeHtml(submittedLabel)}</time>
        </div>
        <h3 class="rh-card__client">${escapeHtml(client?.name || client?.Nome || '—')}</h3>
        <p class="rh-card__meta">
          ${escapeHtml(service?.label || report.serviceType || '—')}
          <span class="rh-card__meta-sep" aria-hidden="true">·</span>
          ${escapeHtml(tech?.name || '—')}
        </p>
      </header>

      <div class="rh-card__body">
        <div class="rh-card__fields review-fields-wrap">${fieldsHTML}</div>
        ${renderRhPanelFotos(job, report)}
        <p class="rh-card__signatures">
          <span class="rh-card__sig${data.signatures?.technician ? ' rh-card__sig--ok' : ''}">Técnico ${data.signatures?.technician ? '✓' : '—'}</span>
          <span class="rh-card__sig${data.signatures?.client ? ' rh-card__sig--ok' : ''}">Cliente ${data.signatures?.client ? '✓' : '—'}</span>
        </p>
      </div>

      <footer class="rh-card__footer">
        <div class="rh-card__actions">
          ${workflowHtml}
          <button type="button" class="rh-card__btn rh-card__btn--pdf" data-panel-pdf="${escapeHtml(report.id)}" title="Gerar PDF" aria-label="Gerar PDF">
            <svg class="rh-card__btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span class="rh-card__btn-pdf-label">PDF</span>
          </button>
        </div>
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
