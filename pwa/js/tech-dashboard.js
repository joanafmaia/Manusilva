/**
 * Manusilva PWA — Technician Dashboard
 */

import {
  requireAuth,
  getWeekDates,
  getJobsSnapshot,
  getReportsSnapshot,
  getReportForJob,
  getJob,
  getClient,
  getServiceType,
  getTechnician,
  jobAssignedToTechnician,
  resolveJobForForm,
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
  showToast,
} from './app.js';
import { reportMatchesTechnicianTeam } from './job-technician-utils.js';
import {
  getCalendarEventStateClass,
  renderWorkStateBadge,
  resolveCalendarEventState,
} from './calendar-event-state.js';
import { initLogoutButton } from './auth.js';
import { getLastClientIntervention } from './views/historico-cliente.js';
import { ensureTrabalhosSemana } from './trabalhos-db.js';
import { ensureServicosSemana } from './servicos-db.js';
import { dedupeReportsForDisplay, ensureRelatoriosForTrabalhos, ensureRelatoriosForServicos } from './relatorios-db.js';
import { triggerTechDataSync } from './tech-sync.js';
import {
  filterCalendarItemsByTech,
  getAdminCalendarItems,
  getCalendarItemReport,
  getCalendarItemSubtitle,
  servicoToCalendarItem,
} from './servicos-panel-utils.js';
import { openTechServicoDetail } from './tech-servico-panel.js';
import { getServico } from './servicos-db.js';
import {
  filterJobsBySearch,
  filterRealizadosBySearch,
  renderTechClientInfoSheet,
  resolveTechActionLabel,
} from './tech-panel-utils.js';
import { requestTechNotificationPermission } from './tech-notifications.js';

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
  agendados: { id: 'agendados', label: 'Agendados', subtitle: 'Dia selecionado' },
  realizados: { id: 'realizados', label: 'Realizados', subtitle: 'Concluídos' },
  clientes: { id: 'clientes', label: 'Clientes', subtitle: 'Histórico por empresa' },
};

const TECH_CAL_COMPACT_KEY = 'tech_calendar_compact';
let techCalendarCompact = localStorage.getItem(TECH_CAL_COMPACT_KEY) === '1';
let techJobsSearchQuery = '';
let techJobsSearchTimer = null;
const TECH_JOBS_SEARCH_DEBOUNCE_MS = 150;

/** Aba ativa no arranque: Agendados (vista semanal do calendário). */
let techJobsTab = 'agendados';
let techJobsTabsBound = false;
let techTabDataCacheKey = null;

/** Evita re-renderizações em cascata (realtime + sync) que sobrecarregam o tablet. */
let techDashboardRefreshTimer = null;
let techDashboardListenersBound = false;
let techDashboardRefreshInFlight = false;
let cachedPendingSyncCount = 0;
let techOfflineDepsPromise = null;

async function loadTechOfflineDeps() {
  if (!techOfflineDepsPromise) {
    techOfflineDepsPromise = Promise.all([
      import('./trabalhos-offline.js'),
      import('./report-local-storage.js'),
    ]).then(([offline, storage]) => ({ offline, storage }));
  }
  return techOfflineDepsPromise;
}

async function refreshPendingSyncCount() {
  try {
    const { offline } = await loadTechOfflineDeps();
    cachedPendingSyncCount = await offline.countTrabalhosPendentes();
  } catch {
    cachedPendingSyncCount = 0;
  }
  return cachedPendingSyncCount;
}

function scheduleTechDashboardRefresh() {
  if (techDashboardRefreshTimer) clearTimeout(techDashboardRefreshTimer);
  techDashboardRefreshTimer = setTimeout(() => {
    techDashboardRefreshTimer = null;
    periodJobsCacheKey = null;
    techTabDataCacheKey = null;
    refreshTechCalendar().catch(console.error);
  }, 280);
}

async function refreshTechDashboardChrome() {
  renderOfflineToggle();
  await refreshPendingSyncCount();
  await renderTechConnectivityBar();
  updateTechTabBadges();
  renderTechDaySummary();
  renderTechRejectedBanner();
  updateTechJobsToolbarVisibility();
}

function bindTechDashboardDataListeners() {
  if (techDashboardListenersBound) return;
  techDashboardListenersBound = true;

  window.addEventListener('jobs-updated', scheduleTechDashboardRefresh);
  window.addEventListener('db-updated', scheduleTechDashboardRefresh);
  window.addEventListener('trabalhos-pendentes-changed', () => {
    refreshTechDashboardChrome().catch(console.error);
  });
  window.addEventListener('online', () => {
    refreshTechDashboardChrome().catch(console.error);
  });
  window.addEventListener('offline', () => {
    refreshTechDashboardChrome().catch(console.error);
  });
}

function bindNotificationPermissionOnGesture() {
  const ask = () => {
    requestTechNotificationPermission().catch(() => {});
  };
  document.addEventListener('click', ask, { once: true, passive: true });
  document.addEventListener('touchstart', ask, { once: true, passive: true });
}

/** Carrega `forms.js` (+ `form-engine.js`) só ao abrir um relatório no tablet. */
let formsModulePromise = null;

function loadFormsModule() {
  if (!formsModulePromise) {
    formsModulePromise = import('./forms.js');
  }
  return formsModulePromise;
}

async function openJobFormLazy(jobId, options = {}) {
  try {
    const { openJobForm } = await loadFormsModule();
    await openJobForm(jobId, options);
  } catch (err) {
    console.error('[Tech] Abrir relatório:', err);
    showToast('Não foi possível abrir este relatório.', 'error', 7000);
  }
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
  const dateA = String(a.date || '');
  const dateB = String(b.date || '');
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return String(a.time || '').localeCompare(String(b.time || ''));
}

/**
 * O relatório conta para este técnico? Verifica o submissor E a equipa completa
 * do trabalho associado — com 2+ técnicos atribuídos, o relatório aparece no
 * histórico de todos, mesmo que só um tenha preenchido no tablet.
 */
function reportAssignedToTechnician(report, techId) {
  if (!report || !techId) return false;
  const tech = getTechnician(techId);
  let job = report.jobId ? getJob(report.jobId) : null;
  if (!job && report.servicoId) {
    const servico = getServico(report.servicoId);
    if (servico) job = servicoToCalendarItem(servico);
  }
  return reportMatchesTechnicianTeam(report, job, {
    techId,
    techName: tech?.name,
  });
}

function getTechAgendadosItems(techId) {
  return filterCalendarItemsByTech(getAdminCalendarItems(), techId);
}

