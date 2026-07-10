import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAvaliacoesAuditSummary,
  buildMonthlyStackedChartData,
  filterAvaliacoesByYear,
  summarizeScoreCounts,
} from '../js/avaliacoes-stats.js';

describe('avaliacoes-stats', () => {
  const sample = [
    { score: 3, criadoEm: '2026-03-15T10:00:00Z', clienteId: '1' },
    { score: 2, criadoEm: '2026-03-20T11:00:00Z', clienteId: '2' },
    { score: 1, criadoEm: '2025-12-01T09:00:00Z', clienteId: '3' },
    { score: 3, criadoEm: '2026-01-08T08:00:00Z', clienteId: '4' },
  ];

  it('filtra por ano da resposta', () => {
    const y2026 = filterAvaliacoesByYear(sample, '2026');
    assert.equal(y2026.length, 3);
    assert.equal(summarizeScoreCounts(y2026).good, 2);
  });

  it('agrega resumo anual', () => {
    const summary = buildAvaliacoesAuditSummary(sample, '2026');
    assert.equal(summary.counts.total, 3);
    assert.equal(summary.satisfiedPercent, 67);
    assert.equal(summary.satisfactionIndex, 83);
  });

  it('agrupa por mês', () => {
    const monthly = buildMonthlyStackedChartData(sample, '2026');
    assert.equal(monthly.datasets[0].data[0], 1);
    assert.equal(monthly.datasets[0].data[2], 1);
    assert.equal(monthly.monthTotals[1], 0);
  });
});
