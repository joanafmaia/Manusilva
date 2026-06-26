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
  resendApprovedReportEmail,
} from './app.js';
import {
  formatOrdemLabel,
  renderReviewFotosSection,
  renderReviewClientEmailField,
  readReviewClientEmail,
  validateReviewClientEmail,
  bindReviewFotoClicks,
  bindReviewPdfButton,
  bindReviewOrcamentoButton,
  renderReviewOrcamentoBanner,
} from './report-review-ui.js';
import { ensureJobsLoaded } from './trabalhos-db.js';
import {
  getCalendarEventStateMeta,
  renderReportWorkStateBadge,
  resolveWorkStateFromReport,
} from './calendar-event-state.js';
import {
  formatReportAge,
  getReportUrgencyLevel,
} from './rh-panel-utils.js';
import { reportHasPedidoOrcamento } from './pedido-orcamento.js';
import {
  computeReviewChecks,
  reviewHasBlockingIssues,
  renderReviewValidationPanel,
  buildReviewExecutiveBullets,
  renderReviewExecutiveList,
  renderReviewTabsNav,
  bindReviewTabs,
  bindRejectNoteTemplates,
  renderRejectNoteTemplates,
  reviewJobHasFotos,
} from './report-review-enhanced.js';

/** @deprecated Preferir `resolveWorkStateFromReport` + `getCalendarEventStateMeta` */
export const REPORT_STATUS_PANEL_META = {
  pending_review: { label: 'Pendente RH', cardClass: 'rh-card--pending work-state-card--pending' },
  draft: { label: 'Em aberto', cardClass: 'rh-card--draft work-state-card--draft' },
  approved: { label: 'Concluído', cardClass: 'rh-card--approved work-state-card--approved' },
  rejected: { label: 'Rejeitado', cardClass: 'rh-card--rejected work-state-card--rejected' },
};

export function getReportStatusPanelMeta(status) {
  const stateMap = {
    pending_review: 'pending',
    draft: 'draft',
    approved: 'approved',
    rejected: 'rejected',
  };
  const state = stateMap[status] || 'draft';
  const meta = getCalendarEventStateMeta(state);
  const rhLegacy = {
    pending: 'rh-card--pending',
    draft: 'rh-card--draft',
    approved: 'rh-card--approved',
    rejected: 'rh-card--rejected',
    scheduled: 'rh-card--draft',
  };
  return {
    label: meta.label,
    cardClass: `${rhLegacy[state] || rhLegacy.draft} ${meta.cardClass}`,
  };
}

const RH_FILTER_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending_review', label: 'Pendente RH', icon: '🟡' },
  { id: 'draft', label: 'Em aberto', icon: '⚪' },
  { id: 'approved', label: 'Concluído', icon: '🟢' },
  { id: 'rejected', label: 'Rejeitado', icon: '🔴' },
];

/** Barra de filtros rápidos no topo do painel RH */
export function buildRhReviewFilterBar(counts, activeFilter = 'pending_review', options = {}) {
  const { techId = 'all', search = '', technicians = [] } = options;

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

  const showBatch =
    activeFilter === 'pending_review' || activeFilter === 'all'
      ? (counts.pending_review ?? 0) > 0
      : false;

  const batchBar = showBatch
    ? `
    <div class="rh-batch-toolbar" id="rh-batch-toolbar">
      <label class="rh-batch-select-all">
        <input type="checkbox" id="rh-select-all-pending" aria-label="Selecionar todos os pendentes">
        <span>Selecionar pendentes</span>
      </label>
      <button type="button" class="btn-success btn-sm" id="rh-batch-approve" disabled>
        Aprovar selecionados (0)
      </button>
    </div>`
    : '';

  return `<div class="rh-review-filters-wrap">
    <div class="rh-review-search-row">
      <input
        type="search"
        class="form-input rh-review-search"
        id="rh-review-search"
        placeholder="Pesquisar cliente ou OP…"
        value="${escapeHtml(search)}"
        autocomplete="off"
        aria-label="Pesquisar relatórios"
      >
      <select class="form-select-sm rh-review-tech-filter" id="rh-review-tech-filter" aria-label="Filtrar por técnico">
        <option value="all"${techId === 'all' ? ' selected' : ''}>Todos os técnicos</option>
        ${technicians
          .map(
            (t) =>
              `<option value="${escapeHtml(t.id)}"${String(techId) === String(t.id) ? ' selected' : ''}>${escapeHtml(t.name)}</option>`,
          )
          .join('')}
      </select>
    </div>
    <div class="rh-review-filters" role="tablist" aria-label="Filtrar relatórios">${chips}</div>
    ${batchBar}
  </div>`;
}

/**
 * Item compacto da lista RH — detalhe completo abre na modal (`openRhReviewModal`).
 */