function getAgendadosItemsForDate(techId, isoDate) {
  const date = toPureDate(isoDate);
  return filterAgendadosActiveJobs(
    getTechAgendadosItems(techId).filter((item) => toPureDate(item.date) === date),
  );
}

/** O calendário (Semana/Mês + dias) só é visível na aba Agendados. */
function updateTechCalendarWrapVisibility() {
  const wrap = document.getElementById('tech-calendar-wrap');
  if (!wrap) return;
  const show = techJobsTab === 'agendados';
  wrap.hidden = !show;
  wrap.style.display = show ? '' : 'none';
}

function ensureTechJobsShell() {
  const app = document.getElementById('app');
  if (!app || app.querySelector('[data-tech-jobs-shell]')) return;
  app.innerHTML = TECH_JOBS_SHELL_HTML;
  bindTechJobsSearch();
}

async function renderTechClientsTab() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <section class="tech-clients-section jobs-section" data-tech-clients-section>
      <div class="section-header">
        <h2 id="tech-jobs-section-title">${TECH_JOBS_TABS.clientes.label}</h2>
        <span class="date-label" id="selected-date-label"></span>
      </div>
      <div data-tech-clients-mount></div>
    </section>
  `;

  const mount = app.querySelector('[data-tech-clients-mount]');
  if (!mount) return;

  const { ensureProductionCatalog } = await import('./clients-catalog.js');
  const { mountClientsList } = await import('./views/clients-list.js');
  await ensureProductionCatalog();
  await mountClientsList(mount, {
    onClientHistory: (clientId) => openTechClientHistory(clientId, { returnTo: 'clientes' }),
  });
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function restoreTechClientsTab() {
  techJobsTab = 'clientes';
  document.querySelectorAll('[data-tech-jobs-tab]').forEach((btn) => {
    const active = btn.dataset.techJobsTab === 'clientes';
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const title = document.getElementById('tech-jobs-section-title');
  if (title) title.textContent = TECH_JOBS_TABS.clientes.label;

  const dateLabel = document.getElementById('selected-date-label');
  if (dateLabel) dateLabel.textContent = '';

  updateTechJobsToolbarVisibility();
  updateTechCalendarWrapVisibility();
  void renderTechClientsTab();
}

function setTechJobsTab(tabId) {
  if (!TECH_JOBS_TABS[tabId] || techJobsTab === tabId) return;
  techJobsTab = tabId;
  techTabDataCacheKey = null;
  techJobsSearchQuery = '';

  document.querySelectorAll('[data-tech-jobs-tab]').forEach((btn) => {
    const active = btn.dataset.techJobsTab === tabId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const title = document.getElementById('tech-jobs-section-title');
  if (title) title.textContent = TECH_JOBS_TABS[tabId].label;

  const searchInput = document.getElementById('tech-jobs-search');
  if (searchInput) searchInput.value = '';

  updateTechJobsToolbarVisibility();
  updateTechCalendarWrapVisibility();
  updateTechTabBadges();

  if (tabId === 'agendados') {
    ensureTechJobsShell();
    refreshTechCalendar()
      .then(() => scheduleCalendarResize())
      .catch(console.error);
    return;
  }

  if (tabId === 'clientes') {
    renderTechClientsTab().catch(console.error);
    return;
  }

  ensureTechJobsShell();
  loadTechTabData()
    .then(() => renderJobs())
    .catch(console.error);
}

function updateTechJobsToolbarVisibility() {
  const toolbar = document.getElementById('tech-jobs-toolbar');
  const search = document.getElementById('tech-jobs-search');
  if (!toolbar || !search) return;
  const showSearch = techJobsTab !== 'realizados' && techJobsTab !== 'clientes';
  toolbar.hidden = !showSearch;
  search.hidden = !showSearch;
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
  const cacheKey = `${session.technicianId}:${techJobsTab}:${techJobsTab === 'agendados' ? selectedDate : today}`;
  if (techTabDataCacheKey === cacheKey) return;

  await loadPeriodJobsFromSupabase();

  if (techJobsTab === 'realizados') {
    const { ensureReportsLoaded } = await import('./relatorios-db.js');
    const { ensureJobsLoaded } = await import('./trabalhos-db.js');
    await ensureReportsLoaded();
    await ensureJobsLoaded();
  } else if (techJobsTab === 'agendados') {
    const { ensureReportsLoaded } = await import('./relatorios-db.js');
    await ensureReportsLoaded();
    // Garante a semana do dia selecionado (para a lista «resto da semana»)
    const weekOfSelected = getWeekDates(new Date(`${selectedDate}T12:00:00`));
    await ensureTrabalhosSemana(
      session.technicianId,
      weekOfSelected[0],
      weekOfSelected[weekOfSelected.length - 1],
    );
  }

  techTabDataCacheKey = cacheKey;
}

/** Data pura YYYY-MM-DD — elimina hora/fuso antes de comparar. */
function toPureDate(value) {
  return String(value || '').split('T')[0];
}

/** Ordem na lista do dia: rejeitados → em curso → agendados → pendentes → realizados. */
const AGENDADOS_STATE_ORDER = {
  rejected: 0,
  draft: 1,
  scheduled: 2,
  pending: 3,
  approved: 4,
};

function sortAgendadosJobs(a, b) {
  const reportA = getCalendarItemReport(a);
  const reportB = getCalendarItemReport(b);
  const stateA = resolveCalendarEventState(a, reportA);
  const stateB = resolveCalendarEventState(b, reportB);
  const orderA = AGENDADOS_STATE_ORDER[stateA] ?? 9;
  const orderB = AGENDADOS_STATE_ORDER[stateB] ?? 9;
  if (orderA !== orderB) return orderA - orderB;
  return sortJobsByDateTime(a, b);
}

function jobMatchesTechOnDate(job, techId, isoDate) {
  if (!jobAssignedToTechnician(job, techId)) return false;
  return toPureDate(job.date) === isoDate;
}

/** Concluídos (aprovados) só na aba Realizados — não na lista Agendados nem no calendário. */
function isAgendadosActiveJob(item) {
  const report = getCalendarItemReport(item);
  return resolveCalendarEventState(item, report) !== 'approved';
}

function filterAgendadosActiveJobs(jobs) {
  return jobs.filter(isAgendadosActiveJob);
}

/** Visitas/trabalhos do dia selecionado — exclui concluídos (todos os relatórios aprovados). */
function getAgendadosJobs(techId) {
  return getAgendadosItemsForDate(techId, selectedDate).sort(sortAgendadosJobs);
}

/** Resto da semana do dia selecionado (exclui o próprio dia). */
function getRestOfWeekScheduledJobs(techId) {
  const selected = toPureDate(selectedDate);
  const weekOfSelected = getWeekDates(new Date(`${selected}T12:00:00`));
  const dateSet = new Set(weekOfSelected);

  return filterAgendadosActiveJobs(
    getTechAgendadosItems(techId).filter((item) => {
      const itemDate = toPureDate(item.date);
      if (!dateSet.has(itemDate) || itemDate === selected) return false;
      return true;
    }),
  ).sort(sortAgendadosJobs);
}

function resolveAgendadosRowAction(state) {
  if (state === 'rejected' || state === 'draft' || state === 'pending') return 'continue';
  if (state === 'scheduled') return 'start';
  return 'view';
}

function renderAgendadosStateLegend() {
  const items = [
    { state: 'scheduled', label: 'Agendado' },
    { state: 'draft', label: 'Em curso' },
    { state: 'pending', label: 'À espera de aprovação' },
    { state: 'rejected', label: 'Rejeitado' },
  ];
  const chips = items
    .map(
      ({ state, label }) =>
        `<span class="tech-jobs-legend__chip tech-jobs-legend__chip--${state}">${escapeHtml(label)}</span>`,
    )
    .join('');
  return `<div class="tech-jobs-legend" aria-label="Legenda de estados">${chips}</div>`;
}

/** Lista plana de trabalhos (sem pastas de visita). */
function renderTechJobsListHtml(jobs, rowRenderer) {
  const rows = jobs.map((job) => rowRenderer(job)).join('');
  return `<div class="tech-job-rows">${rows}</div>`;
}

function renderAgendadosRow(item, options = {}) {
  const report = getCalendarItemReport(item);
  const state = resolveCalendarEventState(item, report);
  const action = item.isServico ? 'servico' : resolveAgendadosRowAction(state);
  return renderTechJobRow(item, report, action, options);
}

function renderAgendadosWeekPreview(techId) {
  const weekJobs = getRestOfWeekScheduledJobs(techId);
  if (!weekJobs.length) {
    return '<p class="agendados-preview-empty text-muted">Sem mais trabalhos agendados esta semana.</p>';
  }

  const rows = weekJobs.map((job) => renderAgendadosRow(job)).join('');

  return `
    <div class="agendados-week-preview">
      <h3 class="agendados-preview-title">Resto da semana</h3>
      <div class="tech-job-rows">${rows}</div>
    </div>
  `;
}

/**
 * Estados visíveis no Histórico de Realizados: Concluído (approved) e
 * Pendente RH (pending_review) — aprovados só leitura; pendentes editáveis.
 */
const REALIZADOS_VISIBLE_STATUSES = new Set(['approved', 'pending_review']);

function getRealizadosItems(techId) {
  return dedupeReportsForDisplay(
    getReportsSnapshot().filter(
      (report) =>
        REALIZADOS_VISIBLE_STATUSES.has(report.status) &&
        reportAssignedToTechnician(report, techId),
    ),
  )
    .map((report) => ({
      report,
      job:
        (report.jobId ? getJob(report.jobId) : null) ||
        (report.servicoId ? servicoToCalendarItem(getServico(report.servicoId)) : null),
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
      <h2 id="tech-jobs-section-title">Agendados</h2>
      <span class="date-label" id="selected-date-label"></span>
    </div>
    <div id="tech-day-summary" class="tech-day-summary" aria-live="polite"></div>
    <div id="tech-rejected-banner" class="tech-rejected-banner" hidden></div>
    <div class="tech-jobs-toolbar" id="tech-jobs-toolbar">
      <input
        type="search"
        id="tech-jobs-search"
        class="tech-jobs-search"
        placeholder="Pesquisar cliente ou serviço…"
        autocomplete="off"
        aria-label="Pesquisar trabalhos"
      >
    </div>
    <div class="jobs-list" id="jobs-list"></div>
  </section>
`;

