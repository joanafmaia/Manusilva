/**
 * Manusilva PWA — Technician Dashboard
 */

import {
  requireAuth,
  getWeekDates,
  getJobsForTechnician,
  getReportForJob,
  getClient,
  getServiceType,
  getTechnician,
  isOffline,
  isNetworkOnline,
  canReachServer,
  setOfflineMode,
  warmOperacoes,
  formatDate,
  getDayLabel,
  getDayNumber,
  isToday,
  COMPANY,
  escapeHtml,
  applyBrandLogo,
} from './app.js';
import {
  getCalendarEventStateClass,
  renderWorkStateBadge,
  resolveCalendarEventState,
} from './calendar-event-state.js';
import { initLogoutButton, renderUserGreeting } from './auth.js';
import { HistoricoClienteView } from './views/historico-cliente.js';
import { ensureTrabalhosSemana } from './trabalhos-db.js';

/** Âncora da semana visível no calendário (segunda-feira da semana em foco) */
let currentWeekDate = startOfLocalDay(new Date());
/** Âncora do mês visível (qualquer dia dentro do mês em foco) */
let currentMonthDate = startOfLocalDay(new Date());
let techCalendarView = 'week';
let selectedDate = new Date().toISOString().split('T')[0];
let weekDates = getWeekDates(currentWeekDate);
let periodJobsCacheKey = null;
let techCalendarNavBound = false;

const TECH_MONTH_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const TECH_MONTH_JOBS_VISIBLE = 4;

/** Carrega `forms.js` (+ `form-engine.js`) só ao abrir um relatório no tablet. */
let formsModulePromise = null;

function loadFormsModule() {
  if (!formsModulePromise) {
    formsModulePromise = import('./forms.js');
  }
  return formsModulePromise;
}