export function buildRhReviewListItem({ job, report, client, tech }) {
  const workState = resolveWorkStateFromReport(report, job);
  const statusMeta = getReportStatusPanelMeta(report?.status);
  const statusClass = statusMeta.cardClass;
  const clientName = client?.name || client?.Nome || '—';
  const techName = tech?.name || '—';
  const service = getServiceType(report?.serviceType || job?.serviceType);
  const serviceLabel = service?.label || report?.serviceType || '—';
  const age = formatReportAge(report?.submittedAt);
  const orcamentoBadge = reportHasPedidoOrcamento(report)
    ? '<span class="rh-list-item__orcamento-badge" title="Pedido de orçamento">Orçamento</span>'
    : '';
  const urgency = getReportUrgencyLevel(report?.submittedAt, report?.status);
  const urgencyClass =
    urgency === 'urgent'
      ? 'rh-list-item--urgent'
      : urgency === 'warning'
        ? 'rh-list-item--warning'
        : '';

  const batchCheckbox =
    report?.status === 'pending_review'
      ? `
      <label class="rh-list-item__check" aria-label="Selecionar para aprovação em lote">
        <input type="checkbox" class="rh-batch-checkbox" data-batch-report-id="${escapeHtml(report.id)}">
      </label>`
      : '';

  const quickActions =
    report?.status === 'pending_review'
      ? `
      <div class="rh-list-item__quick-actions" role="group" aria-label="Ações rápidas">
        <button type="button" class="rh-quick-btn rh-quick-btn--approve" data-quick-approve="${escapeHtml(report.id)}" title="Aprovar" aria-label="Aprovar relatório">✓</button>
        <button type="button" class="rh-quick-btn rh-quick-btn--reject" data-quick-reject="${escapeHtml(report.id)}" title="Rejeitar" aria-label="Rejeitar relatório">✕</button>
      </div>`
      : '';

  return `
    <article
      class="rh-list-item rh-review-stack-card ${statusClass} ${urgencyClass}"
      data-job-id="${escapeHtml(job?.id || '')}"
      data-report-id="${escapeHtml(report.id)}"
      data-report-status="${escapeHtml(report?.status || '')}"
      data-work-state="${escapeHtml(workState)}"
      role="listitem"
    >
      <div class="rh-list-item__summary">
        <div class="rh-list-item__row rh-list-item__row--main">
          ${batchCheckbox}
          <span class="rh-list-item__ordem">${escapeHtml(formatOrdemLabel(job))}</span>
          <div class="rh-list-item__info">
            <div class="rh-list-item__info-top">
              <span class="rh-list-item__client">${escapeHtml(clientName)}</span>
              ${orcamentoBadge}
              <span class="rh-list-item__status">${renderReportWorkStateBadge(report, job)}</span>
            </div>
            <span class="rh-list-item__meta">
              <span class="rh-list-item__service">${service?.icon || '🔧'} ${escapeHtml(serviceLabel)}</span>
              <span class="rh-list-item__age">${escapeHtml(age)}</span>
            </span>
            <span class="rh-list-item__tech">${escapeHtml(techName)}</span>
          </div>
        </div>
        <div class="rh-list-item__row rh-list-item__row--actions">
          ${quickActions}
          <button type="button" class="rh-list-item__open-btn" data-panel-open="${escapeHtml(report.id)}">Rever</button>
        </div>
      </div>
    </article>
  `;
}