export function restoreTechDashboard() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = TECH_JOBS_SHELL_HTML;
  bindTechJobsSearch();
  updateTechJobsToolbarVisibility();
  updateTechCalendarCompactUi();
  updateTechCalendarWrapVisibility();
  const title = document.getElementById('tech-jobs-section-title');
  if (title) title.textContent = TECH_JOBS_TABS[techJobsTab].label;
  refreshTechCalendar().catch(console.error);
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function openTechClientHistory(clientId, { returnTo = 'dashboard' } = {}) {
  const app = document.getElementById('app');
  if (!app || !clientId) return;

  const { mountClientHistoryView } = await import('./views/historico-cliente.js');
  const onBack = returnTo === 'clientes' ? restoreTechClientsTab : restoreTechDashboard;

  await mountClientHistoryView(clientId, app, {
    batteryOnly: false,
    showWorkflowActions: false,
    onBack,
  });
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function initTechDashboard() {
  const session = requireAuth('technician');
  if (!session) return;

  // UI básica primeiro — navegação e botão Sair nunca ficam bloqueados
  // por falhas na recolha de dados do Supabase.
  initLogoutButton();
  renderHeader();
  renderOfflineToggle();
  renderTechConnectivityBar();
  bindTechConnectivityActions();
  import('./app-refresh-ui.js').then(({ bindAppRefreshButton }) => {
    bindAppRefreshButton('btn-force-app-refresh', {
      updateHint: 'Nova versão disponível — toque em «Atualizar» no topo do ecrã.',
    });
  });
  bindTechJobsSearch();
  bindTechGoToday();
  bindTechCalendarCompact();
  updateTechCalendarCompactUi();
  bindTechCalendarNavigation();
  bindTechJobsTabs();
  updateTechJobsToolbarVisibility();
  updateTechCalendarWrapVisibility();
  bindTechDashboardDataListeners();
  bindNotificationPermissionOnGesture();

  try {
    try {
      await warmTechDashboardInitial(session.technicianId);
    } catch (err) {
      const { handleFatalDashboardError } = await import('./app.js');
      if (await handleFatalDashboardError(err)) return;
      console.error('[Técnico] Dados Supabase:', err);
    }

    const { hydrateLocalReportsIntoCache } = await import('./report-local-storage.js');
    await hydrateLocalReportsIntoCache();

    const { initTrabalhosOfflineSync, migrateLegacyOfflineQueue, sincronizarTrabalhosOffline } =
      await import('./trabalhos-offline.js');
    const { getDB, updateDB } = await import('./app.js');

    await migrateLegacyOfflineQueue(getDB, updateDB);
    initTrabalhosOfflineSync();
    sincronizarTrabalhosOffline().catch(console.error);
    await refreshTechCalendar();

    // Realtime: quando o RH cria/altera/elimina trabalhos ou relatórios,
    // a lista atualiza-se logo, sem o técnico fazer refresh manual.
    try {
      const { initTechRealtime } = await import('./tech-realtime.js');
      await initTechRealtime();
    } catch (err) {
      console.warn('[Técnico] Realtime indisponível (a dashboard continua a funcionar):', err);
    }

    scheduleWarmTechDashboardFull();
  } catch (error) {
    const { handleFatalDashboardError } = await import('./app.js');
    if (await handleFatalDashboardError(error)) return;

    console.error('[Técnico] Erro ao carregar dados da dashboard:', error);
    try {
      const { showToast } = await import('./app.js');
      showToast(
        'Erro ao carregar dados. Pode tentar novamente ou terminar sessão pelo botão Sair.',
        'error',
        9000,
      );
    } catch {
      /* UI mínima já está ativa — o botão Sair continua a funcionar */
    }
  }
}

let techConnectivityBound = false;

async function runTechDataSync() {
  if (!canReachServer()) {
    showToast('Sem ligação à internet. Os dados continuam guardados neste tablet.', 'warning', 6000);
    return;
  }

  const bar = document.getElementById('tech-connectivity-bar');
  const syncBtn = document.getElementById('tech-connectivity-sync-btn');
  if (syncBtn) syncBtn.disabled = true;
  bar?.classList.add('tech-connectivity-bar--syncing');

  try {
    const { synced, remaining } = await triggerTechDataSync();
    if (synced > 0) {
      showToast(
        synced === 1 ? '1 relatório enviado com sucesso.' : `${synced} relatórios enviados com sucesso.`,
        'success',
        5000,
      );
      periodJobsCacheKey = null;
      techTabDataCacheKey = null;
      await refreshTechCalendar();
    } else if (remaining > 0) {
      showToast('Não foi possível enviar agora. Tente novamente dentro de momentos.', 'warning', 6000);
    } else {
      showToast('Dados atualizados.', 'success', 3500);
      periodJobsCacheKey = null;
      techTabDataCacheKey = null;
      await refreshTechCalendar();
    }
  } catch (err) {
    console.error('[Técnico] Sincronização:', err);
    showToast('Erro ao sincronizar. Os dados continuam guardados neste dispositivo.', 'error', 7000);
  } finally {
    if (syncBtn) syncBtn.disabled = false;
    bar?.classList.remove('tech-connectivity-bar--syncing');
    refreshTechDashboardChrome().catch(console.error);
  }
}

function bindTechConnectivityActions() {
  if (techConnectivityBound) return;
  techConnectivityBound = true;
  document.getElementById('tech-connectivity-sync-btn')?.addEventListener('click', () => {
    void runTechDataSync();
  });
}

function bindTechGoToday() {
  document.getElementById('tech-go-today')?.addEventListener('click', () => {
    goToToday();
  });
}

function goToToday() {
  const today = getTodayIso();
  currentWeekDate = startOfLocalDay(new Date());
  weekDates = getWeekDates(currentWeekDate);
  selectedDate = today;
  periodJobsCacheKey = null;
  techTabDataCacheKey = null;

  if (techJobsTab !== 'agendados') {
    setTechJobsTab('agendados');
    return;
  }

  refreshTechCalendar().catch(console.error);
}

function bindTechCalendarCompact() {
  document.getElementById('tech-calendar-compact-btn')?.addEventListener('click', () => {
    techCalendarCompact = !techCalendarCompact;
    localStorage.setItem(TECH_CAL_COMPACT_KEY, techCalendarCompact ? '1' : '0');
    updateTechCalendarCompactUi();
  });
}

function updateTechCalendarCompactUi() {
  const wrap = document.getElementById('tech-calendar-wrap');
  const btn = document.getElementById('tech-calendar-compact-btn');
  wrap?.classList.toggle('tech-calendar-wrap--compact', techCalendarCompact);
  if (btn) {
    btn.setAttribute('aria-pressed', techCalendarCompact ? 'true' : 'false');
    btn.textContent = techCalendarCompact ? '▴' : '▾';
    btn.title = techCalendarCompact ? 'Expandir calendário' : 'Calendário compacto';
  }
}

function bindTechJobsSearch() {
  const input = document.getElementById('tech-jobs-search');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    const value = input.value || '';
    if (techJobsSearchTimer) clearTimeout(techJobsSearchTimer);
    techJobsSearchTimer = setTimeout(() => {
      techJobsSearchTimer = null;
      techJobsSearchQuery = value;
      renderJobs();
    }, TECH_JOBS_SEARCH_DEBOUNCE_MS);
  });
}

