/**
 * Painel de Faturação — contas a receber e fluxo de caixa (controlo interno).
 */

import {
  getReportsSnapshot,
  getReport,
  getClient,
  getJob,
  registerReportInvoice,
  confirmInvoicePayment,
  openModal,
  closeModal,
  escapeHtml,
  formatDate,
  showToast,
} from '../app.js';
import { dedupeReportsForDisplay } from '../relatorios-db.js';
import { getInvoicedServicos, getServico } from '../servicos-db.js';
import {
  confirmManualInvoicePayment,
  deleteManualInvoice,
  ensureFaturasManuaisLoadedSafe,
  getManualInvoice,
  getManualInvoicesSnapshot,
  registerManualInvoice,
} from '../faturas-manuais-db.js';
import { getServiceType } from '../entity-lookups.js';
import { getApprovedReportsForServico } from '../servicos-panel-utils.js';
import {
  getPendingBillingItems,
  registerServicoInvoice,
  confirmServicoInvoicePayment,
  revertServicoInvoice,
  resolveBillingFocusTarget,
} from '../servicos-billing-workflow.js';
import {
  isServicoReportBillable,
  resolveBillingReportPdfEntries,
  resolvePrimaryBillingReportId,
  revertReportInvoice,
} from '../billing-workflow.js';
import { isPendingOrcamentoBilling } from '../orcamento-billing-workflow.js';
import { getReportOrcamentoMeta } from '../orcamento-linhas.js';
import { getReportOrcamentoPdfUrl } from '../pedido-orcamento.js';
import { renderClientCombobox, bindClientComboboxes } from '../client-combobox.js';
import { formatOrdemLabel, formatOpLabel } from '../report-review-ui.js';
import { reportIsStandaloneOrcamento } from '../orcamento-standalone.js';
import { resolveOrcamentoBillingTotal } from '../orcamento-billing-workflow.js';
import { STATUS_RECEBIMENTO_OPCOES, labelStatusRecebimento } from '../billing-constants.js';

const URGENT_DAYS = 3;
const DEFAULT_ESTIMATE_EUR = 120;

const VENCIMENTO_ALERT_DAYS = 7;

const ESTIMATE_EUR_BY_SERVICE = {
  folha_intervencao_avarias: 95,
  manutencao_preventiva_empilhadores: 145,
  manutencao_preventiva_bateria: 85,
  manutencao_corretiva_maquinas: 130,
  reparacao_carregador: 110,
  reparacao_avarias_bateria: 100,
  inspecao_dl50_2005: 75,
  manutencao_baterias_grandes: 160,
};

let mountRoot = null;
let billingChart = null;
let chartJsPromise = null;

/** Filtros dinâmicos do painel — período + cliente (KPIs, gráfico e histórico). */
const billingFilters = {
  period: 'all',
  from: '',
  to: '',
  clientId: '',
  clientNome: '',
  recebimentoStatus: 'all',
};

let highlightReportId = null;
let highlightServicoId = null;

async function openBillingReportPdf(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  const entries = resolveBillingReportPdfEntries(report);
  if (entries.length) {
    window.open(entries[0].url, '_blank', 'noopener,noreferrer');
    if (entries.length > 1) {
      showToast(`Este trabalho tem ${entries.length} PDFs — aberto o primeiro.`, 'info', 5000);
    }
    return;
  }

  try {
    const { previewReportPDF } = await import('../pdf-preview.js');
    showToast('A gerar PDF do relatório…', 'info', 2500);
    await previewReportPDF(report);
  } catch (err) {
    console.error('[Faturação] PDF:', err);
    showToast('Não foi possível abrir o PDF do relatório.', 'error');
  }
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-chartjs]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Chart));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.dataset.chartjs = 'true';
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error('Não foi possível carregar Chart.js'));
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}

function daysSince(isoDate) {
  if (!isoDate) return 0;
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const due = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** @returns {'none' | 'ok' | 'soon' | 'overdue'} */
function vencimentoUrgency(isoDate) {
  const days = daysUntil(isoDate);
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= VENCIMENTO_ALERT_DAYS) return 'soon';
  return 'ok';
}

function vencimentoCellClass(urgency) {
  if (urgency === 'overdue' || urgency === 'soon') return 'faturacao-vencimento--alert';
  return '';
}

export function isBillingUrgent(report) {
  if (!report?.approvedAt) return false;
  return daysSince(report.approvedAt) > URGENT_DAYS;
}

export function estimateReportValue(report) {
  if (!report) return DEFAULT_ESTIMATE_EUR;
  if (isPendingOrcamentoBilling(report)) {
    const orcamentoTotal = resolveOrcamentoBillingTotal(report);
    if (orcamentoTotal > 0) return orcamentoTotal;
  }
  const fromData = Number(report.data?.values?.valor_total ?? report.data?.values?.valor);
  if (Number.isFinite(fromData) && fromData > 0) return fromData;
  return ESTIMATE_EUR_BY_SERVICE[report.serviceType] ?? DEFAULT_ESTIMATE_EUR;
}

