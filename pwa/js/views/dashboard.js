/**
 * Painel principal RH — métricas + pesquisa de clientes (sem lista completa no DOM).
 */

import { ensureProductionCatalog } from '../clients-catalog.js';
import { computeDashboardMetrics, renderMetricsSection } from './dashboard-metrics.js';
import { renderClientRegistryBlock, mountClientRegistry } from './rh-registry.js';

let mountRoot = null;

export async function initDashboardPanel(root) {
  mountRoot = root;
  if (!mountRoot) return;

  await ensureProductionCatalog();
  paint();
}

export async function refreshDashboardPanel() {
  if (!mountRoot) return;
  await ensureProductionCatalog();
  updateMetrics();
}

function paint() {
  const metrics = computeDashboardMetrics();

  mountRoot.innerHTML = `
    <div class="dashboard-panel-inner">
      <div data-dashboard-metrics-mount>${renderMetricsSection(metrics)}</div>
      ${renderClientRegistryBlock()}
    </div>
  `;

  mountClientRegistry(mountRoot, {
    onClientAdded: () => {
      updateMetrics();
    },
  });
}

function updateMetrics() {
  const slot = mountRoot?.querySelector('[data-dashboard-metrics-mount]');
  if (!slot) {
    paint();
    return;
  }
  slot.innerHTML = renderMetricsSection(computeDashboardMetrics());
}