/** Intervalo de datas do calendário visível (semana ou mês). */
function getTechCalendarPeriodBounds() {
  if (techCalendarView === 'month') {
    const dates = getMonthDates(currentMonthDate);
    return { startDate: dates[0], endDate: dates[dates.length - 1] };
  }
  const dates = getWeekDates(currentWeekDate);
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
}

/**
 * Arranque rápido: catálogo + trabalhos do período visível + relatórios desses trabalhos.
 * O carregamento completo corre em background para a aba Realizados e histórico.
 */
async function warmTechDashboardInitial(technicianId) {
  const { ensureSupabaseAuthSession } = await import('./supabase-client.js');
  const { ensureProductionCatalog, isProductionCatalogReady } = await import('./clients-catalog.js');

  await ensureSupabaseAuthSession();

  const { startDate, endDate } = getTechCalendarPeriodBounds();
  const catalogTask = isProductionCatalogReady() ? Promise.resolve() : ensureProductionCatalog();

  await Promise.all([
    catalogTask,
    ensureTrabalhosSemana(technicianId, startDate, endDate),
    ensureServicosSemana(technicianId, startDate, endDate),
  ]);

  const periodJobIds = getJobsSnapshot()
    .filter((job) => jobAssignedToTechnician(job, technicianId))
    .filter((job) => {
      const date = String(job.date || '');
      return date >= startDate && date <= endDate;
    })
    .map((job) => job.id);

  const periodServicoIds = getTechAgendadosItems(technicianId)
    .filter((item) => item.isServico)
    .filter((item) => {
      const date = String(item.date || '');
      return date >= startDate && date <= endDate;
    })
    .map((item) => item.id);

  await Promise.all([
    ensureRelatoriosForTrabalhos(periodJobIds),
    ensureRelatoriosForServicos(periodServicoIds),
  ]);
}

