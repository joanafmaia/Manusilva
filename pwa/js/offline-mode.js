/**
 * Modo offline do tablet e fila de sincronização.
 */

import { showToast } from './toast-modal.js';
import { getDB, updateDB } from './local-db.js';
import { patchTrabalhoStatus } from './trabalhos-db.js';
import {
  ensureReportsLoaded,
  upsertRelatorio,
  formatRelatoriosError,
} from './relatorios-db.js';

function buildOfflineQueueActionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isOffline() {
  return getDB().settings?.offline ?? false;
}

export function isNetworkOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function canReachServer() {
  return isNetworkOnline() && !isOffline();
}

export function setOfflineMode(value) {
  updateDB((db) => {
    db.settings.offline = value;
  });
  if (!value) {
    import('./trabalhos-offline.js')
      .then((m) => m.sincronizarTrabalhosOffline())
      .catch(console.error);
    import('./report-draft-sync.js')
      .then((m) => m.syncLocalReportDraftsToServer({ notify: false }))
      .catch(console.error);
    syncOfflineQueue().catch(console.error);
  }
}

export function queueOfflineAction(action) {
  updateDB((db) => {
    db.offlineQueue.push({
      ...action,
      queueId: action?.queueId || buildOfflineQueueActionId(),
      queuedAt: action?.queuedAt || new Date().toISOString(),
    });
  });
}

export async function processOfflineQueue(queue, processAction) {
  const list = Array.isArray(queue) ? queue : [];
  let processedCount = 0;

  for (const action of list) {
    try {
      await processAction(action);
      processedCount += 1;
    } catch (error) {
      return {
        processedCount,
        remaining: list.slice(processedCount),
        error,
      };
    }
  }

  return {
    processedCount,
    remaining: [],
    error: null,
  };
}

export async function syncOfflineQueue() {
  const db = getDB();
  if (!db.offlineQueue.length) return;

  const queue = db.offlineQueue.map((action) => ({
    ...action,
    queueId: action?.queueId || buildOfflineQueueActionId(),
    queuedAt: action?.queuedAt || new Date().toISOString(),
  }));
  updateDB((d) => {
    d.offlineQueue = queue;
  });

  const result = await processOfflineQueue(queue, async (action) => {
      if (action.type === 'save_draft' || action.type === 'submit_report') {
        const report = action.report;
        if (!report) return;
        const saved = await upsertRelatorio(report);
        if (action.type === 'submit_report' && saved?.jobId) {
          await patchTrabalhoStatus(saved.jobId, {
            status: 'completed',
            rejectionNote: null,
          });
        }
      }
  });

  updateDB((d) => {
    d.offlineQueue = result.remaining;
  });

  if (result.processedCount > 0) {
    await ensureReportsLoaded(true);
    window.dispatchEvent(new CustomEvent('db-updated'));
  }

  if (!result.error) {
    showToast(`${result.processedCount} item(ns) sincronizado(s) com a base de dados.`, 'success');
    return;
  }

  console.error('[ManuSilva] syncOfflineQueue:', result.error);
  const pending = result.remaining.length;
  const prefix = result.processedCount
    ? `${result.processedCount} item(ns) sincronizado(s); ${pending} mantido(s) na fila. `
    : '';
  showToast(`${prefix}${formatRelatoriosError(result.error)}`.trim(), 'error', 9000);
}
