/**
 * Manusilva PWA — HR / Admin Dashboard
 */

import {
  requireAuth,
  getWeekDates,
  getAllJobs,
  getClient,
  getTechnician,
  getServiceType,
  getPendingReports,
  getAdminReviewReports,
  getRhPanelReportCounts,
  getReport,
  approveReport,
  rejectReport,
  assignJob,
  deleteJob,
  getJob,
  warmJobs,
  getReportForJob,
  statusBadge,
  warmClientsCatalog,
  warmOperacoes,
  getAllTechnicians,
  openModal,
  closeModal,
  escapeHtml,
  formatDate,
  formatDateLong,
  getDayLabel,
  getDayNumber,
  isToday,
  COMPANY,
  applyBrandLogo,
  SERVICE_TYPES,
  showToast,
  showNotificationToast,
} from './app.js';
import { getCalendarEventStateClass } from './calendar-event-state.js';
import { ensureProductionCatalog, formatClientsLoadError } from './clients-catalog.js';
import { renderClientCombobox, bindClientComboboxes } from './client-combobox.js';
import { initLogoutButton, renderUserGreeting } from './auth.js';
import { initMetricsPanel, refreshMetricsPanel } from './views/dashboard.js';
import { initClientsApp } from './views/clients-app.js';
import { initEmployeesPanel, refreshTechniciansList } from './views/rh-registry.js';
import { initArquivoHistoricoPage, refreshArquivoHistoricoPage } from './views/arquivo-historico.js';

/** Aba ativa do painel admin (controlada pela sidebar) */
let currentTab = 'calendario';

const ADMIN_TAB_BY_NAV = {
  '#calendar': 'calendario',
  '#pending': 'relatorios',
  '#clients': 'clientes',
  '#client-history': 'clientes',
  '#employees': 'funcionarios',
};

let calendarView = 'week';
let filterTechId = 'all';
let currentWeekOffset = 0;
/** Filtro ativo no painel RH — por defeito mostra pendentes */
let rhReviewFilter = 'pending_review';
/** Relatório com detalhe expandido no painel RH (null = todos compactos) */
let relatorioSelecionadoId = null;

const RH_EMPTY_MESSAGES = {
  all: 'Nenhum relatório no histórico.',
  pending_review: 'Nenhum relatório pendente de aprovação neste momento.',
  draft: 'Nenhum rascunho em curso.',
  approved: 'Nenhum relatório aprovado.',
  rejected: 'Nenhum relatório recusado.',
};

const AGENDA_SWIPE_OPEN_PX = 88;

let reviewPanelHeightObserver = null;

/** Iguala a altura do painel de relatórios à do calendário (scroll interno isolado). */
function syncReviewPanelHeight() {
  const cal = document.querySelector('.admin-split-calendar');
  const panel = document.querySelector('.admin-review-panel');
  if (!cal || !panel) return;

  if (window.matchMedia('(max-width: 1024px)').matches) {
    panel.style.removeProperty('height');
    panel.style.removeProperty('max-height');
    return;
  }

  const h = cal.offsetHeight;
  if (h > 0) {
    panel.style.height = `${h}px`;
    panel.style.maxHeight = `${h}px`;
  }
}

function bindReviewPanelHeightSync() {
  if (reviewPanelHeightObserver) return;
  const cal = document.querySelector('.admin-split-calendar');
  if (!cal) return;

  reviewPanelHeightObserver = new ResizeObserver(() => {
    syncReviewPanelHeight();
  });
  reviewPanelHeightObserver.observe(cal);

  window.addEventListener('resize', syncReviewPanelHeight, { passive: true });
}

export function setAdminTab(tab) {
  if (!tab) return;
  currentTab = tab;
  updateAdminTabUI();
  document.querySelector('.admin-main')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAdminTabUI() {
  document.querySelectorAll('[data-admin-tab]').forEach((panel) => {
    const tabs = String(panel.dataset.adminTab || '')
      .split(/\s+/)
      .filter(Boolean);
    panel.classList.toggle('is-active', tabs.includes(currentTab));
  });

  document.querySelectorAll('[data-admin-subtab]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.adminSubtab === currentTab);
  });

  document.querySelectorAll('.nav-item[data-admin-tab]').forEach((item) => {
    item.classList.toggle('active', item.dataset.adminTab === currentTab);
  });

  const showSplit = currentTab === 'calendario' || currentTab === 'relatorios';
  if (showSplit) {
    requestAnimationFrame(() => syncReviewPanelHeight());
  }
}

