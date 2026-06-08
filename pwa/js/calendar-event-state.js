/**
 * Cores do calendário por estado do trabalho / relatório.
 */

export const CALENDAR_EVENT_STATES = {
  draft: {
    className: 'cal-event--draft',
    bg: '#e2e8f0',
    color: '#334155',
    border: '#94a3b8',
  },
  pending: {
    className: 'cal-event--pending',
    bg: '#fef3c7',
    color: '#78350f',
    border: '#fbbf24',
  },
  rejected: {
    className: 'cal-event--rejected',
    bg: '#fee2e2',
    color: '#991b1b',
    border: '#f87171',
  },
  approved: {
    className: 'cal-event--approved',
    bg: '#dcfce7',
    color: '#166534',
    border: '#4ade80',
  },
};

/**
 * Resolve o estado visual do evento (prioridade: relatório → trabalho → pendente).
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 * @returns {'draft' | 'pending' | 'rejected' | 'approved'}
 */
export function resolveCalendarEventState(job, report) {
  const reportStatus = report?.status;
  if (reportStatus === 'draft') return 'draft';
  if (reportStatus === 'rejected' || job?.status === 'rejected') return 'rejected';
  if (reportStatus === 'approved') return 'approved';
  if (reportStatus === 'pending_review') return 'pending';

  if (job?.status === 'rejected') return 'rejected';

  return 'pending';
}

/** @param {'draft' | 'pending' | 'rejected' | 'approved'} state */
export function getCalendarEventStateMeta(state) {
  return CALENDAR_EVENT_STATES[state] || CALENDAR_EVENT_STATES.pending;
}

/**
 * @param {object | null | undefined} job
 * @param {object | null | undefined} report
 */
export function getCalendarEventStateClass(job, report) {
  return getCalendarEventStateMeta(resolveCalendarEventState(job, report)).className;
}
