/**
 * Sincronização manual de dados no tablet do técnico.
 */

import { warmOperacoes } from './app.js';
import { hydrateLocalReportsIntoCache } from './report-local-storage.js';

export async function triggerTechDataSync() {
  const { reconcileLocallyDeletedReports, purgeLocallyDeletedFromCache } = await import(
    './report-deleted-local.js'
  );
  await reconcileLocallyDeletedReports();
  await purgeLocallyDeletedFromCache();

  await warmOperacoes();
  await hydrateLocalReportsIntoCache();

  const { sincronizarTrabalhosOffline } = await import('./trabalhos-offline.js');
  const { syncLocalReportDraftsToServer } = await import('./report-draft-sync.js');
  const [syncResult] = await Promise.all([
    sincronizarTrabalhosOffline(),
    syncLocalReportDraftsToServer({ notify: false }),
  ]);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jobs-updated'));
    window.dispatchEvent(new CustomEvent('db-updated'));
    window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
  }

  return syncResult;
}