async function openJobFormLazy(jobId, options = {}) {
  const { openJobForm } = await loadFormsModule();
  return openJobForm(jobId, options);
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const TECH_JOBS_SHELL_HTML = `
  <section class="jobs-section" data-tech-jobs-shell>
    <div class="section-header">
      <h2>Trabalhos do Dia</h2>
      <span class="date-label" id="selected-date-label"></span>
    </div>
    <p class="text-muted tech-greeting">
      Olá, <strong id="user-name"></strong>
    </p>
    <div class="jobs-list" id="jobs-list"></div>
  </section>
`;

export function restoreTechDashboard() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = TECH_JOBS_SHELL_HTML;
  renderUserGreeting('user-name');
  refreshTechCalendar().catch(console.error);
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openTechClientHistory(clientId) {
  const app = document.getElementById('app');
  if (!app || !clientId) return;
  app.innerHTML = HistoricoClienteView.render(clientId, {
    batteryOnly: false,
    showWorkflowActions: false,
  });
  HistoricoClienteView.init(clientId, {
    onBack: restoreTechDashboard,
    showWorkflowActions: false,
    batteryOnly: false,
  });
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function initTechDashboard() {
  const session = requireAuth('technician');
  if (!session) return;

  renderUserGreeting('user-name');
  initLogoutButton();
  renderHeader();
  renderOfflineToggle();
  renderOfflineSyncBar();

  const { hydrateLocalReportsIntoCache } = await import('./report-local-storage.js');
  await hydrateLocalReportsIntoCache();

  try {
    await warmOperacoes();
  } catch (err) {
    console.error('[Técnico] Dados Supabase:', err);
  }

  await hydrateLocalReportsIntoCache();

  const { initTrabalhosOfflineSync, migrateLegacyOfflineQueue, sincronizarTrabalhosOffline } =
    await import('./trabalhos-offline.js');
  const { getDB, updateDB } = await import('./app.js');

  await migrateLegacyOfflineQueue(getDB, updateDB);
  initTrabalhosOfflineSync();
  sincronizarTrabalhosOffline().catch(console.error);
  renderOfflineSyncBar();

  bindTechCalendarNavigation();
  await refreshTechCalendar();

  window.addEventListener('jobs-updated', () => {
    periodJobsCacheKey = null;
    refreshTechCalendar().catch(console.error);
  });
  window.addEventListener('db-updated', () => {
    renderOfflineToggle();
    renderOfflineSyncBar();
    periodJobsCacheKey = null;
    refreshTechCalendar().catch(console.error);
  });

  window.addEventListener('trabalhos-pendentes-changed', renderOfflineSyncBar);
  window.addEventListener('online', () => {
    renderOfflineToggle();
    renderOfflineSyncBar();
  });
  window.addEventListener('offline', () => {
    renderOfflineToggle();
    renderOfflineSyncBar();
  });

  bindOfflineSyncButton();
}

let offlineSyncBound = false;

function bindOfflineSyncButton() {
  if (offlineSyncBound) return;
  offlineSyncBound = true;

  document.getElementById('offline-sync-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('offline-sync-btn');
    if (!btn || btn.disabled) return;

    if (!canReachServer()) {
      const { showToast } = await import('./app.js');
      showToast('Sem ligação à internet. O relatório continua guardado neste dispositivo.', 'warning', 6000);
      return;
    }

    btn.disabled = true;
    document.getElementById('offline-sync-bar')?.classList.add('is-syncing');
    const labelEl = btn.querySelector('.offline-sync-banner__action-label');
    const prevLabel = labelEl?.textContent || 'Sincronizar Agora';
    if (labelEl) labelEl.textContent = 'A sincronizar…';

    try {
      const { sincronizarTrabalhosOffline } = await import('./trabalhos-offline.js');
      const { synced, remaining } = await sincronizarTrabalhosOffline();
      const { showToast } = await import('./app.js');

      if (synced > 0) {
        showToast(
          synced === 1
            ? '1 relatório enviado com sucesso.'
            : `${synced} relatórios enviados com sucesso.`,
          'success',
          5000,
        );
        periodJobsCacheKey = null;
        await refreshTechCalendar();
      } else if (remaining > 0) {
        showToast('Não foi possível enviar agora. Tente novamente dentro de momentos.', 'warning', 6000);
      } else {
        showToast('Não há relatórios pendentes.', 'info', 3500);
      }
    } catch (err) {
      console.error('[Técnico] Sincronização manual:', err);
      const { showToast } = await import('./app.js');
      showToast('Erro ao sincronizar. Os dados continuam guardados neste dispositivo.', 'error', 7000);
    } finally {
      btn.disabled = false;
      document.getElementById('offline-sync-bar')?.classList.remove('is-syncing');
      if (labelEl) labelEl.textContent = prevLabel;
      renderOfflineSyncBar();
    }
  });
}

function renderOfflineSyncBar() {
  const bar = document.getElementById('offline-sync-bar');
  const title = document.getElementById('offline-sync-title');
  const desc = document.getElementById('offline-sync-desc');
  const countEl = document.getElementById('offline-sync-count');
  const btn = document.getElementById('offline-sync-btn');
  if (!bar) return;

  import('./trabalhos-offline.js')
    .then(async ({ countTrabalhosPendentes }) => {
      const count = await countTrabalhosPendentes();
      if (!count) {
        bar.hidden = true;
        return;
      }

      bar.hidden = false;

      if (title) {
        title.textContent =
          count === 1
            ? '🔄 Tens 1 relatório pendente.'
            : `🔄 Tens ${count} relatórios pendentes.`;
      }

      if (countEl) {
        countEl.hidden = false;
        countEl.textContent = String(count);
      }

      if (desc) {
        desc.textContent = canReachServer()
          ? 'Pronto para enviar ao servidor.'
          : 'Em segurança no tablet até recuperar ligação à internet.';
      }

      if (btn) {
        btn.disabled = false;
        btn.title = canReachServer()
          ? 'Enviar relatórios guardados neste dispositivo'
          : 'Sem rede — os relatórios permanecem guardados no tablet';
      }
    })
    .catch(console.error);
}

function renderHeader() {
  if (!applyBrandLogo()) {
    const logoEl = document.getElementById('brand-logo');
    if (logoEl) logoEl.textContent = COMPANY.logo;
    const nameEl = document.getElementById('brand-name');
    if (nameEl) nameEl.textContent = COMPANY.name;
  }
  const tagline = document.getElementById('brand-tagline');
  if (tagline) tagline.textContent = COMPANY.tagline;
}

function renderOfflineToggle() {
  const toggle = document.getElementById('offline-toggle');
  const label = document.getElementById('offline-label');
  const badge = document.getElementById('connection-badge');
  if (!toggle) return;

  const manualOffline = isOffline();
  const networkOffline = !isNetworkOnline();
  const effectivelyOffline = manualOffline || networkOffline;

  toggle.checked = manualOffline;
  label.textContent = effectivelyOffline ? 'Offline' : 'Online';

  const badgeLabel = document.getElementById('connection-badge-label');
  if (badge) {
    badge.className = `connection-badge tech-navbar__badge ${effectivelyOffline ? 'offline' : 'online'}`;
  }
  if (badgeLabel) {
    if (networkOffline) {
      badgeLabel.textContent = 'Sem rede';
    } else if (manualOffline) {
      badgeLabel.textContent = 'Modo offline';
    } else {
      badgeLabel.textContent = 'Online';
    }
  }

  toggle.onchange = () => {
    setOfflineMode(toggle.checked);
    renderOfflineToggle();
    renderOfflineSyncBar();
  };
}

function getMonthDates(anchorDate) {
  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  return dates;
}

function syncSelectedDateToPeriod() {
  if (techCalendarView === 'month') {
    const dates = getMonthDates(currentMonthDate);
    if (!dates.includes(selectedDate)) {
      const today = new Date().toISOString().split('T')[0];
      selectedDate = dates.includes(today) ? today : dates[0];
    }
    return;
  }

  weekDates = getWeekDates(currentWeekDate);
  if (!weekDates.includes(selectedDate)) {
    const today = new Date().toISOString().split('T')[0];
    selectedDate = weekDates.includes(today) ? today : weekDates[0];
  }
}

function shiftTechWeek(deltaWeeks) {
  const next = new Date(currentWeekDate);
  next.setDate(next.getDate() + deltaWeeks * 7);
  currentWeekDate = startOfLocalDay(next);
  syncSelectedDateToPeriod();
  periodJobsCacheKey = null;
  refreshTechCalendar().catch(console.error);
}

function shiftTechMonth(deltaMonths) {
  const anchor = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  anchor.setMonth(anchor.getMonth() + deltaMonths);
  currentMonthDate = startOfLocalDay(anchor);
  syncSelectedDateToPeriod();
  periodJobsCacheKey = null;
  refreshTechCalendar().catch(console.error);
}

function shiftTechPeriod(delta) {
  if (techCalendarView === 'month') {
    shiftTechMonth(delta);
  } else {
    shiftTechWeek(delta);
  }
}

function setTechCalendarView(view) {
  if (view !== 'week' && view !== 'month') return;
  if (techCalendarView === view) return;

  techCalendarView = view;
  periodJobsCacheKey = null;
  syncSelectedDateToPeriod();

  document.querySelectorAll('[data-tech-cal-view]').forEach((btn) => {
    const active = btn.dataset.techCalView === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  refreshTechCalendar().catch(console.error);
}

function bindTechCalendarNavigation() {
  if (techCalendarNavBound) return;
  techCalendarNavBound = true;

  document.getElementById('tech-prev-period')?.addEventListener('click', () => shiftTechPeriod(-1));
  document.getElementById('tech-next-period')?.addEventListener('click', () => shiftTechPeriod(1));

  document.querySelectorAll('[data-tech-cal-view]').forEach((btn) => {
    btn.addEventListener('click', () => setTechCalendarView(btn.dataset.techCalView));
  });
}

async function loadPeriodJobsFromSupabase() {
  const session = requireAuth('technician');
  if (!session?.technicianId) return;

  let startDate;
  let endDate;
  let cacheKey;

  if (techCalendarView === 'month') {
    const dates = getMonthDates(currentMonthDate);
    startDate = dates[0];
    endDate = dates[dates.length - 1];
    cacheKey = `${session.technicianId}:month:${startDate}:${endDate}`;
  } else {
    weekDates = getWeekDates(currentWeekDate);
    startDate = weekDates[0];
    endDate = weekDates[weekDates.length - 1];
    cacheKey = `${session.technicianId}:week:${startDate}:${endDate}`;
  }

  if (periodJobsCacheKey === cacheKey) return;

  await ensureTrabalhosSemana(session.technicianId, startDate, endDate);
  periodJobsCacheKey = cacheKey;
}

async function refreshTechCalendar() {
  try {
    await loadPeriodJobsFromSupabase();
  } catch (err) {
    console.error('[Técnico] Calendário:', err);
  }
  renderTechCalendar();
}

function updateTechCalendarVisibility() {
  const strip = document.getElementById('calendar-strip');
  const month = document.getElementById('tech-month-calendar');
  if (!strip || !month) return;

  if (techCalendarView === 'month') {
    strip.hidden = true;
    month.hidden = false;
  } else {
    strip.hidden = false;
    month.hidden = true;
  }
}

function renderCalendarTitle() {
  const title = document.getElementById('tech-calendar-title');
  if (!title) return;

  if (techCalendarView === 'month') {
    const anchor = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
    title.textContent = anchor.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  } else {
    weekDates = getWeekDates(currentWeekDate);
    title.textContent = `Semana de ${formatDate(weekDates[0])}`;
  }

  const prevLabel = techCalendarView === 'month' ? 'Mês anterior' : 'Semana anterior';
  const nextLabel = techCalendarView === 'month' ? 'Mês seguinte' : 'Semana seguinte';
  document.getElementById('tech-prev-period')?.setAttribute('aria-label', prevLabel);
  document.getElementById('tech-next-period')?.setAttribute('aria-label', nextLabel);
}

function renderTechCalendar() {
  renderCalendarTitle();
  updateTechCalendarVisibility();
  if (techCalendarView === 'month') {
    renderMonthCalendar();
  } else {
    renderCalendarStrip();
  }
  renderJobs();
}

function openJobFromCalendar(jobId) {
  const report = getReportForJob(jobId);
  if (report?.status === 'pending_review') {
    openJobFormLazy(jobId, { editPending: true }).catch(console.error);
    return;
  }
  openJobFormLazy(jobId).catch(console.error);
}

function renderTechMonthJobBlock(job) {
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const report = getReportForJob(job.id);
  const stateClass = getCalendarEventStateClass(job, report);
  const label = `${job.time} — ${client?.name || 'Cliente'} — ${service?.label || 'Serviço'}`;

  return `
    <button type="button"
      class="cal-block cal-block-sm cal-block--interactive tech-month-job ${stateClass}"
      data-tech-month-job="${job.id}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}">
      <span class="cal-block-time">${job.time}</span>
      <span class="cal-block-client">${escapeHtml(client?.name?.split(' ')[0] || 'Cliente')}</span>
      ${renderWorkStateBadge(job, report)}
    </button>
  `;
}

function bindTechMonthCalendarEvents(container) {
  container.querySelectorAll('[data-tech-month-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openJobFromCalendar(btn.dataset.techMonthJob);
    });
  });

  container.querySelectorAll('[data-tech-month-day]').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('[data-tech-month-job]')) return;
      selectedDate = cell.dataset.techMonthDay;
      renderMonthCalendar();
      renderJobs();
    });
  });
}

