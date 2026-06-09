/**
 * Painel de Faturação — contas a receber e fluxo de caixa (controlo interno).
 */

import {
  getPendingBillingReports,
  getPendingPaymentInvoices,
  getBillingFinancialMetrics,
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

function buildBillingRows(reports) {
  return reports.map((report) => {
    const meta = resolveClientMeta(report.clientId);
    const job = report.jobId ? getJob(report.jobId) : null;
    return {
      report,
      ...meta,
      ordem: formatOrdemLabel(job),
      approvedLabel: report.approvedAt ? formatDate(report.approvedAt) : '—',
      urgent: isBillingUrgent(report, meta.client),
      estimate: estimateReportValue(report),
    };
  });
}

function buildReceivableRows(reports) {
  return reports.map((report) => {
    const meta = resolveClientMeta(report.clientId);
    const valor = Number(report.valorFaturado) || 0;
    const vencimento = report.dataVencimento || null;
    const vencimentoUrg = vencimentoUrgency(vencimento);
    return {
      report,
      ...meta,
      numeroFatura: report.numeroFatura || '—',
      valor,
      valorLabel: formatCurrencyEur(valor),
      emissaoLabel: report.dataFatura ? formatDate(report.dataFatura) : '—',
      condicaoLabel: labelFaturaCondicao(report.faturaCondicaoPagamento),
      statusLabel: labelStatusRecebimento(report.statusRecebimento),
      vencimentoLabel: vencimento ? formatDate(vencimento) : '—',
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
        <table class="rh-data-table faturacao-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">NIF</th>
              <th scope="col">Nº Relatório</th>
              <th scope="col">Data de Aprovação</th>
              <th scope="col">Condição Cadastro</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr class="rh-data-table-row${row.urgent ? ' faturacao-row--urgent' : ''}" data-report-id="${escapeHtml(row.report.id)}">
                <td>${escapeHtml(row.nome)}${row.urgent ? ' <span class="faturacao-urgent-badge" title="Fora do prazo">Urgente</span>' : ''}</td>
                <td>${escapeHtml(row.nif)}</td>
                <td><code class="faturacao-ordem">${escapeHtml(row.ordem)}</code></td>
                <td>${escapeHtml(row.approvedLabel)}</td>
                <td>${escapeHtml(row.condicao)}</td>
                <td class="faturacao-col-action">
                  <button type="button" class="btn-primary btn-sm" data-register-invoice="${escapeHtml(row.report.id)}">
                    Marcar como Faturado
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
        <table class="rh-data-table faturacao-table faturacao-table--receivables">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">NIF</th>
              <th scope="col">Nº Fatura</th>
              <th scope="col">Valor</th>
              <th scope="col">Data de Emissão</th>
              <th scope="col">Condição de Pagamento</th>
              <th scope="col">Data de Vencimento</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr class="rh-data-table-row${row.vencimentoUrg === 'overdue' ? ' faturacao-row--urgent' : ''}" data-invoice-id="${escapeHtml(row.report.id)}">
                <td>${escapeHtml(row.nome)}${row.vencimentoUrg === 'overdue' ? ' <span class="faturacao-urgent-badge">Vencida</span>' : ''}${row.vencimentoUrg === 'soon' ? ' <span class="faturacao-urgent-badge faturacao-urgent-badge--soon">A vencer</span>' : ''}</td>
                <td>${escapeHtml(row.nif)}</td>
                <td><code class="faturacao-ordem">${escapeHtml(row.numeroFatura)}</code></td>
                <td class="faturacao-col-valor">${escapeHtml(row.valorLabel)}</td>
                <td>${escapeHtml(row.emissaoLabel)}</td>
                <td>${escapeHtml(row.condicaoLabel)}</td>
                <td class="${escapeHtml(row.vencimentoClass)}">${escapeHtml(row.vencimentoLabel)}</td>
                <td class="faturacao-col-action">
                  <button type="button" class="btn-success btn-sm" data-confirm-payment="${escapeHtml(row.report.id)}">
                    Confirmar Recebimento
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

  const metrics = getBillingFinancialMetrics();
  const billingRows = buildBillingRows(getPendingBillingReports());
  const receivableRows = buildReceivableRows(getPendingPaymentInvoices());

  replaceMountedSection('.faturacao-kpis', renderKpis(metrics));
  replaceMountedSection('.faturacao-table-section--billing', renderBillingTable(billingRows));
  replaceMountedSection('.faturacao-receivables-section', renderReceivablesTable(receivableRows));
  bindTableActions();
  await updateChartData(metrics);
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
        <input type="number" class="form-input" id="invoice-valor" name="valor" required
          min="0.01" step="0.01" value="${defaultValor.toFixed(2)}">
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
        A fatura legal é emitida no programa externo. «30 Dias» / «60 Dias» calculam a data de vencimento automaticamente.
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
    const valor = Number(document.getElementById('invoice-valor')?.value);
    const condicao = document.getElementById('invoice-condicao')?.value;
    const statusRecebimento = document.getElementById('invoice-status')?.value;
    const btn = document.getElementById('btn-save-invoice');

    if (!numero || !data) {
      showToast('Preencha o número e a data de emissão.', 'warning');
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      showToast('Indique um valor total faturado válido.', 'warning');
      return;
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
    }
  });
}

function bindTableActions() {
  mountRoot?.querySelectorAll('[data-register-invoice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reportId = btn.getAttribute('data-register-invoice');
      if (reportId) openRegisterInvoiceModal(reportId);
    });
  });

  mountRoot?.querySelectorAll('[data-confirm-payment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reportId = btn.getAttribute('data-confirm-payment');
      if (!reportId) return;
      btn.disabled = true;
      try {
        await confirmInvoicePayment(reportId);
        showToast('Recebimento confirmado. Valor movido para caixa.', 'success');
        await refreshFaturacaoPanel({ soft: true });
      } catch (err) {
        console.error('[Faturação] Confirmar recebimento:', err);
        showToast(err?.message || 'Erro ao confirmar recebimento.', 'error');
        btn.disabled = false;
      }
    });
  });
}

function renderPanel() {
  const metrics = getBillingFinancialMetrics();
  const billingRows = buildBillingRows(getPendingBillingReports());
  const receivableRows = buildReceivableRows(getPendingPaymentInvoices());

  return `
    <div class="faturacao-panel dashboard-panel-inner">
      <header class="faturacao-header rh-section">
        <h2 class="ms-h2">Controlo de Faturação</h2>
        <p class="text-muted faturacao-lead">
          Emita faturas no programa externo e registe aqui o valor, prazo e recebimentos para acompanhar o fluxo de caixa.
        </p>
      </header>
      ${renderKpis(metrics)}
      ${renderChartSection()}
      ${renderBillingTable(billingRows)}
      ${renderReceivablesTable(receivableRows)}
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
  await updateChartData(getBillingFinancialMetrics());
}

export function initFaturacaoPanel(root) {
  mountRoot = root;
  return refreshFaturacaoPanel();
}