function bindAdminNavigation() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      const tab = item.dataset.adminTab || ADMIN_TAB_BY_NAV[href];
      if (tab) setAdminTab(tab);
    });
  });
}

export async function initAdminDashboard() {
  const session = requireAuth('admin');
  if (!session) return;

  renderUserGreeting('user-name');
  initLogoutButton();
  bindAdminNavigation();

  try {
    await warmClientsCatalog();
    await warmOperacoes();
  } catch (err) {
    console.error('[Admin] Supabase:', err);
    showToast(formatClientsLoadError(err), 'error', 9000);
  }

  try {
    renderSidebar();
    renderCalendar();
    bindReviewPanelHeightSync();
    bindViewToggle();
    bindCalendarJobInteractions();
    bindRhReviewPanel();
    bindAssignWork();
    updatePendingCount();
    renderRhReviewStack().catch(console.error);
    updateAdminTabUI();
  } catch (err) {
    console.error('[Admin] Erro ao iniciar painel:', err);
    showToast('Erro ao carregar o calendário. Veja a consola (F12).', 'error');
  }

  const { initAdminRealtime, playNotificationBeep } = await import('./admin-realtime.js');
  initAdminRealtime({
    onTrabalhoInserted: () => {
      try {
        renderCalendar();
      } catch (e) {
        console.error('[Admin] Calendário após trabalho realtime:', e);
      }
    },
    onTrabalhoPendente: (job) => {
      const report = getReportForJob(job.id);
      if (report?.status === 'pending_review') {
        handleNewPendingReport(report, { playSound: true }, playNotificationBeep).catch(console.error);
      }
    },
    onPendingReport: (report, opts = {}) => {
      handleNewPendingReport(report, opts, playNotificationBeep).catch(console.error);
    },
  }).catch((err) => {
    console.error('[Admin] Realtime:', err);
  });

  const historyRoot = document.getElementById('client-history-app');
  const metricsRoot = document.getElementById('admin-metrics-root');

  await Promise.all([
    metricsRoot
      ? initMetricsPanel(metricsRoot).catch((err) => {
          console.error('[Admin] Métricas:', err);
        })
      : Promise.resolve(),
    initClientsApp().catch((err) => {
      console.error('[Admin] Painel de clientes:', err);
      showToast(formatClientsLoadError(err), 'error', 9000);
    }),
    historyRoot
      ? initArquivoHistoricoPage(historyRoot).catch((err) => {
          console.error('[Admin] Histórico de clientes:', err);
          showToast(formatClientsLoadError(err), 'error', 9000);
        })
      : Promise.resolve(),
  ]);

  try {
    initEmployeesPanel(document.getElementById('employees-panel'));
  } catch (err) {
    console.error('[Admin] Funcionários:', err);
    showToast('Erro ao carregar cadastro de técnicos.', 'error');
  }

  window.addEventListener('db-updated', () => {
    try {
      renderCalendar();
      renderSidebar();
      refreshTechniciansList(document.getElementById('employees-panel'));
    } catch (err) {
      console.error('[Admin] Atualização:', err);
    }
    refreshMetricsPanel().catch(console.error);
    refreshArquivoHistoricoPage();
    updatePendingCount();
    renderRhReviewStack().catch(console.error);
  });
}

function renderSidebar() {
  if (!applyBrandLogo()) {
    const logoEl = document.getElementById('brand-logo');
    if (logoEl) logoEl.textContent = COMPANY.logo;
    const nameEl = document.getElementById('brand-name');
    if (nameEl) nameEl.textContent = COMPANY.name;
  }

  const filter = document.getElementById('tech-filter');
  if (filter) {
    const previous = filter.value;
    filter.innerHTML = `
      <option value="all">Todos os Técnicos</option>
      ${getAllTechnicians()
        .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
        .join('')}
    `;
    if ([...filter.options].some((o) => o.value === previous)) {
      filter.value = previous;
    }
    if (filter.dataset.bound !== 'true') {
      filter.dataset.bound = 'true';
      filter.addEventListener('change', () => {
        filterTechId = filter.value;
        renderCalendar();
      });
    }
  }
}

