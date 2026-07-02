/**
 * Painel de Faturação — contas a receber e fluxo de caixa (controlo interno).
 */

import {
  getPendingBillingReports,
  getPendingPaymentInvoices,
  getReportsSnapshot,
  getReport,
  getClient,
  getJob,
  registerReportInvoice,
  confirmInvoicePayment,
  dismissPendingBillingReport,
  openModal,
  closeModal,
  escapeHtml,
  formatDate,
  showToast,
} from '../app.js';
import { dedupeReportsForDisplay } from '../relatorios-db.js';
import { renderClientCombobox, bindClientComboboxes } from '../client-combobox.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import { PAYMENT_CONDITION_OPTIONS } from './client-profile-drawer.js';
import {
  FATURA_CONDICAO_OPCOES,
  STATUS_RECEBIMENTO_OPCOES,
  labelFaturaCondicao,
  labelStatusRecebimento,
  condicaoFromClientCatalog,
} from '../billing-constants.js';

const URGENT_PAYMENT_TERMS = new Set(['pronto pagamento', 'semanal']);
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

function normalizePaymentTerm(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Não definida';
  const match = PAYMENT_CONDITION_OPTIONS.find(
    (opt) => opt.toLowerCase() === raw.toLowerCase(),
  );
  return match || raw;
}

