/**
 * Snapshot IndexedDB de trabalhos, serviços e relatórios — arranque offline do técnico.
 */

import { idbGet, idbPut, STORE_OPS_SNAPSHOT } from './indexed-db.js';
import { replaceJobsCache } from './trabalhos-db.js';
import { replaceServicosCache } from './servicos-db.js';
import { replaceReportsCache } from './relatorios-db.js';

const SNAPSHOT_ID = 'latest';

/**
 * Grava o estado operacional atual (após sync online).
 * @param {string} [technicianId]
 */
export async function persistOpsSnapshot(technicianId = '') {
  const { getJobsSnapshot } = await import('./trabalhos-db.js');
  const { getServicosSnapshot } = await import('./servicos-db.js');
  const { getReportsSnapshot } = await import('./relatorios-db.js');

  const jobs = getJobsSnapshot();
  const servicos = getServicosSnapshot();
  const reports = getReportsSnapshot();

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
