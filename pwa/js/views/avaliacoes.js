/**
 * Painel RH — avaliações do cliente por visita.
 */

import { escapeHtml, getClient, showToast } from '../app.js';
import { formatDateLong } from '../date-utils.js';
import { fetchAllAvaliacoes, formatAvaliacaoBadge } from '../avaliacoes-db.js';
import { getServico } from '../servicos-db.js';
import {
  buildAvaliacoesAuditSummary,
  listAvailableAvaliacaoYears,
} from '../avaliacoes-stats.js';
import { loadChartJs } from '../chart-js-loader.js';
import { formatOrdemLabel } from '../report-review-ui.js';

let mountRoot = null;
let activeFilter = 'todas';
let selectedYear = String(new Date().getFullYear());
let rowsCache = [];
let distributionChart = null;
let monthlyChart = null;

function scoreClass(score) {
  if (score === 3) return 'avaliacao-score--good';
  if (score === 2) return 'avaliacao-score--mid';
  if (score === 1) return 'avaliacao-score--bad';
  return '';
}

function enrichRow(avaliacao) {
  const client = avaliacao.clienteId ? getClient(avaliacao.clienteId) : null;
  const servico = avaliacao.servicoId ? getServico(avaliacao.servicoId) : null;
  const visitDate = avaliacao.servicoDate || servico?.date || '';
  const opLabel = servico ? formatOrdemLabel(servico, client) : '';
  const visitSummary = visitDate
    ? `${formatDateLong(visitDate)}${opLabel ? ` · ${opLabel}` : ''}`
    : 'Data da visita indisponível';
  return {
    ...avaliacao,
    clientName: client?.name || client?.Nome || 'Cliente',
    visitDate,
    visitDateLabel: visitDate ? formatDateLong(visitDate) : '—',
    visitSummary,
    opLabel,
    respondedAtLabel: avaliacao.criadoEm
      ? formatDateLong(String(avaliacao.criadoEm).slice(0, 10))
      : '—',
  };
}

function filterRows(rows) {
  if (activeFilter === 'todas') return rows;
  const target = Number(activeFilter);
  return rows.filter((row) => row.score === target);
}

function summarizeCounts(rows) {
  return {
    total: rows.length,
    good: rows.filter((r) => r.score === 3).length,
    mid: rows.filter((r) => r.score === 2).length,
    bad: rows.filter((r) => r.score === 1).length,
  };
}

function destroyCharts() {
  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }
  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }
}

function getChartThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const text =
    styles.getPropertyValue('--text-primary').trim() ||
    styles.getPropertyValue('--text-muted').trim() ||
    '#334155';
  const grid = styles.getPropertyValue('--border-subtle').trim() || '#e2e8f0';
  return { textColor: text, gridColor: grid };
}

function renderYearOptions(years) {
  const current = String(new Date().getFullYear());
  const unique = [...new Set([current, ...years])].sort((a, b) => b.localeCompare(a));
  if (!unique.includes(selectedYear) && selectedYear !== 'all') {
    selectedYear = unique[0] || current;
  }
  return unique
    .map(
      (year) =>
        `<option value="${escapeHtml(year)}"${selectedYear === year ? ' selected' : ''}>${escapeHtml(year)}</option>`,
    )
    .join('');
}

