/**
 * Manusilva PWA — Technician Dashboard
 */

import {
  requireAuth,
  getWeekDates,
  getJobsForTechnician,
  getJobsSnapshot,
  getReportsSnapshot,
  getReportForJob,
  getJob,
  getClient,
  getServiceType,
  getTechnician,
  jobAssignedToTechnician,
  isOffline,
  isNetworkOnline,
  canReachServer,
  setOfflineMode,
  warmOperacoes,
  formatDate,
  formatDateLong,
  getDayLabel,
  getDayNumber,
  isToday,
  COMPANY,
  escapeHtml,
  applyBrandLogo,
} from './app.js';
import { jobMatchesTechnician } from './job-technician-utils.js';
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

const TECH_JOBS_TABS = {
  em_curso: { id: 'em_curso', label: 'Em Curso / Pendentes', subtitle: 'Hoje' },
  agendados: { id: 'agendados', label: 'Agendados', subtitle: 'Próximos trabalhos' },
  realizados: { id: 'realizados', label: 'Histórico de Realizados', subtitle: 'Concluídos' },
};

const SCHEDULED_JOB_STATUSES = new Set([
  'scheduled',
  'agendado',
  'atribuido',
  'atribuído',
  'in_progress',
  'pending_parts',
]);

let techJobsTab = 'em_curso';
let techJobsTabsBound = false;
let techTabDataCacheKey = null;

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

function getTodayIso() {
  return new Date().toISOString().split('T')[0];
}

function addDaysToIso(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
}

function sortJobsByDateTime(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || '').localeCompare(b.time || '');
}

function reportAssignedToTechnician(report, techId) {
  if (!report || !techId) return false;
  const tech = getTechnician(techId);
  return jobMatchesTechnician(report.technicianId, {
    techId,
    techName: tech?.name,
  });
}

function isScheduledJobStatus(status) {
  return SCHEDULED_JOB_STATUSES.has(String(status || '').toLowerCase());
}