function formatCurrencyEur(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatCurrencyEurNullable(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return formatCurrencyEur(num);
}

/** Data legível a partir de timestamps ISO completos ou datas puras. */
function formatDateSafe(iso) {
  const pure = String(iso || '').split('T')[0];
  if (!pure) return '—';
  const label = formatDate(pure);
  return /invalid/i.test(label) ? '—' : label;
}

/* ─── Filtros de período e cliente ─── */

function toLocalIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPeriodRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (billingFilters.period) {
    case 'this_month':
      return { from: toLocalIsoDate(new Date(y, m, 1)), to: toLocalIsoDate(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: toLocalIsoDate(new Date(y, m - 1, 1)), to: toLocalIsoDate(new Date(y, m, 0)) };
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom':
      return { from: billingFilters.from || '', to: billingFilters.to || '' };
    default:
      return { from: '', to: '' };
  }
}

/** Data de referência da fatura (emissão; fallback aprovação). */
function invoiceDateOf(report) {
  return String(report.dataFatura || report.approvedAt || '').split('T')[0];
}

/** Data do relatório técnico (aprovação; fallback submissão). */
function reportDateOf(report) {
  return String(report?.approvedAt || report?.submittedAt || '').split('T')[0];
}

/** Todas as faturas registadas — relatórios legados + visitas (serviços). */
function getInvoicedReports() {
  return dedupeReportsForDisplay(
    getReportsSnapshot().filter((r) => r.faturacaoStatus === 'faturado' && !r.servicoId),
  );
}

function getAllInvoicedEntities() {
  const reports = getInvoicedReports().map((report) => ({ kind: 'report', entity: report }));
  const servicos = getInvoicedServicos().map((servico) => ({ kind: 'servico', entity: servico }));
  const manuais = getManualInvoicesSnapshot().map((invoice) => ({ kind: 'manual', entity: invoice }));
  return [...reports, ...servicos, ...manuais];
}

function invoiceDateOfEntity(item) {
  if (item.kind === 'servico' || item.kind === 'manual') {
    return String(item.entity.dataFatura || item.entity.approvedAt || '').split('T')[0];
  }
  return invoiceDateOf(item.entity);
}

function invoiceMatchesFilters(item) {
  const { from, to } = getPeriodRange();
  const date = invoiceDateOfEntity(item);
  if (from && (!date || date < from)) return false;
  if (to && (!date || date > to)) return false;
  const clientId = item.entity.clientId;
  if (billingFilters.clientId && String(clientId) !== String(billingFilters.clientId)) {
    return false;
  }
  if (billingFilters.recebimentoStatus === 'pendente' && item.entity.statusRecebimento !== 'pendente') {
    return false;
  }
  if (billingFilters.recebimentoStatus === 'pago' && item.entity.statusRecebimento !== 'pago') {
    return false;
  }
  return true;
}

/** Faturas dentro dos filtros ativos — mais recentes primeiro. */
function getFilteredInvoices() {
  return getAllInvoicedEntities()
    .filter(invoiceMatchesFilters)
    .sort((a, b) => invoiceDateOfEntity(b).localeCompare(invoiceDateOfEntity(a)));
}

/** KPIs calculados sobre as faturas filtradas. */
function computeFilteredMetrics(invoices = getFilteredInvoices()) {
  let totalFaturado = 0;
  let totalRecebido = 0;
  let totalDivida = 0;

  invoices.forEach((item) => {
    const valor = Number(item.entity.valorFaturado);
    if (!Number.isFinite(valor) || valor <= 0) return;
    totalFaturado += valor;
    if (item.entity.statusRecebimento === 'pago') totalRecebido += valor;
    else if (item.entity.statusRecebimento === 'pendente') totalDivida += valor;
  });

  return { totalFaturado, totalRecebido, totalDivida };
}

function resolveClientMeta(clientId) {
  const client = getClient(clientId);
  const nome = client?.name || client?.Nome || client?.nome || '—';
  const nif = client?.NIF || client?.nif || '—';
  return { client, nome, nif };
}

function formatOrcamentoOrdemLabel(report) {
  const meta = getReportOrcamentoMeta(report);
  return meta?.numeroFormatado ? `Proposta nº ${meta.numeroFormatado}` : 'Proposta MS.015';
}

function formatServicoOrdemLabel(servico, reports = []) {
  const ops = [
    ...new Set(
      (reports || [])
        .map((r) => {
          if (!r?.jobId) return null;
          const job = getJob(r.jobId);
          return job?.numeroOrdem != null ? Number(job.numeroOrdem) : null;
        })
        .filter((n) => n != null),
    ),
  ];
  const labels = ops
    .sort((a, b) => a - b)
    .map((n) => formatOpLabel(n))
    .filter(Boolean);
  if (labels.length === 1) return labels[0];
  if (labels.length > 1) return labels.join(', ');
  const servicoOp = formatOpLabel(servico?.numeroOrdem);
  if (servicoOp) return servicoOp;
  return formatDateSafe(servico?.date);
}

function formatServicoReportsLabel(reports = []) {
  if (!reports.length) return 'Sem relatórios';
  if (reports.length === 1) {
    const r = reports[0];
    return getServiceType(r.serviceType)?.label || r.serviceType || 'Relatório';
  }
  return `${reports.length} relatórios`;
}

function servicoLatestApproval(reports = []) {
  const dates = reports
    .map((r) => String(r.approvedAt || '').split('T')[0])
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || '';
}

function estimateServicoValue(reports = []) {
  return reports.reduce((sum, report) => sum + estimateReportValue(report), 0);
}

function buildBillingRowsFromItems(items) {
  return items.map((item) => {
    if (item.kind === 'servico') {
      const { servico, reports } = item;
      const billableReports = reports.filter((r) => isServicoReportBillable(r));
      const billingReports = billableReports.length ? billableReports : reports;
      const meta = resolveClientMeta(servico.clientId);
      const latestApproval = servicoLatestApproval(billingReports);
      const urgentReport =
        billingReports.find((r) => isBillingUrgent(r)) || billingReports[0];
      return {
        kind: 'servico',
        servico,
        reports: billingReports,
        ...meta,
        ordem: formatServicoOrdemLabel(servico, billingReports),
        detail: formatServicoReportsLabel(billingReports),
        approvedLabel: formatHistoryDate(latestApproval),
        urgent: urgentReport ? isBillingUrgent(urgentReport) : false,
        estimate: estimateServicoValue(billingReports),
        primaryReportId: resolvePrimaryBillingReportId(billingReports),
      };
    }

    if (item.kind === 'orcamento') {
      const report = item.report;
      const meta = resolveClientMeta(report.clientId);
      const orcamentoMeta = getReportOrcamentoMeta(report);
      const aceiteEm = orcamentoMeta?.respostaClienteEm || report.approvedAt || '';
      return {
        kind: 'orcamento',
        report,
        ...meta,
        ordem: formatOrcamentoOrdemLabel(report),
        detail: 'Proposta comercial MS.015',
        approvedLabel: formatHistoryDate(String(aceiteEm).split('T')[0]),
        urgent: isBillingUrgent(report),
        estimate: resolveOrcamentoBillingTotal(report),
        pdfEntries: resolveBillingReportPdfEntries(report),
        hasPdf: Boolean(getReportOrcamentoPdfUrl(report)),
        primaryReportId: String(report.id),
        pdfTitle: 'Abrir PDF da proposta MS.015',
      };
    }

    const report = item.report;
    const meta = resolveClientMeta(report.clientId);
    const job = report.jobId ? getJob(report.jobId) : null;
    const pdfEntries = resolveBillingReportPdfEntries(report);
    const ordem = formatOrdemLabel(job);
    const detail = getServiceType(report.serviceType)?.label || report.serviceType || 'Relatório';
    return {
      kind: 'report',
      report,
      ...meta,
      ordem,
      detail,
      approvedLabel: formatHistoryDate(String(report.approvedAt || '').split('T')[0]),
      urgent: isBillingUrgent(report),
      estimate: estimateReportValue(report),
      pdfEntries,
      hasPdf: pdfEntries.length > 0,
      primaryReportId: report.id,
      pdfTitle: 'Abrir PDF do relatório técnico',
    };
  });
}

function buildBillingRows(reports) {
  return buildBillingRowsFromItems(
    reports.map((report) => ({ kind: 'report', id: String(report.id), report })),
  );
}

function buildInvoiceRows(items) {
  return items.map((item) => {
    const entity = item.entity;
    const meta = resolveClientMeta(entity.clientId);
    const valor = Number(entity.valorFaturado);
    const pago = entity.statusRecebimento === 'pago';
    const vencimento = entity.dataVencimento || null;
    const vencimentoUrg = pago ? 'none' : vencimentoUrgency(vencimento);
    const trabalho = resolveInvoiceTrabalhoLabel(item);
    return {
      kind: item.kind,
      entity,
      report: item.kind === 'report' ? entity : null,
      servico: item.kind === 'servico' ? entity : null,
      ...meta,
      ...trabalho,
      pago,
      numeroFatura: entity.numeroFatura || '—',
      valor,
      valorLabel: formatCurrencyEurNullable(valor),
      emissaoLabel: formatHistoryDate(String(entity.dataFatura || '').split('T')[0]),
      statusLabel: labelStatusRecebimento(entity.statusRecebimento),
      vencimentoLabel: pago
        ? '—'
        : formatHistoryDate(String(vencimento || '').split('T')[0]),
      vencimentoClass: vencimentoCellClass(vencimentoUrg),
      vencimentoUrg,
    };
  });
}

/** Coluna «Visita / Relatório» — OP + tipo (ou texto livre nas manuais). */
function resolveInvoiceTrabalhoLabel(item) {
  const entity = item.entity;
  if (item.kind === 'manual') {
    const detail = String(entity.descricao || '').trim();
    return {
      ordem: 'Manual',
      detail: detail || 'Fatura avulsa',
    };
  }
  if (item.kind === 'servico') {
    const reports = getApprovedReportsForServico(entity.id);
    return {
      ordem: formatServicoOrdemLabel(entity, reports),
      detail: formatServicoReportsLabel(reports),
    };
  }
  if (item.kind === 'report' && reportIsStandaloneOrcamento(entity)) {
    return {
      ordem: formatOrcamentoOrdemLabel(entity),
      detail: 'Proposta comercial MS.015',
    };
  }
  const job = entity.jobId ? getJob(entity.jobId) : null;
  const ordem = formatOrdemLabel(job);
  const detail = getServiceType(entity.serviceType)?.label || entity.serviceType || 'Relatório';
  return { ordem, detail };
}

function resolveInvoiceTipoLabel(item) {
  if (item.kind === 'manual') return 'Manual';
  if (item.kind === 'servico') return 'Visita';
  if (item.kind === 'report' && reportIsStandaloneOrcamento(item.entity)) return 'Proposta';
  if (item.kind === 'report') return 'Relatório';
  return '—';
}

/** Pendentes primeiro (vencimento mais antigo); recebidas por data de emissão. */
function sortInvoiceRowsForDisplay(rows) {
  return [...rows].sort((a, b) => {
    if (a.pago !== b.pago) return a.pago ? 1 : -1;
    if (!a.pago) {
      const va = String(a.entity.dataVencimento || a.entity.dataFatura || '');
      const vb = String(b.entity.dataVencimento || b.entity.dataFatura || '');
      return va.localeCompare(vb);
    }
    return invoiceDateOfEntity({ kind: a.kind, entity: a.entity }).localeCompare(
      invoiceDateOfEntity({ kind: b.kind, entity: b.entity }),
    );
  });
}

function renderKpis(metrics) {
  return `
    <section class="faturacao-kpis rh-section" aria-label="Indicadores financeiros">
      <div class="dashboard-metrics-grid faturacao-kpis-grid faturacao-kpis-grid--3">
        <article class="dashboard-metric-card dashboard-metric-card--primary">
          <p class="dashboard-metric-value">${formatCurrencyEur(metrics.totalFaturado)}</p>
          <p class="dashboard-metric-label">Total Faturado Global</p>
          <p class="faturacao-kpi-sub">Receita emitida (pagas + pendentes)</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--success">
          <p class="dashboard-metric-value">${formatCurrencyEur(metrics.totalRecebido)}</p>
          <p class="dashboard-metric-label">Total Recebido</p>
          <p class="faturacao-kpi-sub">Dinheiro já em caixa</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--warning">
          <p class="dashboard-metric-value">${formatCurrencyEur(metrics.totalDivida)}</p>
          <p class="dashboard-metric-label">Total em Dívida (Na Rua)</p>
          <p class="faturacao-kpi-sub">Faturado e ainda por receber</p>
        </article>
      </div>
    </section>
  `;
}

function renderFiltersSection() {
  const isCustom = billingFilters.period === 'custom';
  const year = new Date().getFullYear();
  const opt = (value, label) =>
    `<option value="${value}"${billingFilters.period === value ? ' selected' : ''}>${label}</option>`;
  const statusOpt = (value, label) =>
    `<option value="${value}"${billingFilters.recebimentoStatus === value ? ' selected' : ''}>${label}</option>`;

  return `
    <section class="faturacao-filters rh-section glass-card" aria-label="Filtros do controlo de faturação">
      <div class="faturacao-filters-grid">
        <div class="form-group faturacao-filter-group">
          <label class="form-label" for="faturacao-period">Período</label>
          <select class="form-select" id="faturacao-period">
            ${opt('all', 'Tudo')}
            ${opt('this_month', 'Este Mês')}
            ${opt('last_month', 'Mês Passado')}
            ${opt('year', `Ano de ${year}`)}
            ${opt('custom', 'Intervalo Personalizado')}
          </select>
        </div>
        <div class="form-group faturacao-filter-group">
          <label class="form-label" for="faturacao-recebimento">Estado</label>
          <select class="form-select" id="faturacao-recebimento">
            ${statusOpt('all', 'Todos')}
            ${statusOpt('pendente', 'Pendentes de pagamento')}
            ${statusOpt('pago', 'Recebidos')}
          </select>
        </div>
        <div class="faturacao-filter-custom"${isCustom ? '' : ' hidden'}>
          <div class="form-group faturacao-filter-group">
            <label class="form-label" for="faturacao-from">De</label>
            <input type="date" class="form-input" id="faturacao-from" value="${escapeHtml(billingFilters.from)}">
          </div>
          <div class="form-group faturacao-filter-group">
            <label class="form-label" for="faturacao-to">Até</label>
            <input type="date" class="form-input" id="faturacao-to" value="${escapeHtml(billingFilters.to)}">
          </div>
        </div>
        <div class="faturacao-filter-client">
          ${renderClientCombobox({
            fieldId: 'faturacao-client',
            label: 'Cliente',
            value: billingFilters.clientNome,
            selectedId: billingFilters.clientId,
            compact: true,
          })}
        </div>
      </div>
      <div class="faturacao-filter-actions">
        <button type="button" class="btn-primary btn-sm" id="faturacao-manual-invoice">
          Registar fatura manual
        </button>
        <button type="button" class="btn-outline btn-sm" id="faturacao-export-csv">
          Exportar CSV
        </button>
      </div>
    </section>
  `;
}

/* ─── Faturas emitidas (pendentes + histórico) ─── */

/** dd/mm/aaaa — o histórico pode abranger vários anos. */
function formatHistoryDate(isoDate) {
  const [y, m, d] = String(isoDate || '').split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function renderInvoiceRow(row, acumulado, showAcum) {
  const {
    entity,
    nome,
    pago,
    numeroFatura,
    ordem,
    detail,
    valorLabel,
    emissaoLabel,
    vencimentoLabel,
    vencimentoClass,
    vencimentoUrg,
    kind,
  } = row;
  const urgentRow = !pago && vencimentoUrg === 'overdue';
  const detailId = entity.id;
  const detailAttr =
    kind === 'servico'
      ? `data-history-detail-servico="${escapeHtml(detailId)}"`
      : kind === 'manual'
        ? `data-history-detail-manual="${escapeHtml(detailId)}"`
        : `data-history-detail="${escapeHtml(detailId)}"`;
  const pdfReportId = resolveHistoryPdfReportId(kind, detailId);
  const pdfBtn = pdfReportId
    ? `<button type="button" class="btn-outline btn-sm faturacao-btn-compact" data-history-pdf="${escapeHtml(pdfReportId)}" title="Abrir PDF do relatório ou proposta">PDF</button>`
    : '';
  const paymentAttr =
    kind === 'servico'
      ? `data-confirm-payment-servico="${escapeHtml(detailId)}"`
      : kind === 'manual'
        ? `data-confirm-payment-manual="${escapeHtml(detailId)}"`
        : `data-confirm-payment="${escapeHtml(detailId)}"`;
  const kindBadge = kind === 'servico' ? ' <span class="faturacao-visit-badge">Visita</span>' : '';

  return `
    <tr class="rh-data-table-row faturacao-history-row faturacao-invoice-row${urgentRow ? ' faturacao-row--urgent' : ''}" data-invoice-kind="${kind}" data-invoice-id="${escapeHtml(detailId)}">
      <td class="rh-cell-date faturacao-cell-date">${escapeHtml(emissaoLabel)}</td>
      <td class="rh-cell-client faturacao-cell-client faturacao-cell-client--wrap">
        <button type="button" class="rh-cell-link-btn faturacao-history-client-btn faturacao-cell-client-name" ${detailAttr} title="Ver detalhe da fatura (NIF, condição de pagamento, datas)">
          ${escapeHtml(nome)}${kindBadge}
        </button>
        ${vencimentoUrg === 'soon' ? ' <span class="faturacao-urgent-badge faturacao-urgent-badge--soon">A vencer</span>' : ''}
      </td>
      <td class="faturacao-cell-ordem">
        <code class="faturacao-ordem">${escapeHtml(ordem)}</code>
        <span class="faturacao-cell-detail">${escapeHtml(detail)}</span>
      </td>
      <td class="rh-cell-ordem faturacao-cell-ordem"><code class="rh-ordem-badge faturacao-ordem">${escapeHtml(numeroFatura)}</code></td>
      <td class="rh-cell-valor faturacao-col-valor">${escapeHtml(valorLabel)}</td>
      <td class="faturacao-cell-date ${escapeHtml(vencimentoClass)}">${escapeHtml(vencimentoLabel)}</td>
      ${
        showAcum
          ? `<td class="rh-cell-muted faturacao-history-acum" title="Acumulado do cliente até esta fatura">${acumulado != null ? `Σ ${escapeHtml(formatCurrencyEur(acumulado))}` : '—'}</td>`
          : ''
      }
      <td>
        <span class="faturacao-history-estado ${pago ? 'is-pago' : 'is-pendente'}">${pago ? 'Pago' : 'Pendente'}</span>
      </td>
      <td class="faturacao-col-action">
        ${
          kind === 'manual'
            ? `<div class="faturacao-billing-actions">
                ${pdfBtn}
                ${
                  pago
                    ? ''
                    : `<button type="button" class="btn-success btn-sm faturacao-btn-compact" ${paymentAttr} title="Confirmar recebimento">Recebido</button>`
                }
                <button type="button" class="btn-danger btn-sm faturacao-btn-compact" data-delete-manual-invoice="${escapeHtml(detailId)}" title="Eliminar registo da fatura">Eliminar</button>
              </div>`
            : pago
              ? `<div class="faturacao-billing-actions">${pdfBtn || '<span class="text-muted">—</span>'}</div>`
              : `<div class="faturacao-billing-actions">
                  ${pdfBtn}
                  <button type="button" class="btn-success btn-sm faturacao-btn-compact" ${paymentAttr} title="Confirmar recebimento">Recebido</button>
                  ${
                    kind === 'servico'
                      ? `<button type="button" class="btn-secondary btn-sm faturacao-btn-compact" data-revert-invoice-servico="${escapeHtml(detailId)}" title="Voltar à lista por faturar para corrigir">Corrigir</button>`
                      : `<button type="button" class="btn-secondary btn-sm faturacao-btn-compact" data-revert-invoice-report="${escapeHtml(detailId)}" title="Voltar à lista por faturar para corrigir">Corrigir</button>`
                  }
                </div>`
        }
      </td>
    </tr>
  `;
}

function renderInvoicesSection(invoices = getFilteredInvoices()) {
  const clientActive = Boolean(billingFilters.clientId);
  const invoiceRows = sortInvoiceRowsForDisplay(buildInvoiceRows(invoices));
  const pendingCount = invoiceRows.filter((row) => !row.pago).length;

  let rowsHtml = '<p class="text-muted faturacao-empty">Sem faturas emitidas nos filtros selecionados.</p>';
  let cumulativeByReport = null;

  if (invoiceRows.length) {
    if (clientActive) {
      cumulativeByReport = new Map();
      let running = 0;
      [...invoices]
        .sort((a, b) => invoiceDateOfEntity(a).localeCompare(invoiceDateOfEntity(b)))
        .forEach((item) => {
          running += Number(item.entity.valorFaturado) || 0;
          const key = `${item.kind}:${item.entity.id}`;
          cumulativeByReport.set(key, running);
        });
    }

    rowsHtml = `
      <div class="faturacao-table-wrap rh-table-scroll">
        <table class="rh-data-table rh-data-table--compact faturacao-history-table faturacao-table faturacao-table--compact faturacao-table--invoices">
          <thead>
            <tr>
              <th scope="col">Emissão</th>
              <th scope="col">Cliente</th>
              <th scope="col">Visita / Relatório</th>
              <th scope="col">Fatura</th>
              <th scope="col">Valor</th>
              <th scope="col">Vencimento</th>
              ${clientActive ? '<th scope="col">Acumulado</th>' : ''}
              <th scope="col">Estado</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${invoiceRows
              .map((row) =>
                renderInvoiceRow(
                  row,
                  cumulativeByReport ? cumulativeByReport.get(`${row.kind}:${row.entity.id}`) : null,
                  clientActive,
                ),
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const total = invoices.reduce((sum, item) => sum + (Number(item.entity.valorFaturado) || 0), 0);
  const rendaTotal =
    clientActive && invoices.length
      ? `<p class="faturacao-history-total">Renda Total — ${escapeHtml(billingFilters.clientNome || 'cliente selecionado')}: <strong>${escapeHtml(formatCurrencyEur(total))}</strong></p>`
      : '';
  const pendingHint =
    pendingCount > 0
      ? `<p class="text-muted faturacao-invoices-lead">${pendingCount === 1 ? '1 fatura por receber' : `${pendingCount} faturas por receber`} — use «Recebido» quando o pagamento entrar.</p>`
      : '';

  return `
    <section class="faturacao-invoices-section rh-section glass-card" aria-label="Faturas emitidas">
      <h3 class="ms-h2 faturacao-section-title">Faturas emitidas <span class="badge-count">${invoices.length}</span></h3>
      ${pendingHint}
      ${rendaTotal}
      ${rowsHtml}
    </section>
  `;
}

function renderChartSection() {
  return `
    <section class="faturacao-chart-section rh-section glass-card" aria-label="Gráfico de fluxo de caixa">
      <h3 class="ms-h2 faturacao-section-title">Fluxo de caixa</h3>
      <div class="faturacao-chart-wrap">
        <canvas id="faturacao-chart-canvas" aria-label="Gráfico — total faturado, recebido e em dívida"></canvas>
      </div>
    </section>
  `;
}

function renderBillingTable(rows) {
  if (!rows.length) {
    return `
      <section class="faturacao-table-section faturacao-table-section--billing rh-section glass-card">
        <h3 class="ms-h2 faturacao-section-title">Por faturar</h3>
        <p class="text-muted faturacao-empty">Nenhuma visita ou relatório aprovado aguarda faturação.</p>
      </section>
    `;
  }

  return `
    <section class="faturacao-table-section faturacao-table-section--billing rh-section glass-card">
      <h3 class="ms-h2 faturacao-section-title">Por faturar <span class="badge-count">${rows.length}</span></h3>
      <div class="rh-table-scroll">
        <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact faturacao-billing-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Visita / Relatório</th>
              <th scope="col">Aprovação</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const isServico = row.kind === 'servico';
                const reportId = isServico ? '' : String(row.report?.id || row.primaryReportId || '');
                const rowIdAttr = isServico
                  ? `data-servico-id="${escapeHtml(row.servico.id)}"`
                  : `data-report-id="${escapeHtml(reportId)}"`;
                const pdfId = row.primaryReportId;
                const pdfTitle = row.pdfTitle || 'Abrir PDF do relatório técnico';
                const registerAttr = isServico
                  ? `data-register-invoice-servico="${escapeHtml(row.servico.id)}"`
                  : `data-register-invoice="${escapeHtml(reportId)}"`;
                const kindBadge =
                  row.kind === 'orcamento'
                    ? ' <span class="faturacao-visit-badge">Proposta</span>'
                    : '';
                return `
              <tr class="rh-data-table-row${row.urgent ? ' faturacao-row--urgent' : ''}" ${rowIdAttr}>
                <td class="faturacao-cell-client" title="${escapeHtml(row.nome)}">${escapeHtml(row.nome)}${kindBadge}${row.urgent ? ' <span class="faturacao-urgent-badge">Urgente</span>' : ''}</td>
                <td class="faturacao-cell-ordem">
                  <code class="faturacao-ordem">${escapeHtml(row.ordem)}</code>
                  <span class="faturacao-cell-detail">${escapeHtml(row.detail)}</span>
                </td>
                <td class="faturacao-cell-date">${escapeHtml(row.approvedLabel)}</td>
                <td class="faturacao-col-action">
                  <div class="faturacao-billing-actions">
                    ${pdfId ? `<button type="button" class="btn-outline btn-sm faturacao-btn-compact" data-billing-pdf="${escapeHtml(pdfId)}" title="${escapeHtml(pdfTitle)}">PDF</button>` : ''}
                    <button type="button" class="btn-primary btn-sm faturacao-btn-compact" ${registerAttr} title="Marcar como faturado">Faturar</button>
                  </div>
                </td>
              </tr>
            `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function getChartThemeColors() {
  const styles = getComputedStyle(document.body);
  return {
    primary: styles.getPropertyValue('--ms-primary').trim() || '#1e4d72',
    success: styles.getPropertyValue('--ms-emerald-600').trim() || '#059669',
    warning: styles.getPropertyValue('--ms-amber-600').trim() || '#d97706',
    gridColor: styles.getPropertyValue('--ms-border').trim() || 'rgba(148,163,184,0.25)',
    textColor: styles.getPropertyValue('--ms-text-muted').trim() || '#64748b',
  };
}

function buildChartOptions(textColor, gridColor) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => formatCurrencyEur(ctx.parsed.y),
        },
      },
    },
    scales: {
      x: {
        ticks: { color: textColor, maxRotation: 0 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
          callback: (v) => formatCurrencyEur(v),
        },
        grid: { color: gridColor },
      },
    },
  };
}

