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
  setOfflineMode,
  warmJobs,
  statusBadge,
  formatDate,
  getDayLabel,
  getDayNumber,
  isToday,
  COMPANY,
  escapeHtml,
  applyBrandLogo,
} from './app.js';
import { initLogoutButton, renderUserGreeting } from './auth.js';
import { openJobForm } from './forms.js';
import { HistoricoClienteView } from './views/historico-cliente.js';
import {
  ensureTrabalhosSemana,
  getTechnicianJobDatesInRange,
} from './trabalhos-db.js';

let selectedDate = new Date().toISOString().split('T')[0];
let weekDates = getWeekDates();
let weekJobsCacheKey = null;

const TECH_JOBS_SHELL_HTML = `
  <section class="jobs-section" data-tech-jobs-shell>
    <div class="section-header">
      <h2>Trabalhos do Dia</h2>
      <span class="date-label" id="selected-date-label"></span>
    </div>
    <p class="text-muted tech-greeting" style="font-size:0.8rem;margin:-0.5rem 0 1rem">
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
  refreshTechWeekCalendar().catch(console.error);
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openTechClientHistory(clientId) {
  const app = document.getElementById('app');
  if (!app || !clientId) return;
  app.innerHTML = HistoricoClienteView.render(clientId, { batteryOnly: false });
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

  try {
    await warmJobs();
  } catch (err) {
    console.error('[Técnico] Trabalhos Supabase:', err);
  }

  const { initTrabalhosOfflineSync, migrateLegacyOfflineQueue, sincronizarTrabalhosOffline } =
    await import('./trabalhos-offline.js');
  const { getDB, updateDB } = await import('./app.js');

  migrateLegacyOfflineQueue(getDB, updateDB);
  initTrabalhosOfflineSync();
  sincronizarTrabalhosOffline().catch(console.error);

  await refreshTechWeekCalendar();

  window.addEventListener('jobs-updated', () => {
    weekJobsCacheKey = null;
    refreshTechWeekCalendar().catch(console.error);
  });
  window.addEventListener('db-updated', () => {
    renderOfflineToggle();
    weekJobsCacheKey = null;
    refreshTechWeekCalendar().catch(console.error);
  });
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

  const offline = isOffline();
  toggle.checked = offline;
  label.textContent = offline ? 'Offline' : 'Online';
  badge.className = `connection-badge ${offline ? 'offline' : 'online'}`;
  badge.textContent = offline ? '● Offline' : '● Online';

  toggle.onchange = () => {
    setOfflineMode(toggle.checked);
    renderOfflineToggle();
  };
}

async function loadWeekJobsFromSupabase() {
  const session = requireAuth('technician');
  if (!session?.technicianId) return;

  weekDates = getWeekDates(new Date(selectedDate));
  const startDate = weekDates[0];
  const endDate = weekDates[weekDates.length - 1];
  const cacheKey = `${session.technicianId}:${startDate}:${endDate}`;

  if (weekJobsCacheKey === cacheKey) return;

  await ensureTrabalhosSemana(session.technicianId, startDate, endDate);
  weekJobsCacheKey = cacheKey;
}

async function refreshTechWeekCalendar() {
  try {
    await loadWeekJobsFromSupabase();
  } catch (err) {
    console.error('[Técnico] Calendário semanal:', err);
  }
  renderCalendarStrip();
  renderJobs();
}

function renderCalendarStrip() {
  const session = requireAuth('technician');
  const strip = document.getElementById('calendar-strip');
  if (!strip) return;

  weekDates = getWeekDates(new Date(selectedDate));
  const jobDates =
    session?.technicianId
      ? getTechnicianJobDatesInRange(session.technicianId, weekDates)
      : new Set();

  strip.innerHTML = weekDates
    .map((date) => {
      const isSelected = date === selectedDate;
      const today = isToday(date);
      const hasJobs = jobDates.has(date);
      const classes = [
        'cal-day',
        isSelected ? 'selected' : '',
        today ? 'today' : '',
        hasJobs ? 'has-jobs' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
      <button type="button" class="${classes}" data-date="${date}" aria-pressed="${isSelected}">
        <span class="cal-day-name">${getDayLabel(date)}</span>
        <span class="cal-day-num">${getDayNumber(date)}</span>
        ${hasJobs ? '<span class="cal-job-dot" aria-hidden="true"></span>' : ''}
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
    const isRejected = job.status === 'rejected';
    const savedReport = getReportForJob(job.id);
    const hasDraft = savedReport?.status === 'draft';

    return `
      <article class="job-card glass-card ${isRejected ? 'job-rejected' : ''}" data-job-id="${job.id}">
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
          <div class="job-card-badges">
            ${hasDraft ? '<span class="draft-badge">Rascunho</span>' : ''}
            ${statusBadge(job.status)}
          </div>
        </div>
        <div class="job-client-row">
          <button type="button" class="job-client job-client-link" data-client-history="${escapeHtml(job.clientId)}" title="Ver histórico de intervenções">
            ${escapeHtml(client?.name || 'Cliente')}
          </button>
          <button type="button" class="btn-outline btn-sm job-history-btn" data-client-history="${escapeHtml(job.clientId)}">
            Histórico
          </button>
        </div>
        <div class="job-meta">
          <span class="job-type">${service?.icon || '🔧'} ${escapeHtml(service?.label || job.serviceType)}</span>
          ${job.forkliftSerial ? `<span class="job-serial">${escapeHtml(job.forkliftSerial)}</span>` : ''}
        </div>
        <button class="job-action-btn job-action-btn--primary" data-open-job="${job.id}">
          ${isRejected ? 'Corrigir e Reenviar' : job.status === 'completed' ? 'Ver Relatório' : 'Iniciar'}
        </button>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-open-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openJobForm(btn.dataset.openJob);
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
      openJobForm(card.dataset.jobId);
    });
  });
}
