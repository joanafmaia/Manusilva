/**
 * Histórico do Cliente — painel dinâmico com filtros, cartões (mobile/tablet) e tabela (desktop).
 */

import {
  getClient,
  getDB,
  getServiceType,
  getTechnician,
  getJob,
  escapeHtml,
  formatDateLong,
  warmOperacoes,
} from '../app.js';
import { getClientFromCatalog } from '../clients-catalog.js';
import { mapClientToLegacy } from '../mock_data.js';
import { openReportReviewModal, downloadReportPDF } from '../report-review-modal.js';
import { openClientProfilePanel } from './client-profile-drawer.js';
import { isTestClient, TEST_JOB_ORDEM_LABEL } from '../client-test-utils.js';

/** Tipos de relatório técnico de bateria (MS. 061) */
export const BATTERY_REPORT_SERVICE_TYPES = new Set([
  'reparacao_avarias_bateria',
  'manutencao_preventiva_bateria',
  'manutencao_baterias_grandes',
]);

const HISTORY_PAGE_SIZE = 12;

const REPORT_STATUS_LABELS = {
  approved: 'Aprovado',
  pending_review: 'Pendente',
  draft: 'Rascunho',
  rejected: 'Recusado',
};

/** @type {{ onBack?: Function, showWorkflowActions?: boolean, batteryOnly?: boolean, onDownloadPDF?: Function } | null} */
let activeNavOptions = null;

/** Estado dos filtros / paginação (preservado entre re-renders parciais) */
const historyViewState = {
  clientId: null,
  batteryOnly: true,
  search: '',
  typeFilter: 'all',
  statusFilter: 'all',
  visibleCount: HISTORY_PAGE_SIZE,
};

function resolveClientMeta(clientId) {
  const legacy = getClient(clientId) || mapClientToLegacy(getClientFromCatalog(clientId) || { id: clientId });
  const nome = legacy.name || legacy.Nome || '—';
  const nif = legacy.nif || legacy.NIF || '—';
  const email = legacy.email || legacy['E-mail'] || '';
  const phone = legacy.phone || legacy.Telemovel || legacy.telemovel || '';
  const contact = [email, phone].filter(Boolean).join(' · ') || '—';
  return { legacy, nome, nif, contact };
}

function clientIdAliases(clientId) {
  const { legacy } = resolveClientMeta(clientId);
  return new Set(
    [clientId, legacy?.id, legacy?.NIF, legacy?.nif, legacy?.name, legacy?.Nome].filter(Boolean).map(String),
  );
}

function reportBelongsToClient(report, clientId) {
  const aliases = clientIdAliases(clientId);
  return aliases.has(String(report.clientId));
}

function formatOrdemDisplay(numeroOrdem, client = null) {
  if (numeroOrdem != null && numeroOrdem !== '') {
    const padded = String(numeroOrdem).padStart(2, '0');
    return `OP-2026-${padded}`;
  }
  if (isTestClient(client)) return TEST_JOB_ORDEM_LABEL;
  return '—';
}

