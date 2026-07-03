/**
 * Métricas rápidas do painel RH — KPIs acionáveis + resumo de equipa.
 */

import { escapeHtml } from '../html-utils.js';
import {
  getDB,
  getPendingReports,
  getPendingBillingCount,
  getAllJobs,
  getWeekDates,
  getAllTechnicians,
} from '../app.js';
import {
  getProductionClientsCatalog,
  isProductionCatalogReady,
} from '../clients-catalog.js';
import { getTeamStatsSummary } from '../team-stats.js';
import { computeExtendedRhMetrics } from '../rh-panel-utils.js';

export function computeDashboardMetrics(db = getDB()) {
  const catalog = isProductionCatalogReady()
    ? getProductionClientsCatalog({ warn: false })
    : [];
  const jobs = db.jobs || getAllJobs();
  const pending = getPendingReports();
  const today = new Date().toISOString().split('T')[0];
  const weekSet = new Set(getWeekDates());
  const team = getTeamStatsSummary(getAllTechnicians());

  const base = {
    totalClients: catalog.length,
    pendingReports: pending.length,
    jobsToday: jobs.filter((j) => j.date === today).length,
    jobsThisWeek: jobs.filter((j) => weekSet.has(j.date)).length,
    scheduled: jobs.filter((j) => j.status === 'scheduled').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
    technicians: getAllTechnicians().length,
    pendingBilling: getPendingBillingCount(),
    teamTotalConcluidos: team.totalGlobal,
    teamTopMonth: team.topMonth
      ? `${team.topMonth.tech.name} (${team.topMonth.month})`
      : '—',
    teamMonthLabel: team.monthLabel,
  };

  return computeExtendedRhMetrics(base);
}

function renderMetricCard(card) {
  const actionAttr = card.action ? ` data-metric-action="${card.action}"` : '';
  const btnRole = card.action ? ' role="button" tabindex="0"' : '';
  const label = escapeHtml(card.label);
  const value = escapeHtml(String(card.value ?? ''));
  return `
    <article class="dashboard-metric-card dashboard-metric-card--${card.accent} dashboard-metric-card--${card.size || 'primary'}${card.action ? ' dashboard-metric-card--clickable' : ''}"${actionAttr}${btnRole} aria-label="${label}">
      <p class="dashboard-metric-value">${value}</p>
      <p class="dashboard-metric-label">${label}</p>
    </article>
  `;
}

export function renderMetricsSection(metrics) {
  const primaryCards = [
    {
      label: 'Relatórios pendentes RH',
      value: metrics.pendingReports,
      accent: metrics.pendingReports > 0 ? 'warning' : 'muted',
      action: 'go-pending',
    },
    {
      label: 'Por faturar',
      value: metrics.pendingBilling,
      accent: metrics.pendingBilling > 0 ? 'billing-alert' : 'muted',
      action: 'go-billing',
    },
    {
      label: 'Trabalhos hoje',
      value: metrics.jobsToday,
      accent: 'primary',
      action: 'go-calendar-today',
    },
    {
      label: 'Concluídos esta semana',
      value: metrics.completedThisWeek,
      accent: 'success',
      action: 'go-calendar-week',
    },
  ];

  const avgLabel =
    metrics.avgApprovalHours != null
      ? `${metrics.avgApprovalHours}h em média`
      : '—';

  const secondaryCards = [
    {
      label: `Mais saídas — ${metrics.teamMonthLabel}`,
      value: metrics.teamTopMonth,
      accent: 'success',
      size: 'secondary',
    },
    {
      label: 'Tempo médio de aprovação',
      value: avgLabel,
      accent: 'muted',
      size: 'secondary',
    },
    {
      label: 'Pendentes por técnico (top)',
      value: metrics.topPendingTech,
      accent: metrics.pendingReports > 0 ? 'warning' : 'muted',
      size: 'secondary',
    },
    {
      label: 'Clientes no catálogo',
      value: metrics.totalClients,
      accent: 'muted',
      size: 'secondary',
      action: 'go-clients',
    },
    {
      label: 'Trabalhos esta semana',
      value: metrics.jobsThisWeek,
      accent: 'muted',
      size: 'secondary',
    },
    {
      label: 'Técnicos ativos',
      value: metrics.technicians,
      accent: 'muted',
      size: 'secondary',
      action: 'go-employees',
    },
  ];

  const pendingByTechRows = Object.entries(metrics.pendingByTech || {})
    .sort((a, b) => b[1] - a[1])
    .map(
      ([name, count]) =>
        `<li><span>${escapeHtml(name)}</span><strong>${escapeHtml(String(count))}</strong></li>`,
    )
    .join('');

  const teamList =
    pendingByTechRows ||
    '<li class="dashboard-team-list-empty"><span>Sem pendentes</span></li>';

  return `
    <section class="dashboard-metrics rh-section" data-dashboard-metrics aria-labelledby="dashboard-metrics-title">
      <h3 id="dashboard-metrics-title" class="dashboard-section-title">Métricas rápidas</h3>
      <div class="dashboard-metrics-grid dashboard-metrics-grid--primary">
        ${primaryCards.map(renderMetricCard).join('')}
      </div>
      <details class="dashboard-metrics-more">
        <summary>Mais indicadores</summary>
        <div class="dashboard-metrics-grid dashboard-metrics-grid--secondary">
          ${secondaryCards.map(renderMetricCard).join('')}
        </div>
        <div class="dashboard-team-pending">
          <h4 class="dashboard-team-pending-title">Pendentes por técnico</h4>
          <ul class="dashboard-team-pending-list">${teamList}</ul>
        </div>
      </details>
    </section>
  `;
}