function financialChartDataset(metrics) {
  const colors = getChartThemeColors();
  return {
    labels: ['Total Faturado', 'Total Recebido', 'Em Dívida'],
    values: [metrics.totalFaturado, metrics.totalRecebido, metrics.totalDivida],
    colors: [colors.primary, colors.success, colors.warning],
  };
}

function replaceMountedSection(selector, html) {
  const current = mountRoot?.querySelector(selector);
  if (!current) return false;
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const next = wrap.firstElementChild;
  if (!next) return false;
  current.replaceWith(next);
  return true;
}

async function updateChartData(metrics) {
  const canvas = mountRoot?.querySelector('#faturacao-chart-canvas');
  if (!canvas) return;

  const { labels, values, colors } = financialChartDataset(metrics);

  try {
    const Chart = await loadChartJs();

    if (billingChart) {
      billingChart.data.labels = labels;
      billingChart.data.datasets[0].data = values;
      billingChart.data.datasets[0].backgroundColor = colors;
      billingChart.update('active');
      return;
    }

    const { gridColor, textColor } = getChartThemeColors();
    billingChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Fluxo de caixa (EUR)',
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
            maxBarThickness: 56,
          },
        ],
      },
      options: buildChartOptions(textColor, gridColor),
    });
  } catch (err) {
    console.error('[Faturação] Chart.js:', err);
  }
}

