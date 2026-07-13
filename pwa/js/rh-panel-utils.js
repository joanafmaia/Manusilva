/**
 * Utilitários do painel RH — filtros, idade, métricas alargadas.
 */

import { getJob, getClient, getTechnician, getPendingReports } from './app.js';
import { getReportsSnapshot } from './relatorios-db.js';
import { formatOrdemLabel } from './report-review-ui.js';
import { reportMatchesTechnicianTeam } from './job-technician-utils.js';
import { resolveJobContextForReport, resolveReportTechnicianLabel } from './servicos-panel-utils.js';

const RH_FILTER_STORAGE_KEY = 'manusilva.rhReviewFilters.v2';
const RH_FILTER_LEGACY_KEY = 'manusilva.rhReviewFilters';
const RH_DAY_COLLAPSE_KEY = 'manusilva.rhReviewDayCollapse';

export function loadRhReviewFilters() {
  try {
    let raw = localStorage.getItem(RH_FILTER_STORAGE_KEY);
    let migratedFromLegacy = false;
    if (!raw) {
      raw = localStorage.getItem(RH_FILTER_LEGACY_KEY);
      migratedFromLegacy = Boolean(raw);
    }
    if (!raw) return { status: 'pending_review', techId: 'all', search: '' };
    const parsed = JSON.parse(raw);
    let status = parsed.status || 'pending_review';
    if (migratedFromLegacy && status === 'all') {
      status = 'pending_review';
    }
    return {
      status,
      techId: parsed.techId || 'all',
      search: parsed.search || '',
    };
  } catch {
    return { status: 'pending_review', techId: 'all', search: '' };
  }
}

export function saveRhReviewFilters(filters) {
  try {
    localStorage.setItem(
      RH_FILTER_STORAGE_KEY,
      JSON.stringify({
        status: filters.status,
        techId: filters.techId,
        search: filters.search,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

export function loadRhDayCollapseState() {
  try {
    const raw = localStorage.getItem(RH_DAY_COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRhDayCollapseState(state) {
  try {
    localStorage.setItem(RH_DAY_COLLAPSE_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore quota */
  }
}

export function rhDayCollapseKey(dateIso) {
  return dateIso || '_undated';
}

export function isRhDayCollapsed(dateIso, state = loadRhDayCollapseState()) {
  return Boolean(state[rhDayCollapseKey(dateIso)]);
}

export function toggleRhDayCollapsed(dateIso, state = loadRhDayCollapseState()) {
  const key = rhDayCollapseKey(dateIso);
  const next = { ...state };
  if (next[key]) delete next[key];
  else next[key] = true;
  saveRhDayCollapseState(next);
  return next;
}

export function formatReportAge(submittedAt) {
  if (!submittedAt) return '—';
  const then = new Date(submittedAt);
  if (Number.isNaN(then.getTime())) return '—';
  const diffMs = Date.now() - then.getTime();
  if (diffMs < 0) return 'agora';
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return 'há poucos minutos';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

export function getReportUrgencyLevel(submittedAt, status) {
  if (status !== 'pending_review' || !submittedAt) return 'normal';
  const then = new Date(submittedAt);
  if (Number.isNaN(then.getTime())) return 'normal';
  const hours = (Date.now() - then.getTime()) / 3600000;
  if (hours >= 48) return 'urgent';
  if (hours >= 24) return 'warning';
  return 'normal';
}

export function filterRhReports(reports, { techId, search }) {
  let list = [...reports];

  if (techId && techId !== 'all') {
    const tech = getTechnician(techId);
    const match = { techId, techName: tech?.name };
    list = list.filter((report) =>
      reportMatchesTechnicianTeam(report, resolveJobContextForReport(report), match),
    );
  }

  const q = String(search || '').trim().toLowerCase();
  if (!q) return list;

  return list.filter((report) => {
    const job = resolveJobContextForReport(report);
    const client = getClient(report.clientId);
    const techName = resolveReportTechnicianLabel(report, job).toLowerCase();
    const clientName = String(client?.name || client?.Nome || '').toLowerCase();
    const ordem = String(formatOrdemLabel(job) || '').toLowerCase();
    const ordemNum = job?.numeroOrdem != null ? String(job.numeroOrdem) : '';
    return (
      clientName.includes(q) ||
      techName.includes(q) ||
      ordem.includes(q) ||
      ordemNum.includes(q) ||
      String(report.id || '').toLowerCase().includes(q)
    );
  });
}

export { getNextPendingReportId } from './servicos-rh-review.js';

function weekDateSet() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return new Set(dates);
}

export function computeExtendedRhMetrics(baseMetrics) {
  const weekSet = weekDateSet();
  const approved = getReportsSnapshot().filter((r) => r.status === 'approved');
  const completedThisWeek = approved.filter((r) => {
    const job = r.jobId ? getJob(r.jobId) : null;
    const ref = String(job?.date || r.approvedAt || r.submittedAt || '').split('T')[0];
    return weekSet.has(ref);
  }).length;

  const approvalDeltas = approved
    .map((r) => {
      if (!r.submittedAt || !r.approvedAt) return null;
      const sub = new Date(r.submittedAt).getTime();
      const app = new Date(r.approvedAt).getTime();
      if (Number.isNaN(sub) || Number.isNaN(app) || app < sub) return null;
      return (app - sub) / 3600000;
    })
    .filter((h) => h != null);

  const avgApprovalHours =
    approvalDeltas.length > 0
      ? Math.round(approvalDeltas.reduce((a, b) => a + b, 0) / approvalDeltas.length)
      : null;

  const pendingByTech = {};
  getPendingReports().forEach((r) => {
    const tech = getTechnician(r.technicianId);
    const name = tech?.name || '—';
    pendingByTech[name] = (pendingByTech[name] || 0) + 1;
  });

  const topPendingEntry = Object.entries(pendingByTech).sort((a, b) => b[1] - a[1])[0];

  return {
    ...baseMetrics,
    completedThisWeek,
    avgApprovalHours,
    pendingByTech,
    topPendingTech: topPendingEntry
      ? `${topPendingEntry[0]} (${topPendingEntry[1]})`
      : '—',
  };
}

export function buildRhOpsSummaryText(metrics) {
  const parts = [
    `${metrics.pendingReports} pendente${metrics.pendingReports === 1 ? '' : 's'}`,
    `${metrics.pendingBilling} por faturar`,
    `${metrics.jobsToday} trabalho${metrics.jobsToday === 1 ? '' : 's'} hoje`,
  ];
  return parts.join(' · ');
}
