/**
 * Produtividade da equipa técnica — contagem de relatórios «Concluído» (approved)
 * por técnico, a partir dos snapshots Supabase já carregados no painel RH.
 */

import { getReportsSnapshot, dedupeReportsByJobPreferNewest } from './relatorios-db.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import { reportMatchesTechnicianTeam } from './job-technician-utils.js';

function getApprovedReports() {
  return dedupeReportsByJobPreferNewest(
    getReportsSnapshot().filter((r) => r.status === 'approved'),
  );
}

function findJob(jobId) {
  if (!jobId) return null;
  return getJobsSnapshot().find((j) => j.id === jobId) || null;
}

/** Data de referência YYYY-MM-DD: dia do trabalho ou, na falta, aprovação/submissão. */
export function getConcluidoDate(report, job) {
  const raw = job?.date || report.approvedAt || report.submittedAt || '';
  return String(raw).split('T')[0];
}

/** Mês corrente em hora local (YYYY-MM). */
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Histórico de Concluídos de um técnico — [{ report, job, date }], mais recente primeiro.
 * Verifica a equipa completa do trabalho («Hugo, Filipe»): conta para todos os
 * técnicos atribuídos, mesmo que só um tenha submetido o relatório no tablet.
 */
export function getConcluidosForTechnician(tech) {
  const match = { techId: tech?.id, techName: tech?.name };
  return getApprovedReports()
    .map((report) => ({ report, job: findJob(report.jobId) }))
    .filter(({ report, job }) => reportMatchesTechnicianTeam(report, job, match))
    .map(({ report, job }) => ({ report, job, date: getConcluidoDate(report, job) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** COUNT de relatórios exclusivamente «Concluído» do técnico. */
export function countConcluidosForTechnician(tech) {
  return getConcluidosForTechnician(tech).length;
}

/**
 * Resumo para os cards do topo do painel RH.
 * @param {Array<object>} technicians
 * @returns {{ totalGlobal: number, topMonth: { tech: object, month: number } | null, monthLabel: string }}
 */
export function getTeamStatsSummary(technicians) {
  const monthKey = currentMonthKey();
  const now = new Date();
  const monthLabel = now.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  let topMonth = null;
  (technicians || []).forEach((tech) => {
    const items = getConcluidosForTechnician(tech);
    const month = items.filter((i) => i.date.startsWith(monthKey)).length;
    if (month > 0 && (!topMonth || month > topMonth.month)) {
      topMonth = { tech, month };
    }
  });

  return {
    totalGlobal: getApprovedReports().length,
    topMonth,
    monthLabel,
  };
}
