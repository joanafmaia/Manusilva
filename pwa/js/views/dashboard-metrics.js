/**
 * Métricas rápidas do painel RH — sem renderizar a lista de clientes.
 */

import { getDB, getPendingReports, getAllJobs, getWeekDates, getAllTechnicians } from '../app.js';
import { getProductionClientsCatalog } from '../clients-catalog.js';

export function computeDashboardMetrics(db = getDB()) {
  const catalog = getProductionClientsCatalog();
  const jobs = db.jobs || getAllJobs();
  const pending = getPendingReports();
  const today = new Date().toISOString().split('T')[0];
  const weekSet = new Set(getWeekDates());

  return {
    totalClients: catalog.length,
    pendingReports: pending.length,
    jobsToday: jobs.filter((j) => j.date === today).length,
    jobsThisWeek: jobs.filter((j) => weekSet.has(j.date)).length,
    scheduled: jobs.filter((j) => j.status === 'scheduled').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
    technicians: getAllTechnicians().length,
  };
}

export function renderMetricsSection(metrics) {
  const cards = [
    { label: 'Clientes no catálogo', value: metrics.totalClients, accent: 'primary' },
    { label: 'Relatórios pendentes', value: metrics.pendingReports, accent: 'warning' },
    { label: 'Trabalhos hoje', value: metrics.jobsToday, accent: 'primary' },
    { label: 'Trabalhos esta semana', value: metrics.jobsThisWeek, accent: 'muted' },
    { label: 'Agendados', value: metrics.scheduled, accent: 'muted' },
    { label: 'Em progresso', value: metrics.inProgress, accent: 'success' },
    { label: 'Técnicos ativos', value: metrics.technicians, accent: 'muted' },
  ];

  return `
    <section class="dashboard-metrics glass-card" data-dashboard-metrics aria-labelledby="dashboard-metrics-title">
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