function renderAuditSection(summary) {
  const { counts, satisfiedPercent, satisfactionIndex } = summary;
  const yearLabel = selectedYear === 'all' ? 'Todos os anos' : selectedYear;

  return `
    <section class="avaliacoes-audit-section glass-card" aria-label="Resumo para auditoria">
      <div class="avaliacoes-audit-header">
        <div>
          <h3 class="avaliacoes-audit-title">Resumo ${escapeHtml(yearLabel)}</h3>
          <p class="text-muted avaliacoes-audit-lead">Útil para fecho de ano e auditoria da satisfação do cliente.</p>
        </div>
        <div class="avaliacoes-audit-controls">
          <label class="avaliacoes-year-label">
            <span class="text-muted">Ano</span>
            <select id="avaliacoes-year-select" class="form-select-sm">
              ${renderYearOptions(listAvailableAvaliacaoYears(rowsCache))}
              <option value="all"${selectedYear === 'all' ? ' selected' : ''}>Todos</option>
            </select>
          </label>
          <button type="button" class="btn-outline btn-sm" id="avaliacoes-export-csv">Exportar CSV</button>
        </div>
      </div>
      <div class="avaliacoes-kpi-grid">
        <article class="avaliacoes-kpi">
          <p class="avaliacoes-kpi__label">Respostas</p>
          <p class="avaliacoes-kpi__value">${counts.total}</p>
        </article>
        <article class="avaliacoes-kpi">
          <p class="avaliacoes-kpi__label">Satisfeitos</p>
          <p class="avaliacoes-kpi__value">${satisfiedPercent != null ? `${satisfiedPercent}%` : '—'}</p>
          <p class="avaliacoes-kpi__hint text-muted">${counts.good} de ${counts.total || 0}</p>
        </article>
        <article class="avaliacoes-kpi">
          <p class="avaliacoes-kpi__label">Índice de satisfação</p>
          <p class="avaliacoes-kpi__value">${satisfactionIndex != null ? `${satisfactionIndex}/100` : '—'}</p>
          <p class="avaliacoes-kpi__hint text-muted">😊 100% · 😐 50% · 😞 0%</p>
        </article>
      </div>
      <div class="avaliacoes-charts-grid">
        <div class="avaliacoes-chart-card">
          <h4 class="avaliacoes-chart-title">Distribuição</h4>
          <div class="avaliacoes-chart-wrap avaliacoes-chart-wrap--donut">
            <canvas id="avaliacoes-distribution-chart" aria-label="Distribuição das avaliações por tipo"></canvas>
          </div>
        </div>
        <div class="avaliacoes-chart-card">
          <h4 class="avaliacoes-chart-title">Por mês</h4>
          <div class="avaliacoes-chart-wrap">
            <canvas id="avaliacoes-monthly-chart" aria-label="Avaliações por mês"></canvas>
          </div>
        </div>
      </div>
    </section>`;
}

function renderFilterBar(counts) {
  const chips = [
    { id: 'todas', label: 'Todas', count: counts.total },
    { id: '3', label: '😊 Satisfeito', count: counts.good },
    { id: '2', label: '😐 Regular', count: counts.mid },
    { id: '1', label: '😞 Insatisfeito', count: counts.bad },
  ];

  return `
    <div class="rh-filter-bar avaliacoes-filter-bar" role="tablist" aria-label="Filtrar avaliações">
      ${chips
        .map(
          (chip) => `
        <button type="button"
          class="rh-filter-chip${activeFilter === chip.id ? ' is-active' : ''}"
          data-avaliacao-filter="${chip.id}">
          ${escapeHtml(chip.label)}${chip.count ? ` <span class="rh-filter-chip__count">${chip.count}</span>` : ''}
        </button>`,
        )
        .join('')}
    </div>`;
}

function renderRows(rows) {
  if (!rows.length) {
    return `<p class="avaliacoes-panel-empty text-muted">Nenhuma avaliação neste filtro.</p>`;
  }

  return `
    <div class="avaliacoes-list" role="list">
      ${rows
        .map(
          (row) => `
        <article class="avaliacoes-list-item ${scoreClass(row.score)}" role="listitem">
          <div class="avaliacoes-list-item__score" aria-hidden="true">${row.emoji}</div>
          <div class="avaliacoes-list-item__body">
            <h3 class="avaliacoes-list-item__title">${escapeHtml(row.clientName)}</h3>
            <p class="avaliacoes-list-item__meta text-muted">
              Visita: <strong>${escapeHtml(row.visitSummary)}</strong> · Resposta: ${escapeHtml(row.respondedAtLabel)}
            </p>
            <p class="avaliacoes-list-item__label">${escapeHtml(formatAvaliacaoBadge(row))}</p>
          </div>
          ${
            row.servicoId
              ? `<button type="button" class="btn-outline btn-sm" data-open-servico="${escapeHtml(row.servicoId)}" data-visit-date="${escapeHtml(row.visitDate)}" data-client-name="${escapeHtml(row.clientName)}" data-visit-summary="${escapeHtml(row.visitSummary)}">Ver no calendário</button>`
              : ''
          }
        </article>`,
        )
        .join('')}
    </div>`;
}