async function softRefreshFaturacaoPanel() {
  if (!mountRoot) return;

  const invoices = getFilteredInvoices();
  const metrics = computeFilteredMetrics(invoices);
  let billingItems = getPendingBillingItems();
  if (billingFilters.clientId) {
    billingItems = billingItems.filter((item) => {
      const clientId =
        item.kind === 'servico' ? item.servico.clientId : item.report?.clientId;
      return String(clientId) === String(billingFilters.clientId);
    });
  }
  const billingRows = buildBillingRowsFromItems(billingItems);

  replaceMountedSection('.faturacao-kpis', renderKpis(metrics));
  replaceMountedSection('.faturacao-table-section--billing', renderBillingTable(billingRows));
  replaceMountedSection('.faturacao-invoices-section', renderInvoicesSection(invoices));
  bindTableActions();
  await updateChartData(metrics);
}

/** Reaplica os filtros sem reconstruir o painel inteiro (mantém foco/scroll). */
async function applyBillingFilters() {
  if (!mountRoot) return;
  const invoices = getFilteredInvoices();
  const metrics = computeFilteredMetrics(invoices);
  replaceMountedSection('.faturacao-kpis', renderKpis(metrics));
  replaceMountedSection('.faturacao-invoices-section', renderInvoicesSection(invoices));
  bindHistoryDetailActions();
  bindConfirmPaymentActions();
  await updateChartData(metrics);
}

