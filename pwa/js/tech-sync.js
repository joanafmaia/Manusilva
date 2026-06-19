/**
 * Sincronização manual de dados no tablet do técnico.
 */

import { warmOperacoes } from './app.js';
import { hydrateLocalReportsIntoCache } from './report-local-storage.js';

export async function triggerTechDataSync() {
  await warmOperacoes();
  await hydrateLocalReportsIntoCache();

  const { sincronizarTrabalhosOffline } = await import('./trabalhos-offline.js');
  const syncResult = await sincronizarTrabalhosOffline();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jobs-updated'));
    window.dispatchEvent(new CustomEvent('db-updated'));
    window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
  }

  return syncResult;
}
