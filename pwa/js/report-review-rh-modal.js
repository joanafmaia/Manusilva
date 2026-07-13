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
import { msIconHtml, serviceIconHtml } from './ui-icons.js';
import {
  formatOrdemLabel,
  renderReviewFotosSection,
  renderReviewClientEmailField,
  readReviewClientEmail,
  readReviewExtraClientEmail,
  validateReviewClientEmail,
  validateReviewExtraClientEmail,
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
import { reportHasPedidoOrcamento, reportOrcamentoPorPreparar } from './pedido-orcamento.js';
import {
  groupReportsForRhStack,
  groupRhStackItemsByDay,
  getFirstPendingReportIdForServico,
  getRhApproveNextLabel,
  getServicoReviewMeta,
  summarizeServicoReviewState,
} from './servicos-rh-review.js';
import { resolvePdfSignaturesForReport } from './report-pdf-signatures.js';
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
  { id: 'pending_review', label: 'Pendente RH', icon: 'pending' },
  { id: 'orcamento_pendente', label: 'Orçamento', icon: 'euro' },
  { id: 'draft', label: 'Em aberto', icon: 'draft' },
  { id: 'approved', label: 'Concluído', icon: 'approved' },
  { id: 'rejected', label: 'Rejeitado', icon: 'rejected' },
];