function setTechJobsTab(tabId) {
  if (!TECH_JOBS_TABS[tabId] || techJobsTab === tabId) return;
  techJobsTab = tabId;
  techTabDataCacheKey = null;

  document.querySelectorAll('[data-tech-jobs-tab]').forEach((btn) => {
    const active = btn.dataset.techJobsTab === tabId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const title = document.getElementById('tech-jobs-section-title');
  if (title) title.textContent = TECH_JOBS_TABS[tabId].label;

  loadTechTabData()
    .then(() => renderJobs())
    .catch(console.error);
}

function bindTechJobsTabs() {
  if (techJobsTabsBound) return;
  techJobsTabsBound = true;

  document.querySelectorAll('[data-tech-jobs-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setTechJobsTab(btn.dataset.techJobsTab));
  });
}

async function loadTechTabData() {
  const session = requireAuth('technician');
  if (!session?.technicianId) return;

  const today = getTodayIso();
  const cacheKey = `${session.technicianId}:${techJobsTab}:${today}`;
  if (techTabDataCacheKey === cacheKey) return;

  await loadPeriodJobsFromSupabase();

  if (techJobsTab === 'em_curso') {
    const pastStart = addDaysToIso(today, -60);
    await ensureTrabalhosSemana(session.technicianId, pastStart, today);
    const { ensureReportsLoaded } = await import('./relatorios-db.js');
    await ensureReportsLoaded();
  } else if (techJobsTab === 'agendados') {
    const futureEnd = addDaysToIso(today, 120);
    await ensureTrabalhosSemana(session.technicianId, addDaysToIso(today, 1), futureEnd);
  } else if (techJobsTab === 'realizados') {
    const { ensureReportsLoaded } = await import('./relatorios-db.js');
    const { ensureJobsLoaded } = await import('./trabalhos-db.js');
    await ensureReportsLoaded();
    await ensureJobsLoaded();
  }

  techTabDataCacheKey = cacheKey;
}

function getEmCursoJobs(techId) {
  const today = getTodayIso();
  const byId = new Map();

  getReportsSnapshot().forEach((report) => {
    if (report.status !== 'draft' || !reportAssignedToTechnician(report, techId)) return;
    const job = report.jobId ? getJob(report.jobId) : null;
    if (job && jobAssignedToTechnician(job, techId)) byId.set(job.id, job);
  });

  getJobsSnapshot().forEach((job) => {
    if (!jobAssignedToTechnician(job, techId)) return;
    if (job.date !== today) return;
    const report = getReportForJob(job.id);
    if (report?.status === 'approved') return;
    byId.set(job.id, job);
  });

  return [...byId.values()].sort(sortJobsByDateTime);
}

function getAgendadosJobs(techId) {
  const today = getTodayIso();

  return getJobsSnapshot()
    .filter((job) => {
      if (!jobAssignedToTechnician(job, techId)) return false;
      if (job.date <= today) return false;
      const report = getReportForJob(job.id);
      if (report?.status === 'approved' || report?.status === 'draft') return false;
      if (resolveCalendarEventState(job, report) !== 'scheduled') return false;
      return isScheduledJobStatus(job.status);
    })
    .sort(sortJobsByDateTime);
}

function getRealizadosItems(techId) {
  return getReportsSnapshot()
    .filter((report) => report.status === 'approved' && reportAssignedToTechnician(report, techId))
    .map((report) => ({
      report,
      job: report.jobId ? getJob(report.jobId) : null,
    }))
    .sort((a, b) => {
      const dateA = a.job?.date || a.report.approvedAt || a.report.submittedAt || '';
      const dateB = b.job?.date || b.report.approvedAt || b.report.submittedAt || '';
      return String(dateB).localeCompare(String(dateA));
    });
}

const TECH_JOBS_SHELL_HTML = `
  <section class="jobs-section" data-tech-jobs-shell>
    <div class="section-header">
      <h2 id="tech-jobs-section-title">Em Curso / Pendentes</h2>
      <span class="date-label" id="selected-date-label"></span>
    </div>
    <p class="text-muted tech-greeting">
      Olá, <strong id="user-name"></strong>
    </p>
    <div class="tech-jobs-tabs" role="tablist" aria-label="Filtrar trabalhos">
      <button type="button" class="tech-jobs-tab is-active" data-tech-jobs-tab="em_curso" role="tab" aria-selected="true">Em Curso / Pendentes</button>
      <button type="button" class="tech-jobs-tab" data-tech-jobs-tab="agendados" role="tab" aria-selected="false">Agendados</button>
      <button type="button" class="tech-jobs-tab" data-tech-jobs-tab="realizados" role="tab" aria-selected="false">Histórico de Realizados</button>
    </div>
    <div class="jobs-list" id="jobs-list"></div>
  </section>
`;

export function restoreTechDashboard() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = TECH_JOBS_SHELL_HTML;
  techJobsTabsBound = false;
  bindTechJobsTabs();
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
  bindTechJobsTabs();
  await refreshTechCalendar();

  window.addEventListener('jobs-updated', () => {
    periodJobsCacheKey = null;
    techTabDataCacheKey = null;
    refreshTechCalendar().catch(console.error);
  });
  window.addEventListener('db-updated', () => {
    renderOfflineToggle();
    renderOfflineSyncBar();
    periodJobsCacheKey = null;
    techTabDataCacheKey = null;
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
    await loadTechTabData();
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

function renderJobCard(job, { actionMode = 'em_curso' } = {}) {
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const savedReport = getReportForJob(job.id);
  const isRejected = job.status === 'rejected' || savedReport?.status === 'rejected';
  const stateClass = getCalendarEventStateClass(job, savedReport);
  const stateBadge = renderWorkStateBadge(job, savedReport);
  const dateLine =
    techJobsTab === 'agendados' && job.date
      ? `<span class="job-date-chip">${escapeHtml(formatDateLong(job.date))}</span>`
      : '';

  let actionBtn = '';
  if (actionMode === 'realizados') {
    actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-view-job="${job.id}">Visualizar</button>`;
  } else {
    actionBtn = `<button type="button" class="job-action-btn job-action-btn--primary" data-continue-job="${job.id}">Continuar Relatório</button>`;
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
        <div class="job-time">${job.time || '—'}${dateLine}</div>
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
}

function renderRealizadoCard({ job, report }) {
  const client = getClient(report.clientId || job?.clientId);
  const service = getServiceType(report.serviceType || job?.serviceType);
  const stateClass = getCalendarEventStateClass(job, report);
  const stateBadge = renderWorkStateBadge(job, report);
  const serviceDate = job?.date ? formatDateLong(job.date) : '—';
  const jobId = job?.id || report.jobId;

  return `
    <article class="job-card glass-card ${stateClass}" data-job-id="${escapeHtml(jobId || '')}">
      <div class="job-card-top">
        <div class="job-time">${escapeHtml(job?.time || '—')}<span class="job-date-chip">${escapeHtml(serviceDate)}</span></div>
        <div class="job-card-badges">${stateBadge}</div>
      </div>
      <div class="job-client-row">
        <button type="button" class="job-client job-client-link" data-client-history="${escapeHtml(client?.id || report.clientId || '')}" title="Ver histórico de intervenções">
          ${escapeHtml(client?.name || 'Cliente')}
        </button>
        <button type="button" class="btn-outline job-history-btn" data-client-history="${escapeHtml(client?.id || report.clientId || '')}">
          Histórico
        </button>
      </div>
      <div class="job-meta">
        <span class="job-type">${service?.icon || '🔧'} ${escapeHtml(service?.label || report.serviceType || 'Relatório')}</span>
        ${job?.forkliftSerial ? `<span class="job-serial">${escapeHtml(job.forkliftSerial)}</span>` : ''}
      </div>
      <button type="button" class="job-action-btn job-action-btn--primary" data-view-job="${escapeHtml(jobId || '')}">Visualizar</button>
    </article>
  `;
}

function openContinueJob(jobId) {
  const report = getReportForJob(jobId);
  if (report?.status === 'pending_review') {
    openJobFormLazy(jobId, { editPending: true }).catch(console.error);
    return;
  }
  openJobFormLazy(jobId).catch(console.error);
}

const TECH_TAB_EMPTY_MESSAGES = {
  em_curso: 'Sem relatórios em aberto nem trabalhos para hoje.',
  agendados: 'Sem trabalhos agendados nos próximos dias.',
  realizados: 'Ainda não tem relatórios concluídos.',
};

function updateJobsSectionHeader() {
  const tabMeta = TECH_JOBS_TABS[techJobsTab];
  const title = document.getElementById('tech-jobs-section-title');
  const dateLabel = document.getElementById('selected-date-label');
  if (title) title.textContent = tabMeta.label;

  if (!dateLabel) return;

  if (techJobsTab === 'em_curso') {
    dateLabel.textContent = `Hoje — ${formatDate(getTodayIso())}`;
  } else if (techJobsTab === 'agendados') {
    dateLabel.textContent = tabMeta.subtitle;
  } else {
    const session = requireAuth('technician');
    const count = session ? getRealizadosItems(session.technicianId).length : 0;
    dateLabel.textContent = count ? `${count} relatório${count === 1 ? '' : 's'}` : tabMeta.subtitle;
  }
}

function bindJobListEvents(container) {
  container.querySelectorAll('[data-continue-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openContinueJob(btn.dataset.continueJob);
    });
  });

  container.querySelectorAll('[data-view-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!btn.dataset.viewJob) return;
      openJobFormLazy(btn.dataset.viewJob, { viewOnly: true }).catch(console.error);
    });
  });

  container.querySelectorAll('[data-client-history]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.clientHistory) openTechClientHistory(btn.dataset.clientHistory);
    });
  });

  container.querySelectorAll('.job-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-client-history]')) return;
      if (e.target.closest('[data-continue-job], [data-view-job]')) return;
      const jobId = card.dataset.jobId;
      if (!jobId) return;
      if (techJobsTab === 'realizados') {
        openJobFormLazy(jobId, { viewOnly: true }).catch(console.error);
        return;
      }
      openContinueJob(jobId);
    });
  });
}

function renderJobs() {
  const session = requireAuth('technician');
  const container = document.getElementById('jobs-list');
  if (!container || !session) return;

  updateJobsSectionHeader();
  const techId = session.technicianId;

  let html = '';

  if (techJobsTab === 'realizados') {
    const items = getRealizadosItems(techId);
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state glass-card">
          <div class="empty-icon">✅</div>
          <p>${TECH_TAB_EMPTY_MESSAGES.realizados}</p>
        </div>
      `;
      return;
    }
    html = items.map((item) => renderRealizadoCard(item)).join('');
  } else {
    const jobs = techJobsTab === 'agendados' ? getAgendadosJobs(techId) : getEmCursoJobs(techId);
    if (!jobs.length) {
      container.innerHTML = `
        <div class="empty-state glass-card">
          <div class="empty-icon">📋</div>
          <p>${TECH_TAB_EMPTY_MESSAGES[techJobsTab]}</p>
        </div>
      `;
      return;
    }
    html = jobs.map((job) => renderJobCard(job, { actionMode: techJobsTab })).join('');
  }

  container.innerHTML = html;
  bindJobListEvents(container);
}
