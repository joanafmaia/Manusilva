/**
 * Contingência offline — fila local `trabalhos_pendentes` e sincronização com Supabase
 */

import { upsertRelatorio, ensureReportsLoaded } from './relatorios-db.js';
import { patchTrabalho, patchTrabalhoStatus } from './trabalhos-db.js';
import { isValidFotoUrl } from './job-fotos.js';

export const STORAGE_KEY = 'trabalhos_pendentes';

export const MSG_SAVED_ON_DEVICE =
  'Relatório guardado no dispositivo. Será sincronizado automaticamente assim que tiver rede.';

let syncInProgress = false;
let listenerRegistered = false;

function newPendingId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pend-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {Array<object>} */
export function getTrabalhosPendentes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[ManuSilva] trabalhos_pendentes inválido:', err);
    return [];
  }
}

function setTrabalhosPendentes(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Guarda relatório (e opcionalmente PDF em base64) na fila local.
 * @param {{ report: object, tipo?: string, pdfBase64?: string, pdfFilename?: string, queuedAt?: string, id?: string }} entry
 */
export function addTrabalhoPendente(entry) {
  const report = entry.report ? JSON.parse(JSON.stringify(entry.report)) : null;
  if (!report) throw new Error('Relatório inválido para fila offline.');

  const list = getTrabalhosPendentes();
  const tipo = entry.tipo || 'submit';
  const existingIdx = list.findIndex(
    (i) => i.tipo === tipo && i.report?.jobId && i.report.jobId === report.jobId,
  );

  const item = {
    id: entry.id || (existingIdx >= 0 ? list[existingIdx].id : newPendingId()),
    tipo,
    queuedAt: entry.queuedAt || new Date().toISOString(),
    report,
    pdfBase64: entry.pdfBase64 || null,
    pdfFilename: entry.pdfFilename || null,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = item;
  } else {
    list.push(item);
  }

  setTrabalhosPendentes(list);
  return item.id;
}

export function removeTrabalhoPendente(id) {
  setTrabalhosPendentes(getTrabalhosPendentes().filter((i) => i.id !== id));
}

export function hasTrabalhoPendente(id) {
  return getTrabalhosPendentes().some((i) => i.id === id);
}

export function countTrabalhosPendentes() {
  return getTrabalhosPendentes().length;
}

function isManualOfflineMode() {
  try {
    const raw = localStorage.getItem('manusilva_db');
    const db = raw ? JSON.parse(raw) : {};
    return Boolean(db.settings?.offline);
  } catch {
    return false;
  }
}

export function canSyncToServer() {
  return typeof navigator !== 'undefined' && navigator.onLine === true && !isManualOfflineMode();
}

async function syncOnePendingItem(item) {
  const report = item.report;
  if (!report) throw new Error('Item da fila sem dados de relatório.');

  const saved = await upsertRelatorio(report);

  if (saved?.jobId) {
    const fotoPatch = {};
    const data = report.data || {};
    if (isValidFotoUrl(data.fotoAntesUrl)) fotoPatch.fotoAntes = data.fotoAntesUrl;
    if (isValidFotoUrl(data.fotoDepoisUrl)) fotoPatch.fotoDepois = data.fotoDepoisUrl;
    if (Object.keys(fotoPatch).length) {
      await patchTrabalho(saved.jobId, fotoPatch);
    }
  }

  if (item.tipo === 'submit' || report.status === 'pending_review') {
    if (saved?.jobId) {
      await patchTrabalhoStatus(saved.jobId, {
        status: 'completed',
        rejectionNote: null,
      });
    }
  }

  return saved;
}

/**
 * Envia itens de `trabalhos_pendentes` para Supabase (um a um) e remove após sucesso.
 * @returns {Promise<{ synced: number, remaining: number }>}
 */
export async function sincronizarTrabalhosOffline(options = {}) {
  const { notify = true } = options;
  if (!canSyncToServer()) {
    return { synced: 0, remaining: countTrabalhosPendentes() };
  }

  const pending = getTrabalhosPendentes();
  if (!pending.length) {
    return { synced: 0, remaining: 0 };
  }

  if (syncInProgress) {
    return { synced: 0, remaining: pending.length };
  }

  syncInProgress = true;
  let synced = 0;

  try {
    for (const item of pending) {
      try {
        await syncOnePendingItem(item);
        removeTrabalhoPendente(item.id);
        synced++;
      } catch (err) {
        console.error('[ManuSilva] Falha ao sincronizar item offline:', item.id, err);
        break;
      }
    }

    if (synced > 0) {
      await ensureReportsLoaded(true);
      window.dispatchEvent(new CustomEvent('db-updated'));
      if (notify) {
        window.dispatchEvent(
          new CustomEvent('trabalhos-offline-synced', { detail: { synced } }),
        );
      }
    }
  } finally {
    syncInProgress = false;
  }

  return { synced, remaining: countTrabalhosPendentes() };
}

/** Migra submissões antigas de `manusilva_db.offlineQueue` para `trabalhos_pendentes` */
export function migrateLegacyOfflineQueue(getDB, updateDB) {
  const db = getDB();
  const queue = db.offlineQueue || [];
  if (!queue.length) return;

  let migrated = 0;
  const remaining = [];

  for (const action of queue) {
    if (action.type === 'submit_report' && action.report) {
      addTrabalhoPendente({
        report: action.report,
        tipo: 'submit',
        queuedAt: action.queuedAt,
      });
      migrated++;
    } else {
      remaining.push(action);
    }
  }

  if (migrated > 0) {
    updateDB((d) => {
      d.offlineQueue = remaining;
    });
    console.info(`[ManuSilva] ${migrated} submissão(ões) migradas para trabalhos_pendentes.`);
  }
}

/**
 * Regista `online` → sincronização automática (uma vez por sessão de página).
 */
export function initTrabalhosOfflineSync() {
  if (listenerRegistered || typeof window === 'undefined') return;
  listenerRegistered = true;

  if (!window.__trabalhosOfflineToastInit) {
    window.__trabalhosOfflineToastInit = true;
    window.addEventListener('trabalhos-offline-synced', async (e) => {
      const n = e.detail?.synced || 0;
      if (n > 0) {
        const { showToast } = await import('./app.js');
        showToast(
          n === 1
            ? '1 relatório sincronizado com a base de dados.'
            : `${n} relatórios sincronizados com a base de dados.`,
          'success',
          5000,
        );
      }
    });
  }

  window.addEventListener('online', () => {
    sincronizarTrabalhosOffline().catch((err) => {
      console.error('[ManuSilva] Sincronização ao recuperar rede:', err);
    });
  });
}
