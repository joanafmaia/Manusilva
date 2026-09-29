/**
 * Snapshot IndexedDB de trabalhos, serviços e relatórios — arranque offline do técnico.
 */

import { idbGet, idbPut, STORE_OPS_SNAPSHOT } from './indexed-db.js';
import { replaceJobsCache } from './trabalhos-db.js';
import { replaceServicosCache } from './servicos-db.js';
import { replaceReportsCache } from './relatorios-db.js';
import { isReportFormOpen } from './ui-yield.js';

const SNAPSHOT_ID = 'latest';

function slimReportForSnapshot(report) {
  if (!report || typeof report !== 'object') return report;
  const data = report.data;
  if (!data || typeof data !== 'object') return report;
  const nextData = { ...data };
  delete nextData.fotoAntesBase64;
  delete nextData.fotoDepoisBase64;
  delete nextData.fotoAntesFile;
  delete nextData.fotoDepoisFile;
  delete nextData.pdfBase64;
  if (String(nextData.fotoAntesUrl || '').startsWith('data:')) delete nextData.fotoAntesUrl;
  if (String(nextData.fotoDepoisUrl || '').startsWith('data:')) delete nextData.fotoDepoisUrl;
  return { ...report, data: nextData };
}

/**
 * Grava o estado operacional atual (após sync online).
 * @param {string} [technicianId]
 */
export async function persistOpsSnapshot(technicianId = '') {
  if (isReportFormOpen()) return;

  const { getJobsSnapshot } = await import('./trabalhos-db.js');
  const { getServicosSnapshot } = await import('./servicos-db.js');
  const { getReportsSnapshot } = await import('./relatorios-db.js');

  const jobs = getJobsSnapshot();
  const servicos = getServicosSnapshot();
  const reports = getReportsSnapshot().map(slimReportForSnapshot);

  if (!jobs.length && !servicos.length && !reports.length) return;

  await idbPut(STORE_OPS_SNAPSHOT, {
    id: SNAPSHOT_ID,
    technicianId: String(technicianId || ''),
    savedAt: new Date().toISOString(),
    jobs,
    servicos,
    reports,
  });
}

/**
 * Repõe caches em memória a partir do snapshot local.
 * @returns {Promise<boolean>}
 */
export async function hydrateOpsSnapshot() {
  const row = await idbGet(STORE_OPS_SNAPSHOT, SNAPSHOT_ID);
  if (!row) return false;

  if (Array.isArray(row.jobs) && row.jobs.length) {
    replaceJobsCache(row.jobs);
  }
  if (Array.isArray(row.servicos) && row.servicos.length) {
    replaceServicosCache(row.servicos);
  }
  if (Array.isArray(row.reports)) {
    replaceReportsCache(row.reports);
  }

  return Boolean(
    (row.jobs && row.jobs.length) ||
      (row.servicos && row.servicos.length) ||
      (row.reports && row.reports.length),
  );
}