function renderMonthCalendar() {
  const session = requireAuth('technician');
  const container = document.getElementById('tech-month-calendar');
  if (!container) return;

  const techId = session?.technicianId;
  const dates = getMonthDates(currentMonthDate);
  const firstDate = new Date(dates[0] + 'T00:00:00');
  const startDay = firstDate.getDay();
  const pad = startDay === 0 ? 6 : startDay - 1;

  const weekdayRow = `
    <div class="tech-month-weekdays" aria-hidden="true">
      ${TECH_MONTH_WEEKDAYS.map((name) => `<span class="tech-month-weekday">${name}</span>`).join('')}
    </div>
  `;

  let cellsHtml = Array(pad).fill('<div class="cal-cell cal-pad" aria-hidden="true"></div>').join('');

  cellsHtml += dates
    .map((date) => {
      const dayJobs = techId ? getJobsForTechnician(techId, date) : [];
      const isSelected = date === selectedDate;
      const classes = [
        'cal-cell',
        'tech-month-cell',
        isToday(date) ? 'today-cell' : '',
        isSelected ? 'selected-cell' : '',
        dayJobs.length ? 'has-jobs' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const visibleJobs = dayJobs.slice(0, TECH_MONTH_JOBS_VISIBLE);
      const hiddenCount = Math.max(0, dayJobs.length - TECH_MONTH_JOBS_VISIBLE);

      return `
        <button type="button" class="${classes}" data-tech-month-day="${date}" aria-pressed="${isSelected}">
          <span class="cal-cell-day">${getDayNumber(date)}</span>
          <div class="tech-month-jobs">
            ${visibleJobs.map((job) => renderTechMonthJobBlock(job)).join('')}
            ${hiddenCount ? `<span class="cal-more">+${hiddenCount}</span>` : ''}
          </div>
        </button>
      `;
    })
    .join('');

  container.innerHTML = `${weekdayRow}<div class="calendar-month tech-month-grid">${cellsHtml}</div>`;
  bindTechMonthCalendarEvents(container);
}

function renderCalendarStrip() {
  const session = requireAuth('technician');
  const strip = document.getElementById('calendar-strip');
  if (!strip) return;

  weekDates = getWeekDates(currentWeekDate);
  const techId = session?.technicianId;

  strip.innerHTML = weekDates
    .map((date) => {
      const isSelected = date === selectedDate;
      const today = isToday(date);
      const dayJobs = techId ? getJobsForTechnician(techId, date) : [];
      const hasJobs = dayJobs.length > 0;
      const classes = [
        'cal-day',
        isSelected ? 'selected' : '',
        today ? 'today' : '',
        hasJobs ? 'has-jobs' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const statusDots = hasJobs
        ? `<span class="cal-job-dots" aria-hidden="true">${dayJobs
            .map((job) => {
              const state = resolveCalendarEventState(job, getReportForJob(job.id));
              return `<span class="cal-status-dot cal-status-dot--${state}"></span>`;
            })
            .join('')}</span>`
        : '';

      return `
      <button type="button" class="${classes}" data-date="${date}" aria-pressed="${isSelected}">
        <span class="cal-day-name">${getDayLabel(date)}</span>
        <span class="cal-day-num">${getDayNumber(date)}</span>
        ${statusDots}
        ${today && !hasJobs ? '<span class="cal-today-dot" aria-hidden="true"></span>' : ''}
      </button>
    `;
    })
    .join('');

  strip.querySelectorAll('.cal-day').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDate = btn.dataset.date;
      renderCalendarStrip();
      renderJobs();
    });
  });
}

