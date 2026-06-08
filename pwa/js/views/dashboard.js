/**
 * Painel principal RH — métricas (aba calendário) e cadastro de clientes (aba clientes).
 */

import { ensureProductionCatalog } from '../clients-catalog.js';
import { computeDashboardMetrics, renderMetricsSection } from './dashboard-metrics.js';
import { renderClientRegistryBlock, mountClientRegistry } from './rh-registry.js';

let metricsRoot = null;

export async function initMetricsPanel(root) {
  metricsRoot = root;
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  await refreshMetricsPanel();
}

export async function refreshMetricsPanel() {
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  metricsRoot.innerHTML = renderMetricsSection(computeDashboardMetrics());
}

/** @deprecated Use initMetricsPanel — mantido para compatibilidade */
export async function initDashboardPanel(root) {
  await initMetricsPanel(root);
}

/** @deprecated Use refreshMetricsPanel */
export async function refreshDashboardPanel() {
  await refreshMetricsPanel();
}

let clientsRoot = null;

export async function initClientsHubPanel(root) {
  clientsRoot = root;
  if (!clientsRoot) return;

  clientsRoot.innerHTML = `
    <div class="clients-hub" data-clients-hub>
      ${renderClientRegistryBlock()}
    </div>
  `;

  mountClientRegistry(clientsRoot, {
    onClientAdded: () => {
      refreshMetricsPanel().catch(console.error);
    },
  });
}
