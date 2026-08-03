/**
 * Hub da secção Clientes — cadastro de empresa (aba Clientes).
 */

import { initClientsHubPanel, softRefreshClientsHubPanel } from './dashboard.js';

let clientsMounted = false;

export async function restoreClientsDashboard() {
  const app = document.getElementById('app');
  if (!app) return;

  clientsMounted = false;
  await initClientsHubPanel(app);
  clientsMounted = true;
}

export async function initClientsApp() {
  await restoreClientsDashboard();
}

/** Atualização leve (db-updated) — não remonta o hub nem limpa a pesquisa. */
export async function softRefreshClientsApp() {
  if (!clientsMounted) {
    await initClientsApp();
    return;
  }
  const ok = await softRefreshClientsHubPanel();
  if (!ok) await initClientsApp();
}

export function isClientsDashboardMounted() {
  return clientsMounted;
}