function bindViewToggle() {
  document.querySelectorAll('[data-cal-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calendarView = btn.dataset.calView;
      document.querySelectorAll('[data-cal-view]').forEach((b) => b.classList.toggle('active', b === btn));
      renderCalendar();
    });
  });

  document.getElementById('prev-week')?.addEventListener('click', () => {
    currentWeekOffset--;
    renderCalendar();
  });
  document.getElementById('next-week')?.addEventListener('click', () => {
    currentWeekOffset++;
    renderCalendar();
  });
}

function getCalendarDates() {
  const base = new Date();
  base.setDate(base.getDate() + currentWeekOffset * 7);
  if (calendarView === 'week' || calendarView === 'list') return getWeekDates(base);

  const dates = [];
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  return dates;
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('calendar-title');
  if (!grid) return;

  const dates = getCalendarDates();
  const jobs = getAllJobs().filter((j) => filterTechId === 'all' || j.technicianId === filterTechId);

  const firstDate = new Date(dates[0] + 'T00:00:00');
  if (calendarView === 'list') {
    title.textContent = `Agenda — Semana de ${formatDate(dates[0])}`;
  } else if (calendarView === 'week') {
    title.textContent = `Semana de ${formatDate(dates[0])}`;
  } else {
    title.textContent = firstDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  }

  if (calendarView === 'list') {
    grid.className = 'calendar-grid calendar-agenda-list';
    grid.innerHTML = renderAgendaList(jobs, dates);
    bindAgendaSwipeRows(grid);
  } else if (calendarView === 'week') {
    grid.className = 'calendar-grid calendar-week';
    grid.innerHTML = dates.map((date) => {
      const dayJobs = jobs.filter((j) => j.date === date);
      return `
        <div class="cal-col ${isToday(date) ? 'today-col' : ''}">
          <div class="cal-col-header">
            <span>${getDayLabel(date)}</span>
            <strong>${getDayNumber(date)}</strong>
          </div>
          <div class="cal-col-body">
            ${dayJobs.map((j) => renderCalendarBlock(j)).join('') || '<span class="cal-empty">—</span>'}
          </div>
        </div>
      `;
    }).join('');
  } else {
    grid.className = 'calendar-grid calendar-month';
    const startDay = firstDate.getDay();
    const pad = startDay === 0 ? 6 : startDay - 1;
    let html = Array(pad).fill('<div class="cal-cell cal-pad"></div>').join('');

    dates.forEach((date) => {
      const dayJobs = jobs.filter((j) => j.date === date);
      html += `
        <div class="cal-cell ${isToday(date) ? 'today-cell' : ''}">
          <span class="cal-cell-day">${getDayNumber(date)}</span>
          ${dayJobs.slice(0, 3).map((j) => renderCalendarBlock(j, true)).join('')}
          ${dayJobs.length > 3 ? `<span class="cal-more">+${dayJobs.length - 3}</span>` : ''}
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  requestAnimationFrame(() => syncReviewPanelHeight());
}

function renderCalendarBlock(job, compact = false) {
  const tech = getTechnician(job.technicianId);
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const report = getReportForJob(job.id);
  const stateClass = getCalendarEventStateClass(job, report);
  const sizeClass = compact ? 'cal-block cal-block-sm' : 'cal-block';
  const cls = `${sizeClass} cal-block--interactive ${stateClass}`;
  const label = `${job.time} — ${client?.name || 'Cliente'} — ${service?.label || 'Serviço'}`;
  return `
    <button type="button" class="${cls}" data-job-id="${job.id}" style="--tech-color:${tech?.color || '#3b82f6'}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="cal-block-time">${job.time}</span>
      <span class="cal-block-client">${escapeHtml(compact ? client?.name?.split(' ')[0] : client?.name)}</span>
      ${!compact ? `<span class="cal-block-tech">${escapeHtml(tech?.name?.split(' ')[0])}</span>` : ''}
    </button>
  `;
}

function sortJobsByDateTime(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || '').localeCompare(b.time || '');
}

function renderAgendaList(jobs, dates) {
  const dateSet = new Set(dates);
  const inRange = jobs.filter((j) => dateSet.has(j.date)).sort(sortJobsByDateTime);

  if (!inRange.length) {
    return '<p class="cal-empty">Sem serviços atribuídos neste período.</p>';
  }

  return dates
    .map((date) => {
      const dayJobs = inRange.filter((j) => j.date === date);
      if (!dayJobs.length) return '';

      return `
        <section class="agenda-day-group" aria-label="${escapeHtml(formatDateLong(date))}">
          <h3 class="agenda-day-heading">${escapeHtml(formatDateLong(date))}</h3>
          ${dayJobs.map((j) => renderAgendaListItem(j)).join('')}
        </section>
      `;
    })
    .filter(Boolean)
    .join('');
}

function renderAgendaListItem(job) {
  const tech = getTechnician(job.technicianId);
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const report = getReportForJob(job.id);
  const stateClass = getCalendarEventStateClass(job, report);
  const serial = job.forkliftSerial ? ` · ${job.forkliftSerial}` : '';

  return `
    <div class="agenda-swipe-row" data-job-id="${job.id}">
      <div class="agenda-swipe-actions" aria-hidden="true">
        <button type="button" class="agenda-swipe-delete" data-delete-job="${job.id}">Eliminar</button>
      </div>
      <div class="agenda-swipe-track">
        <button type="button" class="agenda-list-item ${stateClass}" data-job-id="${job.id}" style="--tech-color:${tech?.color || '#3b82f6'}">
          <div class="agenda-list-top">
            <span class="agenda-list-time">${job.time}</span>
            ${statusBadge(job.status)}
          </div>
          <p class="agenda-list-client">${escapeHtml(client?.name || 'Cliente')}</p>
          <p class="agenda-list-meta">${service?.icon || '🔧'} ${escapeHtml(service?.label || job.serviceType)} · ${escapeHtml(tech?.name || '—')}${escapeHtml(serial)}</p>
        </button>
      </div>
    </div>
  `;
}

/** Clique nos blocos do calendário (semana / mês) */
function bindCalendarJobInteractions() {
  const grid = document.getElementById('calendar-grid');
  if (!grid || grid.__calendarJobsBound) return;
  grid.__calendarJobsBound = true;

  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-delete-job]')) return;
    const trigger = e.target.closest('[data-job-id]');
    if (!trigger?.dataset.jobId) return;
    e.preventDefault();
    openJobDetailModal(trigger.dataset.jobId);
  });
}

function scrollToReportInPanel(reportId) {
  if (!reportId) return;
  setAdminTab('relatorios');
  const card = document.querySelector(`#rh-review-panel [data-report-id="${reportId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('rh-review-stack-card--highlight');
  setTimeout(() => card.classList.remove('rh-review-stack-card--highlight'), 2200);
}

function clearRhReviewSelection() {
  relatorioSelecionadoId = null;
}

/** Renderiza histórico completo de relatórios no painel direito (com filtros rápidos). */
async function renderRhReviewStack() {
  const panel = document.getElementById('rh-review-panel');
  if (!panel) return;

  try {
    await warmOperacoes();
  } catch (err) {
    console.warn('[Admin] Dados para painel de relatórios:', err);
  }

  updatePendingCount();

  const counts = getRhPanelReportCounts();
  const reports = getAdminReviewReports(rhReviewFilter);

  if (
    relatorioSelecionadoId &&
    !reports.some((r) => r.id === relatorioSelecionadoId)
  ) {
    relatorioSelecionadoId = null;
  }

  const { renderReportValuesForReview } = await import('./form-engine.js');
  const { buildRhReviewListItem, buildRhReviewFilterBar } = await import(
    './report-review-rh-modal.js'
  );

  const filterBar = buildRhReviewFilterBar(counts, rhReviewFilter);

  let stackHtml;
  if (!reports.length) {
    const emptyMsg = RH_EMPTY_MESSAGES[rhReviewFilter] || RH_EMPTY_MESSAGES.all;
    stackHtml = `<p class="rh-review-panel-empty">${escapeHtml(emptyMsg)}</p>`;
  } else {
    const cards = reports
      .map((report) => {
        const expanded = relatorioSelecionadoId === report.id;
        const job = report.jobId ? getJob(report.jobId) : null;
        const client = getClient(report.clientId);
        const tech = getTechnician(report.technicianId);
        const service = getServiceType(report.serviceType);
        const fieldsHTML = expanded
          ? renderReportValuesForReview(service, report.data?.values || {})
          : '';

        return buildRhReviewListItem({
          job,
          report,
          client,
          tech,
          service,
          fieldsHTML,
          expanded,
          showWorkflow: report.status === 'pending_review',
        });
      })
      .join('');

    stackHtml = `<div class="rh-review-stack" role="list">${cards}</div>`;
  }

  panel.innerHTML = `
    <div class="rh-review-panel-inner">
      ${filterBar}
      <div class="rh-review-stack-wrap">${stackHtml}</div>
    </div>`;

  const { bindReviewFotoClicks } = await import('./report-review-ui.js');
  bindReviewFotoClicks(panel);

  requestAnimationFrame(() => syncReviewPanelHeight());
}

let rhReviewPanelBound = false;

function bindRhReviewPanel() {
  const panel = document.getElementById('rh-review-panel');
  if (!panel || rhReviewPanelBound) return;
  rhReviewPanelBound = true;

  panel.addEventListener('click', async (e) => {
    const filterBtn = e.target.closest('[data-rh-filter]');
    if (filterBtn) {
      const next = filterBtn.dataset.rhFilter;
      if (next && next !== rhReviewFilter) {
        rhReviewFilter = next;
        clearRhReviewSelection();
        await renderRhReviewStack();
      }
      return;
    }

    const openBtn = e.target.closest('[data-panel-open]');
    if (openBtn) {
      relatorioSelecionadoId = openBtn.dataset.panelOpen || null;
      await renderRhReviewStack();
      if (relatorioSelecionadoId) scrollToReportInPanel(relatorioSelecionadoId);
      return;
    }

    const closeBtn = e.target.closest('[data-panel-close]');
    if (closeBtn) {
      clearRhReviewSelection();
      await renderRhReviewStack();
      return;
    }

    const pdfBtn = e.target.closest('[data-panel-pdf]');
    if (pdfBtn) {
      const report = getReport(pdfBtn.dataset.panelPdf);
      if (!report) return;
      pdfBtn.disabled = true;
      try {
        const { previewReportPDF } = await import('./pdf-preview.js');
        showToast('A gerar pré-visualização do relatório…', 'info', 2500);
        await previewReportPDF(report);
      } catch (err) {
        console.error('[RH] PDF:', err);
        showToast('Não foi possível gerar a pré-visualização.', 'error');
      } finally {
        pdfBtn.disabled = false;
      }
      return;
    }

    const approveBtn = e.target.closest('[data-panel-approve]');
    if (approveBtn) {
      approveBtn.disabled = true;
      const ok = await approveReport(approveBtn.dataset.panelApprove);
      approveBtn.disabled = false;
      if (ok) {
        clearRhReviewSelection();
        renderCalendar();
        refreshMetricsPanel().catch(console.error);
        await renderRhReviewStack();
      }
      return;
    }

    const rejectBtn = e.target.closest('[data-panel-reject]');
    if (rejectBtn) {
      openRejectDialog(rejectBtn.dataset.panelReject);
    }
  });
}

/** Swipe para a esquerda na vista Agenda — revela Eliminar */
function bindAgendaSwipeRows(container) {
  let openRow = null;

  const closeRow = (row) => {
    if (!row) return;
    row.classList.remove('is-open');
    const track = row.querySelector('.agenda-swipe-track');
    if (track) track.style.transform = '';
  };

  container.querySelectorAll('.agenda-swipe-row').forEach((row) => {
    const track = row.querySelector('.agenda-swipe-track');
    if (!track) return;

    let startX = 0;
    let startOffset = 0;
    let dragging = false;

    const applyOffset = (px) => {
      const clamped = Math.max(-AGENDA_SWIPE_OPEN_PX, Math.min(0, px));
      track.style.transform = `translateX(${clamped}px)`;
      return clamped;
    };

    const snapOpen = (open) => {
      if (open && openRow && openRow !== row) closeRow(openRow);
      if (open) {
        row.classList.add('is-open');
        track.style.transform = `translateX(-${AGENDA_SWIPE_OPEN_PX}px)`;
        openRow = row;
      } else {
        closeRow(row);
        if (openRow === row) openRow = null;
      }
    };

    track.addEventListener(
      'touchstart',
      (e) => {
        if (e.target.closest('[data-delete-job]')) return;
        dragging = true;
        startX = e.touches[0].clientX;
        startOffset = row.classList.contains('is-open') ? -AGENDA_SWIPE_OPEN_PX : 0;
      },
      { passive: true },
    );

    track.addEventListener(
      'touchmove',
      (e) => {
        if (!dragging) return;
        const dx = e.touches[0].clientX - startX;
        applyOffset(startOffset + dx);
      },
      { passive: true },
    );

    track.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const wasOpen = row.classList.contains('is-open');
      if (wasOpen && dx > 28) snapOpen(false);
      else if (!wasOpen && dx < -36) snapOpen(true);
      else snapOpen(wasOpen);
    });

    track.addEventListener('touchcancel', () => {
      dragging = false;
      snapOpen(row.classList.contains('is-open'));
    });
  });

  container.querySelectorAll('[data-delete-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteJob(btn.dataset.deleteJob);
    });
  });
}

