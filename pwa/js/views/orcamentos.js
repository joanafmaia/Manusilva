/**
 * Painel RH — propostas comerciais MS.015 (pedidos de orçamento).
 */

import {
  getClient,
  getJob,
  getReport,
  getReportsSnapshot,
  getServiceType,
  getTechnician,
  escapeHtml,
  showToast,
} from '../app.js';
import { openOrcamentoModal } from '../orcamento-modal.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import {
  getPedidoOrcamentoDetalhe,
  getReportOrcamentoPdfUrl,
  isRhOrcamentoQueueReport,
  openOrcamentoStorageUrl,
  reportHasPedidoOrcamento,
  reportOrcamentoPorPreparar,
} from '../pedido-orcamento.js';
import { getReportOrcamentoMeta } from '../orcamento-linhas.js';
import { dedupeReportsByJobPreferNewest } from '../relatorios-db.js';

const PANEL_STATUSES = new Set(['pending_review', 'approved']);

let mountRoot = null;
let activeFilter = 'por_preparar';
let searchQuery = '';
let highlightReportId = null;

function orcamentoWorkflowStatus(report) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.enviadoEm) return 'enviada';
  if (meta?.atualizadoEm) return 'guardada';
  return 'por_preparar';
}

function listOrcamentoReports() {
  return dedupeReportsByJobPreferNewest(
    getReportsSnapshot()
      .filter((report) => isRhOrcamentoQueueReport(report))
      .sort((a, b) => {
        const da = String(a.approvedAt || a.submittedAt || '');
        const db = String(b.approvedAt || b.submittedAt || '');
        return db.localeCompare(da);
      }),
  );
}

