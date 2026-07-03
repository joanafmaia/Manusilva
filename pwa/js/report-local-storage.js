/**
 * Rascunhos de relatório — IndexedDB (fotos como Blob, metadados leves).
 * Migra automaticamente rascunhos antigos de localStorage.
 */

import { mergeReportInCache, getReportsSnapshot, isUuid } from './relatorios-db.js';
import { getJobsSnapshot, isJobsCacheLoaded } from './trabalhos-db.js';
import { sameEntityId } from './entity-id.js';
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
      if (draft?.jobId || draft?.servicoId) {
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
 * A chave em `jobId` pode ser o id do trabalho, do relatório ou `svc:{servicoId}:{tipo}`.
 * @param {object} report
 */
export function reportDraftStorageKey(report) {
  if (!report) return '';
  if (report.id) return String(report.id);
  if (report.servicoId && report.serviceType) {
    return `svc:${report.servicoId}:${report.serviceType}`;
  }
  return String(report.jobId || '');
}

export async function saveLocalReportDraft(report) {
  await ensureMigrated();

  const key = reportDraftStorageKey(report);
  if (!key) {
    throw new Error('Rascunho sem identificador (jobId ou servicoId+tipo).');
  }

  const data = report.data || {};
  const existing = await idbGet(STORE_REPORT_DRAFTS, key);

  const photoAntes = await resolveDraftPhotoBlob('antes', data, existing);
  const photoDepois = await resolveDraftPhotoBlob('depois', data, existing);

  const entry = stripPhotosFromReport(report);
  entry._localSavedAt = new Date().toISOString();
  if (entry.status !== 'pending_review') {
    entry.status = 'draft';
  }

  await idbPut(STORE_REPORT_DRAFTS, {
    jobId: key,
    report: entry,
    photoAntes,
    photoDepois,
  });

  window.dispatchEvent(
    new CustomEvent('report-draft-saved', { detail: { jobId: key } }),
  );

  return entry;
}

/** @param {string} jobId */
export async function getLocalReportDraft(jobId) {
  await ensureMigrated();
  const key = String(jobId || '').trim();
  if (!key) return null;

  let record = await idbGet(STORE_REPORT_DRAFTS, key);
  if (!record && jobId != null && String(jobId) !== jobId) {
    record = await idbGet(STORE_REPORT_DRAFTS, jobId);
  }
  if (!record) {
    const records = await idbGetAll(STORE_REPORT_DRAFTS);
    record =
      records.find((entry) => {
        const draftJobId = entry?.jobId ?? entry?.report?.jobId;
        return draftJobId != null && String(draftJobId).trim() === key;
      }) || null;
  }
  if (!record) return null;
  return mergePhotosIntoReport(record);
}

/** Apaga rascunho e fotos locais desse trabalho. */
export async function removeLocalReportDraft(jobId) {
  await ensureMigrated();
  if (!jobId) return;
  await idbDelete(STORE_REPORT_DRAFTS, jobId);
}

/**
 * Remove todas as entradas IndexedDB associadas a um relatório (várias chaves possíveis).
 * @param {object} report
 */
export async function removeAllLocalDraftsForReport(report) {
  await ensureMigrated();
  if (!report) return 0;

  const idKey = report.id ? String(report.id) : '';
  const svcKey =
    report.servicoId && report.serviceType
      ? `svc:${report.servicoId}:${report.serviceType}`
      : '';

  const keys = new Set();
  if (idKey) keys.add(idKey);
  if (svcKey) keys.add(svcKey);
  if (report.jobId) keys.add(String(report.jobId));

  const records = await idbGetAll(STORE_REPORT_DRAFTS);
  for (const record of records) {
    const storeKey = record?.jobId != null ? String(record.jobId) : '';
    const draft = record?.report;
    if (!storeKey || !draft) continue;

    const sameId = idKey && draft.id && sameEntityId(draft.id, idKey);
    const sameStoreKey = idKey && storeKey === idKey;
    const legacySvc =
      svcKey &&
      storeKey === svcKey &&
      (!draft.id || !idKey || sameEntityId(draft.id, idKey));

    if (sameId || sameStoreKey || legacySvc) {
      keys.add(storeKey);
    }
  }

  for (const key of keys) {
    await idbDelete(STORE_REPORT_DRAFTS, key);
  }
  return keys.size;
}

export async function getAllLocalReportDrafts() {
  await ensureMigrated();
  const { isReportLocallyDeleted } = await import('./report-deleted-local.js');
  const records = await idbGetAll(STORE_REPORT_DRAFTS);
  const drafts = [];
  for (const record of records) {
    const merged = await mergePhotosIntoReport(record);
    if (!merged) continue;
    if (isReportLocallyDeleted(merged)) {
      removeAllLocalDraftsForReport(merged).catch(() => {});
      continue;
    }
    drafts.push(merged);
  }
  return drafts;
}

/**
 * Escolhe o relatório mais recente para abrir o formulário (local vs servidor).
 */
export async function resolveReportForJob(jobId, serverReport, options = {}) {
  const local = await getLocalReportDraft(jobId);
  return mergeLocalAndServerReport(local, serverReport, options);
}

/** Resolve rascunho local vs servidor para relatório de um serviço. */
export async function resolveReportForServico(servicoId, serviceType, serverReport, options = {}) {
  const key = serverReport?.id
    ? String(serverReport.id)
    : `svc:${servicoId}:${serviceType}`;
  const local = await getLocalReportDraft(key);
  return mergeLocalAndServerReport(local, serverReport, options);
}

function mergeLocalAndServerReport(local, serverReport, options = {}) {
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
  if (serverReport.status === 'rejected') return serverReport;

  if (localAt && (!serverAt || localAt > serverAt)) return local;
  return serverReport;
}

/** Estados do servidor que um rascunho local NUNCA pode sobrepor. */
const LOCKED_SERVER_STATUSES = new Set(['approved', 'rejected']);

function findServerReportForDraft(draft, serverReports) {
  if (!draft) return null;
  if (draft.id) {
    const byId = serverReports.find((r) => sameEntityId(r.id, draft.id));
    if (byId) return byId;
    return null;
  }
  if (draft.servicoId && draft.serviceType) {
    const matches = serverReports.filter(
      (r) =>
        sameEntityId(r.servicoId, draft.servicoId) && r.serviceType === draft.serviceType,
    );
    if (matches.length === 1) return matches[0];
    return null;
  }
  if (draft.jobId) {
    return serverReports.find((r) => sameEntityId(r.jobId, draft.jobId)) || null;
  }
  return null;
}

/**
 * Trabalho eliminado pelo RH: o id era do servidor (uuid da tabela trabalhos)
 * mas já não existe nem em trabalhos nem em relatorios. Ids locais/mock não contam.
 */
function isDraftOfDeletedJob(draft, serverReport, serverJobIds) {
  if (!serverJobIds || serverReport) return false;
  const jobId = String(draft?.jobId || '');
  if (!isUuid(jobId)) return false;
  return !serverJobIds.has(jobId);
}

/**
 * Repõe rascunhos locais e submissões em fila no cache em memória (dashboard técnico offline).
 * Rascunhos obsoletos (o servidor já tem o relatório submetido/concluído) são ignorados
 * — e removidos do tablet quando o relatório foi aprovado ou o trabalho foi eliminado pelo RH.
 */
export async function hydrateLocalReportsIntoCache() {
  const { isReportLocallyDeleted } = await import('./report-deleted-local.js');
  const drafts = await getAllLocalReportDrafts();
  const serverReports = getReportsSnapshot();
  const serverJobIds = isJobsCacheLoaded()
    ? new Set(getJobsSnapshot().map((j) => String(j.id)))
    : null;

  for (const draft of drafts) {
    if (isReportLocallyDeleted(draft)) {
      removeAllLocalDraftsForReport(draft).catch(() => {});
      continue;
    }

    const server = findServerReportForDraft(draft, serverReports);

    if (server?.status === 'pending_review') {
      const localAt = String(draft._localSavedAt || '');
      const serverAt = String(server.submittedAt || server.approvedAt || '');
      if (localAt && (!serverAt || localAt >= serverAt)) {
        mergeReportInCache({ ...server, ...draft, status: 'pending_review', id: server.id });
      }
      continue;
    }

    if (server && LOCKED_SERVER_STATUSES.has(server.status)) {
      // O servidor manda: rascunho local não pode mascarar reprovação ou aprovação.
      if (server.status === 'approved' || server.status === 'rejected') {
        removeLocalReportDraft(reportDraftStorageKey(draft)).catch(() => {});
      }
      continue;
    }

    // O RH eliminou o trabalho enquanto o tablet estava offline/fechado:
    // o rascunho órfão é removido e nunca entra na aba Em Curso / Pendentes.
    if (isDraftOfDeletedJob(draft, server, serverJobIds)) {
      removeLocalReportDraft(reportDraftStorageKey(draft)).catch(() => {});
      continue;
    }

    if (server) {
      const merged = { ...server, ...draft, id: server.id || draft.id };
      if (server.status === 'pending_review' && draft.status !== 'pending_review') {
        merged.status = server.status;
      }
      mergeReportInCache(merged);
      continue;
    }

    mergeReportInCache(draft);
  }

  try {
    const { getTrabalhosPendentes } = await import('./trabalhos-offline.js');
    const pending = await getTrabalhosPendentes();
    pending.forEach((item) => {
      if (item?.report && !isReportLocallyDeleted(item.report)) {
        mergeReportInCache(item.report);
      }
    });
  } catch (err) {
    console.warn('[ManuSilva] Hidratar fila offline:', err);
  }
}
