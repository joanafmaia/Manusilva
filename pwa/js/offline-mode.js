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
    syncOfflineQueue().catch(console.error);
  }
}

export function queueOfflineAction(action) {
  updateDB((db) => {
    db.offlineQueue.push({ ...action, queuedAt: new Date().toISOString() });
  });
}

export async function syncOfflineQueue() {
  const db = getDB();
  if (!db.offlineQueue.length) return;

  const queue = [...db.offlineQueue];
  updateDB((d) => {
    d.offlineQueue = [];
  });

  try {
    for (const action of queue) {
      if (action.type === 'save_draft' || action.type === 'submit_report') {
        const report = action.report;
        if (!report) continue;
        const saved = await upsertRelatorio(report);
        if (action.type === 'submit_report' && saved?.jobId) {
          await patchTrabalhoStatus(saved.jobId, {
            status: 'completed',
            rejectionNote: null,
          });
        }
      }
    }
    await ensureReportsLoaded(true);
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast(`${queue.length} item(ns) sincronizado(s) com a base de dados.`, 'success');
  } catch (err) {
    console.error('[ManuSilva] syncOfflineQueue:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
  }
}