function renderJobs() {
  const session = requireAuth('technician');
  const container = document.getElementById('jobs-list');
  const dateLabel = document.getElementById('selected-date-label');
  if (!container || !session) return;

  dateLabel.textContent = formatDate(selectedDate);
  const jobs = getJobsForTechnician(session.technicianId, selectedDate);

  if (!jobs.length) {
    container.innerHTML = `
      <div class="empty-state glass-card">
        <div class="empty-icon">📋</div>
        <p>Sem trabalhos atribuídos para este dia.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = jobs.map((job) => {
    const client = getClient(job.clientId);
    const service = getServiceType(job.serviceType);
    const savedReport = getReportForJob(job.id);
    const isRejected = job.status === 'rejected' || savedReport?.status === 'rejected';
    const isPendingReview = savedReport?.status === 'pending_review';
    const isApproved = savedReport?.status === 'approved';
    const hasDraft = savedReport?.status === 'draft';
    const stateClass = getCalendarEventStateClass(job, savedReport);
    const stateBadge = renderWorkStateBadge(job, savedReport);

    let actionBtn = '';
    if (isPendingReview) {
      actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-edit-pending-job="${job.id}">✏️ Editar</button>`;
    } else if (isRejected) {
      actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-open-job="${job.id}">Corrigir e Reenviar</button>`;
    } else if (isApproved) {
      actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-open-job="${job.id}">Ver Relatório</button>`;
    } else if (hasDraft) {
      actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-open-job="${job.id}">Continuar relatório</button>`;
    } else {
      actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-open-job="${job.id}">Iniciar</button>`;
    }

    return `
      <article class="job-card glass-card ${stateClass} ${isRejected ? 'job-rejected' : ''}" data-job-id="${job.id}">
        ${isRejected ? `
          <div class="job-rejection-alert">
            <span class="alert-icon">⚠</span>
            <div>
              <strong>Correção Necessária</strong>
              <p>${escapeHtml(job.rejectionNote)}</p>
            </div>
          </div>
        ` : ''}
        <div class="job-card-top">
          <div class="job-time">${job.time}</div>
          <div class="job-card-badges">${stateBadge}</div>
        </div>
        <div class="job-client-row">
          <button type="button" class="job-client job-client-link" data-client-history="${escapeHtml(job.clientId)}" title="Ver histórico de intervenções">
            ${escapeHtml(client?.name || 'Cliente')}
          </button>
          <button type="button" class="btn-outline job-history-btn" data-client-history="${escapeHtml(job.clientId)}">
            Histórico
          </button>
        </div>
        <div class="job-meta">
          <span class="job-type">${service?.icon || '🔧'} ${escapeHtml(service?.label || job.serviceType)}</span>
          ${job.forkliftSerial ? `<span class="job-serial">${escapeHtml(job.forkliftSerial)}</span>` : ''}
        </div>
        ${actionBtn}
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-open-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openJobFormLazy(btn.dataset.openJob).catch(console.error);
    });
  });

  container.querySelectorAll('[data-edit-pending-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openJobFormLazy(btn.dataset.editPendingJob, { editPending: true }).catch(console.error);
    });
  });

  container.querySelectorAll('[data-client-history]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTechClientHistory(btn.dataset.clientHistory);
    });
  });

  container.querySelectorAll('.job-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-client-history]')) return;
      if (e.target.closest('[data-edit-pending-job], [data-open-job]')) return;
      const report = getReportForJob(card.dataset.jobId);
      if (report?.status === 'pending_review') {
        openJobFormLazy(card.dataset.jobId, { editPending: true }).catch(console.error);
        return;
      }
      openJobFormLazy(card.dataset.jobId).catch(console.error);
    });
  });
}
