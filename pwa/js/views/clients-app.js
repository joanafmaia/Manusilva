/**
 * Hub da secção Clientes — métricas e cadastro (sem histórico).
 */

import { initDashboardPanel } from './dashboard.js';

let dashboardMounted = false;

export async function restoreClientsDashboard() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="clients-hub" data-clients-hub>
      <div id="dashboard-panel" class="dashboard-panel"></div>
    </div>
  `;

  dashboardMounted = false;
  await initDashboardPanel(document.getElementById('dashboard-panel'));
  dashboardMounted = true;
}

export async function initClientsApp() {
  await restoreClientsDashboard();
}

export function isClientsDashboardMounted() {
  return dashboardMounted;
}
