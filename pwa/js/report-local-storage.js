/**
 * Rascunhos de relatório no localStorage do tablet (offline em caves / zonas remotas).
 * Chave agregada por jobId — independente do Supabase e do painel RH (PC).
 */

import { mergeReportInCache } from './relatorios-db.js';

export const DRAFTS_STORAGE_KEY = 'manusilva_rascunhos';

function readDraftMap() {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch (err) {
    console.warn('[ManuSilva] Rascunhos locais inválidos:', err);
    return {};
  }
}

function writeDraftMap(map) {
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(map));
}

/**
 * Grava rascunho completo no dispositivo (auto-save / gravar rascunho).
 * @param {object} report
 */
export function saveLocalReportDraft(report) {
  if (!report?.jobId) return null;

  const entry = JSON.parse(JSON.stringify(report));
  entry._localSavedAt = new Date().toISOString();
  if (entry.status !== 'pending_review') {
    entry.status = 'draft';
  }

  const map = readDraftMap();
  map[report.jobId] = entry;
  writeDraftMap(map);

  window.dispatchEvent(
    new CustomEvent('report-draft-saved', { detail: { jobId: report.jobId } }),
  );
  return entry;
}

/** @param {string} jobId */
export function getLocalReportDraft(jobId) {
  if (!jobId) return null;
  return readDraftMap()[jobId] || null;
}

/** @param {string} jobId */
export function removeLocalReportDraft(jobId) {
  if (!jobId) return;
  const map = readDraftMap();
  if (!map[jobId]) return;
  delete map[jobId];
  writeDraftMap(map);
}

export function getAllLocalReportDrafts() {
  return Object.values(readDraftMap());
}

/**
 * Escolhe o relatório mais recente para abrir o formulário (local vs servidor).
 * @param {string} jobId
 * @param {object|null} serverReport
 * @param {{ editPending?: boolean }} [options]
 */
export function resolveReportForJob(jobId, serverReport, options = {}) {
  const local = getLocalReportDraft(jobId);
  if (!local) return serverReport || null;
  if (!serverReport) return local;
  if (serverReport.status === 'approved') return serverReport;

  const localAt = String(local._localSavedAt || '');
  const serverAt = String(serverReport.submittedAt || serverReport.approvedAt || '');

  if (options.editPending && serverReport.status === 'pending_review') {
    if (localAt && (!serverAt || localAt >= serverAt)) {
      return { ...serverReport, ...local, status: 'pending_review' };
    }
    return serverReport;
  }

  if (serverReport.status === 'pending_review') return serverReport;
  if (serverReport.status === 'rejected') {
    return localAt >= serverAt ? local : serverReport;
  }

  if (localAt && (!serverAt || localAt > serverAt)) return local;
  return serverReport;
}

/**
 * Repõe rascunhos locais e submissões em fila no cache em memória (dashboard técnico offline).
 */
export async function hydrateLocalReportsIntoCache() {
  getAllLocalReportDrafts().forEach((draft) => mergeReportInCache(draft));

  try {
    const { getTrabalhosPendentes } = await import('./trabalhos-offline.js');
    getTrabalhosPendentes().forEach((item) => {
      if (item?.report) mergeReportInCache(item.report);
    });
  } catch (err) {
    console.warn('[ManuSilva] Hidratar fila offline:', err);
  }
}
