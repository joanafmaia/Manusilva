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
import { getClientName } from '../client-display.js';
import { openOrcamentoModal } from '../orcamento-modal.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import {
  getPedidoOrcamentoDetalhe,
  getReportOrcamentoPdfUrl,
  getReportTechnicalPdfUrl,
  isRhOrcamentoQueueReport,
  openOrcamentoStorageUrl,
  reportIsStandaloneOrcamento,
  reportOrcamentoPorPreparar,
} from '../pedido-orcamento.js';
import {
  openNovaPropostaModal,
  reportOrcamentoQueueLabel,
} from '../orcamento-standalone.js';
import { getReportOrcamentoMeta } from '../orcamento-linhas.js';
import {
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  ORCAMENTO_TIPO_PROPOSTA_OPTIONS,
  resolveOrcamentoReferenceYear,
} from '../orcamento-tipo-proposta.js';
import { buildOrcamentoAuditSummary, downloadOrcamentoAuditCsv } from '../orcamento-audit.js';
import { dedupeReportsForDisplay } from '../relatorios-db.js';
import {
  orcamentoAguardaRespostaCliente,
  resolveOrcamentoWorkflowClass,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  setOrcamentoRespostaCliente,
} from '../orcamento-workflow.js';
import { ensureFolhasObraLoadedSafe } from '../folhas-obra-db.js';
import {
  bindFolhaObraRhSection,
  renderFolhaObraRhSection,
} from './folha-obra-rh.js';
import { reportIsFolhaObraOrcamento } from '../folha-obra-orcamento.js';
import { getSession } from '../session.js';

let mountRoot = null;
let activeFilter = 'todas';
let tipoFilter = 'all';
let searchQuery = '';
let exportYear = String(new Date().getFullYear());
let exportTipoFilter = 'all';
let exportEstadoFilter = 'all';
let highlightReportId = null;

const EXPORT_ESTADO_OPTIONS = [
  { value: 'all', label: 'Todos os estados' },
  { value: 'por_preparar', label: 'Por preparar' },
  { value: 'guardada', label: 'Guardadas' },
  { value: 'enviada', label: 'Enviadas (aguardam resposta)' },
  { value: 'aceite', label: 'Aceites' },
  { value: 'recusada', label: 'Recusadas' },
];

function listOrcamentoReports() {
  return dedupeReportsForDisplay(
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
    rows = rows.filter((report) => resolveOrcamentoWorkflowStatus(report) === activeFilter);
  }

  if (tipoFilter && tipoFilter !== 'all') {
    rows = rows.filter((report) => getOrcamentoTipoProposta(report) === tipoFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((report) => {
    const client = getClient(report.clientId);
    const values = report?.data?.values || {};
    const job = report.jobId ? getJob(report.jobId) : null;
    const clientName = getClientName(client, values).toLowerCase();
    const op = formatOrdemLabel(job).toLowerCase();
    const numero = String(getReportOrcamentoMeta(report)?.numeroFormatado || '').toLowerCase();
    const tipo = formatOrcamentoTipoPropostaLabel(getOrcamentoTipoProposta(report)).toLowerCase();
    return clientName.includes(q) || op.includes(q) || numero.includes(q) || tipo.includes(q);
  });
}

function countByWorkflow(reports) {
  return {
    por_preparar: reports.filter(reportOrcamentoPorPreparar).length,
    guardada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'guardada').length,
    enviada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'enviada').length,
    aceite: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'aceite').length,
    recusada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'recusada').length,
    todas: reports.length,
  };
}

function reportStatusLabel(report) {
  return reportOrcamentoQueueLabel(report);
}

