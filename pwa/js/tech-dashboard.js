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
import { reportMatchesTechnicianTeam } from './job-technician-utils.js';
import {
  getCalendarEventStateClass,
  renderWorkStateBadge,
  resolveCalendarEventState,
} from './calendar-event-state.js';
import { initLogoutButton, renderUserGreeting } from './auth.js';
import { HistoricoClienteView } from './views/historico-cliente.js';
import { ensureTrabalhosSemana, isJobsCacheLoaded } from './trabalhos-db.js';
import { isUuid } from './relatorios-db.js';

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
  em_curso: { id: 'em_curso', label: 'Em Curso / Pendentes', subtitle: 'Relatórios em aberto' },
  agendados: { id: 'agendados', label: 'Agendados', subtitle: 'Dia selecionado' },
  realizados: { id: 'realizados', label: 'Histórico de Realizados', subtitle: 'Concluídos' },
};

/** Aba ativa no arranque: Agendados (vista semanal do calendário). */
let techJobsTab = 'agendados';
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
  const job = report.jobId ? getJob(report.jobId) : null;
  return reportMatchesTechnicianTeam(report, job, {
    techId,
    techName: tech?.name,
  });
}

/** O calendário (Semana/Mês + dias) só é visível na aba Agendados. */
function updateTechCalendarWrapVisibility() {
  const wrap = document.getElementById('tech-calendar-wrap');
  if (!wrap) return;
  const show = techJobsTab === 'agendados';
  wrap.hidden = !show;
  wrap.style.display = show ? '' : 'none';
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

  updateTechCalendarWrapVisibility();

  if (tabId === 'agendados') {
    // Calendário volta a ser visível — garante grelha/dados atualizados
    refreshTechCalendar()
      .then(() => scheduleCalendarResize())
      .catch(console.error);
    return;
  }

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
  const cacheKey = `${session.technicianId}:${techJobsTab}:${techJobsTab === 'agendados' ? selectedDate : today}`;
  if (techTabDataCacheKey === cacheKey) return;

  await loadPeriodJobsFromSupabase();

  if (techJobsTab === 'em_curso' || techJobsTab === 'realizados') {
    const { ensureReportsLoaded } = await import('./relatorios-db.js');
    const { ensureJobsLoaded } = await import('./trabalhos-db.js');
    await ensureReportsLoaded();
    await ensureJobsLoaded();
  } else if (techJobsTab === 'agendados') {
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

function jobFromDraftReport(report) {
  const job = report.jobId ? getJob(report.jobId) : null;
  if (job) return job;
  if (!report.jobId) return null;
  return {
    id: report.jobId,
    clientId: report.clientId,
    serviceType: report.serviceType,
    forkliftSerial: report.forkliftSerial || '',
    date: report.submittedAt?.split('T')[0] || '',
    time: '',
    technicianId: report.technicianId,
    status: 'scheduled',
    rejectionNote: null,
  };
}

/** Estados de trabalho que excluem o relatório da aba Em Curso. */
const EM_CURSO_EXCLUDED_JOB_STATUSES = new Set([
  'completed',
  'concluido',
  'concluído',
  'approved',
  'pending_review',
  'pendente',
]);

/**
 * Apenas relatórios EXCLUSIVAMENTE «Em aberto» (rascunho), incluindo dias anteriores.
 * Concluídos, Pendente RH e Rejeitados nunca entram aqui.
 */
function getEmCursoJobs(techId) {
  const byId = new Map();
  const jobsLoaded = isJobsCacheLoaded();

  getReportsSnapshot().forEach((report) => {
    // Regra estrita: só estado 'draft' (Em aberto)
    if (report.status !== 'draft') return;
    if (!reportAssignedToTechnician(report, techId)) return;

    // Trabalho eliminado pelo RH: id do servidor (uuid) que já não existe
    // na tabela trabalhos — o rascunho não pode continuar a aparecer.
    if (jobsLoaded && isUuid(report.jobId) && !getJob(report.jobId)) {
      return;
    }

    const job = jobFromDraftReport(report);
    if (!job) return;
    if (job.technicianId && !jobAssignedToTechnician(job, techId)) return;

    // Defesa extra: se o trabalho no servidor já está submetido/concluído,
    // o rascunho local é obsoleto e não pode aparecer como Em aberto.
    if (EM_CURSO_EXCLUDED_JOB_STATUSES.has(String(job.status || '').toLowerCase())) return;

    byId.set(job.id, job);
  });

  return [...byId.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Estados visíveis na aba Agendados: por fazer (Agendado) ou a corrigir (Rejeitado). */
const AGENDADOS_VISIBLE_STATES = new Set(['scheduled', 'rejected']);

/** Data pura YYYY-MM-DD — elimina hora/fuso antes de comparar. */
function toPureDate(value) {
  return String(value || '').split('T')[0];
}

/** Trabalhos da aba «Agendados» do dia selecionado (agendados + rejeitados a corrigir). */
function getAgendadosJobs(techId) {
  const selected = toPureDate(selectedDate);
  return getJobsSnapshot()
    .filter((job) => {
      if (!jobAssignedToTechnician(job, techId)) return false;
      if (toPureDate(job.date) !== selected) return false;
      const report = getReportForJob(job.id);
      return AGENDADOS_VISIBLE_STATES.has(resolveCalendarEventState(job, report));
    })
    .sort(sortJobsByDateTime);
}

/** Trabalhos no resto da semana do dia selecionado (exclui o próprio dia). */
function getRestOfWeekScheduledJobs(techId) {
  const selected = toPureDate(selectedDate);
  const weekOfSelected = getWeekDates(new Date(`${selected}T12:00:00`));
  const dateSet = new Set(weekOfSelected);

  return getJobsSnapshot()
    .filter((job) => {
      const jobDate = toPureDate(job.date);
      if (!jobAssignedToTechnician(job, techId)) return false;
      if (!dateSet.has(jobDate) || jobDate === selected) return false;
      const report = getReportForJob(job.id);
      return AGENDADOS_VISIBLE_STATES.has(resolveCalendarEventState(job, report));
    })
    .sort(sortJobsByDateTime);
}

/** Linha da aba Agendados: rejeitados reabrem para correção (borda vermelha). */
function renderAgendadosRow(job, options = {}) {
  const report = getReportForJob(job.id);
  const state = resolveCalendarEventState(job, report);
  const action = state === 'rejected' ? 'continue' : 'start';
  return renderTechJobRow(job, report, action, options);
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
 * Pendente RH (pending_review) — o técnico vê o que enviou, só em leitura.
 */
const REALIZADOS_VISIBLE_STATUSES = new Set(['approved', 'pending_review']);

function getRealizadosItems(techId) {
  return getReportsSnapshot()
    .filter(
      (report) =>
        REALIZADOS_VISIBLE_STATUSES.has(report.status) &&
        reportAssignedToTechnician(report, techId),
    )
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
      <h2 id="tech-jobs-section-title">Agendados</h2>
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
  updateTechCalendarWrapVisibility();
  const title = document.getElementById('tech-jobs-section-title');
  if (title) title.textContent = TECH_JOBS_TABS[techJobsTab].label;
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

  // UI básica primeiro — navegação e botão Sair nunca ficam bloqueados
  // por falhas na recolha de dados do Supabase.
  renderUserGreeting('user-name');
  initLogoutButton();
  renderHeader();
  renderOfflineToggle();
  renderOfflineSyncBar();
  bindTechCalendarNavigation();
  bindTechJobsTabs();
  bindOfflineSyncButton();
  updateTechCalendarWrapVisibility();

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

  try {
    const { hydrateLocalReportsIntoCache } = await import('./report-local-storage.js');
    await hydrateLocalReportsIntoCache();

    try {
      await warmOperacoes();
    } catch (err) {
      const { handleFatalDashboardError } = await import('./app.js');
      if (await handleFatalDashboardError(err)) return;
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

    await refreshTechCalendar();

    // Realtime: quando o RH cria/altera/elimina trabalhos ou relatórios,
    // a lista atualiza-se logo, sem o técnico fazer refresh manual.
    try {
      const { initTechRealtime } = await import('./tech-realtime.js');
      await initTechRealtime();
    } catch (err) {
      console.warn('[Técnico] Realtime indisponível (a dashboard continua a funcionar):', err);
    }
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
  const label = `${client?.name || 'Cliente'} — ${service?.label || 'Serviço'}`;

  return `
    <button type="button"
      class="cal-block cal-block-sm cal-block--interactive tech-month-job ${stateClass}"
      data-tech-month-job="${job.id}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}">
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

/* ─── Linha compacta padrão (todas as abas) ───
   [Data] | [Cliente] | [Tipo de Relatório] | [Etiqueta Estado] | [Ação]
   Borda esquerda com a cor oficial do estado. (Serviços são ao dia — sem hora.) */

const TECH_ROW_ACTIONS = {
  view: { icon: '👁️', title: 'Visualizar relatório' },
  continue: { icon: '✏️', title: 'Continuar relatório' },
  start: { icon: '▶', title: 'Iniciar relatório' },
};

function renderTechJobRow(job, report, actionType, { dateOverride, showDate = true } = {}) {
  const state = resolveCalendarEventState(job, report);
  const client = getClient(job?.clientId || report?.clientId);
  const service = getServiceType(job?.serviceType || report?.serviceType);
  const action = TECH_ROW_ACTIONS[actionType] || TECH_ROW_ACTIONS.view;
  const jobId = job?.id || report?.jobId || '';
  const isoDate = dateOverride || job?.date || '';
  const label = `${action.title}: ${client?.name || 'Cliente'} — ${service?.label || 'Relatório'}${isoDate ? ` — ${formatDateLong(isoDate)}` : ''}`;

  return `
    <button type="button" class="tech-job-row tech-job-row--${state}" data-row-job="${escapeHtml(jobId)}" data-row-action="${escapeHtml(actionType)}" aria-label="${escapeHtml(label)}">
      ${showDate ? `<span class="tech-job-row-date">${formatRealizadoRowDate(isoDate)}</span>` : ''}
      <span class="tech-job-row-client">${escapeHtml(client?.name || 'Cliente')}</span>
      <span class="tech-job-row-service">${service?.icon || '🔧'} ${escapeHtml(service?.label || job?.serviceType || 'Relatório')}</span>
      ${renderWorkStateBadge(job, report)}
      <span class="tech-job-row-action" aria-hidden="true">${action.icon}</span>
    </button>
  `;
}

function bindTechJobRowsEvents(scope) {
  const run = (row) => {
    const jobId = row.dataset.rowJob;
    if (!jobId) return;
    if (row.dataset.rowAction === 'view') {
      openJobFormLazy(jobId, { viewOnly: true }).catch(console.error);
    } else {
      openContinueJob(jobId);
    }
  };

  scope.querySelectorAll('.tech-job-row[data-row-job]').forEach((row) => {
    row.addEventListener('click', () => run(row));
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
  const query = realizadosSearchQuery.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => {
    const client = getClient(item.report.clientId || item.job?.clientId);
    const clientName = String(client?.name || '').toLowerCase();
    const service = getServiceType(item.report.serviceType || item.job?.serviceType);
    const serviceLabel = String(service?.label || '').toLowerCase();
    return clientName.includes(query) || serviceLabel.includes(query);
  });
}

function renderRealizadoRow({ job, report }) {
  const isoDate = getRealizadoItemDate({ job, report });
  return renderTechJobRow(job, report, 'view', { dateOverride: isoDate });
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

function openContinueJob(jobId) {
  const report = getReportForJob(jobId);
  if (report?.status === 'pending_review') {
    openJobFormLazy(jobId, { editPending: true }).catch(console.error);
    return;
  }
  openJobFormLazy(jobId).catch(console.error);
}

const TECH_TAB_EMPTY_MESSAGES = {
  em_curso: 'Não tem relatórios em aberto. Os rascunhos guardados aparecem aqui.',
  agendados: 'Sem trabalhos agendados neste dia.',
  realizados: 'Ainda não tem relatórios concluídos.',
};

function updateJobsSectionHeader() {
  const tabMeta = TECH_JOBS_TABS[techJobsTab];
  const title = document.getElementById('tech-jobs-section-title');
  const dateLabel = document.getElementById('selected-date-label');
  if (title) title.textContent = tabMeta.label;

  if (!dateLabel) return;

  if (techJobsTab === 'em_curso') {
    const techSession = requireAuth('technician');
    const count = techSession ? getEmCursoJobs(techSession.technicianId).length : 0;
    dateLabel.textContent = count
      ? `${count} relatório${count === 1 ? '' : 's'} em aberto`
      : tabMeta.subtitle;
  } else if (techJobsTab === 'agendados') {
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

  // Esvazia a lista antes de injetar as novas linhas filtradas,
  // para não deixar lixo visual de consultas anteriores.
  container.innerHTML = '';

  updateJobsSectionHeader();
  const techId = session.technicianId;

  if (techJobsTab === 'realizados') {
    renderRealizadosPanel(container, techId);
    return;
  }

  if (techJobsTab === 'agendados') {
    const jobs = getAgendadosJobs(techId);
    if (!jobs.length) {
      // Layout compacto: nota discreta + trabalhos do resto da semana
      container.innerHTML = `
        <div class="agendados-empty-note" role="status">
          <span aria-hidden="true">📅</span>
          <p>${TECH_TAB_EMPTY_MESSAGES.agendados}</p>
        </div>
        ${renderAgendadosWeekPreview(techId)}
      `;
    } else {
      // Aba diária: o dia já está selecionado no calendário — a linha começa pelo cliente.
      container.innerHTML = `
        <div class="tech-job-rows">
          ${jobs.map((job) => renderAgendadosRow(job, { showDate: false })).join('')}
        </div>
        ${renderAgendadosWeekPreview(techId)}
      `;
    }
    bindTechJobRowsEvents(container);
    return;
  }

  const jobs = getEmCursoJobs(techId);
  if (!jobs.length) {
    container.innerHTML = `
      <div class="empty-state glass-card">
        <div class="empty-icon">📋</div>
        <p>${TECH_TAB_EMPTY_MESSAGES.em_curso}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="tech-job-rows">
      ${jobs.map((job) => renderTechJobRow(job, getReportForJob(job.id), 'continue')).join('')}
    </div>
  `;
  bindTechJobRowsEvents(container);
}
