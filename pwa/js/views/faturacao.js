/**
 * Painel de Faturação — controlo interno pós-aprovação (emissão legal fora da app).
 */

import {
  getPendingBillingReports,
  getClient,
  getJob,
  registerReportInvoice,
  openModal,
  closeModal,
  escapeHtml,
  formatDate,
  showToast,
  formatRelatoriosError,
} from '../app.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import { PAYMENT_CONDITION_OPTIONS } from './client-profile-drawer.js';

const URGENT_PAYMENT_TERMS = new Set(['pronto pagamento', 'semanal']);
const URGENT_DAYS = 3;
const DEFAULT_ESTIMATE_EUR = 120;

/** Valores indicativos por tipo de serviço (até existir preço real no relatório) */
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
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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
    maximumFractionDigits: 0,
  }).format(value);
}

function resolveClientMeta(clientId) {
  const client = getClient(clientId);
  const nome =
    client?.name ||
    client?.Nome ||
    client?.nome ||
    '—';
  const nif = client?.NIF || client?.nif || '—';
  const condicao = normalizePaymentTerm(
    client?.condicao_pagamento ||
      client?.condicaoPagamento ||
      client?.['Condição de pagamento'] ||
      '',
  );
  return { client, nome, nif, condicao };
}

function buildRows(reports) {
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

function groupByPaymentCondition(rows) {
  const counts = new Map();
  PAYMENT_CONDITION_OPTIONS.forEach((opt) => counts.set(opt, 0));
  counts.set('Não definida', 0);

  rows.forEach((row) => {
    const key = row.condicao;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const labels = [];
  const values = [];
  for (const [label, count] of counts.entries()) {
    if (count > 0) {
      labels.push(label);
      values.push(count);
    }
  }

  if (!labels.length) {
    labels.push('Sem pendentes');
    values.push(0);
  }

  return { labels, values };
}

function renderKpis(rows) {
  const total = rows.length;
  const totalEstimate = rows.reduce((sum, r) => sum + r.estimate, 0);
  const urgentCount = rows.filter((r) => r.urgent).length;

  return `
    <section class="faturacao-kpis rh-section" aria-label="Indicadores de faturação">
      <div class="dashboard-metrics-grid faturacao-kpis-grid">
        <article class="dashboard-metric-card dashboard-metric-card--warning">
          <p class="dashboard-metric-value">${total}</p>
          <p class="dashboard-metric-label">Aguardar Faturação</p>
          <p class="faturacao-kpi-sub">${formatCurrencyEur(totalEstimate)} estimado</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--primary">
          <p class="dashboard-metric-value">${urgentCount}</p>
          <p class="dashboard-metric-label">Fora do Prazo / Urgente</p>
          <p class="faturacao-kpi-sub">Pronto pagamento ou semanal · &gt; ${URGENT_DAYS} dias</p>
        </article>
      </div>
    </section>
  `;
}

function renderChartSection() {
  return `
    <section class="faturacao-chart-section rh-section glass-card" aria-label="Gráfico por condição de pagamento">
      <h3 class="ms-h2 faturacao-section-title">Pendentes por condição de pagamento</h3>
      <div class="faturacao-chart-wrap">
        <canvas id="faturacao-chart-canvas" aria-label="Gráfico de barras — relatórios pendentes por condição de pagamento"></canvas>
      </div>
    </section>
  `;
}

function renderTable(rows) {
  if (!rows.length) {
    return `
      <section class="faturacao-table-section rh-section glass-card">
        <h3 class="ms-h2 faturacao-section-title">Relatórios por faturar</h3>
        <p class="text-muted faturacao-empty">Nenhum relatório aprovado aguarda faturação.</p>
      </section>
    `;
  }

  return `
    <section class="faturacao-table-section rh-section glass-card">
      <h3 class="ms-h2 faturacao-section-title">Relatórios por faturar <span class="badge-count">${rows.length}</span></h3>
      <div class="rh-table-scroll">
        <table class="rh-data-table faturacao-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">NIF</th>
              <th scope="col">Nº Relatório</th>
              <th scope="col">Data de Aprovação</th>
              <th scope="col">Condição de Pagamento</th>
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
                    Registar Fatura
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
    barColor: styles.getPropertyValue('--ms-accent').trim() || '#2563eb',
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
          label: (ctx) => `${ctx.parsed.y} relatório(s)`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: textColor, maxRotation: 45, minRotation: 0 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
          stepSize: 1,
          precision: 0,
        },
        grid: { color: gridColor },
      },
    },
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

async function updateChartData(rows) {
  const canvas = mountRoot?.querySelector('#faturacao-chart-canvas');
  if (!canvas) return;

  const { labels, values } = groupByPaymentCondition(rows);

  try {
    const Chart = await loadChartJs();

    if (billingChart) {
      billingChart.data.labels = labels;
      billingChart.data.datasets[0].data = values;
      billingChart.update('active');
      return;
    }

    const { barColor, gridColor, textColor } = getChartThemeColors();
    billingChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Relatórios pendentes',
            data: values,
            backgroundColor: barColor,
            borderRadius: 6,
            maxBarThickness: 48,
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

  const rows = buildRows(getPendingBillingReports());

  replaceMountedSection('.faturacao-kpis', renderKpis(rows));
  replaceMountedSection('.faturacao-table-section', renderTable(rows));
  bindTableActions();
  await updateChartData(rows);
}

function openRegisterInvoiceModal(reportId) {
  const today = new Date().toISOString().split('T')[0];
  const content = `
    <form id="register-invoice-form" class="faturacao-invoice-form">
      <div class="form-group">
        <label class="form-label" for="invoice-numero">Número da Fatura</label>
        <input type="text" class="form-input" id="invoice-numero" name="numero" required
          placeholder="ex: FT 2026/123" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="invoice-data">Data da Fatura</label>
        <input type="date" class="form-input" id="invoice-data" name="data" required value="${today}">
      </div>
      <p class="text-muted faturacao-invoice-hint">
        A fatura é emitida no programa externo. Este registo apenas fecha o controlo interno.
      </p>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Cancelar</button>
    <button type="button" class="btn-primary" id="btn-save-invoice">Guardar</button>
  `;

  openModal('Registar Fatura', content, actions);

  document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-invoice')?.addEventListener('click', async () => {
    const numero = document.getElementById('invoice-numero')?.value?.trim();
    const data = document.getElementById('invoice-data')?.value?.trim();
    const btn = document.getElementById('btn-save-invoice');

    if (!numero || !data) {
      showToast('Preencha o número e a data da fatura.', 'warning');
      return;
    }

    btn.disabled = true;
    try {
      await registerReportInvoice(reportId, { numeroFatura: numero, dataFatura: data });
      closeModal();
      showToast('Fatura registada. Relatório removido da fila de pendentes.', 'success');
      await refreshFaturacaoPanel({ soft: true });
    } catch (err) {
      console.error('[Faturação] Registo:', err);
      showToast(formatRelatoriosError(err) || err?.message || 'Erro ao registar fatura.', 'error');
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
}

function renderPanel() {
  const reports = getPendingBillingReports();
  const rows = buildRows(reports);

  return `
    <div class="faturacao-panel dashboard-panel-inner">
      <header class="faturacao-header rh-section">
        <h2 class="ms-h2">Controlo de Faturação</h2>
        <p class="text-muted faturacao-lead">
          Relatórios aprovados aguardam registo da fatura emitida no programa externo.
          Nenhum relatório aprovado deve ficar por faturar.
        </p>
      </header>
      ${renderKpis(rows)}
      ${renderChartSection()}
      ${renderTable(rows)}
    </div>
  `;
}

/**
 * @param {{ soft?: boolean }} [options]
 * soft=true — atualiza KPIs/tabela e usa chart.update() (sem destruir o gráfico)
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
  const rows = buildRows(getPendingBillingReports());
  await updateChartData(rows);
}

export function initFaturacaoPanel(root) {
  mountRoot = root;
  return refreshFaturacaoPanel();
}