export function openRhRejectDialog(reportId, onRejected) {
  const content = `
    <p class="text-muted mb-4">Escreva uma nota de correção para o técnico:</p>
    ${renderRejectNoteTemplates()}
    <textarea id="reject-note" class="form-textarea" rows="4" placeholder="Ex: Faltam fotos do componente substituído..."></textarea>
  `;
  const actions = `
    <button type="button" class="btn-ghost" id="cancel-reject">Cancelar</button>
    <button type="button" class="btn-danger" id="confirm-reject">Enviar Rejeição</button>
  `;
  const overlay = openModal('Rejeitar Relatório', content, actions);
  bindRejectNoteTemplates(overlay);
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
  let report = getReport(reportId);
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
  const values = report.data?.values || {};
  const fieldsHTML = renderReportValuesForReview(service, values);
  const showWorkflow = report.status === 'pending_review';
  const hasNext = Boolean(showWorkflow && callbacks.getNextReportId?.(reportId));
  const showBilling = Boolean(showWorkflow && callbacks.navigateToBilling);

  const statusLabel = getCalendarEventStateMeta(resolveWorkStateFromReport(report, job)).label;

  const content = buildRhReviewModalContent({
    job,
    report,
    client,
    tech,
    service,
    values,
    fieldsHTML,
    showWorkflow,
    showApproveNext: hasNext,
    showApproveBilling: showBilling,
  });

  const overlay = openModal(
    `${service?.icon || '📋'} ${escapeHtml(service?.label || 'Relatório')} — ${escapeHtml(statusLabel)}`,
    content,
    '',
    { review: true, reviewWide: true },
  );

  bindReviewFotoClicks(overlay);
  bindReviewPdfButton(overlay, { job, report });
  bindReviewOrcamentoButton(overlay, {
    report,
    onUpdated: (updated) => {
      report = updated;
    },
  });
  bindReviewTabs(overlay);

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);

  if (showWorkflow) {
    const runApprove = async (mode = 'single') => {
      const andNext = mode === 'next';
      const andBilling = mode === 'billing';
      const checks = computeReviewChecks({ report, job, client, values });
      if (reviewHasBlockingIssues(checks)) {
        const proceed = window.confirm(
          'Ainda há verificações em falha (a vermelho). Deseja aprovar na mesma?',
        );
        if (!proceed) return;
      }

      const btnId =
        andBilling ? '#modal-approve-billing' : andNext ? '#modal-approve-next' : '#modal-approve';
      const btn = overlay.querySelector(btnId);
      const emailErr = await validateReviewClientEmail(overlay);
      if (emailErr) {
        showToast(emailErr, 'error');
        return;
      }
      if (btn) btn.disabled = true;
      const clientEmail = readReviewClientEmail(overlay);
      const ok = await approveReport(reportId, { clientEmail });
      if (btn) btn.disabled = false;
      if (!ok) return;

      closeModal();
      await callbacks.onApproved?.();

      if (andBilling && callbacks.navigateToBilling) {
        await callbacks.navigateToBilling(reportId);
        return;
      }

      if (andNext) {
        const nextId = callbacks.getNextReportId?.(reportId);
        if (nextId) {
          await openRhReviewModal(nextId, callbacks);
        } else {
          showToast('Não há mais relatórios pendentes na fila atual.', 'info');
        }
      }
    };

    overlay.querySelector('#modal-approve')?.addEventListener('click', () => runApprove('single'));
    overlay.querySelector('#modal-approve-next')?.addEventListener('click', () => runApprove('next'));
    overlay.querySelector('#modal-approve-billing')?.addEventListener('click', () =>
      runApprove('billing'),
    );

    overlay.querySelector('#modal-reject')?.addEventListener('click', () => {
      closeModal();
      openRhRejectDialog(reportId, callbacks.onRejected);
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        runApprove(hasNext && e.shiftKey ? 'next' : 'single');
      }
      if (e.altKey && e.key.toLowerCase() === 'f' && showBilling) {
        e.preventDefault();
        runApprove('billing');
      }
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        closeModal();
        openRhRejectDialog(reportId, callbacks.onRejected);
      }
    });
  } else if (report.status === 'approved') {
    overlay.querySelector('#modal-resend-email')?.addEventListener('click', async () => {
      const emailErr = await validateReviewClientEmail(overlay);
      if (emailErr) {
        showToast(emailErr, 'error');
        return;
      }
      const clientEmail = readReviewClientEmail(overlay);
      const fallbackEmail = client?.email || client?.['E-mail'] || '';
      if (!clientEmail && !fallbackEmail) {
        showToast('Indique o e-mail do cliente para reenviar.', 'warning');
        return;
      }

      const btn = overlay.querySelector('#modal-resend-email');
      if (btn) btn.disabled = true;
      const ok = await resendApprovedReportEmail(reportId, {
        clientEmail: clientEmail || undefined,
      });
      if (btn) btn.disabled = false;
      if (ok) closeModal();
    });
  }

  return overlay;
}

/**
 * Corpo da modal de revisão RH — validação, tabs e ações fixas.
 */