function buildJobDetailContent(job) {
  const tech = getTechnician(job.technicianId);
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const report = getReportForJob(job.id);

  let reportLine = 'Sem relatório iniciado';
  if (report?.status === 'draft') reportLine = 'Rascunho guardado pelo técnico';
  else if (report?.status === 'pending_review') reportLine = 'Aguarda aprovação (RH)';
  else if (report?.status === 'approved') reportLine = 'Relatório aprovado';
  else if (report) reportLine = `Relatório: ${report.status}`;

  const rejectionBlock =
    job.status === 'rejected' && job.rejectionNote
      ? `<div class="job-detail-rejection"><strong>Nota de rejeição</strong>${escapeHtml(job.rejectionNote)}</div>`
      : '';

  return `
    <dl class="job-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(client?.name || '—')}</dd></div>
      <div><dt>Técnico</dt><dd>${escapeHtml(tech?.name || '—')}</dd></div>
      <div><dt>Serviço</dt><dd>${service?.icon || ''} ${escapeHtml(service?.label || job.serviceType)}</dd></div>
      <div><dt>Data e hora</dt><dd>${escapeHtml(formatDateLong(job.date))} · ${escapeHtml(job.time)}</dd></div>
      <div><dt>N.º série</dt><dd>${escapeHtml(job.forkliftSerial || '—')}</dd></div>
      <div><dt>Estado</dt><dd>${statusBadge(job.status)}</dd></div>
      <div><dt>Relatório</dt><dd>${escapeHtml(reportLine)}</dd></div>
    </dl>
    ${rejectionBlock}
  `;
}