function bindFilterEvents() {
  const root = mountRoot;
  if (!root) return;

  const periodSel = root.querySelector('#faturacao-period');
  periodSel?.addEventListener('change', () => {
    billingFilters.period = periodSel.value;
    const customWrap = root.querySelector('.faturacao-filter-custom');
    if (customWrap) customWrap.hidden = billingFilters.period !== 'custom';
    applyBillingFilters().catch(console.error);
  });

  root.querySelector('#faturacao-recebimento')?.addEventListener('change', (e) => {
    billingFilters.recebimentoStatus = e.target.value || 'all';
    applyBillingFilters().catch(console.error);
  });

  root.querySelector('#faturacao-export-csv')?.addEventListener('click', () => {
    exportFilteredInvoicesCsv();
  });

  root.querySelector('#faturacao-manual-invoice')?.addEventListener('click', () => {
    openRegisterManualInvoiceModal();
  });

  root.querySelector('#faturacao-from')?.addEventListener('change', (e) => {
    billingFilters.from = e.target.value || '';
    applyBillingFilters().catch(console.error);
  });
  root.querySelector('#faturacao-to')?.addEventListener('change', (e) => {
    billingFilters.to = e.target.value || '';
    applyBillingFilters().catch(console.error);
  });

  const combo = root.querySelector('[data-client-combobox][data-field-id="faturacao-client"]');
  if (!combo) return;

  const syncClientFilterFromCombobox = () => {
    const id = combo.querySelector('.client-combobox-id')?.value || '';
    const nome = combo.querySelector('.client-combobox-input')?.value || '';
    if (id === billingFilters.clientId) return;
    billingFilters.clientId = id;
    billingFilters.clientNome = id ? nome : '';
    applyBillingFilters().catch(console.error);
  };

  // O combobox atualiza o hidden após a seleção — sincroniza no tick seguinte.
  combo.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.client-combobox-option')) return;
    setTimeout(syncClientFilterFromCombobox, 0);
  });
  combo.querySelector('.client-combobox-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    setTimeout(syncClientFilterFromCombobox, 0);
  });
  combo.querySelector('.client-combobox-clear')?.addEventListener('click', () => {
    setTimeout(syncClientFilterFromCombobox, 0);
  });
  combo.querySelector('.client-combobox-input')?.addEventListener('input', (e) => {
    if (!String(e.target.value || '').trim() && billingFilters.clientId) {
      setTimeout(syncClientFilterFromCombobox, 0);
    }
  });
}

function openRegisterInvoiceModal(reportId) {
  const report = getReport(reportId);
  const isOrcamento = report && isPendingOrcamentoBilling(report);
  openRegisterInvoiceModalCore({
    title: 'Registar Fatura',
    defaultValor: estimateReportValue(report),
    client: report?.clientId ? getClient(report.clientId) : null,
    hint: isOrcamento
      ? 'Proposta comercial aceite pelo cliente. O valor sugerido é o total da MS.015 (com IVA). A fatura legal é emitida no programa externo.'
      : 'A fatura legal é emitida no programa externo. Se este relatório for faturado em conjunto com outros do mesmo cliente, pode deixar o valor em branco.',
    onSave: (payload) => registerReportInvoice(reportId, payload),
  });
}

function openRegisterServicoInvoiceModal(servicoId, reports = []) {
  const client = reports[0]?.clientId ? getClient(reports[0].clientId) : null;
  const reportLines = reports
    .map((r) => {
      const label = getServiceType(r.serviceType)?.label || r.serviceType || 'Relatório';
      return `<li>${escapeHtml(label)}</li>`;
    })
    .join('');
  openRegisterInvoiceModalCore({
    title: 'Registar Fatura da Visita',
    defaultValor: estimateServicoValue(reports),
    client,
    extraHtml: reportLines
      ? `<p class="text-muted faturacao-invoice-hint"><strong>Relatórios incluídos:</strong></p><ul class="faturacao-invoice-report-list">${reportLines}</ul>`
      : '',
    hint: 'Uma única fatura para todos os relatórios desta visita. O valor pode ficar em branco se agregar vários trabalhos do mesmo cliente.',
    onSave: (payload) => registerServicoInvoice(servicoId, payload),
  });
}

function openRegisterManualInvoiceModal() {
  const today = new Date().toISOString().split('T')[0];
  const statusOptions = STATUS_RECEBIMENTO_OPCOES.map(
    (opt) =>
      `<option value="${opt.value}"${opt.value === 'pendente' ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`,
  ).join('');

  const content = `
    <form id="register-manual-invoice-form" class="faturacao-invoice-form">
      <p class="text-muted faturacao-invoice-hint">
        Registe uma fatura emitida no programa externo que não está ligada a nenhum relatório ou visita na app.
      </p>
      ${renderClientCombobox({
        fieldId: 'manual-invoice-client',
        label: 'Cliente',
        value: billingFilters.clientNome,
        selectedId: billingFilters.clientId,
      })}
      <div class="form-group">
        <label class="form-label" for="manual-invoice-numero">Número da Fatura</label>
        <input type="text" class="form-input" id="manual-invoice-numero" required
          placeholder="ex: FT 2026/123" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="manual-invoice-valor">Valor Total Faturado (€)</label>
        <input type="number" class="form-input" id="manual-invoice-valor" min="0" step="0.01" placeholder="0,00">
      </div>
      <div class="form-group">
        <label class="form-label" for="manual-invoice-data">Data de Emissão</label>
        <input type="date" class="form-input" id="manual-invoice-data" required value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label" for="manual-invoice-status">Estado de Recebimento</label>
        <select class="form-input" id="manual-invoice-status" required>${statusOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="manual-invoice-trabalho">Visita / Relatório</label>
        <input type="text" class="form-input" id="manual-invoice-trabalho" maxlength="240" required
          placeholder="ex: Material avulso, reparação antiga, manutenção preventiva…" autocomplete="off">
        <p class="text-muted faturacao-field-hint">Do que é esta fatura — aparece na lista como nas visitas da app.</p>
      </div>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-primary" id="btn-save-manual-invoice">Registar fatura</button>
  `;

  const overlay = openModal('Registar Fatura Manual', content, actions);
  bindClientComboboxes(overlay);

  overlay.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  overlay.querySelector('#btn-save-manual-invoice')?.addEventListener('click', async () => {
    const clientId =
      overlay.querySelector('[data-client-combobox][data-field-id="manual-invoice-client"] .client-combobox-id')?.value?.trim() ||
      '';
    const numero = overlay.querySelector('#manual-invoice-numero')?.value?.trim();
    const data = overlay.querySelector('#manual-invoice-data')?.value?.trim();
    const valor = overlay.querySelector('#manual-invoice-valor')?.value?.trim() || '';
    const statusRecebimento = overlay.querySelector('#manual-invoice-status')?.value;
    const descricao = overlay.querySelector('#manual-invoice-trabalho')?.value?.trim() || '';
    const btn = overlay.querySelector('#btn-save-manual-invoice');

    if (!clientId) {
      showToast('Selecione um cliente da lista.', 'warning');
      return;
    }
    if (!numero || !data) {
      showToast('Preencha o número e a data de emissão.', 'warning');
      return;
    }
    if (!descricao) {
      showToast('Indique do que é a fatura (Visita / Relatório).', 'warning');
      return;
    }
    if (valor) {
      const valorNum = Number(valor.replace(',', '.'));
      if (!Number.isFinite(valorNum) || valorNum < 0) {
        showToast('Indique um valor total faturado válido.', 'warning');
        return;
      }
    }

    btn.disabled = true;
    try {
      await registerManualInvoice({
        clientId,
        numeroFatura: numero,
        dataFatura: data,
        valorFaturado: valor,
        statusRecebimento,
        descricao,
      });
      closeModal();
      showToast('Fatura manual registada.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Fatura manual:', err);
      showToast(err?.message || 'Erro ao registar fatura.', 'error');
      btn.disabled = false;
    }
  });
}