/** Barra de filtros rápidos no topo do painel RH */
export function buildRhReviewFilterBar(counts, activeFilter = 'pending_review', options = {}) {
  const { techId = 'all', search = '', technicians = [] } = options;

  const chips = RH_FILTER_TABS.map(({ id, label, icon }) => {
    const count = counts[id] ?? 0;
    const isActive = activeFilter === id;
    const text = `${label} (${count})`;
    const iconHtml = id !== 'all' && icon ? msIconHtml(icon, 'rh-filter-chip__icon') : '';
    return `
      <button
        type="button"
        class="rh-filter-chip${isActive ? ' is-active' : ''}"
        data-rh-filter="${escapeHtml(id)}"
        role="tab"
        aria-selected="${isActive ? 'true' : 'false'}"
      >${iconHtml}${escapeHtml(text)}</button>`;
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
    ? reportOrcamentoPorPreparar(report)
      ? '<span class="rh-list-item__orcamento-badge rh-list-item__orcamento-badge--pending" title="Proposta comercial por preparar">Orçamento</span>'
      : '<span class="rh-list-item__orcamento-badge" title="Pedido de orçamento">Orçamento</span>'
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
        <button type="button" class="rh-quick-btn rh-quick-btn--approve" data-quick-approve="${escapeHtml(report.id)}" title="Aprovar" aria-label="Aprovar relatório">${msIconHtml('check', 'rh-quick-btn__icon')}</button>
        <button type="button" class="rh-quick-btn rh-quick-btn--reject" data-quick-reject="${escapeHtml(report.id)}" title="Rejeitar" aria-label="Rejeitar relatório">${msIconHtml('close', 'rh-quick-btn__icon')}</button>
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
              <span class="rh-list-item__service">${serviceIconHtml(service, 'rh-list-item__service-icon')} ${escapeHtml(serviceLabel)}</span>
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

/**
 * Pasta de visita no painel RH — vários relatórios do mesmo serviço.
 */
export function buildRhVisitaFolder({ servicoId, reports, getJobFn = getJob, avaliacao = null }) {
  const { title, dateLabel, state, servico } = getServicoReviewMeta(servicoId);
  const statusParts = [];
  if (state.pending) statusParts.push(`${state.pending} pendente${state.pending === 1 ? '' : 's'}`);
  if (state.approved) statusParts.push(`${state.approved} aprovado${state.approved === 1 ? '' : 's'}`);
  if (state.rejected) statusParts.push(`${state.rejected} rejeitado${state.rejected === 1 ? '' : 's'}`);
  if (state.draft) statusParts.push(`${state.draft} rascunho${state.draft === 1 ? '' : 's'}`);

  const emailHint = servico?.clientEmailSentAt
    ? `<span class="rh-visita-folder__email-hint text-muted">E-mail enviado ao cliente</span>`
    : state.total > 1 && !state.allApproved
      ? `<span class="rh-visita-folder__email-hint text-muted">E-mail único quando todos estiverem aprovados</span>`
      : state.allApproved
        ? `<span class="rh-visita-folder__email-hint text-muted">Pronto para enviar e-mail ao cliente</span>`
        : '';

  const avaliacaoHint = avaliacao
    ? `<span class="rh-visita-folder__email-hint" title="Avaliação do cliente">Cliente: ${escapeHtml(avaliacao.emoji)} ${escapeHtml(avaliacao.label)}</span>`
    : '';

  const reviewBtn = state.hasPending
    ? `<button type="button" class="btn-primary btn-sm" data-servico-review="${escapeHtml(servicoId)}">Rever visita</button>`
    : '';

  const reportsHtml = reports
    .map((report) => {
      const item = buildRhReviewListItem({
        job: report.jobId ? getJobFn(report.jobId) : null,
        report,
        client: getClient(report.clientId),
        tech: getTechnician(report.technicianId),
      });
      const rowClass =
        report.status === 'pending_review' ? ' rh-visita-folder__report-row--pending' : '';
      return `<div class="rh-visita-folder__report-row${rowClass}"><div class="rh-visita-folder__report-item">${item}</div></div>`;
    })
    .join('');

  return `
    <article class="rh-visita-folder" data-servico-id="${escapeHtml(servicoId)}" role="listitem">
      <header class="rh-visita-folder__header">
        <div class="rh-visita-folder__heading">
          ${msIconHtml('clipboard', 'rh-visita-folder__icon')}
          <div>
            <h3 class="rh-visita-folder__title">${escapeHtml(title)}</h3>
            <p class="rh-visita-folder__meta">${escapeHtml(dateLabel)} · ${state.total} relatório${state.total === 1 ? '' : 's'}${statusParts.length ? ` · ${escapeHtml(statusParts.join(', '))}` : ''}</p>
          </div>
        </div>
        <div class="rh-visita-folder__actions">
          ${emailHint}
          ${avaliacaoHint}
          ${reviewBtn}
        </div>
      </header>
      <div class="rh-visita-folder__reports" role="list">${reportsHtml}</div>
      ${
        state.total > 1
          ? `<p class="rh-visita-folder__hint text-muted">Assinaturas partilhadas no fim da visita — cada relatório é aprovado ou rejeitado individualmente.</p>`
          : ''
      }
    </article>
  `;
}

function buildRhVisitReviewBanner(servicoId, currentReportId) {
  const { title, dateLabel, reports } = getServicoReviewMeta(servicoId);
  const state = summarizeServicoReviewState(reports);
  if (reports.length < 2) return '';

  const rows = reports
    .map((r) => {
      const st = getServiceType(r.serviceType);
      const isCurrent = r.id === currentReportId;
      const label = st?.label || r.serviceType || 'Relatório';
      const badge = renderReportWorkStateBadge(r, r.jobId ? getJob(r.jobId) : null);
      return `<li class="rh-visita-review-context__item${isCurrent ? ' is-current' : ''}">
        <button type="button" class="rh-visita-review-context__link" data-visit-report-open="${escapeHtml(r.id)}" ${isCurrent ? 'aria-current="true"' : ''}>
          ${serviceIconHtml(st, 'ms-icon')} ${escapeHtml(label)} ${badge}
        </button>
      </li>`;
    })
    .join('');

  return `
    <section class="rh-visita-review-context" aria-label="Relatórios desta visita">
      <p class="rh-visita-review-context__lead">
        <strong>Visita:</strong> ${escapeHtml(title)} — ${escapeHtml(dateLabel)}
        · ${state.pending} pendente${state.pending === 1 ? '' : 's'} de ${state.total}
      </p>
      <ul class="rh-visita-review-context__list">${rows}</ul>
    </section>
  `;
}

/**
 * Lista RH — pastas de visita (serviço) + cartões soltos, agrupados por dia.
 */
export function buildRhReviewGroupedStack(reports, { getJobFn = getJob, avaliacoesMap = null } = {}) {
  const stackItems = groupReportsForRhStack(reports);
  const dayGroups = groupRhStackItemsByDay(stackItems, getJobFn);

  const renderStackItem = (item) => {
    if (item.kind === 'servico') {
      const avaliacao =
        avaliacoesMap && typeof avaliacoesMap.get === 'function'
          ? avaliacoesMap.get(String(item.servicoId)) || null
          : null;
      return buildRhVisitaFolder({
        servicoId: item.servicoId,
        reports: item.reports,
        getJobFn,
        avaliacao,
      });
    }
    const report = item.report;
    const job = report.jobId ? getJobFn(report.jobId) : null;
    return buildRhReviewListItem({
      job,
      report,
      client: getClient(report.clientId),
      tech: getTechnician(report.technicianId),
    });
  };

  return dayGroups
    .map((group) => {
      const cards = group.items.map(renderStackItem).join('');
      const countLabel = `${group.items.length} relatório${group.items.length === 1 ? '' : 's'}`;
      return `
        <section class="rh-review-day-group" data-day="${escapeHtml(group.dateIso)}" aria-label="${escapeHtml(group.label)}">
          <header class="rh-review-day-group__header">
            <h3 class="rh-review-day-group__title">${escapeHtml(group.label)}</h3>
            <span class="rh-review-day-group__count">${escapeHtml(countLabel)}</span>
          </header>
          <div class="rh-review-day-group__items" role="list">${cards}</div>
        </section>
      `;
    })
    .join('');
}

/** Abre revisão da visita — primeiro relatório pendente. */
export async function openRhServicoReview(servicoId, callbacks = {}) {
  const reportId = getFirstPendingReportIdForServico(servicoId);
  if (!reportId) {
    showToast('Nenhum relatório pendente nesta visita.', 'info', 5000);
    return;
  }
  await openRhReviewModal(reportId, callbacks);
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
  const nextReportId = showWorkflow ? callbacks.getNextReportId?.(reportId) : null;
  const hasNext = Boolean(nextReportId);
  const nextReport = nextReportId ? getReport(nextReportId) : null;
  const approveNextLabel = getRhApproveNextLabel(report, nextReport);
  const showBilling = Boolean(showWorkflow && callbacks.navigateToBilling);
  const servicoId = report.servicoId ? String(report.servicoId) : '';
  const visitBannerHtml = servicoId ? buildRhVisitReviewBanner(servicoId, reportId) : '';

  if (servicoId) {
    const { ensureServicosLoadedSafe } = await import('./servicos-db.js');
    await ensureServicosLoadedSafe();
  }
  const signatures = resolvePdfSignaturesForReport(report);

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
    approveNextLabel,
    signatures,
    visitBannerHtml,
  });

  const overlay = openModal(
    '',
    content,
    '',
    {
      review: true,
      reviewWide: true,
      titleHtml: `${serviceIconHtml(service)} ${escapeHtml(service?.label || 'Relatório')} — ${escapeHtml(statusLabel)}`,
    },
  );

  bindReviewFotoClicks(overlay);
  bindReviewPdfButton(overlay, { job, report });
  bindReviewOrcamentoButton(overlay, { report });
  bindReviewTabs(overlay);

  overlay.querySelectorAll('[data-visit-report-open]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextId = btn.getAttribute('data-visit-report-open');
      if (!nextId || nextId === reportId) return;
      closeModal();
      await openRhReviewModal(nextId, callbacks);
    });
  });

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);

  if (showWorkflow) {
    const runApprove = async (mode = 'single') => {
      const andNext = mode === 'next';
      const andBilling = mode === 'billing';
      const clientEmailDraft = readReviewClientEmail(overlay);
      const checks = computeReviewChecks({ report, job, client, values, clientEmail: clientEmailDraft });
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
      const extraEmailErr = await validateReviewExtraClientEmail(overlay);
      if (extraEmailErr) {
        showToast(extraEmailErr, 'error');
        return;
      }
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
      try {
        const clientEmail = readReviewClientEmail(overlay);
        const extraClientEmail = readReviewExtraClientEmail(overlay);
        const ok = await approveReport(reportId, {
          clientEmail,
          extraClientEmail: extraClientEmail || undefined,
        });
        if (!ok) return;

        const nextId = andNext ? callbacks.getNextReportId?.(reportId) : null;

        closeModal();
        await callbacks.onApproved?.();

        if (andBilling && callbacks.navigateToBilling) {
          await callbacks.navigateToBilling(reportId);
          return;
        }

        if (andNext) {
          if (nextId) {
            await openRhReviewModal(nextId, callbacks);
          } else {
            showToast('Não há mais relatórios pendentes na fila atual.', 'info');
          }
        }
      } catch (err) {
        console.error('[RH] Aprovar relatório:', err);
        showToast(err?.message || 'Erro ao aprovar o relatório.', 'error', 8000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
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
      const extraEmailErr = await validateReviewExtraClientEmail(overlay);
      if (extraEmailErr) {
        showToast(extraEmailErr, 'error');
        return;
      }
      const clientEmail = readReviewClientEmail(overlay);
      const extraClientEmail = readReviewExtraClientEmail(overlay);
      const fallbackEmail = client?.email || client?.['E-mail'] || '';
      if (!clientEmail && !fallbackEmail && !extraClientEmail) {
        showToast('Indique o e-mail do cliente para reenviar.', 'warning');
        return;
      }

      const btn = overlay.querySelector('#modal-resend-email');
      if (btn) btn.disabled = true;
      const ok = await resendApprovedReportEmail(reportId, {
        clientEmail: clientEmail || undefined,
        extraClientEmail: extraClientEmail || undefined,
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
  approveNextLabel = 'Aprovar e seguinte',
  signatures = null,
  visitBannerHtml = '',
}) {
  const data = report?.data || {};
  const resolvedSignatures = signatures || data.signatures || {};
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
        : 'E-mail para envio do relatório técnico após aprovação. A proposta comercial usa outro destinatário.',
  });
  const hasFotos = reviewJobHasFotos(job, report);
  const checks = computeReviewChecks({ report, job, client, values });
  const validationHtml = renderReviewValidationPanel(checks);
  const executiveHtml = renderReviewExecutiveList(
    buildReviewExecutiveBullets({ service, report, job, client, tech, values }),
  );
  const fotosHtml = hasFotos ? renderReviewFotosSection(job, report) : '';
  const serviceLine = service
    ? `${serviceIconHtml(service, 'ms-icon')} ${escapeHtml(service.label || report?.serviceType || '—')}`
    : '—';
  const queueAge = report?.submittedAt ? formatReportAge(report.submittedAt) : '';

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="btn-danger btn-touch review-action-btn" id="modal-reject" title="Alt+R">Rejeitar</button>
        <button type="button" class="btn-success btn-touch review-action-btn" id="modal-approve" title="Alt+A">Aprovar</button>
        ${showApproveNext ? `<button type="button" class="btn-primary btn-touch review-action-btn" id="modal-approve-next" title="Alt+Shift+A">${escapeHtml(approveNextLabel)}</button>` : ''}
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
      ${visitBannerHtml}
      <header class="review-meta-card review-meta-card--enhanced">
        <div class="review-meta-card__top">
          <div class="review-ordem-block">
            <span class="review-ordem-kicker">Ordem Nº</span>
            <span class="review-ordem-num">${escapeHtml(formatOrdemLabel(job))}</span>
          </div>
          ${queueAge ? `<span class="review-queue-badge">${escapeHtml(queueAge)}</span>` : ''}
        </div>
        <p class="review-meta-row"><strong>Serviço:</strong> ${serviceLine}</p>
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
            <h4 class="review-section-title">Assinaturas${report?.servicoId ? ' da visita' : ''}</h4>
            <p class="review-signatures">
              Técnico: ${resolvedSignatures?.technicianData || resolvedSignatures?.technician ? 'Assinado' : 'Pendente'}
              · Cliente: ${resolvedSignatures?.clientData || resolvedSignatures?.client ? 'Assinado' : 'Pendente'}
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