function openJobDetailModal(jobId) {
  const job = getJob(jobId);
  if (!job) {
    showToast('Serviço não encontrado.', 'error');
    return;
  }

  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const modalTitle = `${service?.icon || '🔧'} ${client?.name || 'Serviço'} — ${job.time}`;

  const actions = `
    <button type="button" class="btn-ghost" id="job-detail-close">Fechar</button>
    <button type="button" class="btn-danger" id="job-detail-delete">Eliminar</button>
  `;

  const overlay = openModal(modalTitle, buildJobDetailContent(job), actions);

  overlay.querySelector('#job-detail-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#job-detail-delete')?.addEventListener('click', () => {
    closeModal();
    confirmDeleteJob(jobId);
  });
}

function confirmDeleteJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  const report = getReportForJob(jobId);
  const client = getClient(job.clientId);
  const extra = report
    ? '<p class="text-muted" style="margin-top:0.5rem;font-size:0.8125rem">O relatório associado a este trabalho também será removido.</p>'
    : '';

  const content = `
    <p>Tem a certeza que deseja eliminar o serviço atribuído a <strong>${escapeHtml(client?.name || 'este cliente')}</strong> (${escapeHtml(job.date)} ${escapeHtml(job.time)})?</p>
    ${extra}
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="cancel-delete-job">Cancelar</button>
    <button type="button" class="btn-danger" id="confirm-delete-job">Eliminar</button>
  `;

  const overlay = openModal('Eliminar trabalho', content, actions);
  overlay.querySelector('#cancel-delete-job')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-delete-job')?.addEventListener('click', async () => {
    if (await deleteJob(jobId)) {
      closeModal();
      renderCalendar();
    }
  });
}