function openRegisterInvoiceModalCore({
  title,
  defaultValor,
  client,
  hint,
  extraHtml = '',
  onSave,
}) {
  const today = new Date().toISOString().split('T')[0];

  const statusOptions = STATUS_RECEBIMENTO_OPCOES.map(
    (opt) =>
      `<option value="${opt.value}"${opt.value === 'pendente' ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`,
  ).join('');

  const content = `
    <form id="register-invoice-form" class="faturacao-invoice-form">
      ${extraHtml}
      <div class="form-group">
        <label class="form-label" for="invoice-numero">Número da Fatura</label>
        <input type="text" class="form-input" id="invoice-numero" name="numero" required
          placeholder="ex: FT 2026/123" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="invoice-valor">Valor Total Faturado (€)</label>
        <input type="number" class="form-input" id="invoice-valor" name="valor"
          min="0" step="0.01" placeholder="${defaultValor.toFixed(2)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="invoice-data">Data de Emissão</label>
        <input type="date" class="form-input" id="invoice-data" name="data" required value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label" for="invoice-status">Estado de Recebimento</label>
        <select class="form-input" id="invoice-status" name="status" required>
          ${statusOptions}
        </select>
      </div>
      <p class="text-muted faturacao-invoice-hint">${escapeHtml(hint)}</p>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-primary" id="btn-save-invoice">Marcar como Faturado</button>
  `;

  openModal(title, content, actions);

  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-invoice')?.addEventListener('click', async () => {
    const numero = document.getElementById('invoice-numero')?.value?.trim();
    const data = document.getElementById('invoice-data')?.value?.trim();
    const valor = document.getElementById('invoice-valor')?.value?.trim() || '';
    const statusRecebimento = document.getElementById('invoice-status')?.value;
    const btn = document.getElementById('btn-save-invoice');

    if (!numero || !data) {
      showToast('Preencha o número e a data de emissão.', 'warning');
      return;
    }
    if (valor) {
      const valorNum = Number(valor.replace(',', '.'));
      if (!Number.isFinite(valorNum) || valorNum < 0) {
        showToast('Indique um valor total faturado válido.', 'warning');
        return;
      }
    }

    btn.disabled = true;
    try {
      await onSave({
        numeroFatura: numero,
        dataFatura: data,
        valorFaturado: valor,
        statusRecebimento,
      });
      closeModal();
      showToast('Fatura registada. Controlo financeiro atualizado.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Registo:', err);
      showToast(err?.message || 'Erro ao registar fatura.', 'error');
      btn.disabled = false;
    }
  });
}

function bindBillingRowActionButtons() {
  mountRoot?.querySelectorAll('[data-billing-pdf]').forEach((btn) => {
    if (btn.dataset.boundBilling === '1') return;
    btn.dataset.boundBilling = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.getAttribute('data-billing-pdf');
      if (reportId) void openBillingReportPdf(reportId);
    });
  });

  mountRoot?.querySelectorAll('[data-register-invoice]').forEach((btn) => {
    if (btn.dataset.boundBilling === '1') return;
    btn.dataset.boundBilling = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.getAttribute('data-register-invoice');
      if (reportId) openRegisterInvoiceModal(reportId);
    });
  });

  mountRoot?.querySelectorAll('[data-register-invoice-servico]').forEach((btn) => {
    if (btn.dataset.boundBillingServico === '1') return;
    btn.dataset.boundBillingServico = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const servicoId = btn.getAttribute('data-register-invoice-servico');
      if (!servicoId) return;
      const reports = getApprovedReportsForServico(servicoId);
      openRegisterServicoInvoiceModal(servicoId, reports);
    });
  });
}

function openInvoiceHistoryDetailModal(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const meta = resolveClientMeta(report.clientId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const pago = report.statusRecebimento === 'pago';
  const recebimentoRaw = report.dataRecebimento ? String(report.dataRecebimento).split('T')[0] : '';
  const recebimentoLabel = recebimentoRaw
    ? formatHistoryDate(recebimentoRaw)
    : pago
      ? '—'
      : 'Pendente';

  const vencimentoLabel = pago
    ? '—'
    : formatHistoryDate(String(report.dataVencimento || '').split('T')[0]);

  const content = `
    <dl class="faturacao-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(meta.nome)}</dd></div>
      <div><dt>NIF</dt><dd>${escapeHtml(meta.nif)}</dd></div>
      <div><dt>Nº Fatura</dt><dd><code class="faturacao-ordem">${escapeHtml(report.numeroFatura || '—')}</code></dd></div>
      ${job ? `<div><dt>Ordem de produção</dt><dd>${escapeHtml(formatOrdemLabel(job))}</dd></div>` : ''}
      <div><dt>Valor faturado</dt><dd>${escapeHtml(formatCurrencyEurNullable(report.valorFaturado))}</dd></div>
      <div><dt>Data do relatório</dt><dd>${escapeHtml(formatHistoryDate(reportDateOf(report)))}</dd></div>
      <div><dt>Data da faturação</dt><dd>${escapeHtml(formatHistoryDate(invoiceDateOf(report)))}</dd></div>
      <div><dt>Data de vencimento</dt><dd>${escapeHtml(vencimentoLabel)}</dd></div>
      <div><dt>Data do recebimento</dt><dd>${escapeHtml(recebimentoLabel)}</dd></div>
      <div><dt>Estado</dt><dd>${pago ? 'Pago' : 'Pendente'}</dd></div>
    </dl>
  `;

  const canRevert = !pago && !report.servicoId;
  const actions = `
    ${canRevert ? `<button type="button" class="btn-warning btn-sm" data-revert-invoice-report-modal="${escapeHtml(reportId)}">Voltar a por faturar</button>` : ''}
    <button type="button" class="btn-secondary" data-modal-cancel>Fechar</button>
  `;
  openModal('Detalhe da fatura', content, actions);
  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
  document.querySelector('[data-revert-invoice-report-modal]')?.addEventListener('click', () => {
    closeModal();
    runRevertReportInvoice(reportId);
  });
}

function openServicoInvoiceHistoryDetailModal(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const reports = getApprovedReportsForServico(servicoId);
  const meta = resolveClientMeta(servico.clientId);
  const pago = servico.statusRecebimento === 'pago';
  const recebimentoRaw = servico.dataRecebimento ? String(servico.dataRecebimento).split('T')[0] : '';
  const recebimentoLabel = recebimentoRaw
    ? formatHistoryDate(recebimentoRaw)
    : pago
      ? '—'
      : 'Pendente';
  const vencimentoLabel = pago
    ? '—'
    : formatHistoryDate(String(servico.dataVencimento || '').split('T')[0]);
  const reportList = reports
    .map((r) => `<li>${escapeHtml(getServiceType(r.serviceType)?.label || r.serviceType || 'Relatório')}</li>`)
    .join('');

  const content = `
    <dl class="faturacao-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(meta.nome)}</dd></div>
      <div><dt>NIF</dt><dd>${escapeHtml(meta.nif)}</dd></div>
      <div><dt>Visita</dt><dd>${escapeHtml(formatServicoOrdemLabel(servico, reports))} — ${escapeHtml(formatDateSafe(servico.date))}</dd></div>
      <div><dt>Nº Fatura</dt><dd><code class="faturacao-ordem">${escapeHtml(servico.numeroFatura || '—')}</code></dd></div>
      <div><dt>Relatórios</dt><dd><ul class="faturacao-invoice-report-list">${reportList || '<li>—</li>'}</ul></dd></div>
      <div><dt>Valor faturado</dt><dd>${escapeHtml(formatCurrencyEurNullable(servico.valorFaturado))}</dd></div>
      <div><dt>Data da faturação</dt><dd>${escapeHtml(formatHistoryDate(String(servico.dataFatura || '').split('T')[0]))}</dd></div>
      <div><dt>Data de vencimento</dt><dd>${escapeHtml(vencimentoLabel)}</dd></div>
      <div><dt>Data do recebimento</dt><dd>${escapeHtml(recebimentoLabel)}</dd></div>
      <div><dt>Estado</dt><dd>${pago ? 'Pago' : 'Pendente'}</dd></div>
    </dl>
  `;

  const actions = `
    ${pago ? '' : `<button type="button" class="btn-warning btn-sm" data-revert-invoice-servico-modal="${escapeHtml(servicoId)}">Voltar a por faturar</button>`}
    <button type="button" class="btn-secondary" data-modal-cancel>Fechar</button>
  `;
  openModal('Detalhe da fatura (visita)', content, actions);
  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
  document.querySelector('[data-revert-invoice-servico-modal]')?.addEventListener('click', () => {
    closeModal();
    runRevertServicoInvoice(servicoId);
  });
}

function openManualInvoiceHistoryDetailModal(invoiceId) {
  const invoice = getManualInvoice(invoiceId);
  if (!invoice) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const meta = resolveClientMeta(invoice.clientId);
  const pago = invoice.statusRecebimento === 'pago';
  const recebimentoRaw = invoice.dataRecebimento ? String(invoice.dataRecebimento).split('T')[0] : '';
  const recebimentoLabel = recebimentoRaw
    ? formatHistoryDate(recebimentoRaw)
    : pago
      ? '—'
      : 'Pendente';
  const vencimentoLabel = pago
    ? '—'
    : formatHistoryDate(String(invoice.dataVencimento || '').split('T')[0]);

  const content = `
    <dl class="faturacao-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(meta.nome)}</dd></div>
      <div><dt>NIF</dt><dd>${escapeHtml(meta.nif)}</dd></div>
      <div><dt>Origem</dt><dd>Registo manual</dd></div>
      <div><dt>Visita / Relatório</dt><dd>${escapeHtml(invoice.descricao || '—')}</dd></div>
      <div><dt>Nº Fatura</dt><dd><code class="faturacao-ordem">${escapeHtml(invoice.numeroFatura || '—')}</code></dd></div>
      <div><dt>Valor faturado</dt><dd>${escapeHtml(formatCurrencyEurNullable(invoice.valorFaturado))}</dd></div>
      <div><dt>Data da faturação</dt><dd>${escapeHtml(formatHistoryDate(String(invoice.dataFatura || '').split('T')[0]))}</dd></div>
      <div><dt>Data de vencimento</dt><dd>${escapeHtml(vencimentoLabel)}</dd></div>
      <div><dt>Data do recebimento</dt><dd>${escapeHtml(recebimentoLabel)}</dd></div>
      <div><dt>Estado</dt><dd>${pago ? 'Pago' : 'Pendente'}</dd></div>
    </dl>
  `;

  const actions = `<button type="button" class="btn-secondary" data-modal-cancel>Fechar</button>`;
  openModal('Detalhe da fatura manual', content, actions);
  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
}

function openConfirmPaymentModal(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const meta = resolveClientMeta(report.clientId);
  const today = new Date().toISOString().split('T')[0];

  const content = `
    <form id="confirm-payment-form" class="faturacao-invoice-form">
      <p class="text-muted faturacao-invoice-hint">
        Confirmar recebimento de <strong>${escapeHtml(meta.nome)}</strong>
        — fatura <strong>${escapeHtml(report.numeroFatura || '—')}</strong>
        (${escapeHtml(formatCurrencyEurNullable(report.valorFaturado))}).
      </p>
      <div class="form-group">
        <label class="form-label" for="payment-data">Data de recebimento</label>
        <input type="date" class="form-input" id="payment-data" name="data" required value="${today}">
      </div>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-success" id="btn-confirm-payment">Confirmar recebimento</button>
  `;

  openModal('Confirmar Recebimento', content, actions);

  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
    const data = document.getElementById('payment-data')?.value?.trim();
    const btn = document.getElementById('btn-confirm-payment');
    if (!data) {
      showToast('Indique a data de recebimento.', 'warning');
      return;
    }
    btn.disabled = true;
    try {
      await confirmInvoicePayment(reportId, { dataRecebimento: data });
      closeModal();
      showToast('Recebimento confirmado. Valor movido para caixa.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Confirmar recebimento:', err);
      showToast(err?.message || 'Erro ao confirmar recebimento.', 'error');
      btn.disabled = false;
    }
  });
}

