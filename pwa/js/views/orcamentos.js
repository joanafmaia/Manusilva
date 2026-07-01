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
  cancelPedidoOrcamentoReport,
} from '../app.js';
import { openOrcamentoModal } from '../orcamento-modal.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import {
  getPedidoOrcamentoDetalhe,
  getReportOrcamentoPdfUrl,
  getReportTechnicalPdfUrl,
  isRhOrcamentoQueueReport,
  openOrcamentoStorageUrl,
  reportIsStandaloneOrcamento,
  reportOrcamentoGuardado,
  reportOrcamentoPorPreparar,
} from '../pedido-orcamento.js';
import {
  openNovaPropostaModal,
  reportOrcamentoQueueLabel,
} from '../orcamento-standalone.js';
import { getReportOrcamentoMeta } from '../orcamento-linhas.js';
import { dedupeReportsByJobPreferNewest } from '../relatorios-db.js';

const PANEL_STATUSES = new Set(['pending_review', 'approved']);

let mountRoot = null;
let activeFilter = 'todas';
let searchQuery = '';
let highlightReportId = null;

function orcamentoWorkflowStatus(report) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.enviadoEm) return 'enviada';
  if (reportOrcamentoGuardado(report)) return 'guardada';
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
  return reportOrcamentoQueueLabel(report);
}

function renderFilterHint(counts, total) {
  if (total <= 0) return '';

  const hints = [
    { id: 'por_preparar', label: 'por preparar', count: counts.por_preparar },
    { id: 'guardada', label: 'guardadas', count: counts.guardada },
    { id: 'enviada', label: 'enviadas', count: counts.enviada },
  ].filter(({ id, count }) => id !== activeFilter && count > 0);

  if (!hints.length) return '';

  const chips = hints
    .map(
      ({ id, count, label }) =>
        `<button type="button" class="orcamentos-filter-hint__link" data-orc-filter="${escapeHtml(id)}">${count} ${escapeHtml(label)} — ver</button>`,
    )
    .join('<span class="orcamentos-filter-hint__sep" aria-hidden="true">·</span>');

  return `
    <p class="orcamentos-filter-hint text-muted">
      <span class="orcamentos-filter-hint__label">Neste filtro não há resultados.</span>
      ${chips}
    </p>`;
}

function renderEmptyState(counts, total) {
  if (total <= 0) {
    return `<p class="orcamentos-empty text-muted">Ainda não há propostas. Use <strong>Nova proposta</strong> para começar.</p>`;
  }
  return `
    <div class="orcamentos-empty-wrap">
      <p class="orcamentos-empty text-muted">Nenhuma proposta neste filtro.</p>
      ${renderFilterHint(counts, total)}
    </div>`;
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
  const detalhe = reportIsStandaloneOrcamento(report) ? '' : getPedidoOrcamentoDetalhe(report);
  const detalheShort = detalhe
    ? detalhe.length > 48
      ? `${detalhe.slice(0, 45)}…`
      : detalhe
    : '—';
  const pdfUrl = getReportOrcamentoPdfUrl(report);
  const techPdfUrl = getReportTechnicalPdfUrl(report) || (job?.urlPdf ? String(job.urlPdf).trim() : '');
  const canApproveReport = !reportIsStandaloneOrcamento(report) && report.status === 'pending_review';
  const canCancelPedido = !meta?.enviadoEm;
  const canReviewReport = !reportIsStandaloneOrcamento(report);
  const highlighted = highlightReportId && report.id === highlightReportId;
  const clientName = client?.name || client?.Nome || '—';

  return `
    <tr class="rh-data-table-row orcamentos-row${highlighted ? ' orcamentos-row--highlight' : ''}" data-report-id="${escapeHtml(report.id)}">
      <td class="rh-cell-ordem"><code class="orcamentos-ordem rh-ordem-badge">${escapeHtml(formatOrdemLabel(job))}</code></td>
      <td class="rh-cell-client" title="${escapeHtml(clientName)}">
        <span class="rh-cell-client-name">${escapeHtml(clientName)}</span>
        <span class="orcamentos-row__sub">${escapeHtml(service?.label || report.serviceType || '—')}</span>
      </td>
      <td class="rh-cell-muted">${escapeHtml(reportStatusLabel(report))}</td>
      <td class="rh-cell-muted">
        <span class="orcamentos-status ${statusClass(workflow)}">${escapeHtml(statusLabel(workflow))}</span>
        ${meta?.numeroFormatado ? `<span class="orcamentos-numero">nº ${escapeHtml(meta.numeroFormatado)}</span>` : ''}
      </td>
      <td class="rh-cell-muted orcamentos-col-detalhe" title="${escapeHtml(detalhe)}">${escapeHtml(detalheShort)}</td>
      <td class="rh-cell-muted">${escapeHtml(tech?.name || '—')}</td>
      <td class="rh-col-action">
        <div class="rh-table-actions">
          ${
            canApproveReport
              ? `<button type="button" class="btn-success btn-sm rh-btn-compact" data-orc-approve-report="${escapeHtml(report.id)}" title="Aprovar e enviar o relatório técnico ao cliente">Aprovar</button>`
              : ''
          }
          <button type="button" class="btn-primary btn-sm rh-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="${workflow === 'por_preparar' ? 'Preparar proposta comercial' : 'Editar proposta'}">
            ${workflow === 'por_preparar' ? 'Preparar' : 'Editar'}
          </button>
          ${
            techPdfUrl && report.status === 'approved'
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-tech-pdf="${escapeHtml(techPdfUrl)}" title="Abrir PDF do relatório técnico">PDF</button>`
              : ''
          }
          ${
            canReviewReport
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-review="${escapeHtml(report.id)}" title="Rever relatório">Rever</button>`
              : ''
          }
          ${
            pdfUrl
              ? `<button type="button" class="btn-ghost btn-sm rh-btn-compact" data-orc-pdf="${escapeHtml(report.id)}" title="Abrir PDF da proposta">Prop.</button>`
              : ''
          }
          ${
            canCancelPedido
              ? `<button type="button" class="btn-danger btn-sm rh-btn-compact" data-orc-cancel="${escapeHtml(report.id)}" title="${reportIsStandaloneOrcamento(report) ? 'Eliminar proposta' : 'Eliminar pedido de orçamento'}">Eliminar</button>`
              : ''
          }
        </div>
      </td>
    </tr>`;
}

