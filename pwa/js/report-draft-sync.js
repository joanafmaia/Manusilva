/**
 * Sincronização segura de rascunhos locais (IndexedDB) → Supabase.
 * Garante que dados recolhidos offline não se perdem quando volta a rede.
 */

import { sameEntityId } from './entity-id.js';
import { isUuid } from './relatorios-db.js';
import {
  getAllLocalReportDrafts,
  reportDraftStorageKey,
  removeLocalReportDraft,
} from './report-local-storage.js';
import { uploadPendingFotosFromReport } from './foto-trabalho-storage.js';

/** O servidor confirmou que gravou o mesmo relatório/trabalho/visita. */
export function isDraftSafelySynced(local, saved) {
  if (!local || !saved) return false;
  if (!saved.id || !isUuid(saved.id)) return false;

  if (local.id && isUuid(local.id) && !sameEntityId(saved.id, local.id)) {
    return false;
  }

  if (local.servicoId) {
    if (!sameEntityId(saved.servicoId, local.servicoId)) return false;
    if (local.serviceType && saved.serviceType !== local.serviceType) return false;
    return true;
  }

  if (local.jobId) {
    return sameEntityId(saved.jobId, local.jobId);
  }

  return false;
}

/**
 * Envia rascunhos do tablet para Supabase. Mantém cópia local se a gravação falhar.
 * @returns {Promise<{ synced: number, remaining: number }>}
 */
export async function syncLocalReportDraftsToServer(options = {}) {
  const { notify = false } = options;

  const { canSyncToServer } = await import('./trabalhos-offline.js');
  if (!canSyncToServer()) {
    const remaining = (await getAllLocalReportDrafts()).length;
    return { synced: 0, remaining };
  }

  const { upsertRelatorio, mergeReportInCache } = await import('./relatorios-db.js');
  const drafts = await getAllLocalReportDrafts();
  let synced = 0;

  for (const draft of drafts) {
    const status = draft.status || 'draft';
    if (status !== 'draft' && status !== 'pending_review') continue;

    const { isReportLocallyDeleted } = await import('./report-deleted-local.js');
    if (isReportLocallyDeleted(draft)) {
      const { removeAllLocalDraftsForReport } = await import('./report-local-storage.js');
      await removeAllLocalDraftsForReport(draft).catch(() => {});
      continue;
    }

    const key = reportDraftStorageKey(draft);
    try {
      const { ensureReportsLoaded, isRelatorioLockedOnServer } = await import('./relatorios-db.js');
      await ensureReportsLoaded(true);
      if (await isRelatorioLockedOnServer(draft)) {
        console.warn('[ManuSilva] Rascunho local descartado — relatório já revisto no servidor:', key);
        await removeLocalReportDraft(key);
        continue;
      }

      const report = await uploadPendingFotosFromReport(draft);
      const saved = await upsertRelatorio(report);

      if (!saved || !isDraftSafelySynced(draft, saved)) {
        if (saved) {
          mergeReportInCache({ ...saved, ...draft, id: saved.id });
        }
        console.warn('[ManuSilva] Rascunho local mantido (sync incompleto):', key);
        continue;
      }

      mergeReportInCache(saved);
      await removeLocalReportDraft(key);
      synced += 1;
    } catch (err) {
      console.error('[ManuSilva] Falha ao sincronizar rascunho local:', key, err);
    }
  }

  if (synced > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('db-updated'));
    if (notify) {
      const { showToast } = await import('./toast-modal.js');
      showToast(
        synced === 1
          ? '1 rascunho sincronizado com a base de dados.'
          : `${synced} rascunhos sincronizados com a base de dados.`,
        'success',
        5000,
      );
    }
  }

  return { synced, remaining: (await getAllLocalReportDrafts()).length };
}

export async function countUnsyncedLocalReportDrafts() {
  return (await getAllLocalReportDrafts()).length;
}
