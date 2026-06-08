/**
 * Revisão RH — lista compacta no painel + modal de detalhe (painel admin)
 */

import {
  escapeHtml,
  formatDateLong,
  getReport,
  getClient,
  getTechnician,
  getServiceType,
  getJob,
  openModal,
  closeModal,
  showToast,
  approveReport,
  rejectReport,
} from './app.js';
import {
  formatOrdemLabel,
  renderReviewFotosSection,
  bindReviewFotoClicks,
  bindReviewPdfButton,
} from './report-review-ui.js';
import { ensureJobsLoaded } from './trabalhos-db.js';

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
 * Item compacto da lista RH — detalhe completo abre na modal (`openRhReviewModal`).
 */
export function buildRhReviewListItem({ job, report, client, tech }) {
  const statusMeta = getReportStatusPanelMeta(report?.status);
  const statusClass = statusMeta.cardClass;
  const clientName = client?.name || client?.Nome || '—';
  const techName = tech?.name || '—';

  return `
    <article
      class="rh-list-item rh-review-stack-card ${statusClass}"
      data-job-id="${escapeHtml(job?.id || '')}"
      data-report-id="${escapeHtml(report.id)}"
      data-report-status="${escapeHtml(report?.status || '')}"
      role="listitem"
    >
      <div class="rh-list-item__summary">
        <span class="rh-list-item__ordem">${escapeHtml(formatOrdemLabel(job))}</span>
        <div class="rh-list-item__info">
          <span class="rh-list-item__client">${escapeHtml(clientName)}</span>
          <span class="rh-list-item__tech">${escapeHtml(techName)}</span>
        </div>
        <span class="rh-list-item__status rh-card__status-pill">${escapeHtml(statusMeta.label)}</span>
        <button type="button" class="rh-list-item__open-btn" data-panel-open="${escapeHtml(report.id)}">Rever</button>
      </div>
    </article>
  `;
}

function openRhRejectDialog(reportId, onRejected) {
  const content = `
    <p class="text-muted mb-4">Escreva uma nota de correção para o técnico:</p>
    <textarea id="reject-note" class="form-textarea" rows="4" placeholder="Ex: Faltam fotos do componente substituído..."></textarea>
  `;
  const actions = `
    <button type="button" class="btn-ghost" id="cancel-reject">Cancelar</button>
    <button type="button" class="btn-danger" id="confirm-reject">Enviar Rejeição</button>
  `;
  const overlay = openModal('Rejeitar Relatório', content, actions);
  overlay.querySelector('#cancel-reject')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-reject')?.addEventListener('click', async () => {
    const note = overlay.querySelector('#reject-note')?.value?.trim();
    if (!note) {
      showToast('Por favor, escreva uma nota de correção.', 'error');
      return;
    }
    const btn = overlay.querySelector('#confirm-reject');
    btn.disabled = true;
    const ok = await rejectReport(reportId, note);
    btn.disabled = false;
    if (ok) {
      closeModal();
      onRejected?.();
    }
  });
}

/**
 * Modal centrada com detalhe completo do relatório (RH).
 * @param {string} reportId
 * @param {{ onApproved?: () => void, onRejected?: () => void }} [callbacks]
 */
export async function openRhReviewModal(reportId, callbacks = {}) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  try {
    await ensureJobsLoaded(true);
  } catch (err) {
    console.warn('[RH] Trabalhos para revisão:', err);
  }

  const { renderReportValuesForReview } = await import('./form-engine.js');

  const job = report.jobId ? getJob(report.jobId) : null;
  const client = getClient(report.clientId);
  const tech = getTechnician(report.technicianId);
  const service = getServiceType(report.serviceType);
  const fieldsHTML = renderReportValuesForReview(service, report.data?.values || {});
  const showWorkflow = report.status === 'pending_review';

  const statusLabel =
    report.status === 'approved'
      ? 'Aprovado'
      : report.status === 'pending_review'
        ? 'Aguarda aprovação'
        : report.status === 'draft'
          ? 'Rascunho'
          : report.status === 'rejected'
            ? 'Recusado'
            : report.status || '—';

  const content = buildRhReviewModalContent({
    job,
    report,
    client,
    tech,
    fieldsHTML,
    showWorkflow,
  });

  const overlay = openModal(
    `${service?.icon || '📋'} ${escapeHtml(service?.label || 'Relatório')} — ${escapeHtml(statusLabel)}`,
    content,
    '',
    { review: true },
  );

  bindReviewFotoClicks(overlay);
  bindReviewPdfButton(overlay, { job, report });

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);

  if (showWorkflow) {
    overlay.querySelector('#modal-approve')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#modal-approve');
      btn.disabled = true;
      const ok = await approveReport(reportId);
      btn.disabled = false;
      if (ok) {
        closeModal();
        callbacks.onApproved?.();
      }
    });

    overlay.querySelector('#modal-reject')?.addEventListener('click', () => {
      closeModal();
      openRhRejectDialog(reportId, callbacks.onRejected);
    });
  }

  return overlay;
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