function getClientHistoryReports(clientId, { batteryOnly = true } = {}) {
  const db = getDB();
  return (db.reports || [])
    .filter((r) => {
      if (!reportBelongsToClient(r, clientId)) return false;
      if (batteryOnly && !BATTERY_REPORT_SERVICE_TYPES.has(r.serviceType)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

export function getClientBatteryReports(clientId) {
  return getClientHistoryReports(clientId, { batteryOnly: true });
}

export function getClientSubmittedReports(clientId) {
  return getClientHistoryReports(clientId, { batteryOnly: false });
}

/** Última intervenção concluída do cliente (qualquer tipo de relatório). */
export function getLastClientIntervention(clientId) {
  const reports = getClientSubmittedReports(clientId).filter(
    (r) => r.status === 'approved' || r.submittedAt,
  );
  if (!reports.length) return null;
  return enrichReportRow(reports[0], {
    nome: getClient(clientId)?.name || getClient(clientId)?.Nome || 'Cliente',
  });
}

function enrichReportRow(report, clientMeta) {
  const job = report.jobId ? getJob(report.jobId) : null;
  const service = getServiceType(report.serviceType);
  const tech = getTechnician(report.technicianId);
  const dateRaw = report.submittedAt || job?.date || '';
  const dateStr = dateRaw ? formatDateLong(String(dateRaw).split('T')[0]) : '—';
  const ordem = formatOrdemDisplay(job?.numeroOrdem, clientMeta.legacy);
  const machine = report.forkliftSerial || job?.forkliftSerial || '—';
  const serviceLabel = service?.label || report.serviceType || '—';
  const searchBlob = [clientMeta.nome, ordem, machine, serviceLabel, tech?.name || '']
    .join(' ')
    .toLowerCase();

  return {
    report,
    job,
    service,
    tech,
    dateStr,
    dateRaw,
    ordem,
    machine,
    serviceLabel,
    serviceType: report.serviceType,
    status: report.status || 'draft',
    searchBlob,
  };
}

function reportStatusBadge(status) {
  if (status === 'approved') {
    return '<span class="client-history-status client-history-status--approved">Aprovado</span>';
  }
  if (status === 'pending_review') {
    return '<span class="client-history-status client-history-status--pending">Pendente</span>';
  }
  if (status === 'draft') {
    return '<span class="client-history-status client-history-status--draft">Rascunho</span>';
  }
  if (status === 'rejected') {
    return '<span class="client-history-status client-history-status--rejected">Recusado</span>';
  }
  return `<span class="client-history-status">${escapeHtml(REPORT_STATUS_LABELS[status] || status)}</span>`;
}

function pdfActionButton(report, job, variant = 'card') {
  const btnClass =
    variant === 'table'
      ? 'btn-outline btn-sm client-history-pdf-btn'
      : 'btn-primary client-history-pdf-btn client-history-pdf-btn--card';
  const label = variant === 'table' ? 'Ver PDF' : 'Ver PDF';

  if (job?.urlPdf) {
    return `<button type="button" class="${btnClass}" data-open-pdf-url="${escapeHtml(job.urlPdf)}">${label}</button>`;
  }
  return `<button type="button" class="${btnClass}" data-download-pdf="${escapeHtml(report.id)}">${label}</button>`;
}

function filterHistoryRows(rows) {
  const q = historyViewState.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (historyViewState.typeFilter !== 'all' && row.serviceType !== historyViewState.typeFilter) {
      return false;
    }
    if (historyViewState.statusFilter !== 'all' && row.status !== historyViewState.statusFilter) {
      return false;
    }
    if (q && !row.searchBlob.includes(q)) return false;
    return true;
  });
}

function buildTypeFilterOptions(rows) {
  const types = [...new Set(rows.map((r) => r.serviceType).filter(Boolean))];
  return types
    .map((id) => {
      const service = getServiceType(id);
      const label = service?.label || id;
      return `<option value="${escapeHtml(id)}"${historyViewState.typeFilter === id ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function renderToolbar(rows) {
  const typeOptions = buildTypeFilterOptions(rows);
  const filtered = filterHistoryRows(rows);

  return `
    <div class="client-history-toolbar rh-section" data-history-toolbar>
      <div class="client-history-toolbar-search">
        <label class="form-label" for="client-history-search">Pesquisa rápida</label>
        <input type="search" id="client-history-search" class="form-input client-history-search-input"
          placeholder="Cliente, ordem, n.º série…" value="${escapeHtml(historyViewState.search)}"
          autocomplete="off" aria-label="Pesquisar no histórico">
      </div>
      <div class="client-history-toolbar-filters">
        <div class="client-history-filter">
          <label class="form-label" for="client-history-type">Tipo de relatório</label>
          <select id="client-history-type" class="form-select client-history-filter-select" aria-label="Filtrar por tipo">
            <option value="all"${historyViewState.typeFilter === 'all' ? ' selected' : ''}>Todos os tipos</option>
            ${typeOptions}
          </select>
        </div>
        <div class="client-history-filter">
          <label class="form-label" for="client-history-status">Estado</label>
          <select id="client-history-status" class="form-select client-history-filter-select" aria-label="Filtrar por estado">
            <option value="all"${historyViewState.statusFilter === 'all' ? ' selected' : ''}>Todos</option>
            <option value="approved"${historyViewState.statusFilter === 'approved' ? ' selected' : ''}>Aprovado</option>
            <option value="pending_review"${historyViewState.statusFilter === 'pending_review' ? ' selected' : ''}>Pendente</option>
            <option value="draft"${historyViewState.statusFilter === 'draft' ? ' selected' : ''}>Rascunho</option>
            <option value="rejected"${historyViewState.statusFilter === 'rejected' ? ' selected' : ''}>Recusado</option>
          </select>
        </div>
      </div>
      <p class="client-history-result-count text-muted" aria-live="polite">
        ${filtered.length} relatório${filtered.length === 1 ? '' : 's'} encontrado${filtered.length === 1 ? '' : 's'}
      </p>
    </div>
  `;
}

function renderHistoryCard(row) {
  const { report } = row;

  return `
    <article class="client-history-card" data-report-id="${escapeHtml(report.id)}">
      <button type="button" class="client-history-card-body" data-open-report="${escapeHtml(report.id)}">
        <div class="client-history-card-top">
          <span class="client-history-ordem">${escapeHtml(row.ordem)}</span>
          ${reportStatusBadge(row.status)}
        </div>
        <h4 class="client-history-card-service">${escapeHtml(row.serviceLabel)}</h4>
        <dl class="client-history-card-meta">
          <div><dt>Máquina</dt><dd>${escapeHtml(row.machine)}</dd></div>
          <div><dt>Data</dt><dd>${escapeHtml(row.dateStr)}</dd></div>
          <div><dt>Técnico</dt><dd>${escapeHtml(row.tech?.name || '—')}</dd></div>
        </dl>
      </button>
      <footer class="client-history-card-footer">
        ${pdfActionButton(report, row.job, 'card')}
      </footer>
    </article>
  `;
}

function renderHistoryTableRow(row) {
  const { report } = row;
  return `
    <tr class="client-history-table-row" data-report-id="${escapeHtml(report.id)}">
      <td><span class="client-history-ordem">${escapeHtml(row.ordem)}</span></td>
      <td>${escapeHtml(row.serviceLabel)}</td>
      <td>${escapeHtml(row.machine)}</td>
      <td>${escapeHtml(row.dateStr)}</td>
      <td>${reportStatusBadge(row.status)}</td>
      <td class="client-history-table-actions">
        <button type="button" class="btn-ghost btn-sm" data-open-report="${escapeHtml(report.id)}" title="Ver detalhe">Detalhe</button>
        ${pdfActionButton(report, row.job, 'table')}
      </td>
    </tr>
  `;
}

function renderListSection(rows, { batteryOnly }) {
  const filtered = filterHistoryRows(rows);
  const visible = filtered.slice(0, historyViewState.visibleCount);
  const hasMore = filtered.length > historyViewState.visibleCount;
  const emptyMsg = batteryOnly
    ? 'Nenhum relatório de bateria corresponde aos filtros.'
    : 'Nenhum relatório corresponde aos filtros.';

  if (!filtered.length) {
    return `
      <div class="client-history-results" data-history-results>
        <p class="text-muted client-history-empty">${emptyMsg}</p>
      </div>
    `;
  }

  const cardsHtml = visible.map((row) => renderHistoryCard(row)).join('');
  const tableRowsHtml = visible.map((row) => renderHistoryTableRow(row)).join('');

  const loadMoreHtml = hasMore
    ? `<div class="client-history-pagination">
        <button type="button" class="btn-secondary client-history-load-more" data-history-load-more>
          Carregar mais (${filtered.length - historyViewState.visibleCount} restantes)
        </button>
      </div>`
    : '';

  return `
    <div class="client-history-results" data-history-results>
      <div class="client-history-grid" role="list" aria-label="Relatórios do cliente">
        ${cardsHtml}
      </div>
      <div class="client-history-table-wrap">
        <div class="client-history-table-scroll">
          <table class="client-history-table rh-data-table">
            <thead>
              <tr>
                <th scope="col">Ordem</th>
                <th scope="col">Relatório</th>
                <th scope="col">Máquina</th>
                <th scope="col">Data</th>
                <th scope="col">Estado</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </div>
      </div>
      ${loadMoreHtml}
    </div>
  `;
}

export const HistoricoClienteView = {
  /**
   * @param {string} clientId
   * @param {{ batteryOnly?: boolean }} [renderOptions]
   */
  render(clientId, renderOptions = {}) {
    const batteryOnly = renderOptions.batteryOnly !== false;
    const showWorkflow =
      renderOptions.showWorkflowActions ?? activeNavOptions?.showWorkflowActions !== false;
    const { nome, nif, contact } = resolveClientMeta(clientId);
    const clientMeta = { nome, nif, contact };
    const reports = getClientHistoryReports(clientId, { batteryOnly });
    const rows = reports.map((r) => enrichReportRow(r, clientMeta));

    if (historyViewState.clientId !== clientId) {
      historyViewState.clientId = clientId;
      historyViewState.batteryOnly = batteryOnly;
      historyViewState.search = '';
      historyViewState.typeFilter = 'all';
      historyViewState.statusFilter = 'all';
      historyViewState.visibleCount = HISTORY_PAGE_SIZE;
    }

    const reportsTitle = batteryOnly ? 'Relatórios técnicos de bateria' : 'Histórico de intervenções';

    return `
      <div class="client-history-page" data-client-history data-client-id="${escapeHtml(clientId)}">
        <header class="client-history-header">
          <button type="button" class="btn-ghost client-history-back" data-history-back>&larr; Voltar</button>
          <h2 class="client-history-title ms-page-title">Histórico do Cliente</h2>
        </header>

        <section class="client-history-company rh-section">
          <div class="client-history-company-head">
            <h3 class="dashboard-section-title">Dados da empresa</h3>
            <button type="button" class="btn-secondary btn-sm" data-client-ficha="${escapeHtml(clientId)}">
              Ver ficha completa
            </button>
          </div>
          <dl class="client-history-dl">
            <div><dt>Nome</dt><dd>${escapeHtml(nome)}</dd></div>
            <div><dt>NIF</dt><dd>${escapeHtml(nif)}</dd></div>
            <div><dt>Contacto</dt><dd>${escapeHtml(contact)}</dd></div>
          </dl>
        </section>

        <section class="client-history-reports">
          <h3 class="dashboard-section-title">${escapeHtml(reportsTitle)}</h3>
          ${renderToolbar(rows)}
          ${renderListSection(rows, { batteryOnly })}
        </section>
      </div>
    `;
  },

  /**
   * @param {string} clientId
   * @param {{ onBack?: () => void, showWorkflowActions?: boolean, batteryOnly?: boolean, onDownloadPDF?: (reportId: string) => void }} [options]
   */
  async init(clientId, options = {}) {
    await warmOperacoes();

    const onDownloadPDF =
      typeof options.onDownloadPDF === 'function'
        ? options.onDownloadPDF
        : (reportId) => downloadReportPDF(reportId);

    activeNavOptions = options;
    const batteryOnly = options.batteryOnly !== false;
    const root = document.querySelector('[data-client-history]');
    if (!root) return;

    const showWorkflow = options.showWorkflowActions !== false;
    const clientMeta = resolveClientMeta(clientId);
    const rows = getClientHistoryReports(clientId, { batteryOnly }).map((r) =>
      enrichReportRow(r, clientMeta),
    );

    const repaintResults = () => {
      const mount = root.querySelector('[data-history-results]');
      const countEl = root.querySelector('.client-history-result-count');
      if (mount) {
        mount.outerHTML = renderListSection(rows, { batteryOnly });
        bindListInteractions(root, {
          showWorkflow,
          onDownloadPDF,
          onLoadMore: () => {
            historyViewState.visibleCount += HISTORY_PAGE_SIZE;
            repaintResults();
          },
        });
      }
      if (countEl) {
        const n = filterHistoryRows(rows).length;
        countEl.textContent = `${n} relatório${n === 1 ? '' : 's'} encontrado${n === 1 ? '' : 's'}`;
      }
    };

    root.querySelector('[data-client-ficha]')?.addEventListener('click', () => {
      openClientProfilePanel(clientId, {
        onHistory: () => {
          root.querySelector('.client-history-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    });

    root.querySelector('[data-history-back]')?.addEventListener('click', async () => {
      historyViewState.clientId = null;
      if (typeof options.onBack === 'function') {
        options.onBack();
        return;
      }
      const { restoreClientsDashboard } = await import('./clients-app.js');
      restoreClientsDashboard();
    });

    const searchInput = root.querySelector('#client-history-search');
    searchInput?.addEventListener('input', () => {
      historyViewState.search = searchInput.value;
      historyViewState.visibleCount = HISTORY_PAGE_SIZE;
      repaintResults();
    });

    root.querySelector('#client-history-type')?.addEventListener('change', (e) => {
      historyViewState.typeFilter = e.target.value;
      historyViewState.visibleCount = HISTORY_PAGE_SIZE;
      repaintResults();
    });

    root.querySelector('#client-history-status')?.addEventListener('change', (e) => {
      historyViewState.statusFilter = e.target.value;
      historyViewState.visibleCount = HISTORY_PAGE_SIZE;
      repaintResults();
    });

    const bindActions = () => {
      bindListInteractions(root, {
        showWorkflow,
        onDownloadPDF,
        onLoadMore: () => {
          historyViewState.visibleCount += HISTORY_PAGE_SIZE;
          repaintResults();
        },
      });
    };

    bindActions();
  },
};

function bindListInteractions(root, { showWorkflow, onDownloadPDF, onLoadMore }) {
  root.querySelector('[data-history-load-more]')?.addEventListener('click', () => {
    onLoadMore?.();
  });

  root.querySelectorAll('[data-open-report]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.dataset.openReport;
      if (!reportId) return;
      openReportReviewModal(reportId, {
        showWorkflowActions: showWorkflow,
        onApproved: () => {
          const app = document.getElementById('app');
          const clientId = root.dataset.clientId;
          if (app && clientId) {
            app.innerHTML = HistoricoClienteView.render(clientId, {
              batteryOnly: activeNavOptions?.batteryOnly !== false,
              showWorkflowActions: activeNavOptions?.showWorkflowActions,
            });
            void HistoricoClienteView.init(clientId, activeNavOptions || {});
          }
        },
        onRejected: () => {
          const app = document.getElementById('app');
          const clientId = root.dataset.clientId;
          if (app && clientId) {
            app.innerHTML = HistoricoClienteView.render(clientId, {
              batteryOnly: activeNavOptions?.batteryOnly !== false,
              showWorkflowActions: activeNavOptions?.showWorkflowActions,
            });
            void HistoricoClienteView.init(clientId, activeNavOptions || {});
          }
        },
      });
    });
  });

  root.querySelectorAll('[data-download-pdf]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDownloadPDF(btn.dataset.downloadPdf);
    });
  });

  root.querySelectorAll('[data-open-pdf-url]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.openPdfUrl;
      if (url) window.open(url, '_blank');
    });
  });
}
