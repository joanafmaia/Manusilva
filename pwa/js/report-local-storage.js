/**
 * Rascunhos de relatório — IndexedDB (fotos como Blob, metadados leves).
 * Migra automaticamente rascunhos antigos de localStorage.
 */

import { mergeReportInCache } from './relatorios-db.js';
import {
  STORE_REPORT_DRAFTS,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from './indexed-db.js';
import { compressDataUrl, dataUrlToBlob } from './image-compress.js';

/** Chave legada — apenas para migração única */
export const DRAFTS_STORAGE_KEY = 'manusilva_rascunhos';

let legacyMigrationDone = false;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Leitura da foto falhou.'));
    reader.readAsDataURL(blob);
  });
}

async function resolveDraftPhotoBlob(slot, data, existing) {
  const base64Key = slot === 'antes' ? 'fotoAntesBase64' : 'fotoDepoisBase64';
  const urlKey = slot === 'antes' ? 'fotoAntesUrl' : 'fotoDepoisUrl';
  const blobKey = slot === 'antes' ? 'photoAntes' : 'photoDepois';
  const inline = data[base64Key] || data[urlKey];

  if (inline && String(inline).startsWith('data:image')) {
    return photoInputToBlob(inline);
  }
  if (inline && /^https?:\/\//i.test(String(inline))) {
    return null;
  }
  if (data[urlKey] === null && data[base64Key] == null) {
    return null;
  }
  return existing?.[blobKey] instanceof Blob ? existing[blobKey] : null;
}

async function photoInputToBlob(value) {
  if (!value) return null;
  if (value instanceof Blob) return value;
  const text = String(value);
  if (!text.startsWith('data:image')) return null;
  try {
    const compressed = await compressDataUrl(text);
    return compressed.blob;
  } catch {
    return dataUrlToBlob(text);
  }
}

/** Separa fotos pesadas do JSON do relatório. */
function stripPhotosFromReport(report) {
  const copy = cloneJson(report);
  const data = copy.data || {};
  delete data.fotoAntesBase64;
  delete data.fotoDepoisBase64;
  copy.data = data;
  return copy;
}

async function mergePhotosIntoReport(record) {
  if (!record?.report) return null;
  const report = cloneJson(record.report);
  const data = report.data || {};

  if (record.photoAntes instanceof Blob) {
    const dataUrl = await blobToDataUrl(record.photoAntes);
    data.fotoAntesBase64 = dataUrl;
    if (!data.fotoAntesUrl || !/^https?:\/\//i.test(String(data.fotoAntesUrl))) {
      data.fotoAntesUrl = dataUrl;
    }
  }

  if (record.photoDepois instanceof Blob) {
    const dataUrl = await blobToDataUrl(record.photoDepois);
    data.fotoDepoisBase64 = dataUrl;
    if (!data.fotoDepoisUrl || !/^https?:\/\//i.test(String(data.fotoDepoisUrl))) {
      data.fotoDepoisUrl = dataUrl;
    }
  }

  report.data = data;
  return report;
}

async function migrateLegacyLocalStorageDrafts() {
  if (legacyMigrationDone || typeof localStorage === 'undefined') return;
  legacyMigrationDone = true;

  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return;

    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      localStorage.removeItem(DRAFTS_STORAGE_KEY);
      return;
    }

    const entries = Object.values(map);
    for (const draft of entries) {
      if (draft?.jobId) {
        await saveLocalReportDraft(draft);
      }
    }

    localStorage.removeItem(DRAFTS_STORAGE_KEY);
    if (entries.length) {
      console.info(`[ManuSilva] ${entries.length} rascunho(s) migrados para IndexedDB.`);
    }
  } catch (err) {
    console.warn('[ManuSilva] Migração de rascunhos localStorage → IndexedDB:', err);
  }
}

async function ensureMigrated() {
  await migrateLegacyLocalStorageDrafts();
}

/**
 * Grava rascunho no IndexedDB (auto-save / gravar rascunho).
 * @param {object} report
 */
export async function saveLocalReportDraft(report) {
  await ensureMigrated();

  if (!report?.jobId) {
    throw new Error('Rascunho sem identificador do trabalho (jobId).');
  }

  const data = report.data || {};
  const existing = await idbGet(STORE_REPORT_DRAFTS, report.jobId);

  const photoAntes = await resolveDraftPhotoBlob('antes', data, existing);
  const photoDepois = await resolveDraftPhotoBlob('depois', data, existing);

  const entry = stripPhotosFromReport(report);
  entry._localSavedAt = new Date().toISOString();
  if (entry.status !== 'pending_review') {
    entry.status = 'draft';
  }

  await idbPut(STORE_REPORT_DRAFTS, {
    jobId: report.jobId,
    report: entry,
    photoAntes,
    photoDepois,
  });

  window.dispatchEvent(
    new CustomEvent('report-draft-saved', { detail: { jobId: report.jobId } }),
  );

  return entry;
}

/** @param {string} jobId */
export async function getLocalReportDraft(jobId) {
  await ensureMigrated();
  if (!jobId) return null;

  const record = await idbGet(STORE_REPORT_DRAFTS, jobId);
  if (!record) return null;
  return mergePhotosIntoReport(record);
}

/** Apaga rascunho e fotos locais desse trabalho. */
export async function removeLocalReportDraft(jobId) {
  await ensureMigrated();
  if (!jobId) return;
  await idbDelete(STORE_REPORT_DRAFTS, jobId);
}

export async function getAllLocalReportDrafts() {
  await ensureMigrated();
  const records = await idbGetAll(STORE_REPORT_DRAFTS);
  const drafts = [];
  for (const record of records) {
    const merged = await mergePhotosIntoReport(record);
    if (merged) drafts.push(merged);
  }
  return drafts;
}

/**
 * Escolhe o relatório mais recente para abrir o formulário (local vs servidor).
 */
export async function resolveReportForJob(jobId, serverReport, options = {}) {
  const local = await getLocalReportDraft(jobId);
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
  const drafts = await getAllLocalReportDrafts();
  drafts.forEach((draft) => mergeReportInCache(draft));

  try {
    const { getTrabalhosPendentes } = await import('./trabalhos-offline.js');
    const pending = await getTrabalhosPendentes();
    pending.forEach((item) => {
      if (item?.report) mergeReportInCache(item.report);
    });
  } catch (err) {
    console.warn('[ManuSilva] Hidratar fila offline:', err);
  }
}