function openConfirmServicoPaymentModal(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const meta = resolveClientMeta(servico.clientId);
  const today = new Date().toISOString().split('T')[0];

  const content = `
    <form id="confirm-payment-form" class="faturacao-invoice-form">
      <p class="text-muted faturacao-invoice-hint">
        Confirmar recebimento de <strong>${escapeHtml(meta.nome)}</strong>
        — fatura <strong>${escapeHtml(servico.numeroFatura || '—')}</strong>
        (${escapeHtml(formatCurrencyEurNullable(servico.valorFaturado))}).
      </p>
      <div class="form-group">
        <label class="form-label" for="payment-data">Data de recebimento</label>
        <input type="date" class="form-input" id="payment-data" name="data" required value="${today}">
      </div>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-success" id="btn-confirm-payment">Confirmar recebimento</button>
  `;

  openModal('Confirmar Recebimento', content, actions);

  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
    const data = document.getElementById('payment-data')?.value?.trim();
    const btn = document.getElementById('btn-confirm-payment');
    if (!data) {
      showToast('Indique a data de recebimento.', 'warning');
      return;
    }
    btn.disabled = true;
    try {
      await confirmServicoInvoicePayment(servicoId, { dataRecebimento: data });
      closeModal();
      showToast('Recebimento confirmado. Valor movido para caixa.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Confirmar recebimento:', err);
      showToast(err?.message || 'Erro ao confirmar recebimento.', 'error');
      btn.disabled = false;
    }
  });
}

function openConfirmManualPaymentModal(invoiceId) {
  const invoice = getManualInvoice(invoiceId);
  if (!invoice) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }

  const meta = resolveClientMeta(invoice.clientId);
  const today = new Date().toISOString().split('T')[0];

  const content = `
    <form id="confirm-payment-form" class="faturacao-invoice-form">
      <p class="text-muted faturacao-invoice-hint">
        Confirmar recebimento de <strong>${escapeHtml(meta.nome)}</strong>
        — fatura <strong>${escapeHtml(invoice.numeroFatura || '—')}</strong>
        (${escapeHtml(formatCurrencyEurNullable(invoice.valorFaturado))}).
      </p>
      <div class="form-group">
        <label class="form-label" for="payment-data">Data de recebimento</label>
        <input type="date" class="form-input" id="payment-data" name="data" required value="${today}">
      </div>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-success" id="btn-confirm-payment">Confirmar recebimento</button>
  `;

  openModal('Confirmar Recebimento', content, actions);
  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
    const data = document.getElementById('payment-data')?.value?.trim();
    const btn = document.getElementById('btn-confirm-payment');
    if (!data) {
      showToast('Indique a data de recebimento.', 'warning');
      return;
    }
    btn.disabled = true;
    try {
      await confirmManualInvoicePayment(invoiceId, { dataRecebimento: data });
      closeModal();
      showToast('Recebimento confirmado. Valor movido para caixa.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Confirmar recebimento manual:', err);
      showToast(err?.message || 'Erro ao confirmar recebimento.', 'error');
      btn.disabled = false;
    }
  });
}

function runRevertServicoInvoice(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Visita não encontrada.', 'error');
    return;
  }
  const meta = resolveClientMeta(servico.clientId);
  const reports = getApprovedReportsForServico(servicoId);
  const visita = formatServicoOrdemLabel(servico, reports);
  const ok = window.confirm(
    `Voltar a visita ${visita} (${meta.nome}) à lista por faturar?\n\nA fatura ${servico.numeroFatura || ''} deixa de constar como emitida — poderá registar de novo com o valor correcto.`,
  );
  if (!ok) return;
  void revertServicoInvoice(servicoId)
    .then(() => {
      showToast('Visita devolvida à lista por faturar.', 'success');
      refreshFaturacaoPanel({ soft: true }).catch(console.error);
    })
    .catch((err) => {
      console.error('[Faturação] Reverter fatura visita:', err);
      showToast(err?.message || 'Erro ao reverter a fatura.', 'error');
    });
}

function runRevertReportInvoice(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }
  const meta = resolveClientMeta(report.clientId);
  const ok = window.confirm(
    `Voltar este relatório (${meta.nome}) à lista por faturar?\n\nA fatura ${report.numeroFatura || ''} deixa de constar como emitida — poderá registar de novo com o valor correcto.`,
  );
  if (!ok) return;
  void revertReportInvoice(reportId)
    .then(() => {
      showToast('Relatório devolvido à lista por faturar.', 'success');
      refreshFaturacaoPanel({ soft: true }).catch(console.error);
    })
    .catch((err) => {
      console.error('[Faturação] Reverter fatura relatório:', err);
      showToast(err?.message || 'Erro ao reverter a fatura.', 'error');
    });
}

/** Id do relatório cujo PDF abrir no histórico de faturas emitidas. */
function resolveHistoryPdfReportId(kind, entityId) {
  if (kind === 'report') return entityId;
  if (kind === 'servico') {
    const reports = getApprovedReportsForServico(entityId);
    return reports[0]?.id || '';
  }
  return '';
}

function bindHistoryDetailActions() {
  mountRoot?.querySelectorAll('[data-history-detail]').forEach((btn) => {
    if (btn.dataset.boundHistory === '1') return;
    btn.dataset.boundHistory = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.getAttribute('data-history-detail');
      if (reportId) openInvoiceHistoryDetailModal(reportId);
    });
  });

  mountRoot?.querySelectorAll('[data-history-detail-servico]').forEach((btn) => {
    if (btn.dataset.boundHistory === '1') return;
    btn.dataset.boundHistory = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const servicoId = btn.getAttribute('data-history-detail-servico');
      if (servicoId) openServicoInvoiceHistoryDetailModal(servicoId);
    });
  });

  mountRoot?.querySelectorAll('[data-history-detail-manual]').forEach((btn) => {
    if (btn.dataset.boundHistory === '1') return;
    btn.dataset.boundHistory = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const invoiceId = btn.getAttribute('data-history-detail-manual');
      if (invoiceId) openManualInvoiceHistoryDetailModal(invoiceId);
    });
  });

  mountRoot?.querySelectorAll('[data-history-pdf]').forEach((btn) => {
    if (btn.dataset.boundHistoryPdf === '1') return;
    btn.dataset.boundHistoryPdf = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.getAttribute('data-history-pdf');
      if (reportId) void openBillingReportPdf(reportId);
    });
  });
}