function formatOrdemOp2026(numeroOrdem) {
  if (numeroOrdem == null) return 'nova ordem';
  return `Ordem OP-2026-${String(numeroOrdem).padStart(2, '0')}`;
}

function showPendingReportNotification(report) {
  const tech = getTechnician(report.technicianId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const ordem = formatOrdemOp2026(job?.numeroOrdem);

  showNotificationToast(
    'Novo Relatório Pendente!',
    `O técnico ${tech?.name || '—'} acabou de submeter o relatório da ${ordem}.`,
    {
      icon: '🔔',
      duration: 8000,
      dedupeKey: report.id || report.jobId,
      onClick: () => scrollToReportInPanel(report.id),
    },
  );
}

async function handleNewPendingReport(report, opts = {}, beep) {
  if (!report?.id) return;
  try {
    await warmJobs();
  } catch (err) {
    console.warn('[Admin] Trabalhos para notificação:', err);
  }
  rhReviewFilter = 'pending_review';
  relatorioSelecionadoId = report.id;
  setAdminTab('relatorios');
  renderCalendar();
  await renderRhReviewStack();
  showPendingReportNotification(report);
  scrollToReportInPanel(report.id);
  if (opts.playSound && beep) beep();
}

function updatePendingCount() {
  const count = document.getElementById('pending-count');
  if (count) count.textContent = String(getPendingReports().length);
}

function openRejectDialog(reportId) {
  const content = `
    <p class="text-muted mb-4">Escreva uma nota de correção para o técnico:</p>
    <textarea id="reject-note" class="form-textarea" rows="4" placeholder="Ex: Faltam fotos do componente substituído..."></textarea>
  `;
  const actions = `
    <button class="btn-ghost" id="cancel-reject">Cancelar</button>
    <button class="btn-danger" id="confirm-reject">Enviar Rejeição</button>
  `;

  const overlay = openModal('Rejeitar Relatório', content, actions);

  overlay.querySelector('#cancel-reject').addEventListener('click', closeModal);
  overlay.querySelector('#confirm-reject').addEventListener('click', () => {
    const note = document.getElementById('reject-note').value.trim();
    if (!note) {
      showToast('Por favor, escreva uma nota de correção.', 'error');
      return;
    }
    rejectReport(reportId, note).then(async () => {
      closeModal();
      clearRhReviewSelection();
      renderCalendar();
      await renderRhReviewStack();
    });
  });
}

function bindAssignWork() {
  const btn = document.getElementById('btn-assign-work');
  btn?.addEventListener('click', () => {
    openAssignModal().catch((err) => {
      console.error('[Admin] Atribuir trabalho:', err);
      showToast('Erro ao abrir o formulário de atribuição.', 'error');
    });
  });
}

async function openAssignModal() {
  try {
    await ensureProductionCatalog();
  } catch (err) {
    console.error('[Admin] Clientes para atribuição:', err);
    showToast(formatClientsLoadError(err), 'error', 9000);
    return;
  }

  const techOptions = getAllTechnicians()
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
    .join('');

  const content = `
    <form id="assign-form" class="assign-form">
      <div class="form-group">
        <label class="form-label">Técnico</label>
        <select class="form-select" id="assign-tech" required>${techOptions}</select>
      </div>
      ${renderClientCombobox({ fieldId: 'assign-client', label: 'Cliente / Empresa' })}
      <div class="form-group">
        <label class="form-label">Tipo de Serviço</label>
        <select class="form-select" id="assign-service" required>
          ${SERVICE_TYPES.map((s) => `<option value="${s.id}">${s.icon} ${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Data</label>
          <input type="date" class="form-input" id="assign-date" required>
        </div>
        <div class="form-group">
          <label class="form-label">Hora</label>
          <input type="time" class="form-input" id="assign-time" required value="09:00">
        </div>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn-ghost" id="cancel-assign">Cancelar</button>
    <button class="btn-primary" id="confirm-assign">Atribuir Trabalho</button>
  `;

  const overlay = openModal('Atribuir Trabalho', content, actions);
  await bindClientComboboxes(overlay);

  const dateInput = overlay.querySelector('#assign-date');
  dateInput.value = new Date().toISOString().split('T')[0];

  overlay.querySelector('#cancel-assign').addEventListener('click', closeModal);
  overlay.querySelector('#confirm-assign').addEventListener('click', async () => {
    const techId = overlay.querySelector('#assign-tech').value;
    const clientId = overlay.querySelector(
      '[data-client-combobox][data-field-id="assign-client"] .client-combobox-id',
    )?.value;
    const serviceType = overlay.querySelector('#assign-service').value;
    const date = overlay.querySelector('#assign-date').value;
    const time = overlay.querySelector('#assign-time').value;

    if (!techId || !clientId || !date || !time) {
      showToast('Preencha todos os campos.', 'error');
      return;
    }

    const id = await assignJob({
      technicianId: techId,
      clientId,
      forkliftSerial: '',
      serviceType,
      date,
      time,
    });
    if (!id) return;
    closeModal();
    renderCalendar();
  });
}