function isUrgentPaymentTerm(condicao) {
  return URGENT_PAYMENT_TERMS.has(String(condicao ?? '').trim().toLowerCase());
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

export function isBillingUrgent(report, client) {
  if (!report?.approvedAt) return false;
  const condicao =
    client?.condicao_pagamento ||
    client?.condicaoPagamento ||
    client?.['Condição de pagamento'] ||
    '';
  if (!isUrgentPaymentTerm(condicao)) return false;
  return daysSince(report.approvedAt) > URGENT_DAYS;
}

export function estimateReportValue(report) {
  if (!report) return DEFAULT_ESTIMATE_EUR;
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

/** Todas as faturas registadas — o histórico nunca é apagado do Supabase. */
function getInvoicedReports() {
  return dedupeReportsForDisplay(
    getReportsSnapshot().filter((r) => r.faturacaoStatus === 'faturado'),
  );
}

function invoiceMatchesFilters(report) {
  const { from, to } = getPeriodRange();
  const date = invoiceDateOf(report);
  if (from && (!date || date < from)) return false;
  if (to && (!date || date > to)) return false;
  if (billingFilters.clientId && String(report.clientId) !== String(billingFilters.clientId)) {
    return false;
  }
  if (billingFilters.recebimentoStatus === 'pendente' && report.statusRecebimento !== 'pendente') {
    return false;
  }
  if (billingFilters.recebimentoStatus === 'pago' && report.statusRecebimento !== 'pago') {
    return false;
  }
  return true;
}

/** Faturas dentro dos filtros ativos — mais recentes primeiro. */
function getFilteredInvoices() {
  return getInvoicedReports()
    .filter(invoiceMatchesFilters)
    .sort((a, b) => invoiceDateOf(b).localeCompare(invoiceDateOf(a)));
}

/** KPIs calculados sobre as faturas filtradas. */
function computeFilteredMetrics(invoices = getFilteredInvoices()) {
  let totalFaturado = 0;
  let totalRecebido = 0;
  let totalDivida = 0;

  invoices.forEach((r) => {
    const valor = Number(r.valorFaturado);
    if (!Number.isFinite(valor) || valor <= 0) return;
    totalFaturado += valor;
    if (r.statusRecebimento === 'pago') totalRecebido += valor;
    else if (r.statusRecebimento === 'pendente') totalDivida += valor;
  });

  return { totalFaturado, totalRecebido, totalDivida };
}

function resolveClientMeta(clientId) {
  const client = getClient(clientId);
  const nome = client?.name || client?.Nome || client?.nome || '—';
  const nif = client?.NIF || client?.nif || '—';
  const condicao = normalizePaymentTerm(
    client?.condicao_pagamento ||
      client?.condicaoPagamento ||
      client?.['Condição de pagamento'] ||
      '',
  );
  return { client, nome, nif, condicao };
}

function resolveBillingReportPdfEntries(report) {
  if (!report) return [];
  const job = report.jobId ? getJob(report.jobId) : null;
  const urls = Array.isArray(report?.data?.urlPdfs) ? report.data.urlPdfs.filter(Boolean) : [];
  const names = Array.isArray(report?.data?.pdfFilenames) ? report.data.pdfFilenames : [];
  if (urls.length) {
    return urls.map((url, index) => ({
      url: String(url).trim(),
      label: names[index] || `Relatório ${index + 1}`,
    }));
  }
  if (job?.urlPdf && String(job.urlPdf).trim()) {
    return [{ url: String(job.urlPdf).trim(), label: 'Relatório técnico' }];
  }
  return [];
}

function buildBillingRows(reports) {
  return reports.map((report) => {
    const meta = resolveClientMeta(report.clientId);
    const job = report.jobId ? getJob(report.jobId) : null;
    const pdfEntries = resolveBillingReportPdfEntries(report);
    return {
      report,
      ...meta,
      ordem: formatOrdemLabel(job),
      approvedLabel: formatHistoryDate(String(report.approvedAt || '').split('T')[0]),
      urgent: isBillingUrgent(report, meta.client),
      estimate: estimateReportValue(report),
      pdfEntries,
      hasPdf: pdfEntries.length > 0,
    };
  });
}

function buildReceivableRows(reports) {
  return reports.map((report) => {
    const meta = resolveClientMeta(report.clientId);
    const valor = Number(report.valorFaturado);
    const vencimento = report.dataVencimento || null;
    const vencimentoUrg = vencimentoUrgency(vencimento);
    return {
      report,
      ...meta,
      numeroFatura: report.numeroFatura || '—',
      valor,
      valorLabel: formatCurrencyEurNullable(valor),
      emissaoLabel: formatHistoryDate(String(report.dataFatura || '').split('T')[0]),
      condicaoLabel: labelFaturaCondicao(report.faturaCondicaoPagamento),
      statusLabel: labelStatusRecebimento(report.statusRecebimento),
      vencimentoLabel: formatHistoryDate(String(vencimento || '').split('T')[0]),
      vencimentoClass: vencimentoCellClass(vencimentoUrg),
      vencimentoUrg,
    };
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
        <button type="button" class="btn-outline btn-sm" id="faturacao-export-csv">
          Exportar CSV
        </button>
      </div>
    </section>
  `;
}

/* ─── Histórico de Faturas Emitidas ─── */

/** dd/mm/aaaa — o histórico pode abranger vários anos. */
function formatHistoryDate(isoDate) {
  const [y, m, d] = String(isoDate || '').split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function renderInvoiceHistoryRow(report, acumulado, showAcum) {
  const meta = resolveClientMeta(report.clientId);
  const pago = report.statusRecebimento === 'pago';

  return `
    <tr class="rh-data-table-row faturacao-history-row" data-history-id="${escapeHtml(report.id)}">
      <td class="rh-cell-date">${escapeHtml(formatHistoryDate(invoiceDateOf(report)))}</td>
      <td class="rh-cell-client">
        <button type="button" class="rh-cell-link-btn faturacao-history-client-btn" data-history-detail="${escapeHtml(report.id)}" title="Ver datas do relatório, faturação e recebimento">
          ${escapeHtml(meta.nome)}
        </button>
      </td>
      <td class="rh-cell-ordem"><code class="rh-ordem-badge faturacao-ordem">${escapeHtml(report.numeroFatura || '—')}</code></td>
      <td class="rh-cell-valor">${escapeHtml(formatCurrencyEurNullable(report.valorFaturado))}</td>
      ${
        showAcum
          ? `<td class="rh-cell-muted faturacao-history-acum" title="Acumulado do cliente até esta fatura">${acumulado != null ? `Σ ${escapeHtml(formatCurrencyEur(acumulado))}` : '—'}</td>`
          : ''
      }
      <td>
        <span class="faturacao-history-estado ${pago ? 'is-pago' : 'is-pendente'}">${pago ? 'Pago' : 'Pendente'}</span>
      </td>
    </tr>
  `;
}

function renderHistorySection(invoices = getFilteredInvoices()) {
  const clientActive = Boolean(billingFilters.clientId);

  let rowsHtml = '<p class="text-muted faturacao-empty">Sem faturas emitidas nos filtros selecionados.</p>';
  let cumulativeByReport = null;

  if (invoices.length) {
    if (clientActive) {
      cumulativeByReport = new Map();
      let running = 0;
      [...invoices]
        .sort((a, b) => invoiceDateOf(a).localeCompare(invoiceDateOf(b)))
        .forEach((r) => {
          running += Number(r.valorFaturado) || 0;
          cumulativeByReport.set(r.id, running);
        });
    }

    rowsHtml = `
      <div class="faturacao-table-wrap">
        <table class="rh-data-table rh-data-table--compact faturacao-history-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Fatura</th>
              <th>Valor</th>
              ${clientActive ? '<th>Acumulado</th>' : ''}
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${invoices
              .map((r) =>
                renderInvoiceHistoryRow(
                  r,
                  cumulativeByReport ? cumulativeByReport.get(r.id) : null,
                  clientActive,
                ),
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const total = invoices.reduce((sum, r) => sum + (Number(r.valorFaturado) || 0), 0);
  const rendaTotal =
    clientActive && invoices.length
      ? `<p class="faturacao-history-total">Renda Total — ${escapeHtml(billingFilters.clientNome || 'cliente selecionado')}: <strong>${escapeHtml(formatCurrencyEur(total))}</strong></p>`
      : '';

  return `
    <section class="faturacao-history-section rh-section glass-card" aria-label="Histórico de faturas emitidas">
      <h3 class="ms-h2 faturacao-section-title">Histórico de Faturas Emitidas <span class="badge-count">${invoices.length}</span></h3>
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
        <h3 class="ms-h2 faturacao-section-title">Relatórios por faturar</h3>
        <p class="text-muted faturacao-empty">Nenhum relatório aprovado aguarda faturação.</p>
      </section>
    `;
  }

  return `
    <section class="faturacao-table-section faturacao-table-section--billing rh-section glass-card">
      <h3 class="ms-h2 faturacao-section-title">Relatórios por faturar <span class="badge-count">${rows.length}</span></h3>
      <div class="rh-table-scroll">
        <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact faturacao-billing-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">NIF</th>
              <th scope="col">Relatório</th>
              <th scope="col">Aprovação</th>
              <th scope="col">Condição</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr class="rh-data-table-row${row.urgent ? ' faturacao-row--urgent' : ''}" data-report-id="${escapeHtml(row.report.id)}">
                <td class="faturacao-cell-client" title="${escapeHtml(row.nome)}">${escapeHtml(row.nome)}${row.urgent ? ' <span class="faturacao-urgent-badge">Urgente</span>' : ''}</td>
                <td class="faturacao-cell-nif">${escapeHtml(row.nif)}</td>
                <td class="faturacao-cell-ordem"><code class="faturacao-ordem">${escapeHtml(row.ordem)}</code></td>
                <td class="faturacao-cell-date">${escapeHtml(row.approvedLabel)}</td>
                <td class="faturacao-cell-muted">${escapeHtml(row.condicao)}</td>
                <td class="faturacao-col-action">
                  <div class="faturacao-billing-actions">
                    <button type="button" class="btn-outline btn-sm faturacao-btn-compact" data-billing-pdf="${escapeHtml(row.report.id)}" title="Abrir PDF do relatório técnico">PDF</button>
                    <button type="button" class="btn-primary btn-sm faturacao-btn-compact" data-register-invoice="${escapeHtml(row.report.id)}" title="Marcar como faturado">Faturar</button>
                    <button type="button" class="btn-danger btn-sm faturacao-btn-compact" data-billing-dismiss="${escapeHtml(row.report.id)}" title="Retirar da lista por faturar">Eliminar</button>
                  </div>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderReceivablesTable(rows) {
  if (!rows.length) {
    return `
      <section class="faturacao-receivables-section rh-section glass-card">
        <h3 class="ms-h2 faturacao-section-title">Faturas Pendentes de Pagamento</h3>
        <p class="text-muted faturacao-empty">Nenhuma fatura em aberto — tudo recebido.</p>
      </section>
    `;
  }

  return `
    <section class="faturacao-receivables-section rh-section glass-card">
      <h3 class="ms-h2 faturacao-section-title">Faturas Pendentes de Pagamento <span class="badge-count">${rows.length}</span></h3>
      <div class="rh-table-scroll">
        <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact faturacao-table--receivables">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">NIF</th>
              <th scope="col">Fatura</th>
              <th scope="col">Valor</th>
              <th scope="col">Emissão</th>
              <th scope="col">Condição</th>
              <th scope="col">Vencimento</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr class="rh-data-table-row${row.vencimentoUrg === 'overdue' ? ' faturacao-row--urgent' : ''}" data-invoice-id="${escapeHtml(row.report.id)}">
                <td class="faturacao-cell-client faturacao-cell-client--wrap">
                  <span class="faturacao-cell-client-name">${escapeHtml(row.nome)}</span>
                  ${row.vencimentoUrg === 'overdue' ? ' <span class="faturacao-urgent-badge">Vencida</span>' : ''}${row.vencimentoUrg === 'soon' ? ' <span class="faturacao-urgent-badge faturacao-urgent-badge--soon">A vencer</span>' : ''}
                </td>
                <td class="faturacao-cell-nif">${escapeHtml(row.nif)}</td>
                <td class="faturacao-cell-ordem"><code class="faturacao-ordem">${escapeHtml(row.numeroFatura)}</code></td>
                <td class="faturacao-col-valor">${escapeHtml(row.valorLabel)}</td>
                <td class="faturacao-cell-date">${escapeHtml(row.emissaoLabel)}</td>
                <td class="faturacao-cell-muted">${escapeHtml(row.condicaoLabel)}</td>
                <td class="faturacao-cell-date ${escapeHtml(row.vencimentoClass)}">${escapeHtml(row.vencimentoLabel)}</td>
                <td class="faturacao-col-action">
                  <button type="button" class="btn-success btn-sm faturacao-btn-compact" data-confirm-payment="${escapeHtml(row.report.id)}" title="Confirmar recebimento">
                    Recebido
                  </button>
                </td>
              </tr>
            `,
              )
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
    primary: styles.getPropertyValue('--ms-accent').trim() || '#2563eb',
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
  let billingReports = getPendingBillingReports();
  if (billingFilters.clientId) {
    billingReports = billingReports.filter(
      (r) => String(r.clientId) === String(billingFilters.clientId),
    );
  }
  const billingRows = buildBillingRows(billingReports);
  const receivableRows = buildReceivableRows(getPendingPaymentInvoices());

  replaceMountedSection('.faturacao-kpis', renderKpis(metrics));
  replaceMountedSection('.faturacao-table-section--billing', renderBillingTable(billingRows));
  replaceMountedSection('.faturacao-receivables-section', renderReceivablesTable(receivableRows));
  replaceMountedSection('.faturacao-history-section', renderHistorySection(invoices));
  bindTableActions();
  await updateChartData(metrics);
}

/** Reaplica os filtros sem reconstruir o painel inteiro (mantém foco/scroll). */
async function applyBillingFilters() {
  if (!mountRoot) return;
  const invoices = getFilteredInvoices();
  const metrics = computeFilteredMetrics(invoices);
  replaceMountedSection('.faturacao-kpis', renderKpis(metrics));
  replaceMountedSection('.faturacao-history-section', renderHistorySection(invoices));
  bindHistoryDetailActions();
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
  const defaultValor = estimateReportValue(report);
  const today = new Date().toISOString().split('T')[0];
  const client = report?.clientId ? getClient(report.clientId) : null;
  const defaultCondicao = condicaoFromClientCatalog(
    client?.condicao_pagamento ||
      client?.condicaoPagamento ||
      client?.['Condição de pagamento'],
  );

  const condicaoOptions = FATURA_CONDICAO_OPCOES.map(
    (opt) =>
      `<option value="${opt.value}"${opt.value === defaultCondicao ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`,
  ).join('');

  const statusOptions = STATUS_RECEBIMENTO_OPCOES.map(
    (opt) =>
      `<option value="${opt.value}"${opt.value === 'pendente' ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`,
  ).join('');

  const content = `
    <form id="register-invoice-form" class="faturacao-invoice-form">
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
        <label class="form-label" for="invoice-condicao">Condição de Pagamento</label>
        <select class="form-input" id="invoice-condicao" name="condicao" required>
          ${condicaoOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="invoice-status">Estado de Recebimento</label>
        <select class="form-input" id="invoice-status" name="status" required>
          ${statusOptions}
        </select>
      </div>
      <p class="text-muted faturacao-invoice-hint">
        A fatura legal é emitida no programa externo. Se este relatório for faturado em conjunto com outros do mesmo cliente, pode deixar o valor em branco. «30 Dias» / «60 Dias» calculam a data de vencimento automaticamente.
      </p>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-primary" id="btn-save-invoice">Marcar como Faturado</button>
  `;

  openModal('Registar Fatura', content, actions);

  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-invoice')?.addEventListener('click', async () => {
    const numero = document.getElementById('invoice-numero')?.value?.trim();
    const data = document.getElementById('invoice-data')?.value?.trim();
    const valor = document.getElementById('invoice-valor')?.value?.trim() || '';
    const condicao = document.getElementById('invoice-condicao')?.value;
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
      await registerReportInvoice(reportId, {
        numeroFatura: numero,
        dataFatura: data,
        valorFaturado: valor,
        condicaoPagamento: condicao,
        statusRecebimento,
      });
      closeModal();
      showToast('Fatura registada. Controlo financeiro atualizado.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Registo:', err);
      showToast(err?.message || 'Erro ao registar fatura.', 'error');
      btn.disabled = false;
      return;
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

  mountRoot?.querySelectorAll('[data-billing-dismiss]').forEach((btn) => {
    if (btn.dataset.boundBilling === '1') return;
    btn.dataset.boundBilling = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.getAttribute('data-billing-dismiss');
      if (!reportId) return;
      const report = getReport(reportId);
      const client = report ? getClient(report.clientId) : null;
      const job = report?.jobId ? getJob(report.jobId) : null;
      const label = client?.name || client?.Nome || formatOrdemLabel(job) || 'este relatório';
      const ok = window.confirm(
        `Retirar ${label} da lista por faturar?\n\nO relatório técnico aprovado mantém-se — apenas deixa de aparecer nesta fila.`,
      );
      if (!ok) return;
      void dismissPendingBillingReport(reportId).then((done) => {
        if (!done) return;
        refreshFaturacaoPanel({ soft: true }).catch(console.error);
      });
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

  const content = `
    <dl class="faturacao-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(meta.nome)}</dd></div>
      <div><dt>NIF</dt><dd>${escapeHtml(meta.nif)}</dd></div>
      <div><dt>Nº Fatura</dt><dd><code class="faturacao-ordem">${escapeHtml(report.numeroFatura || '—')}</code></dd></div>
      ${job ? `<div><dt>Ordem de produção</dt><dd>${escapeHtml(formatOrdemLabel(job))}</dd></div>` : ''}
      <div><dt>Valor faturado</dt><dd>${escapeHtml(formatCurrencyEurNullable(report.valorFaturado))}</dd></div>
      <div><dt>Data do relatório</dt><dd>${escapeHtml(formatHistoryDate(reportDateOf(report)))}</dd></div>
      <div><dt>Data da faturação</dt><dd>${escapeHtml(formatHistoryDate(invoiceDateOf(report)))}</dd></div>
      <div><dt>Data do recebimento</dt><dd>${escapeHtml(recebimentoLabel)}</dd></div>
      <div><dt>Estado</dt><dd>${pago ? 'Pago' : 'Pendente'}</dd></div>
    </dl>
  `;

  const actions = `<button type="button" class="btn-secondary" data-modal-cancel>Fechar</button>`;
  openModal('Detalhe da fatura', content, actions);
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
    'Cliente',
    'NIF',
    'Nº Fatura',
    'Valor (EUR)',
    'Estado',
    'Condição',
    'Data relatório',
    'Data recebimento',
  ];
  const lines = [header.join(';')];

  invoices.forEach((report) => {
    const meta = resolveClientMeta(report.clientId);
    const recebimento = report.dataRecebimento
      ? String(report.dataRecebimento).split('T')[0]
      : '';
    const row = [
      invoiceDateOf(report),
      meta.nome,
      meta.nif,
      report.numeroFatura || '',
      Number.isFinite(Number(report.valorFaturado)) ? Number(report.valorFaturado) : '',
      labelStatusRecebimento(report.statusRecebimento),
      labelFaturaCondicao(report.faturaCondicaoPagamento),
      reportDateOf(report),
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

/** Destaca relatório após refresh do painel de faturação. */
export function queueBillingReportFocus(reportId) {
  highlightReportId = reportId ? String(reportId) : null;
}

/** Destaca e faz scroll até um relatório na tabela «por faturar». */
export function focusBillingReport(reportId) {
  if (!reportId || !mountRoot) return;
  highlightReportId = String(reportId);
  const row = mountRoot.querySelector(`[data-report-id="${CSS.escape(highlightReportId)}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('faturacao-row--highlight');
  setTimeout(() => row.classList.remove('faturacao-row--highlight'), 4500);
  highlightReportId = null;
}

function applyBillingHighlight() {
  if (!highlightReportId) return;
  focusBillingReport(highlightReportId);
}

function renderPanel() {
  const invoices = getFilteredInvoices();
  const metrics = computeFilteredMetrics(invoices);
  let billingReports = getPendingBillingReports();
  if (billingFilters.clientId) {
    billingReports = billingReports.filter(
      (r) => String(r.clientId) === String(billingFilters.clientId),
    );
  }
  const billingRows = buildBillingRows(billingReports);
  const receivableRows = buildReceivableRows(getPendingPaymentInvoices());

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
      ${renderReceivablesTable(receivableRows)}
      ${renderHistorySection(invoices)}
    </div>
  `;
}

/**
 * @param {{ soft?: boolean }} [options]
 */
export async function refreshFaturacaoPanel(options = {}) {
  if (!mountRoot) return;

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