function scheduleWarmTechDashboardFull() {
  void warmOperacoes()
    .then(async () => {
      const { reconcileLocallyDeletedReports, purgeLocallyDeletedFromCache } = await import(
        './report-deleted-local.js'
      );
      const { hydrateLocalReportsIntoCache } = await import('./report-local-storage.js');
      const { syncLocalReportDraftsToServer } = await import('./report-draft-sync.js');
      await reconcileLocallyDeletedReports();
      await purgeLocallyDeletedFromCache();
      await hydrateLocalReportsIntoCache();
      await syncLocalReportDraftsToServer({ notify: false });
      window.dispatchEvent(new CustomEvent('db-updated'));
    })
    .catch((err) => {
      console.warn('[Técnico] Carregamento completo em background:', err);
    });
}

function getRejectedJobsForTech(techId) {
  return getTechAgendadosItems(techId)
    .filter((item) => {
      const report = getCalendarItemReport(item);
      return resolveCalendarEventState(item, report) === 'rejected';
    })
    .sort(sortJobsByDateTime);
}

function getTodayAgendadosCount(techId) {
  const today = getTodayIso();
  return getAgendadosItemsForDate(techId, today).length;
}

function countJobsByStateForDate(techId, isoDate) {
  const counts = { draft: 0, pending: 0, scheduled: 0, rejected: 0 };
  getAgendadosItemsForDate(techId, isoDate).forEach((item) => {
    const state = resolveCalendarEventState(item, getCalendarItemReport(item));
    if (counts[state] !== undefined) counts[state] += 1;
  });
  return counts;
}

function updateTechTabBadges() {
  const session = requireAuth('technician');
  if (!session?.technicianId) return;
  const techId = session.technicianId;

  const counts = {
    agendados: getTodayAgendadosCount(techId),
    realizados: getRealizadosItems(techId).length,
  };

  Object.entries(counts).forEach(([tabId, count]) => {
    const badge = document.getElementById(`tech-tab-badge-${tabId}`);
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? '99+' : String(count);
    } else {
      badge.hidden = true;
    }
  });
}

async function renderTechDaySummary() {
  const el = document.getElementById('tech-day-summary');
  if (!el) return;

  const session = requireAuth('technician');
  if (!session?.technicianId) {
    el.innerHTML = '';
    return;
  }

  const techId = session.technicianId;
  const userName = session.name || 'técnico';
  const pendingSync = cachedPendingSyncCount;

  const today = getTodayIso();
  const todayJobs = getTodayAgendadosCount(techId);
  const todayStates = countJobsByStateForDate(techId, today);
  const rejected = getRejectedJobsForTech(techId).length;
  const todayLabel = formatDateLong(today);

  const stateParts = [];
  if (todayStates.draft) {
    stateParts.push(`<strong>${todayStates.draft}</strong> em curso`);
  }
  if (todayStates.pending) {
    stateParts.push(`<strong>${todayStates.pending}</strong> à espera de aprovação`);
  }

  const parts = [
    `<strong>${todayJobs}</strong> trabalho${todayJobs === 1 ? '' : 's'} hoje`,
    ...(stateParts.length ? [stateParts.join(' · ')] : []),
    pendingSync
      ? `<strong>${pendingSync}</strong> por sincronizar`
      : '<span class="tech-day-summary__ok">sincronizado</span>',
  ];

  el.innerHTML = `
    <p class="tech-day-summary__greeting">Olá, <strong>${escapeHtml(userName)}</strong></p>
    <p class="tech-day-summary__stats">${todayLabel} · ${parts.join(' · ')}${
      rejected ? ` · <span class="tech-day-summary__warn"><strong>${rejected}</strong> rejeitado${rejected === 1 ? '' : 's'}</span>` : ''
    }</p>
  `;
}

function renderTechRejectedBanner() {
  const banner = document.getElementById('tech-rejected-banner');
  if (!banner) return;

  const session = requireAuth('technician');
  if (!session?.technicianId) {
    banner.hidden = true;
    return;
  }

  const rejected = getRejectedJobsForTech(session.technicianId);
  if (!rejected.length) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }

  const first = rejected[0];
  const client = getClient(first.clientId);
  const report = getCalendarItemReport(first);
  const note = report?.rejectionNote || first.rejectionNote || '';
  const more = rejected.length > 1 ? ` (+${rejected.length - 1} outro${rejected.length > 2 ? 's' : ''})` : '';

  banner.hidden = false;
  banner.innerHTML = `
    <div class="tech-rejected-banner__content">
      <span class="tech-rejected-banner__icon" aria-hidden="true">↩</span>
      <div class="tech-rejected-banner__text">
        <strong>Relatório rejeitado — ${escapeHtml(client?.name || 'Cliente')}${more}</strong>
        ${note ? `<span class="tech-rejected-banner__note">${escapeHtml(note.length > 120 ? `${note.slice(0, 120)}…` : note)}</span>` : ''}
      </div>
      <button type="button" class="btn-primary btn-sm tech-rejected-banner__action" data-rejected-job="${escapeHtml(first.id)}">Corrigir</button>
    </div>
  `;

  banner.querySelector('[data-rejected-job]')?.addEventListener('click', () => {
    void openContinueJob(first.id);
  });
}

async function renderTechConnectivityBar() {
  const bar = document.getElementById('tech-connectivity-bar');
  const text = document.getElementById('tech-connectivity-text');
  const syncBtn = document.getElementById('tech-connectivity-sync-btn');
  if (!bar || !text) return;

  try {
    const { storage } = await loadTechOfflineDeps();
    const pending = cachedPendingSyncCount;
    const drafts = (await storage.getAllLocalReportDrafts()).length;
    const manualOffline = isOffline();
    const networkOffline = !isNetworkOnline();
    const online = canReachServer() && !manualOffline;

    bar.classList.remove(
      'tech-connectivity-bar--ok',
      'tech-connectivity-bar--warn',
      'tech-connectivity-bar--offline',
      'tech-connectivity-bar--syncing',
    );

    if (!online) {
      bar.classList.add('tech-connectivity-bar--offline');
      if (networkOffline) {
        text.textContent = pending
          ? `Sem rede · ${pending} relatório(s) por enviar`
          : 'Sem rede — dados guardados no tablet';
      } else {
        text.textContent = pending
          ? `Modo offline · ${pending} por enviar`
          : 'Modo offline — dados guardados no tablet';
      }
      if (syncBtn) {
        syncBtn.hidden = pending <= 0;
        syncBtn.disabled = !canReachServer();
      }
      return;
    }

    if (pending > 0) {
      bar.classList.add('tech-connectivity-bar--warn');
      text.textContent = `${pending} relatório(s) aguardam envio`;
      if (syncBtn) {
        syncBtn.hidden = false;
        syncBtn.disabled = false;
      }
      return;
    }

    bar.classList.add('tech-connectivity-bar--ok');
    text.textContent = drafts
      ? `Sincronizado · ${drafts} rascunho(s) em aberto`
      : 'Sincronizado com o servidor';
    if (syncBtn) syncBtn.hidden = true;
  } catch (err) {
    console.warn('[Técnico] Estado de sync:', err);
    text.textContent = 'Estado de sincronização indisponível';
  }
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
  const badge = document.getElementById('connection-badge');
  if (!toggle && isOffline()) {
    setOfflineMode(false);
  }

  const manualOffline = toggle ? isOffline() : false;
  const networkOffline = !isNetworkOnline();
  const effectivelyOffline = manualOffline || networkOffline;

  if (toggle) {
    toggle.checked = manualOffline;
    toggle.onchange = () => {
      setOfflineMode(toggle.checked);
      renderOfflineToggle();
      refreshTechDashboardChrome().catch(console.error);
    };
  }

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

  // Esconde/limpa de imediato a vista anterior para não ficarem as duas
  // estruturas misturadas enquanto os dados do novo período carregam.
  updateTechCalendarVisibility();

  refreshTechCalendar()
    .then(() => scheduleCalendarResize())
    .catch(console.error);
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

  await Promise.all([
    ensureTrabalhosSemana(session.technicianId, startDate, endDate),
    ensureServicosSemana(session.technicianId, startDate, endDate),
  ]);

  const servicoIds = getTechAgendadosItems(session.technicianId)
    .filter((item) => item.isServico && item.date >= startDate && item.date <= endDate)
    .map((item) => item.id);
  if (servicoIds.length) {
    await ensureRelatoriosForServicos(servicoIds);
  }

  periodJobsCacheKey = cacheKey;
}

