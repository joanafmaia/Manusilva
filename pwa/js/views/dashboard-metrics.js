/**
 * Métricas rápidas do painel RH — sem renderizar a lista de clientes.
 */

import {
  getDB,
  getPendingReports,
  getPendingBillingReports,
  getAllJobs,
  getWeekDates,
  getAllTechnicians,
} from '../app.js';
import {
  getProductionClientsCatalog,
  isProductionCatalogReady,
} from '../clients-catalog.js';
import { getTeamStatsSummary } from '../team-stats.js';

export function computeDashboardMetrics(db = getDB()) {
  const catalog = isProductionCatalogReady()
    ? getProductionClientsCatalog({ warn: false })
    : [];
  const jobs = db.jobs || getAllJobs();
  const pending = getPendingReports();
  const today = new Date().toISOString().split('T')[0];
  const weekSet = new Set(getWeekDates());
  const team = getTeamStatsSummary(getAllTechnicians());

  return {
    totalClients: catalog.length,
    pendingReports: pending.length,
    jobsToday: jobs.filter((j) => j.date === today).length,
    jobsThisWeek: jobs.filter((j) => weekSet.has(j.date)).length,
    scheduled: jobs.filter((j) => j.status === 'scheduled').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
    technicians: getAllTechnicians().length,
    pendingBilling: getPendingBillingReports().length,
    teamTotalConcluidos: team.totalGlobal,
    teamTopMonth: team.topMonth
      ? `${team.topMonth.tech.name} (${team.topMonth.month})`
      : '—',
    teamMonthLabel: team.monthLabel,
  };
}

export function renderMetricsSection(metrics) {
  const cards = [
    { label: `Mais saídas — ${metrics.teamMonthLabel}`, value: metrics.teamTopMonth, accent: 'success' },
    { label: 'Intervenções concluídas (total)', value: metrics.teamTotalConcluidos, accent: 'primary' },
    { label: 'Clientes no catálogo', value: metrics.totalClients, accent: 'primary' },
    { label: 'Relatórios pendentes', value: metrics.pendingReports, accent: 'warning' },
    { label: 'Trabalhos hoje', value: metrics.jobsToday, accent: 'primary' },
    { label: 'Trabalhos esta semana', value: metrics.jobsThisWeek, accent: 'muted' },
    { label: 'Agendados', value: metrics.scheduled, accent: 'muted' },
    { label: 'Em progresso', value: metrics.inProgress, accent: 'success' },
    { label: 'Técnicos ativos', value: metrics.technicians, accent: 'muted' },
    {
      label: 'Relatórios por faturar',
      value: metrics.pendingBilling,
      // Laranja de alerta quando há relatórios aprovados à espera de fatura
      accent: metrics.pendingBilling > 0 ? 'billing-alert' : 'muted',
    },
  ];

  return `
    <section class="dashboard-metrics rh-section" data-dashboard-metrics aria-labelledby="dashboard-metrics-title">
      <h3 id="dashboard-metrics-title" class="dashboard-section-title">Métricas rápidas</h3>
      <div class="dashboard-metrics-grid">
        ${cards
          .map(
            (c) => `
          <article class="dashboard-metric-card dashboard-metric-card--${c.accent}">
            <p class="dashboard-metric-value">${c.value}</p>
            <p class="dashboard-metric-label">${c.label}</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `;
}