function bindConfirmPaymentActions() {
  mountRoot?.querySelectorAll('[data-confirm-payment]').forEach((btn) => {
    if (btn.dataset.boundPayment === '1') return;
    btn.dataset.boundPayment = '1';
    btn.addEventListener('click', () => {
      const reportId = btn.getAttribute('data-confirm-payment');
      if (reportId) openConfirmPaymentModal(reportId);
    });
  });

  mountRoot?.querySelectorAll('[data-confirm-payment-servico]').forEach((btn) => {
    if (btn.dataset.boundPayment === '1') return;
    btn.dataset.boundPayment = '1';
    btn.addEventListener('click', () => {
      const servicoId = btn.getAttribute('data-confirm-payment-servico');
      if (servicoId) openConfirmServicoPaymentModal(servicoId);
    });
  });

  mountRoot?.querySelectorAll('[data-confirm-payment-manual]').forEach((btn) => {
    if (btn.dataset.boundPayment === '1') return;
    btn.dataset.boundPayment = '1';
    btn.addEventListener('click', () => {
      const invoiceId = btn.getAttribute('data-confirm-payment-manual');
      if (invoiceId) openConfirmManualPaymentModal(invoiceId);
    });
  });

  mountRoot?.querySelectorAll('[data-delete-manual-invoice]').forEach((btn) => {
    if (btn.dataset.boundDeleteManual === '1') return;
    btn.dataset.boundDeleteManual = '1';
    btn.addEventListener('click', () => {
      const invoiceId = btn.getAttribute('data-delete-manual-invoice');
      if (!invoiceId) return;
      const invoice = getManualInvoice(invoiceId);
      if (!invoice) {
        showToast('Fatura não encontrada.', 'error');
        return;
      }
      const meta = resolveClientMeta(invoice.clientId);
      const label = invoice.numeroFatura || invoice.descricao || 'esta fatura';
      const ok = window.confirm(
        `Eliminar a fatura ${label} de ${meta.nome}?\n\nO registo manual será removido do controlo financeiro. A fatura legal emitida externamente mantém-se — apenas deixa de aparecer aqui.`,
      );
      if (!ok) return;
      void deleteManualInvoice(invoiceId)
        .then(() => {
          showToast('Fatura manual eliminada.', 'success');
          refreshFaturacaoPanel({ soft: true }).catch(console.error);
        })
        .catch((err) => {
          console.error('[Faturação] Eliminar fatura manual:', err);
          showToast(err?.message || 'Erro ao eliminar a fatura.', 'error');
        });
    });
  });

  mountRoot?.querySelectorAll('[data-revert-invoice-servico]').forEach((btn) => {
    if (btn.dataset.boundRevertServico === '1') return;
    btn.dataset.boundRevertServico = '1';
    btn.addEventListener('click', () => {
      const servicoId = btn.getAttribute('data-revert-invoice-servico');
      if (servicoId) runRevertServicoInvoice(servicoId);
    });
  });

  mountRoot?.querySelectorAll('[data-revert-invoice-report]').forEach((btn) => {
    if (btn.dataset.boundRevertReport === '1') return;
    btn.dataset.boundRevertReport = '1';
    btn.addEventListener('click', () => {
      const reportId = btn.getAttribute('data-revert-invoice-report');
      if (reportId) runRevertReportInvoice(reportId);
    });
  });
}

function bindTableActions() {
  bindBillingRowActionButtons();
  bindConfirmPaymentActions();
  bindHistoryDetailActions();
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportFilteredInvoicesCsv() {
  const invoices = getFilteredInvoices();
  if (!invoices.length) {
    showToast('Não há faturas para exportar nos filtros atuais.', 'info');
    return;
  }

  const header = [
    'Data faturação',
    'Tipo',
    'Cliente',
    'NIF',
    'Visita / Relatório',
    'Nº Fatura',
    'Valor (EUR)',
    'Estado',
    'Data recebimento',
  ];
  const lines = [header.join(';')];

  invoices.forEach((item) => {
    const entity = item.entity;
    const meta = resolveClientMeta(entity.clientId);
    const recebimento = entity.dataRecebimento ? String(entity.dataRecebimento).split('T')[0] : '';
    const trabalho = resolveInvoiceTrabalhoLabel(item);
    const trabalhoLabel = [trabalho.ordem, trabalho.detail].filter(Boolean).join(' — ');
    const row = [
      invoiceDateOfEntity(item),
      resolveInvoiceTipoLabel(item),
      meta.nome,
      meta.nif,
      trabalhoLabel,
      entity.numeroFatura || '',
      Number.isFinite(Number(entity.valorFaturado)) ? Number(entity.valorFaturado) : '',
      labelStatusRecebimento(entity.statusRecebimento),
      recebimento,
    ].map(csvEscape);
    lines.push(row.join(';'));
  });

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `faturacao-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${invoices.length} linha(s) exportada(s).`, 'success');
}

/** Destaca visita ou relatório após refresh do painel de faturação. */
export function queueBillingReportFocus(reportId) {
  const target = resolveBillingFocusTarget(reportId, getReport);
  highlightServicoId = target.servicoId;
  highlightReportId = target.reportId;
}

/** Destaca e faz scroll até uma linha na tabela «por faturar». */
export function focusBillingReport(reportId) {
  queueBillingReportFocus(reportId);
  applyBillingHighlight();
}

function focusBillingServico(servicoId) {
  if (!servicoId || !mountRoot) return;
  const row = mountRoot.querySelector(`[data-servico-id="${CSS.escape(servicoId)}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('faturacao-row--highlight');
  setTimeout(() => row.classList.remove('faturacao-row--highlight'), 4500);
}

function applyBillingHighlight() {
  if (highlightServicoId) {
    focusBillingServico(highlightServicoId);
    highlightServicoId = null;
    highlightReportId = null;
    return;
  }
  if (!highlightReportId || !mountRoot) return;
  const row = mountRoot.querySelector(`[data-report-id="${CSS.escape(highlightReportId)}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('faturacao-row--highlight');
  setTimeout(() => row.classList.remove('faturacao-row--highlight'), 4500);
  highlightReportId = null;
}

function renderPanel() {
  const invoices = getFilteredInvoices();
  const metrics = computeFilteredMetrics(invoices);
  let billingItems = getPendingBillingItems();
  if (billingFilters.clientId) {
    billingItems = billingItems.filter((item) => {
      const clientId =
        item.kind === 'servico' ? item.servico.clientId : item.report?.clientId;
      return String(clientId) === String(billingFilters.clientId);
    });
  }
  const billingRows = buildBillingRowsFromItems(billingItems);

  return `
    <div class="faturacao-panel rh-admin-panel dashboard-panel-inner">
      <header class="faturacao-header rh-section">
        <h2 class="ms-h2">Controlo de Faturação</h2>
        <p class="text-muted faturacao-lead">
          Emita faturas no programa externo e registe aqui o valor, prazo e recebimentos para acompanhar o fluxo de caixa.
        </p>
      </header>
      ${renderFiltersSection()}
      ${renderKpis(metrics)}
      ${renderChartSection()}
      ${renderBillingTable(billingRows)}
      ${renderInvoicesSection(invoices)}
    </div>
  `;
}

/**
 * @param {{ soft?: boolean }} [options]
 */
export async function refreshFaturacaoPanel(options = {}) {
  if (!mountRoot) return;

  if (!options.soft) {
    const { ensureReportsLoaded } = await import('../relatorios-db.js');
    const { ensureServicosLoadedSafe } = await import('../servicos-db.js');
    await Promise.all([
      ensureReportsLoaded(true),
      ensureServicosLoadedSafe(true),
      ensureFaturasManuaisLoadedSafe(true),
    ]);
  }

  const canSoftRefresh =
    options.soft === true && mountRoot.querySelector('#faturacao-chart-canvas');

  if (canSoftRefresh) {
    await softRefreshFaturacaoPanel();
    return;
  }

  if (billingChart) {
    billingChart.destroy();
    billingChart = null;
  }

  mountRoot.innerHTML = renderPanel();
  bindTableActions();
  bindFilterEvents();
  bindClientComboboxes(mountRoot).catch(console.error);
  await updateChartData(computeFilteredMetrics());
  applyBillingHighlight();
}

export function initFaturacaoPanel(root) {
  mountRoot = root;
  return refreshFaturacaoPanel();
}
