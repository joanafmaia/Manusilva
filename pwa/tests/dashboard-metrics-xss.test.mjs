import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMetricsSection } from '../js/views/dashboard-metrics.js';

const XSS_PAYLOAD = '<img src=x onerror=alert(1)>';

function baseMetrics(overrides = {}) {
  return {
    pendingReports: 2,
    pendingBilling: 0,
    jobsToday: 3,
    completedThisWeek: 5,
    avgApprovalHours: 4,
    teamTopMonth: `${XSS_PAYLOAD} (3)`,
    teamMonthLabel: 'junho',
    topPendingTech: XSS_PAYLOAD,
    totalClients: 100,
    jobsThisWeek: 12,
    technicians: 4,
    pendingByTech: { [XSS_PAYLOAD]: 2, 'Hugo': 1 },
    ...overrides,
  };
}

describe('dashboard-metrics XSS', () => {
  it('escapa nomes de técnicos em KPIs e listas', () => {
    const html = renderMetricsSection(baseMetrics());
    assert.equal(html.includes(XSS_PAYLOAD), false);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /dashboard-team-pending-list/);
  });
});