export function buildRhReviewModalContent({
  job,
  report,
  client,
  tech,
  service,
  values = {},
  fieldsHTML,
  showWorkflow = true,
  showApproveNext = false,
  showApproveBilling = false,
}) {
  const data = report?.data || {};
  const submittedDate = report?.submittedAt
    ? String(report.submittedAt).split('T')[0]
    : job?.date || '';
  const dateLabel = submittedDate ? formatDateLong(submittedDate) : '—';
  const canResendEmail = report?.status === 'approved';
  const contactField = renderReviewClientEmailField(client, {
    editable: showWorkflow || canResendEmail,
    hint:
      canResendEmail && !showWorkflow
        ? 'E-mail para reenvio do relatório técnico. Se alterar, a base de dados do cliente será atualizada.'
        : 'E-mail para envio do relatório técnico após aprovação. A proposta MS.015 usa outro destinatário.',
  });
  const hasFotos = reviewJobHasFotos(job, report);
  const checks = computeReviewChecks({ report, job, client, values });
  const validationHtml = renderReviewValidationPanel(checks);
  const executiveHtml = renderReviewExecutiveList(
    buildReviewExecutiveBullets({ service, report, job, client, tech, values }),
  );
  const fotosHtml = hasFotos ? renderReviewFotosSection(job, report) : '';
  const serviceLine = service
    ? `${service.icon || '📋'} ${service.label || report?.serviceType || '—'}`
    : '—';
  const queueAge = report?.submittedAt ? formatReportAge(report.submittedAt) : '';

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="btn-danger btn-touch review-action-btn" id="modal-reject" title="Alt+R">Rejeitar</button>
        <button type="button" class="btn-success btn-touch review-action-btn" id="modal-approve" title="Alt+A">Aprovar</button>
        ${showApproveNext ? '<button type="button" class="btn-primary btn-touch review-action-btn" id="modal-approve-next" title="Alt+Shift+A">Aprovar e seguinte</button>' : ''}
        ${showApproveBilling ? '<button type="button" class="btn-outline btn-touch review-action-btn" id="modal-approve-billing" title="Alt+F">Aprovar e faturar</button>' : ''}
      `
    : canResendEmail
      ? `
        <button type="button" class="btn-primary btn-touch review-action-btn" id="modal-resend-email">Reenviar e-mail ao cliente</button>
        <button type="button" class="btn-secondary btn-touch review-action-btn" id="modal-close-review">Fechar</button>
      `
      : `<button type="button" class="btn-secondary btn-touch review-action-btn" id="modal-close-review">Fechar</button>`;

  return `
    <div class="review-shell${hasFotos ? ' review-shell--has-fotos' : ' review-shell--no-fotos'}">
      <header class="review-meta-card review-meta-card--enhanced">
        <div class="review-meta-card__top">
          <div class="review-ordem-block">
            <span class="review-ordem-kicker">Ordem Nº</span>
            <span class="review-ordem-num">${escapeHtml(formatOrdemLabel(job))}</span>
          </div>
          ${queueAge ? `<span class="review-queue-badge">${escapeHtml(queueAge)}</span>` : ''}
        </div>
        <p class="review-meta-row"><strong>Serviço:</strong> ${escapeHtml(serviceLine)}</p>
        <p class="review-meta-row"><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</p>
        <p class="review-meta-row"><strong>Técnico:</strong> ${escapeHtml(tech?.name || '—')}</p>
        ${contactField}
        <p class="review-meta-row"><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>
        ${report?.forkliftSerial ? `<p class="review-meta-row"><strong>Máquina:</strong> ${escapeHtml(report.forkliftSerial)}</p>` : ''}
      </header>

      ${renderReviewOrcamentoBanner(report)}

      ${validationHtml}

      ${renderReviewTabsNav('resumo')}

      <div class="review-tab-panels">
        <div class="review-tab-panel is-active" data-review-panel="resumo" role="tabpanel">
          <section class="review-block">
            <h4 class="review-section-title">Resumo executivo</h4>
            ${executiveHtml}
          </section>
          ${fotosHtml}
          <section class="review-block review-block--compact">
            <h4 class="review-section-title">Assinaturas</h4>
            <p class="review-signatures">
              Técnico: ${data.signatures?.technician ? '✓ Assinado' : '✗ Pendente'}
              · Cliente: ${data.signatures?.client ? '✓ Assinado' : '✗ Pendente'}
            </p>
          </section>
        </div>

        <div class="review-tab-panel" data-review-panel="pdf" role="tabpanel" hidden>
          <div class="review-pdf-tab">
            <p class="review-pdf-tab__lead">Pré-visualize o documento tal como o cliente o receberá após aprovação.</p>
            <button type="button" class="btn-primary btn-touch review-btn-pdf review-btn-pdf--hero" id="modal-pdf-preview">Gerar pré-visualização PDF</button>
            <p class="text-muted review-pdf-tab__hint">${
              canResendEmail && job?.urlPdf
                ? 'PDF oficial disponível — pode reenviar o e-mail ao cliente no rodapé.'
                : 'O PDF oficial é gerado automaticamente ao aprovar.'
            }</p>
          </div>
        </div>

        <div class="review-tab-panel" data-review-panel="dados" role="tabpanel" hidden>
          <section class="review-block">
            <h4 class="review-section-title">Dados do relatório</h4>
            <div class="review-fields-wrap">${fieldsHTML}</div>
          </section>
        </div>
      </div>

      <footer class="review-sticky-footer">
        <button type="button" class="btn-outline btn-touch review-btn-pdf" id="modal-pdf-preview-footer" title="Pré-visualizar PDF">PDF</button>
        <div class="review-sticky-footer__actions">
          ${workflowHtml}
        </div>
      </footer>
    </div>
  `;
}
