/**
 * Painel principal RH — métricas (aba calendário) e cadastro de clientes (aba clientes).
 */

import { ensureProductionCatalog } from '../clients-catalog.js';
import {
  openModal,
  closeModal,
  showToast,
} from '../app.js';
import { computeDashboardMetrics, renderMetricsSection } from './dashboard-metrics.js';
import { renderClientFormSection, mountClientForm } from './rh-client-form.js';
import { mountClientsList } from './clients-list.js';
import { mountClientHistoryView } from './historico-cliente.js';
import { restoreClientsDashboard } from './clients-app.js';

let metricsRoot = null;

export async function initMetricsPanel(root, onAction) {
  metricsRoot = root;
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  await refreshMetricsPanel(onAction);
}

export async function refreshMetricsPanel(onAction) {
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  metricsRoot.innerHTML = renderMetricsSection(computeDashboardMetrics());
  bindMetricsPanelActions(metricsRoot, onAction);
}

function bindMetricsPanelActions(root, handlers = {}) {
  if (!root || !handlers) return;

  const trigger = (action) => {
    const fn = handlers[action];
    if (typeof fn === 'function') fn();
  };

  root.querySelectorAll('[data-metric-action]').forEach((el) => {
    const action = el.dataset.metricAction;
    el.addEventListener('click', () => trigger(action));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger(action);
      }
    });
  });
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

/* ─── Modal «Adicionar Cliente» ─── */

function openAddClientModal() {
  const overlay = openModal('🏢 Adicionar Cliente', renderClientFormSection({ modal: true }));

  mountClientForm(overlay, {
    onSuccess: () => {
      closeModal();
      showToast('Cliente adicionado com sucesso.', 'success');
      refreshMetricsPanel().catch(console.error);
      refreshClientsListMount().catch(console.error);
    },
  });
}

/* ─── Histórico do cliente (vista partilhada RH + técnico) ─── */

export async function openClientHistoryPanel(clientId) {
  const app = document.getElementById('app');
  if (!app || !clientId) return;
  await mountClientHistoryView(clientId, app, {
    batteryOnly: false,
    showWorkflowActions: true,
    onBack: () => restoreClientsDashboard(),
  });
}

/** @deprecated Preferir openClientHistoryPanel */
export function openClientHistoryModal(clientId) {
  void openClientHistoryPanel(clientId);
}

/* ─── Painel principal de Clientes / Empresas ─── */

async function refreshClientsListMount() {
  const listMount = clientsRoot?.querySelector('[data-clients-list-mount]');
  if (!listMount) return;
  await mountClientsList(listMount, {
    onClientHistory: (clientId) => openClientHistoryPanel(clientId),
  });
}

export async function initClientsHubPanel(root) {
  clientsRoot = root;
  if (!clientsRoot) return;

  clientsRoot.innerHTML = `
    <div class="clients-hub" data-clients-hub>
      <div data-clients-list-mount></div>
    </div>
  `;

  const addBtn = document.getElementById('btn-add-client');
  if (addBtn && addBtn.dataset.bound !== 'true') {
    addBtn.dataset.bound = 'true';
    addBtn.addEventListener('click', openAddClientModal);
  }

  await refreshClientsListMount();
}
