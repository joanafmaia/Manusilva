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

let selectedDate = new Date().toISOString().split('T')[0];
let weekDates = getWeekDates();

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
  renderJobs();
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

export function initTechDashboard() {
  const session = requireAuth('technician');
  if (!session) return;

  renderUserGreeting('user-name');
  initLogoutButton();
  renderHeader();
  renderOfflineToggle();
  renderCalendarStrip();
  renderJobs();

  window.addEventListener('jobs-updated', renderJobs);
  window.addEventListener('db-updated', () => {
    renderOfflineToggle();
    renderJobs();
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

function renderCalendarStrip() {
  weekDates = getWeekDates(new Date(selectedDate));
  const strip = document.getElementById('calendar-strip');
  if (!strip) return;

  strip.innerHTML = weekDates.map((date) => {
    const isSelected = date === selectedDate;
    const today = isToday(date);
    return `
      <button class="cal-day ${isSelected ? 'selected' : ''} ${today ? 'today' : ''}" data-date="${date}">
        <span class="cal-day-name">${getDayLabel(date)}</span>
        <span class="cal-day-num">${getDayNumber(date)}</span>
        ${today ? '<span class="cal-today-dot"></span>' : ''}
      </button>
    `;
  }).join('');

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
        <button class="job-action-btn" data-open-job="${job.id}">
          ${isRejected ? 'Corrigir e Reenviar' : job.status === 'completed' ? 'Ver Relatório' : 'Abrir Relatório'}
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
