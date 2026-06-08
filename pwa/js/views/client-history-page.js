/**
 * Página isolada: histórico de clientes (pesquisa + tabela de relatórios).
 */

import { ensureProductionCatalog } from '../clients-catalog.js';
import { renderSearchSection, mountClientSearch } from './dashboard-client-search.js';
import { HistoricoClienteView } from './historico-cliente.js';

let mountRoot = null;
let teardownSearch = null;
let selectedClientId = null;

function renderEmptyState() {
  return `
    <div class="rh-section client-history-empty">
      <p class="text-muted" style="margin:0">
        Pesquise uma empresa para abrir o histórico de relatórios submetidos.
      </p>
    </div>
  `;
}

function paintSelectedClient(clientId) {
  const historyMount = mountRoot?.querySelector('[data-client-history-content]');
  if (!historyMount || !clientId) return;

  historyMount.innerHTML = HistoricoClienteView.render(clientId, { batteryOnly: false });
  HistoricoClienteView.init(clientId, {
    batteryOnly: false,
    showWorkflowActions: true,
    onBack: () => {
      selectedClientId = null;
      historyMount.innerHTML = renderEmptyState();
    },
  });
}

async function paint() {
  if (!mountRoot) return;

  mountRoot.innerHTML = `
    <div class="dashboard-panel-inner">
      <div data-dashboard-search-mount>${renderSearchSection()}</div>
      <div data-client-history-content>${renderEmptyState()}</div>
    </div>
  `;

  teardownSearch?.();
  const searchMount = mountRoot.querySelector('[data-dashboard-search-mount]');
  teardownSearch = await mountClientSearch(searchMount, (record) => {
    selectedClientId = record?.id || null;
    if (!selectedClientId) return;
    paintSelectedClient(selectedClientId);
  });

  if (selectedClientId) {
    paintSelectedClient(selectedClientId);
  }
}

export async function initClientHistoryPage(root) {
  mountRoot = root;
  if (!mountRoot) return;

  const { warmOperacoes } = await import('../app.js');
  await ensureProductionCatalog();
  await warmOperacoes();
  await paint();
}

export function refreshClientHistoryPage() {
  if (!mountRoot) return;
  if (selectedClientId) {
    paintSelectedClient(selectedClientId);
  }
}