function renderFilterHint(counts, total) {
  if (total <= 0) return '';

  const hints = [
    { id: 'por_preparar', label: 'por preparar', count: counts.por_preparar },
    { id: 'guardada', label: 'guardadas', count: counts.guardada },
    { id: 'enviada', label: 'enviadas (aguardam resposta)', count: counts.enviada },
    { id: 'aceite', label: 'aceites', count: counts.aceite },
    { id: 'recusada', label: 'recusadas', count: counts.recusada },
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

function renderMetrics(counts) {
  return `
    <section class="faturacao-kpis rh-section" aria-label="Indicadores de propostas">
      <div class="dashboard-metrics-grid faturacao-kpis-grid faturacao-kpis-grid--3">
        <article class="dashboard-metric-card dashboard-metric-card--warning">
          <p class="dashboard-metric-value">${counts.por_preparar}</p>
          <p class="dashboard-metric-label">Por preparar</p>
          <p class="faturacao-kpi-sub">Aguardam proposta comercial</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--primary">
          <p class="dashboard-metric-value">${counts.enviada}</p>
          <p class="dashboard-metric-label">Enviadas</p>
          <p class="faturacao-kpi-sub">Aguardam resposta do cliente</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--success">
          <p class="dashboard-metric-value">${counts.aceite}</p>
          <p class="dashboard-metric-label">Aceites</p>
          <p class="faturacao-kpi-sub">Prontas para faturação</p>
        </article>
      </div>
    </section>`;
}

function renderEstadoTabs(counts) {
  const chips = [
    { id: 'por_preparar', label: 'Por preparar', count: counts.por_preparar },
    { id: 'guardada', label: 'Guardadas', count: counts.guardada },
    { id: 'enviada', label: 'Enviadas', count: counts.enviada },
    { id: 'aceite', label: 'Aceites', count: counts.aceite },
    { id: 'recusada', label: 'Recusadas', count: counts.recusada },
    { id: 'todas', label: 'Todas', count: counts.todas },
  ];

  return `
    <div class="faturacao-invoices-tabs" role="tablist" aria-label="Filtrar propostas por estado">
      ${chips
        .map(
          ({ id, label, count }) => `
        <button
          type="button"
          class="faturacao-invoices-tab${activeFilter === id ? ' is-active' : ''}"
          data-orc-filter="${escapeHtml(id)}"
          role="tab"
          aria-selected="${activeFilter === id ? 'true' : 'false'}"
        >
          ${escapeHtml(label)} <span class="faturacao-invoices-tab-count">${count}</span>
        </button>`,
        )
        .join('')}
    </div>`;
}

function renderTableRow(report) {
  const client = getClient(report.clientId);
  const values = report?.data?.values || {};
  const job = report.jobId ? getJob(report.jobId) : null;
  const tech = getTechnician(report.technicianId);
  const service = getServiceType(report.serviceType);
  const workflow = resolveOrcamentoWorkflowStatus(report);
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
  const canEditProposal = !meta?.enviadoEm;
  const aguardaResposta = orcamentoAguardaRespostaCliente(report);
  const podeMarcarResposta = Boolean(meta?.enviadoEm);
  const highlighted = highlightReportId && report.id === highlightReportId;
  const clientName = getClientName(client, values) || '—';
  const tipoLabel = formatOrcamentoTipoPropostaLabel(getOrcamentoTipoProposta(report));

  return `
    <tr class="rh-data-table-row orcamentos-row${highlighted ? ' orcamentos-row--highlight faturacao-row--highlight' : ''}" data-report-id="${escapeHtml(report.id)}">
      <td class="faturacao-cell-ordem"><code class="orcamentos-ordem rh-ordem-badge faturacao-ordem">${escapeHtml(formatOrdemLabel(job))}</code></td>
      <td class="faturacao-cell-client" title="${escapeHtml(clientName)}">
        <span class="rh-cell-client-name">${escapeHtml(clientName)}</span>
        <span class="faturacao-cell-detail orcamentos-row__sub">${escapeHtml(service?.label || report.serviceType || '—')}</span>
      </td>
      <td class="rh-cell-muted">${escapeHtml(tipoLabel)}</td>
      <td class="rh-cell-muted">${escapeHtml(reportStatusLabel(report))}</td>
      <td class="rh-cell-muted">
        <span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span>
        ${meta?.numeroFormatado ? `<span class="orcamentos-numero">nº ${escapeHtml(meta.numeroFormatado)}</span>` : ''}
      </td>
      <td class="rh-cell-muted orcamentos-col-detalhe" title="${escapeHtml(detalhe)}">${escapeHtml(detalheShort)}</td>
      <td class="rh-cell-muted">${escapeHtml(tech?.name || '—')}</td>
      <td class="faturacao-col-action">
        <div class="faturacao-billing-actions rh-table-actions">
          ${
            canApproveReport
              ? `<button type="button" class="btn-success btn-sm rh-btn-compact" data-orc-approve-report="${escapeHtml(report.id)}" title="Aprovar e enviar o relatório técnico ao cliente">Aprovar</button>`
              : ''
          }
          ${
            canEditProposal
              ? `<button type="button" class="btn-primary btn-sm rh-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="${workflow === 'por_preparar' ? 'Preparar proposta comercial' : 'Editar proposta'}">
            ${workflow === 'por_preparar' ? 'Preparar' : 'Editar'}
          </button>`
              : ''
          }
          ${
            pdfUrl
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-pdf="${escapeHtml(report.id)}" title="Abrir PDF da proposta comercial">PDF</button>`
              : ''
          }
          ${
            techPdfUrl && report.status === 'approved'
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-tech-pdf="${escapeHtml(techPdfUrl)}" title="Abrir PDF do relatório técnico">Relatório</button>`
              : ''
          }
          ${
            aguardaResposta
              ? `<button type="button" class="btn-success btn-sm rh-btn-compact" data-orc-aceite="${escapeHtml(report.id)}" title="Cliente aceitou a proposta">Aceite</button>
                 <button type="button" class="btn-danger btn-sm rh-btn-compact" data-orc-recusada="${escapeHtml(report.id)}" title="Cliente recusou a proposta">Recusada</button>`
              : ''
          }
          ${
            podeMarcarResposta && !aguardaResposta && workflow !== 'aceite'
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-aceite="${escapeHtml(report.id)}" title="Marcar como aceite">Aceite</button>`
              : ''
          }
          ${
            podeMarcarResposta && !aguardaResposta && workflow !== 'recusada'
              ? `<button type="button" class="btn-outline btn-sm rh-btn-compact" data-orc-recusada="${escapeHtml(report.id)}" title="Marcar como recusada">Recusada</button>`
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

function resolveExportYearOptions(reports) {
  const years = new Set([Number(exportYear) || new Date().getFullYear()]);
  for (const report of reports) {
    const y = resolveOrcamentoReferenceYear(report);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

function renderTipoFilterSelect(id, value, label) {
  const options = [
    `<option value="all"${value === 'all' ? ' selected' : ''}>Todos os tipos</option>`,
    ...ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
      ({ value: v, label: l }) =>
        `<option value="${escapeHtml(v)}"${value === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
    ),
  ].join('');
  return `
    <div class="form-group faturacao-filter-group">
      <label class="form-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select class="form-select" id="${escapeHtml(id)}">${options}</select>
    </div>`;
}

function renderCompactFilterSelect(id, value, label, optionsHtml) {
  return `
    <label class="faturacao-audit-year-label">
      <span class="form-label">${escapeHtml(label)}</span>
      <select class="form-select-sm" id="${escapeHtml(id)}">${optionsHtml}</select>
    </label>`;
}

function renderFiltersSection(all) {
  const yearOptions = resolveExportYearOptions(all);
  const exportTipoOptions = [
    `<option value="all"${exportTipoFilter === 'all' ? ' selected' : ''}>Todos</option>`,
    ...ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
      ({ value: v, label: l }) =>
        `<option value="${escapeHtml(v)}"${exportTipoFilter === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
    ),
  ].join('');
  const exportEstadoOptions = EXPORT_ESTADO_OPTIONS.map(
    ({ value: v, label: l }) =>
      `<option value="${escapeHtml(v)}"${exportEstadoFilter === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
  ).join('');

  return `
    <section class="faturacao-filters orcamentos-filters rh-section glass-card" aria-label="Filtros de propostas">
      <div class="faturacao-filters-grid">
        <div class="form-group faturacao-filter-group orcamentos-filter-search">
          <label class="form-label" for="orcamentos-search">Pesquisar</label>
          <input
            type="search"
            class="form-input"
            id="orcamentos-search"
            placeholder="Cliente, OP, tipo ou nº orçamento…"
            value="${escapeHtml(searchQuery)}"
            autocomplete="off"
          />
        </div>
        ${renderTipoFilterSelect('orcamentos-tipo-filter', tipoFilter, 'Tipo de proposta')}
      </div>
      <div class="faturacao-filter-actions">
        ${renderCompactFilterSelect(
          'orcamentos-export-year',
          exportYear,
          'Ano (exportação)',
          yearOptions
            .map(
              (y) =>
                `<option value="${y}"${String(exportYear) === String(y) ? ' selected' : ''}>${y}</option>`,
            )
            .join(''),
        )}
        ${renderCompactFilterSelect('orcamentos-export-tipo', exportTipoFilter, 'Tipo (export.)', exportTipoOptions)}
        ${renderCompactFilterSelect(
          'orcamentos-export-estado',
          exportEstadoFilter,
          'Estado (export.)',
          exportEstadoOptions,
        )}
        <button type="button" class="btn-outline btn-sm" id="orcamentos-export-csv">
          Exportar Excel (CSV)
        </button>
        <button type="button" class="btn-outline btn-sm" id="orcamentos-export-pdf">
          Exportar PDF
        </button>
      </div>
    </section>`;
}

function renderPropostasSection(rows, counts, totalAll) {
  const body = rows.length
    ? `
      <div class="rh-table-scroll faturacao-table-wrap">
        <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact orcamentos-table">
          <thead>
            <tr>
              <th scope="col">OP</th>
              <th scope="col">Cliente</th>
              <th scope="col">Tipo</th>
              <th scope="col">Relatório</th>
              <th scope="col">Proposta</th>
              <th scope="col">Pedido</th>
              <th scope="col">Técnico</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((report) => renderTableRow(report)).join('')}
          </tbody>
        </table>
      </div>`
    : renderEmptyState(counts, totalAll);

  return `
    <section class="faturacao-invoices-section orcamentos-table-section rh-section glass-card" aria-label="Propostas comerciais">
      <div class="faturacao-invoices-head">
        <h3 class="ms-h2 faturacao-section-title">Propostas comerciais <span class="badge-count">${rows.length}</span></h3>
        ${renderEstadoTabs(counts)}
      </div>
      ${body}
    </section>`;
}

async function exportOrcamentoAuditPdf() {
  const all = listOrcamentoReports();
  const summary = buildOrcamentoAuditSummary(all, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });

  if (!summary.metrics.proposalCount) {
    showToast('Não há propostas guardadas para exportar com estes filtros.', 'info');
    return;
  }

  const btn = mountRoot?.querySelector('#orcamentos-export-pdf');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'A gerar PDF…';
  }

  try {
    const { generateOrcamentoAuditPdfBlob } = await import('../pdf-orcamento-audit.js');
    const { downloadPdfBlob } = await import('../pdf-preview.js');
    const { blob, filename } = await generateOrcamentoAuditPdfBlob({
      summary,
      rows: summary.rows,
      year: exportYear,
      tipoFilter: exportTipoFilter,
      estadoFilter: exportEstadoFilter,
    });
    downloadPdfBlob(blob, filename);
    showToast('PDF de propostas exportado.', 'success', 4000);
  } catch (err) {
    console.error('[Orçamentos] PDF anual:', err);
    showToast(err?.message || 'Não foi possível gerar o PDF.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Exportar PDF';
    }
  }
}

function exportOrcamentoAuditCsv() {
  const all = listOrcamentoReports();
  const summary = buildOrcamentoAuditSummary(all, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });

  if (!summary.metrics.proposalCount) {
    showToast('Não há propostas para exportar com estes filtros.', 'info');
    return;
  }

  downloadOrcamentoAuditCsv(summary.rows, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });
  showToast(
    `${summary.metrics.proposalCount} proposta(s) exportada(s) para Excel (CSV).`,
    'success',
    5000,
  );
}

function renderPanel() {
  const all = listOrcamentoReports();
  const counts = countByWorkflow(all);
  const rows = filterOrcamentoReports(all);

  return `
    <div class="orcamentos-panel faturacao-panel rh-admin-panel dashboard-panel-inner">
      ${renderFolhaObraRhSection()}
      <header class="faturacao-header orcamentos-header rh-section">
        <div class="orcamentos-header__top">
          <div>
            <h2 class="ms-h2">Orçamentos / Propostas comerciais</h2>
            <p class="text-muted faturacao-lead orcamentos-lead">
              Crie propostas comerciais do zero ou a partir de pedidos dos técnicos. O e-mail da proposta é enviado à parte do relatório de intervenção.
            </p>
          </div>
          <button type="button" class="btn-primary btn-touch orcamentos-new-btn" data-orc-new>
            Nova proposta
          </button>
        </div>
      </header>
      ${renderFiltersSection(all)}
      ${renderMetrics(counts)}
      ${renderPropostasSection(rows, counts, all.length)}
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
        onUpdated: async (updated) => {
          const { syncFolhaObraFromOrcamentoReport } = await import('../folha-obra-orcamento.js');
          await syncFolhaObraFromOrcamentoReport(updated);
          refreshOrcamentosPanel().catch(console.error);
        },
      });
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
      if (url) openOrcamentoStorageUrl(url);
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

    const aceiteBtn = e.target.closest('[data-orc-aceite]');
    if (aceiteBtn) {
      const reportId = aceiteBtn.dataset.orcAceite;
      if (!reportId) return;
      void setOrcamentoRespostaCliente(reportId, 'aceite')
        .then((saved) => {
          if (saved) {
            const msg = reportIsFolhaObraOrcamento(saved)
              ? 'Proposta aceite. Equipamento libertado para o Armazém.'
              : 'Proposta marcada como aceite. Adicionada à Faturação.';
            showToast(msg, 'success');
            refreshOrcamentosPanel().catch(console.error);
          }
        })
        .catch((err) => showToast(err?.message || 'Erro ao guardar.', 'error'));
      return;
    }

    const recusadaBtn = e.target.closest('[data-orc-recusada]');
    if (recusadaBtn) {
      const reportId = recusadaBtn.dataset.orcRecusada;
      if (!reportId) return;
      void setOrcamentoRespostaCliente(reportId, 'recusada')
        .then((saved) => {
          if (saved) {
            showToast('Proposta marcada como recusada.', 'info');
            refreshOrcamentosPanel().catch(console.error);
          }
        })
        .catch((err) => showToast(err?.message || 'Erro ao guardar.', 'error'));
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
      return;
    }

    const exportBtn = e.target.closest('#orcamentos-export-pdf');
    if (exportBtn) {
      void exportOrcamentoAuditPdf();
      return;
    }

    const exportCsvBtn = e.target.closest('#orcamentos-export-csv');
    if (exportCsvBtn) {
      exportOrcamentoAuditCsv();
    }
  });

  mountRoot.addEventListener('input', (e) => {
    if (e.target.id !== 'orcamentos-search') return;
    searchQuery = e.target.value || '';
    refreshOrcamentosPanel().catch(console.error);
  });

  mountRoot.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'orcamentos-tipo-filter') {
      tipoFilter = target.value || 'all';
      refreshOrcamentosPanel().catch(console.error);
      return;
    }
    if (target.id === 'orcamentos-export-year') {
      exportYear = target.value || String(new Date().getFullYear());
      refreshOrcamentosPanel().catch(console.error);
      return;
    }
    if (target.id === 'orcamentos-export-tipo') {
      exportTipoFilter = target.value || 'all';
      refreshOrcamentosPanel().catch(console.error);
      return;
    }
    if (target.id === 'orcamentos-export-estado') {
      exportEstadoFilter = target.value || 'all';
      refreshOrcamentosPanel().catch(console.error);
    }
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

export async function initOrcamentosPanel(root) {
  mountRoot = root;
  bindPanelEvents();
  await ensureFolhasObraLoadedSafe(true);
  bindFolhaObraRhSection(root, {
    session: getSession(),
    onRefresh: () => refreshOrcamentosPanel().catch(console.error),
  });
  return refreshOrcamentosPanel();
}

export function countOrcamentosPorPreparar() {
  return listOrcamentoReports().filter(reportOrcamentoPorPreparar).length;
}