function renderPanel() {
  const all = listOrcamentoReports();
  const counts = countByWorkflow(all);
  const rows = filterOrcamentoReports(all);

  return `
    <div class="orcamentos-panel rh-admin-panel">
      <header class="orcamentos-header">
        <div class="orcamentos-header__top">
          <h2 class="orcamentos-title">Orçamentos / Propostas comerciais</h2>
          <button type="button" class="btn-primary btn-touch orcamentos-new-btn" data-orc-new>
            Nova proposta
          </button>
        </div>
        <p class="orcamentos-lead text-muted">
          Crie propostas comerciais do zero ou a partir de pedidos dos técnicos. O e-mail da proposta é enviado à parte do relatório de intervenção.
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
        <section class="orcamentos-table-section rh-admin-section">
        <div class="orcamentos-table-wrap">
          <table class="rh-data-table rh-data-table--compact orcamentos-table">
            <thead>
              <tr>
                <th>OP</th>
                <th>Cliente</th>
                <th>Relatório</th>
                <th>Proposta</th>
                <th>Pedido</th>
                <th>Técnico</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((report) => renderTableRow(report)).join('')}
            </tbody>
          </table>
        </div>
        </section>`
          : renderEmptyState(counts, all.length)
      }
    </div>`;
}

function bindPanelEvents() {
  if (!mountRoot || mountRoot.dataset.orcBound === '1') return;
  mountRoot.dataset.orcBound = '1';

  mountRoot.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-orc-filter]');
    if (filterBtn) {
      activeFilter = filterBtn.dataset.orcFilter || 'todas';
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

    const approveReportBtn = e.target.closest('[data-orc-approve-report]');
    if (approveReportBtn) {
      const reportId = approveReportBtn.dataset.orcApproveReport;
      if (!reportId) return;
      void import('../report-review-rh-modal.js').then(({ openRhReviewModal }) =>
        openRhReviewModal(reportId, {
          onApproved: () => refreshOrcamentosPanel().catch(console.error),
          onRejected: () => refreshOrcamentosPanel().catch(console.error),
        }),
      );
      return;
    }

    const techPdfBtn = e.target.closest('[data-orc-tech-pdf]');
    if (techPdfBtn) {
      const url = techPdfBtn.dataset.orcTechPdf;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else showToast('PDF do relatório técnico não disponível.', 'warning');
      return;
    }

    const cancelBtn = e.target.closest('[data-orc-cancel]');
    if (cancelBtn) {
      const reportId = cancelBtn.dataset.orcCancel;
      if (!reportId) return;
      const report = getReport(reportId);
      const client = report ? getClient(report.clientId) : null;
      const job = report?.jobId ? getJob(report.jobId) : null;
      const label = client?.name || client?.Nome || formatOrdemLabel(job) || 'este pedido';
      if (reportIsStandaloneOrcamento(report)) {
        void cancelPedidoOrcamentoReport(reportId).then((done) => {
          if (done) refreshOrcamentosPanel().catch(console.error);
        });
        return;
      }
      const ok = window.confirm(
        `Eliminar o pedido de orçamento de ${label}?\n\nO relatório técnico mantém-se. A proposta comercial por preparar será removida.`,
      );
      if (!ok) return;
      void cancelPedidoOrcamentoReport(reportId).then((done) => {
        if (done) refreshOrcamentosPanel().catch(console.error);
      });
      return;
    }

    const newBtn = e.target.closest('[data-orc-new]');
    if (newBtn) {
      openNovaPropostaModal({
        onCreated: (report) => {
          highlightReportId = report?.id || null;
          refreshOrcamentosPanel().catch(console.error);
        },
      });
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
  return listOrcamentoReports().filter(reportOrcamentoPorPreparar).length;
}
