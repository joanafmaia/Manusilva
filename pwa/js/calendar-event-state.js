/**
 * Tabela oficial de cores e etiquetas — estados dos trabalhos / relatórios.
 * Fonte única para calendários (técnicos + RH) e painel lateral de relatórios.
 */

export const WORK_STATE_COLORS = {
  scheduled: '#3b82f6',
  draft: '#6b7280',
  pending: '#eab308',
  rejected: '#ef4444',
  approved: '#10b981',
};

export const CALENDAR_EVENT_STATES = {
  scheduled: {
    className: 'cal-event--scheduled',
    cardClass: 'work-state-card--scheduled',
    badgeClass: 'work-state-badge--scheduled',
    label: 'Agendado',
    color: WORK_STATE_COLORS.scheduled,
  },
  draft: {
    className: 'cal-event--draft',
    cardClass: 'work-state-card--draft',
    badgeClass: 'work-state-badge--draft',
    label: 'Em aberto',
    color: WORK_STATE_COLORS.draft,
  },
  pending: {
    className: 'cal-event--pending',
    cardClass: 'work-state-card--pending',
    badgeClass: 'work-state-badge--pending',
    label: 'Pendente RH',
    color: WORK_STATE_COLORS.pending,
  },
  rejected: {
    className: 'cal-event--rejected',
    cardClass: 'work-state-card--rejected',
    badgeClass: 'work-state-badge--rejected',
    label: 'Rejeitado',
    color: WORK_STATE_COLORS.rejected,
  },
  approved: {
    className: 'cal-event--approved',
    cardClass: 'work-state-card--approved',
    badgeClass: 'work-state-badge--approved',
    label: 'Concluído',
    color: WORK_STATE_COLORS.approved,
  },
};

/**
 * Resolve o estado visual do evento (prioridade: relatório → trabalho → agendado).
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 * @returns {'scheduled' | 'draft' | 'pending' | 'rejected' | 'approved'}
 */
export function resolveCalendarEventState(job, report) {
  const reportStatus = report?.status;
  if (reportStatus === 'draft') return 'draft';
  if (reportStatus === 'rejected' || job?.status === 'rejected') return 'rejected';
  if (reportStatus === 'approved') return 'approved';
  if (reportStatus === 'pending_review') return 'pending';

  if (job?.status === 'rejected') return 'rejected';
  if (job?.status === 'completed') return 'approved';

  return 'scheduled';
}

/**
 * Estado visual a partir do relatório (painel RH quando o trabalho pode estar ausente).
 * @param {object | null | undefined} report
 * @param {object | null | undefined} [job]
 */
export function resolveWorkStateFromReport(report, job = null) {
  if (job) return resolveCalendarEventState(job, report);
  const status = report?.status;
  if (status === 'draft') return 'draft';
  if (status === 'pending_review') return 'pending';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'draft';
}

/** @param {'scheduled' | 'draft' | 'pending' | 'rejected' | 'approved'} state */
export function getCalendarEventStateMeta(state) {
  return CALENDAR_EVENT_STATES[state] || CALENDAR_EVENT_STATES.scheduled;
}

/**
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 */
export function getCalendarEventStateClass(job, report) {
  return getCalendarEventStateMeta(resolveCalendarEventState(job, report)).className;
}

/**
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 */
export function getWorkStateCardClass(job, report) {
  return getCalendarEventStateMeta(resolveCalendarEventState(job, report)).cardClass;
}

/** Etiqueta oficial para calendário mensal / listas */
export function getCalendarEventStateLabel(job, report) {
  const state = resolveCalendarEventState(job, report);
  return getCalendarEventStateMeta(state).label;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Badge unificado com etiqueta e cor do estado.
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 * @param {{ flash?: boolean }} [options]
 */
export function renderWorkStateBadge(job, report, options = {}) {
  const state = resolveCalendarEventState(job, report);
  const meta = getCalendarEventStateMeta(state);
  const flash = options.flash && state === 'pending' ? ' work-state-badge--flash' : '';
  return `<span class="work-state-badge ${meta.badgeClass}${flash}">${escHtml(meta.label)}</span>`;
}

/**
 * Badge a partir do relatório (painel RH).
 * @param {object | null | undefined} report
 * @param {object | null | undefined} [job]
 * @param {{ flash?: boolean }} [options]
 */
export function renderReportWorkStateBadge(report, job = null, options = {}) {
  const state = resolveWorkStateFromReport(report, job);
  const meta = getCalendarEventStateMeta(state);
  const flash = options.flash && state === 'pending' ? ' work-state-badge--flash' : '';
  return `<span class="work-state-badge ${meta.badgeClass}${flash}">${escHtml(meta.label)}</span>`;
}