async function refreshTechCalendar() {
  if (techDashboardRefreshInFlight) return;
  techDashboardRefreshInFlight = true;
  try {
    await loadPeriodJobsFromSupabase();
    await loadTechTabData();
    renderTechCalendar();
    await refreshTechDashboardChrome();
  } catch (err) {
    console.error('[Técnico] Calendário:', err);
  } finally {
    techDashboardRefreshInFlight = false;
  }
}

function updateTechCalendarVisibility() {
  const strip = document.getElementById('calendar-strip');
  const month = document.getElementById('tech-month-calendar');
  if (!strip || !month) return;

  // Classes de vista no contentor pai — isolam os estilos de cada modo.
  const body = strip.closest('.tech-calendar-body');
  body?.classList.toggle('vista-mensal', techCalendarView === 'month');
  body?.classList.toggle('vista-semanal', techCalendarView !== 'month');

  // Limpeza absoluta do contentor inativo — evita herdar estrutura/estilos
  // da outra vista e garante que só uma grelha existe no DOM de cada vez.
  if (techCalendarView === 'month') {
    strip.hidden = true;
    strip.style.display = 'none';
    strip.innerHTML = '';
    month.hidden = false;
    month.style.removeProperty('display');
  } else {
    month.hidden = true;
    month.style.display = 'none';
    month.innerHTML = '';
    strip.hidden = false;
    strip.style.removeProperty('display');
  }

  // Força o navegador a processar o novo layout antes de desenhar os cards.
  void body?.offsetHeight;
}

/** Força o browser a recalcular dimensões após trocar de vista. */
function scheduleCalendarResize() {
  setTimeout(() => {
    const active =
      techCalendarView === 'month'
        ? document.getElementById('tech-month-calendar')
        : document.getElementById('calendar-strip');
    // Leitura de offsetHeight força reflow da nova grelha
    void active?.offsetHeight;
    window.dispatchEvent(new Event('resize'));
  }, 50);
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

function openJobFromCalendar(itemId) {
  const session = requireAuth('technician');
  const techId = session?.technicianId;
  const item = techId
    ? getTechAgendadosItems(techId).find((i) => String(i.id) === String(itemId))
    : null;
  if (item?.isServico) {
    void openTechServicoDetail(itemId);
    return;
  }
  void openContinueJob(itemId);
}

function renderTechMonthJobBlock(item) {
  const client = getClient(item.clientId);
  const report = getCalendarItemReport(item);
  const subtitle = item.isServico
    ? getCalendarItemSubtitle(item)
    : getServiceType(item.serviceType)?.label || 'Serviço';
  const stateClass = getCalendarEventStateClass(item, report);
  const label = `${client?.name || 'Cliente'} — ${subtitle}`;

  return `
    <button type="button"
      class="cal-block cal-block-sm cal-block--interactive tech-month-job ${stateClass}"
      data-tech-month-job="${item.id}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}">
      <span class="cal-block-client">${escapeHtml(client?.name?.split(' ')[0] || 'Cliente')}</span>
      ${renderWorkStateBadge(item, report)}
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

  const selectMonthDay = (cell) => {
    selectedDate = cell.dataset.techMonthDay;
    if (techJobsTab === 'agendados') techTabDataCacheKey = null;
    renderMonthCalendar();
    if (techJobsTab === 'agendados') {
      loadTechTabData().then(() => renderJobs()).catch(console.error);
    } else {
      renderJobs();
    }
  };

  container.querySelectorAll('[data-tech-month-day]').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('[data-tech-month-job]')) return;
      selectMonthDay(cell);
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('[data-tech-month-job]')) return;
      e.preventDefault();
      selectMonthDay(cell);
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
      const dayJobs = techId ? getAgendadosItemsForDate(techId, date) : [];
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

      // <div role="button"> em vez de <button>: os cards internos são botões
      // e botões aninhados são HTML inválido (o parser partia a grelha).
      return `
        <div class="${classes}" data-tech-month-day="${date}" role="button" tabindex="0" aria-pressed="${isSelected}">
          <span class="cal-cell-day">${getDayNumber(date)}</span>
          <div class="tech-month-jobs">
            ${visibleJobs.map((job) => renderTechMonthJobBlock(job)).join('')}
            ${hiddenCount ? `<span class="cal-more">+${hiddenCount}</span>` : ''}
          </div>
        </div>
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
      const dayJobs = techId ? getAgendadosItemsForDate(techId, date) : [];
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
            .map((item) => {
              const state = resolveCalendarEventState(item, getCalendarItemReport(item));
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
      if (techJobsTab === 'agendados') techTabDataCacheKey = null;
      renderCalendarStrip();
      if (techJobsTab === 'agendados') {
        loadTechTabData().then(() => renderJobs()).catch(console.error);
      } else {
        renderJobs();
      }
    });
  });
}

/* ─── Cartão de trabalho (2 linhas, toque amplo) ─── */

const TECH_ROW_ACTIONS = {
  view: { icon: '👁️', title: 'Visualizar relatório' },
  continue: { icon: '✏️', title: 'Continuar relatório' },
  start: { icon: '▶', title: 'Iniciar relatório' },
  servico: { icon: '📋', title: 'Abrir visita' },
};