async function updateCharts(summary) {
  const distCanvas = mountRoot?.querySelector('#avaliacoes-distribution-chart');
  const monthCanvas = mountRoot?.querySelector('#avaliacoes-monthly-chart');
  if (!distCanvas || !monthCanvas) return;

  try {
    const Chart = await loadChartJs();
    const { textColor, gridColor } = getChartThemeColors();
    const { distribution, monthly } = summary;

    if (distributionChart) distributionChart.destroy();
    distributionChart = new Chart(distCanvas, {
      type: 'doughnut',
      data: {
        labels: distribution.labels,
        datasets: [
          {
            data: distribution.values,
            backgroundColor: distribution.colors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, boxWidth: 12 },
          },
        },
      },
    });

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(monthCanvas, {
      type: 'bar',
      data: {
        labels: monthly.labels,
        datasets: monthly.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: textColor },
            grid: { color: gridColor },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { color: textColor, precision: 0 },
            grid: { color: gridColor },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, boxWidth: 12 },
          },
        },
      },
    });
  } catch (err) {
    console.warn('[Avaliações] Gráficos:', err);
  }
}

function exportAuditCsv(rows) {
  const header = ['Ano', 'Data resposta', 'Cliente', 'Visita', 'Score', 'Avaliação'];
  const lines = [header.join(';')];
  for (const row of rows) {
    const cells = [
      String(row.criadoEm || '').slice(0, 4),
      String(row.criadoEm || '').slice(0, 10),
      row.clientName || '',
      row.visitSummary || '',
      String(row.score || ''),
      formatAvaliacaoBadge(row),
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `avaliacoes-clientes-${selectedYear}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindPanelEvents(enriched, auditRows) {
  mountRoot.querySelectorAll('[data-avaliacao-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.avaliacaoFilter || 'todas';
      renderPanel();
    });
  });

  mountRoot.querySelectorAll('[data-open-servico]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const servicoId = btn.dataset.openServico;
      if (!servicoId) return;
      window.dispatchEvent(
        new CustomEvent('admin-open-calendar-item', {
          detail: {
            jobId: servicoId,
            visitDate: btn.dataset.visitDate || '',
            clientName: btn.dataset.clientName || '',
            visitSummary: btn.dataset.visitSummary || '',
          },
        }),
      );
    });
  });

  mountRoot.querySelector('#avaliacoes-year-select')?.addEventListener('change', (event) => {
    selectedYear = event.target.value || String(new Date().getFullYear());
    renderPanel();
  });

  mountRoot.querySelector('#avaliacoes-export-csv')?.addEventListener('click', () => {
    if (!auditRows.length) {
      showToast('Não há avaliações para exportar neste período.', 'info');
      return;
    }
    exportAuditCsv(auditRows);
    showToast('CSV exportado.', 'success', 4000);
  });
}

function renderPanel() {
  if (!mountRoot) return;
  destroyCharts();

  const enriched = rowsCache.map(enrichRow);
  const auditSummary = buildAvaliacoesAuditSummary(enriched, selectedYear);
  const auditRows =
    selectedYear === 'all'
      ? enriched
      : enriched.filter((row) => String(row.criadoEm || '').slice(0, 4) === selectedYear);
  const visible = filterRows(auditRows);
  const counts = summarizeCounts(auditRows);

  mountRoot.innerHTML = `
    <div class="avaliacoes-panel-inner">
      <div class="panel-header">
        <div>
          <h2>Avaliações dos Clientes</h2>
          <p class="text-muted avaliacoes-panel-lead">Feedback após o e-mail da visita — um registo por serviço.</p>
        </div>
      </div>
      ${auditRows.length ? renderAuditSection(auditSummary) : ''}
      ${renderFilterBar(counts)}
      ${renderRows(visible)}
    </div>`;

  bindPanelEvents(enriched, auditRows);
  if (auditRows.length) {
    void updateCharts(auditSummary);
  }
}

export async function refreshAvaliacoesPanel() {
  if (!mountRoot) return;
  try {
    const { ensureServicosLoadedSafe } = await import('../servicos-db.js');
    await ensureServicosLoadedSafe();
    rowsCache = await fetchAllAvaliacoes();
    renderPanel();
  } catch (err) {
    console.error('[Avaliações] refresh:', err);
    showToast('Não foi possível carregar as avaliações.', 'error');
  }
}

export function initAvaliacoesPanel(root) {
  mountRoot = root;
  return refreshAvaliacoesPanel();
}

export function countAvaliacoesInsatisfeitas(rows = rowsCache) {
  return rows.filter((row) => row.score === 1).length;
}

export function teardownAvaliacoesPanel() {
  destroyCharts();
  mountRoot = null;
}
