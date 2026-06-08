/**
 * Hub da secção Clientes — cadastro de empresa (aba Clientes).
 */

import { initClientsHubPanel } from './dashboard.js';

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

export function isClientsDashboardMounted() {
  return clientsMounted;
}
