/**
 * Página isolada: Arquivo Digital (pesquisa + histórico + download PDF).
 */

import { ensureProductionCatalog } from '../clients-catalog.js';
import { showToast, getReport } from '../app.js';
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

async function downloadArquivoPdf(reportId) {
  if (!reportId) return;

  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado no arquivo local.', 'error');
    return;
  }

  try {
    const { showPdfPreviewLoading } = await import('../pdf-preview.js');
    showPdfPreviewLoading(true, 'A gerar PDF…');

    try {
      const payload = {
        ...report,
        submittedAt: report.submittedAt || new Date().toISOString(),
      };

      const { importPdfReport } = await import('../pdf-loader.js');
      const { generateManutencaoBateriasGrandesPDF, generateInspecaoDl50PDF } = await importPdfReport();

      if (payload.serviceType === 'manutencao_baterias_grandes') {
        await generateManutencaoBateriasGrandesPDF(payload);
      } else if (payload.serviceType === 'inspecao_dl50_2005') {
        await generateInspecaoDl50PDF(payload);
      } else {
        throw new Error('Tipo de relatório não suportado para download no Arquivo Digital.');
      }

      showToast('PDF descarregado com sucesso.', 'success');
    } finally {
      showPdfPreviewLoading(false);
    }
  } catch (err) {
    console.error('[Arquivo Digital] Download PDF:', err);
    showToast(err?.message || 'Não foi possível gerar o PDF.', 'error');
  }
}

export function paintClientHistory(rootOrId, maybeClientId) {
  let root = mountRoot;
  let clientId = rootOrId;

  if (typeof rootOrId === 'object' && rootOrId?.querySelector) {
    root = rootOrId;
    clientId = maybeClientId;
  }

  const historyMount = root?.querySelector('[data-client-history-content]');
  if (!historyMount || !clientId) return;

  selectedClientId = clientId;
  historyMount.innerHTML = HistoricoClienteView.render(clientId, { batteryOnly: false });
  HistoricoClienteView.init(clientId, {
    batteryOnly: false,
    showWorkflowActions: true,
    onDownloadPDF: downloadArquivoPdf,
    onBack: () => {
      selectedClientId = null;
      historyMount.innerHTML = renderEmptyState();
    },
  });
  historyMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function paintSelectedClient(clientId) {
  paintClientHistory(mountRoot, clientId);
}

async function paint() {
  if (!mountRoot) return;

  mountRoot.innerHTML = `
    <div class="dashboard-panel-inner">
      <div class="clients-history-nav rh-section" data-clients-history-nav>
        <p class="clients-history-nav-text text-muted">
          Para consultar ou editar dados cadastrais (NIF, morada, contacto), use a lista em
          <a href="#clients" class="clients-history-nav-link" data-goto-clients-list>Clientes / Empresas</a>.
        </p>
      </div>
      <div data-dashboard-search-mount>${renderSearchSection()}</div>
      <div data-client-history-content>${renderEmptyState()}</div>
    </div>
  `;

  mountRoot.querySelector('[data-goto-clients-list]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const { setAdminTab } = await import('../admin-dashboard.js');
    setAdminTab('clientes');
    document.getElementById('clients')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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

export async function initArquivoHistoricoPage(root) {
  mountRoot = root;
  if (!mountRoot) return;

  const { warmOperacoes } = await import('../app.js');
  await ensureProductionCatalog();
  await warmOperacoes();
  await paint();
}

export function refreshArquivoHistoricoPage() {
  if (!mountRoot) return;
  if (selectedClientId) {
    paintSelectedClient(selectedClientId);
  }
}