function renderTechJobRow(job, report, actionType, { dateOverride, showDate = true, reportId = '' } = {}) {
  const state = resolveCalendarEventState(job, report);
  const client = getClient(job?.clientId || report?.clientId);
  const isServico = Boolean(job?.isServico);
  const subtitle = isServico
    ? getCalendarItemSubtitle(job)
    : getServiceType(job?.serviceType || report?.serviceType)?.label || job?.serviceType || 'Relatório';
  const action = TECH_ROW_ACTIONS[actionType] || TECH_ROW_ACTIONS.view;
  const actionLabel = resolveTechActionLabel(actionType, state);
  const jobId = job?.id || report?.jobId || report?.servicoId || '';
  const clientId = job?.clientId || report?.clientId || '';
  const isoDate = dateOverride || job?.date || '';
  const label = `${action.title}: ${client?.name || 'Cliente'} — ${subtitle}${isoDate ? ` — ${formatDateLong(isoDate)}` : ''}`;
  const resolvedReportId = reportId || report?.id || '';
  const servicoAttr = isServico ? ' data-row-servico="1"' : '';
  const directReportAttr =
    !isServico && report?.servicoId && resolvedReportId
      ? ` data-row-servico-report="1" data-row-service-type="${escapeHtml(report.serviceType || '')}"`
      : '';

  const rejectionNote = report?.rejectionNote || job?.rejectionNote || '';
  const rejectionHtml =
    state === 'rejected'
      ? `<p class="tech-job-card__rejection">↩ ${
          rejectionNote
            ? escapeHtml(rejectionNote.length > 100 ? `${rejectionNote.slice(0, 100)}…` : rejectionNote)
            : 'Rejeitado — corrija e reenvie'
        }</p>`
      : '';

  const pdfBtn =
    actionType === 'view' && resolvedReportId
      ? `<button type="button" class="tech-job-card__pdf" data-row-pdf="${escapeHtml(resolvedReportId)}" data-row-pdf-job="${escapeHtml(jobId)}" aria-label="Ver PDF">PDF</button>`
      : '';

  return `
    <div class="tech-job-card tech-job-card--${state}">
      <button type="button" class="tech-job-card__main" data-row-job="${escapeHtml(jobId)}" data-row-action="${escapeHtml(actionType)}"${servicoAttr}${directReportAttr} data-row-report-id="${escapeHtml(resolvedReportId)}" aria-label="${escapeHtml(label)}">
        <div class="tech-job-card__row tech-job-card__row--top">
          ${showDate ? `<span class="tech-job-card__date">${formatRealizadoRowDate(isoDate)}</span>` : ''}
          <span class="tech-job-card__client">${escapeHtml(client?.name || 'Cliente')}</span>
          ${renderWorkStateBadge(job, report)}
        </div>
        <div class="tech-job-card__row tech-job-card__row--bottom">
          <span class="tech-job-card__service">${isServico ? '📋' : getServiceType(job?.serviceType || report?.serviceType)?.icon || '🔧'} ${escapeHtml(subtitle)}</span>
          <span class="tech-job-card__cta">${escapeHtml(actionLabel)}</span>
        </div>
        ${rejectionHtml}
      </button>
      <div class="tech-job-card__aside">
        ${
          clientId
            ? `<button type="button" class="tech-job-card__info" data-client-info="${escapeHtml(clientId)}" aria-label="Informação do cliente">ℹ️</button>`
            : ''
        }
        ${pdfBtn}
      </div>
    </div>
  `;
}

async function openReportPdfQuick(reportId, jobId) {
  const report =
    getReportsSnapshot().find((r) => String(r.id) === String(reportId)) ||
    (jobId ? getReportForJob(jobId) : null);
  if (!report) {
    showToast('Relatório não encontrado.', 'warning', 5000);
    return;
  }
  try {
    const previewModule = await import('./pdf-preview.js');
    await previewModule.previewReportPDF(report);
  } catch (err) {
    console.error('[Tech] PDF:', err);
    showToast('Não foi possível abrir o PDF.', 'error', 6000);
  }
}

function openTechClientInfo(clientId) {
  const client = getClient(clientId);
  if (!client) {
    showToast('Cliente não encontrado no catálogo.', 'warning', 5000);
    return;
  }
  const existing = document.querySelector('.tech-client-sheet');
  existing?.remove();
  const lastIntervention = getLastClientIntervention(clientId);
  const sheet = renderTechClientInfoSheet(client, {
    lastIntervention,
    onLastPdf: (reportId, jobId) => openReportPdfQuick(reportId, jobId),
    onHistory: () => openTechClientHistory(clientId),
  });
  document.body.appendChild(sheet);
}

let techJobRowOpening = false;

function bindTechJobRowsEvents(scope) {
  const run = async (row) => {
    if (techJobRowOpening) return;
    const jobId = String(row.dataset.rowJob || '').trim();
    if (!jobId) {
      showToast('Trabalho sem identificador válido.', 'warning', 5000);
      return;
    }

    techJobRowOpening = true;
    row.disabled = true;
    row.setAttribute('aria-busy', 'true');

    try {
      if (row.dataset.rowServico === '1') {
        await openTechServicoDetail(jobId);
      } else if (row.dataset.rowServicoReport === '1') {
        const { openServicoReportForm } = await loadFormsModule();
        await openServicoReportForm(jobId, {
          serviceType: row.dataset.rowServiceType,
          reportId: row.dataset.rowReportId || undefined,
          viewOnly: row.dataset.rowAction === 'view',
          editPending: row.dataset.rowAction === 'continue',
        });
      } else if (row.dataset.rowAction === 'view') {
        await openJobFormLazy(jobId, { viewOnly: true });
      } else {
        await openContinueJob(jobId);
      }
    } finally {
      techJobRowOpening = false;
      row.disabled = false;
      row.removeAttribute('aria-busy');
    }
  };

  scope.querySelectorAll('.tech-job-card__main[data-row-job]').forEach((row) => {
    row.addEventListener('click', () => {
      void run(row);
    });
  });

  scope.querySelectorAll('[data-client-info]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTechClientInfo(btn.dataset.clientInfo);
    });
  });

  scope.querySelectorAll('[data-row-pdf]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void openReportPdfQuick(btn.dataset.rowPdf, btn.dataset.rowPdfJob);
    });
  });
}

/* ─── Histórico de Realizados — lista compacta com pesquisa e grupos por mês ─── */

let realizadosSearchQuery = '';

function getRealizadoItemDate(item) {
  return item.job?.date || String(item.report.approvedAt || item.report.submittedAt || '').split('T')[0] || '';
}

function formatRealizadoRowDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

function formatRealizadoMonthLabel(isoDate) {
  if (!isoDate) return 'Sem data';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  const label = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function filterRealizadosItems(items) {
  return filterRealizadosBySearch(items, realizadosSearchQuery, {
    getClient,
    getService: getServiceType,
  });
}

function renderRealizadoRow({ job, report }) {
  const isoDate = getRealizadoItemDate({ job, report });
  const action = report?.status === 'pending_review' ? 'continue' : 'view';
  let pseudoJob =
    job ||
    (report.servicoId
      ? servicoToCalendarItem(getServico(report.servicoId))
      : {
          id: report.jobId || report.servicoId,
          clientId: report.clientId,
          serviceType: report.serviceType,
          date: isoDate,
        });
  if (report.servicoId) {
    pseudoJob = {
      ...pseudoJob,
      id: report.servicoId,
      serviceType: report.serviceType,
      isServico: false,
    };
  }
  return renderTechJobRow(pseudoJob, report, action, {
    dateOverride: isoDate,
    reportId: report.id,
  });
}

function renderRealizadosListHtml(allItems) {
  const items = filterRealizadosItems(allItems);

  if (!items.length) {
    return realizadosSearchQuery.trim()
      ? '<p class="realizados-no-results text-muted">Nenhum resultado para esta pesquisa.</p>'
      : `
        <div class="empty-state glass-card">
          <div class="empty-icon">✅</div>
          <p>${TECH_TAB_EMPTY_MESSAGES.realizados}</p>
        </div>
      `;
  }

  // Agrupa por mês/ano, do mais recente para o mais antigo (items já vêm ordenados)
  const groups = new Map();
  items.forEach((item) => {
    const isoDate = getRealizadoItemDate(item);
    const key = isoDate ? isoDate.slice(0, 7) : 'sem-data';
    if (!groups.has(key)) {
      groups.set(key, { label: formatRealizadoMonthLabel(isoDate), items: [] });
    }
    groups.get(key).items.push(item);
  });

  return [...groups.values()]
    .map(
      (group) => `
        <section class="realizados-month-group">
          <h3 class="realizados-month-heading">${escapeHtml(group.label)}</h3>
          <div class="tech-job-rows">
            ${group.items.map((item) => renderRealizadoRow(item)).join('')}
          </div>
        </section>
      `,
    )
    .join('');
}

function bindRealizadosListEvents(listEl) {
  bindTechJobRowsEvents(listEl);
}

function renderRealizadosPanel(container, techId) {
  const allItems = getRealizadosItems(techId);

  container.innerHTML = `
    <div class="realizados-toolbar">
      <input
        type="search"
        id="realizados-search"
        class="realizados-search"
        placeholder="🔍 Pesquisar cliente…"
        autocomplete="off"
        value="${escapeHtml(realizadosSearchQuery)}"
        aria-label="Pesquisar relatórios concluídos por cliente"
      >
    </div>
    <div id="realizados-list">${renderRealizadosListHtml(allItems)}</div>
  `;

  const listEl = container.querySelector('#realizados-list');
  bindRealizadosListEvents(listEl);

  const searchInput = container.querySelector('#realizados-search');
  searchInput?.addEventListener('input', () => {
    realizadosSearchQuery = searchInput.value || '';
    // Re-renderiza só a lista — o input mantém o foco enquanto escreve
    listEl.innerHTML = renderRealizadosListHtml(getRealizadosItems(techId));
    bindRealizadosListEvents(listEl);
  });
}

async function openContinueJob(jobId) {
  const report = getReportForJob(jobId);
  if (report?.status === 'pending_review') {
    await openJobFormLazy(jobId, { editPending: true });
    return;
  }
  await openJobFormLazy(jobId);
}

const TECH_TAB_EMPTY_MESSAGES = {
  agendados: 'Sem trabalhos neste dia.',
  realizados: 'Ainda não tem relatórios concluídos.',
};

function updateJobsSectionHeader() {
  const tabMeta = TECH_JOBS_TABS[techJobsTab];
  const title = document.getElementById('tech-jobs-section-title');
  const dateLabel = document.getElementById('selected-date-label');
  if (title) title.textContent = tabMeta.label;

  if (!dateLabel) return;

  if (techJobsTab === 'agendados') {
    dateLabel.textContent = formatDate(selectedDate);
  } else {
    const session = requireAuth('technician');
    const count = session ? getRealizadosItems(session.technicianId).length : 0;
    dateLabel.textContent = count ? `${count} relatório${count === 1 ? '' : 's'}` : tabMeta.subtitle;
  }
}

function renderJobs() {
  const session = requireAuth('technician');
  const container = document.getElementById('jobs-list');
  if (!container || !session) return;

  container.innerHTML = '';

  updateJobsSectionHeader();
  updateTechJobsToolbarVisibility();
  const techId = session.technicianId;

  const searchInput = document.getElementById('tech-jobs-search');
  if (searchInput && searchInput.value !== techJobsSearchQuery) {
    searchInput.value = techJobsSearchQuery;
  }

  if (techJobsTab === 'realizados') {
    renderRealizadosPanel(container, techId);
    return;
  }

  const jobFilterOpts = {
    getClient,
    getService: getServiceType,
    getReport: (id) => getCalendarItemReport({ id }),
    getSubtitle: (item) =>
      item?.isServico ? getCalendarItemSubtitle(item) : getServiceType(item?.serviceType)?.label || '',
  };

  if (techJobsTab === 'agendados') {
    let jobs = getAgendadosJobs(techId);
    jobs = filterJobsBySearch(jobs, techJobsSearchQuery, jobFilterOpts);

    if (!jobs.length) {
      const emptyMsg = techJobsSearchQuery.trim()
        ? 'Nenhum resultado para esta pesquisa.'
        : TECH_TAB_EMPTY_MESSAGES.agendados;
      container.innerHTML = `
        ${renderAgendadosStateLegend()}
        <div class="agendados-empty-note" role="status">
          <span aria-hidden="true">📅</span>
          <p>${emptyMsg}</p>
        </div>
        ${techJobsSearchQuery.trim() ? '' : renderAgendadosWeekPreview(techId)}
      `;
    } else {
      container.innerHTML = `
        ${renderAgendadosStateLegend()}
        ${renderTechJobsListHtml(jobs, (job) => renderAgendadosRow(job, { showDate: false }))}
        ${techJobsSearchQuery.trim() ? '' : renderAgendadosWeekPreview(techId)}
      `;
    }
    bindTechJobRowsEvents(container);
    return;
  }
}