function filterOrcamentoReports(reports) {
  let rows = reports;
  if (activeFilter === 'por_preparar') {
    rows = rows.filter(reportOrcamentoPorPreparar);
  } else if (activeFilter !== 'todas') {
    rows = rows.filter((report) => orcamentoWorkflowStatus(report) === activeFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((report) => {
    const client = getClient(report.clientId);
    const job = report.jobId ? getJob(report.jobId) : null;
    const clientName = String(client?.name || client?.Nome || '').toLowerCase();
    const op = formatOrdemLabel(job).toLowerCase();
    const numero = String(getReportOrcamentoMeta(report)?.numeroFormatado || '').toLowerCase();
    return clientName.includes(q) || op.includes(q) || numero.includes(q);
  });
}

function countByWorkflow(reports) {
  return {
    por_preparar: reports.filter(reportOrcamentoPorPreparar).length,
    guardada: reports.filter((r) => orcamentoWorkflowStatus(r) === 'guardada').length,
    enviada: reports.filter((r) => orcamentoWorkflowStatus(r) === 'enviada').length,
    todas: reports.length,
  };
}

function statusLabel(status) {
  if (status === 'enviada') return 'Enviada';
  if (status === 'guardada') return 'Guardada';
  return 'Por preparar';
}

function statusClass(status) {
  if (status === 'enviada') return 'orcamentos-status--ok';
  if (status === 'guardada') return 'orcamentos-status--saved';
  return 'orcamentos-status--pending';
}

function reportStatusLabel(report) {
  if (report.status === 'approved') return 'Relatório aprovado';
  if (report.status === 'pending_review') return 'Aguarda aprovação RH';
  return report.status || '—';
}

function renderKpis(counts) {
  const chips = [
    { id: 'por_preparar', label: 'Por preparar', count: counts.por_preparar },
    { id: 'guardada', label: 'Guardadas', count: counts.guardada },
    { id: 'enviada', label: 'Enviadas', count: counts.enviada },
    { id: 'todas', label: 'Todas', count: counts.todas },
  ];

  return `
    <div class="orcamentos-kpis" role="tablist" aria-label="Filtrar propostas">
      ${chips
        .map(
          ({ id, label, count }) => `
        <button
          type="button"
          class="orcamentos-kpi${activeFilter === id ? ' is-active' : ''}"
          data-orc-filter="${escapeHtml(id)}"
          role="tab"
          aria-selected="${activeFilter === id ? 'true' : 'false'}"
        >
          <span class="orcamentos-kpi__value">${count}</span>
          <span class="orcamentos-kpi__label">${escapeHtml(label)}</span>
        </button>`,
        )
        .join('')}
    </div>`;
}

function renderTableRow(report) {
  const client = getClient(report.clientId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const tech = getTechnician(report.technicianId);
  const service = getServiceType(report.serviceType);
  const workflow = orcamentoWorkflowStatus(report);
  const meta = getReportOrcamentoMeta(report);
  const detalhe = getPedidoOrcamentoDetalhe(report);
  const detalheShort = detalhe
    ? detalhe.length > 72
      ? `${detalhe.slice(0, 69)}…`
      : detalhe
    : '—';
  const pdfUrl = getReportOrcamentoPdfUrl(report);
  const highlighted = highlightReportId && report.id === highlightReportId;

  return `
    <tr class="orcamentos-row${highlighted ? ' orcamentos-row--highlight' : ''}" data-report-id="${escapeHtml(report.id)}">
      <td><span class="orcamentos-ordem">${escapeHtml(formatOrdemLabel(job))}</span></td>
      <td>
        <strong>${escapeHtml(client?.name || client?.Nome || '—')}</strong>
        <span class="orcamentos-row__sub">${escapeHtml(service?.label || report.serviceType || '—')}</span>
      </td>
      <td class="orcamentos-col-muted">${escapeHtml(reportStatusLabel(report))}</td>
      <td>
        <span class="orcamentos-status ${statusClass(workflow)}">${escapeHtml(statusLabel(workflow))}</span>
        ${meta?.numeroFormatado ? `<span class="orcamentos-numero">nº ${escapeHtml(meta.numeroFormatado)}</span>` : ''}
      </td>
      <td class="orcamentos-col-detalhe" title="${escapeHtml(detalhe)}">${escapeHtml(detalheShort)}</td>
      <td class="orcamentos-col-muted">${escapeHtml(tech?.name || '—')}</td>
      <td class="orcamentos-col-action">
        <button type="button" class="btn-primary btn-sm btn-touch" data-orc-open="${escapeHtml(report.id)}">
          ${workflow === 'por_preparar' ? 'Preparar' : 'Editar'}
        </button>
        <button type="button" class="btn-outline btn-sm btn-touch" data-orc-review="${escapeHtml(report.id)}">Rever</button>
        ${
          pdfUrl
            ? `<button type="button" class="btn-ghost btn-sm btn-touch" data-orc-pdf="${escapeHtml(report.id)}">PDF</button>`
            : ''
        }
      </td>
    </tr>`;
}

function renderPanel() {
  const all = listOrcamentoReports();
  const counts = countByWorkflow(all);
  const rows = filterOrcamentoReports(all);

  return `
    <div class="orcamentos-panel">
      <header class="orcamentos-header">
        <h2 class="orcamentos-title">Orçamentos / Propostas MS.015</h2>
        <p class="orcamentos-lead text-muted">
          Propostas comerciais independentes do relatório técnico. Pode aprovar o relatório primeiro e preparar o orçamento depois — o e-mail da proposta é enviado à parte.
        </p>
      </header>

      ${renderKpis(counts)}

      <div class="orcamentos-toolbar">
        <input
          type="search"
          class="form-input orcamentos-search"
          id="orcamentos-search"
          placeholder="Pesquisar cliente, OP ou nº orçamento…"
          value="${escapeHtml(searchQuery)}"
          autocomplete="off"
          aria-label="Pesquisar orçamentos"
        />
      </div>

      ${
        rows.length
          ? `
        <div class="orcamentos-table-wrap">
          <table class="orcamentos-table">
            <thead>
              <tr>
                <th>OP</th>
                <th>Cliente / Serviço</th>
                <th>Relatório</th>
                <th>Proposta</th>
                <th>Pedido do técnico</th>
                <th>Técnico</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((report) => renderTableRow(report)).join('')}
            </tbody>
          </table>
        </div>`
          : `<p class="orcamentos-empty text-muted">Nenhuma proposta neste filtro.</p>`
      }
    </div>`;
}

function bindPanelEvents() {
  if (!mountRoot || mountRoot.dataset.orcBound === '1') return;
  mountRoot.dataset.orcBound = '1';

  mountRoot.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-orc-filter]');
    if (filterBtn) {
      activeFilter = filterBtn.dataset.orcFilter || 'por_preparar';
      refreshOrcamentosPanel().catch(console.error);
      return;
    }

    const openBtn = e.target.closest('[data-orc-open]');
    if (openBtn) {
      const report = getReport(openBtn.dataset.orcOpen);
      if (!report) {
        showToast('Relatório não encontrado.', 'error');
        return;
      }
      openOrcamentoModal(report, {
        onUpdated: () => refreshOrcamentosPanel().catch(console.error),
      });
      return;
    }

    const reviewBtn = e.target.closest('[data-orc-review]');
    if (reviewBtn) {
      const reportId = reviewBtn.dataset.orcReview;
      if (!reportId) return;
      void import('../report-review-rh-modal.js').then(({ openRhReviewModal }) =>
        openRhReviewModal(reportId, {
          onApproved: () => refreshOrcamentosPanel().catch(console.error),
          onRejected: () => refreshOrcamentosPanel().catch(console.error),
        }),
      );
      return;
    }

    const pdfBtn = e.target.closest('[data-orc-pdf]');
    if (pdfBtn) {
      const report = getReport(pdfBtn.dataset.orcPdf);
      const url = report ? getReportOrcamentoPdfUrl(report) : null;
      if (!url) {
        showToast('Gere e guarde a proposta antes de abrir o PDF.', 'warning');
        return;
      }
      openOrcamentoStorageUrl(url);
    }
  });

  mountRoot.addEventListener('input', (e) => {
    if (e.target.id !== 'orcamentos-search') return;
    searchQuery = e.target.value || '';
    refreshOrcamentosPanel().catch(console.error);
  });
}

function applyHighlight() {
  if (!mountRoot || !highlightReportId) return;
  const row = mountRoot.querySelector(`[data-report-id="${CSS.escape(highlightReportId)}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  window.setTimeout(() => {
    highlightReportId = null;
    row?.classList.remove('orcamentos-row--highlight');
  }, 4000);
}

export async function refreshOrcamentosPanel() {
  if (!mountRoot) return;
  mountRoot.innerHTML = renderPanel();
  applyHighlight();
}

export function queueOrcamentoReportFocus(reportId) {
  highlightReportId = reportId || null;
}

export function initOrcamentosPanel(root) {
  mountRoot = root;
  bindPanelEvents();
  return refreshOrcamentosPanel();
}

export function countOrcamentosPorPreparar() {
  return listOrcamentoReports().length;
}
