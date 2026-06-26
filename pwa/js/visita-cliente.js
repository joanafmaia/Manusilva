/**
 * Visita ao cliente — agrupamento virtual (cliente + dia + técnico).
 * Vários trabalhos/relatórios na mesma visita; e-mail ao cliente via pasta RH.
 */

import { getJobsSnapshot } from './trabalhos-db.js';

/** @param {{ clientId?: string | number, date?: string, technicianId?: string }} params */
export function buildVisitaKey({ clientId, date, technicianId } = {}) {
  const cid = String(clientId ?? '').trim();
  const d = String(date ?? '').split('T')[0];
  const tid = String(technicianId ?? '').trim();
  if (!cid || !d || !tid) return '';
  return `${cid}|${d}|${tid}`;
}

/** @param {string} visitKey */
export function parseVisitaKey(visitKey) {
  const [clientId, date, technicianId] = String(visitKey || '').split('|');
  if (!clientId || !date || !technicianId) return null;
  return { clientId, date, technicianId };
}

/** @param {object} job */
export function getJobVisitaKey(job) {
  if (!job) return '';
  return buildVisitaKey({
    clientId: job.clientId,
    date: job.date,
    technicianId: job.technicianId,
  });
}

/** @param {object} report @param {object} [job] */
export function getReportVisitaKey(report, job = null) {
  const date =
    job?.date ||
    String(report?.submittedAt || report?.approvedAt || '').split('T')[0] ||
    '';
  return buildVisitaKey({
    clientId: report?.clientId || job?.clientId,
    date,
    technicianId: report?.technicianId || job?.technicianId,
  });
}

/** @param {object[]} [jobs] */
export function countTrabalhosNaVisita(visitKey, jobs = getJobsSnapshot()) {
  if (!visitKey) return 0;
  return jobs.filter((job) => getJobVisitaKey(job) === visitKey).length;
}

/**
 * Tamanho da visita = máximo entre trabalhos agendados e relatórios submetidos.
 * @param {string} visitKey
 * @param {object[]} jobs
 * @param {object[]} reports
 * @param {(id: string) => object | null} getJob
 */
export function getVisitaItemCount(visitKey, jobs = [], reports = [], getJob = () => null) {
  if (!visitKey) return 0;
  const jobCount = jobs.filter((job) => getJobVisitaKey(job) === visitKey).length;
  const reportCount = reports.filter((report) => {
    const job = report?.jobId ? getJob(report.jobId) : null;
    return getReportVisitaKey(report, job) === visitKey;
  }).length;
  return Math.max(jobCount, reportCount);
}

/** @param {object[]} [jobs] */
export function isMultiTrabalhoVisita(visitKey, jobs = getJobsSnapshot()) {
  return countTrabalhosNaVisita(visitKey, jobs) >= 2;
}

/** Visita com 2+ trabalhos ou 2+ relatórios (mesmo cliente/dia/técnico). */
export function isReportInMultiVisita(
  report,
  job = null,
  { jobs = getJobsSnapshot(), reports = [], getJob = () => null } = {},
) {
  const key = getReportVisitaKey(report, job);
  return getVisitaItemCount(key, jobs, reports, getJob) >= 2;
}

/** @param {object} report */
export function reportVisitaEmailWasSent(report) {
  return Boolean(report?.data?.visitClienteEmailSentAt);
}

/**
 * Conta relatórios aprovados da visita ainda não incluídos num e-mail de visita.
 * @param {string} visitKey
 * @param {object[]} reports
 * @param {(id: string) => object | null} getJob
 */
export function getVisitaApprovedReportsPendingEmail(visitKey, reports, getJob) {
  if (!visitKey) return [];
  return reports.filter((report) => {
    if (report?.status !== 'approved') return false;
    if (reportVisitaEmailWasSent(report)) return false;
    const job = report.jobId ? getJob(report.jobId) : null;
    return getReportVisitaKey(report, job) === visitKey;
  });
}

/**
 * Agrupa trabalhos do técnico em pastas quando há 2+ no mesmo cliente/dia.
 * @param {object[]} jobs
 * @param {object[]} [allJobs]
 */
export function groupJobsByVisita(jobs, allJobs = getJobsSnapshot(), allReports = []) {
  const isFolder = (key) => getVisitaItemCount(key, allJobs, allReports) >= 2;

  /** @type {Map<string, object[]>} */
  const folders = new Map();
  const singles = [];

  jobs.forEach((job) => {
    const key = getJobVisitaKey(job);
    if (key && isFolder(key)) {
      if (!folders.has(key)) folders.set(key, []);
      folders.get(key).push(job);
      return;
    }
    singles.push(job);
  });

  const folderList = [...folders.entries()].map(([visitKey, items]) => ({
    visitKey,
    jobs: items,
    jobCount: getVisitaItemCount(visitKey, allJobs, allReports),
  }));

  return { folders: folderList, singles };
}

/**
 * Agrupa relatórios do painel RH em pastas de visita.
 * @param {object[]} reports
 * @param {(id: string) => object | null} getJob
 * @param {object[]} [allJobs]
 */
export function groupReportsByVisita(reports, getJob, allJobs = getJobsSnapshot(), allReports = reports) {
  const isFolder = (key) => getVisitaItemCount(key, allJobs, allReports, getJob) >= 2;

  /** @type {Map<string, object[]>} */
  const folders = new Map();
  const singles = [];

  reports.forEach((report) => {
    const job = report.jobId ? getJob(report.jobId) : null;
    const key = getReportVisitaKey(report, job);
    if (key && isFolder(key)) {
      if (!folders.has(key)) folders.set(key, []);
      folders.get(key).push(report);
      return;
    }
    singles.push(report);
  });

  const foldersList = [...folders.entries()].map(([visitKey, items]) => ({
    visitKey,
    reports: items,
    jobCount: getVisitaItemCount(visitKey, allJobs, allReports, getJob),
  }));

  return { folders: foldersList, singles };
}

/** Ordena pastas/relatórios por data de submissão mais recente. */
export function sortVisitaReportsNewestFirst(reports = []) {
  return [...reports].sort((a, b) =>
    String(b.submittedAt || b.approvedAt || '').localeCompare(
      String(a.submittedAt || a.approvedAt || ''),
    ),
  );
}

export function sortVisitaFoldersNewestFirst(folders = []) {
  return [...folders].sort((a, b) => {
    const aDate = sortVisitaReportsNewestFirst(a.reports)[0]?.submittedAt || '';
    const bDate = sortVisitaReportsNewestFirst(b.reports)[0]?.submittedAt || '';
    return String(bDate).localeCompare(String(aDate));
  });
}

/**
 * @param {string} visitKey
 * @param {object[]} reports
 * @param {(id: string) => object | null} getJob
 */
export function summarizeVisitaEmailStatus(visitKey, reports, getJob) {
  const approved = reports.filter((report) => {
    if (report?.status !== 'approved') return false;
    const job = report.jobId ? getJob(report.jobId) : null;
    return getReportVisitaKey(report, job) === visitKey;
  });
  const pending = approved.filter((report) => !reportVisitaEmailWasSent(report));
  return {
    approvedCount: approved.length,
    pendingEmailCount: pending.length,
    allApprovedSent: approved.length > 0 && pending.length === 0,
  };
}
