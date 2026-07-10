import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBillingAuditSummary,
  buildBillingByTypeRows,
  computeBillingMetrics,
  filterBillingByYear,
} from '../js/faturacao-stats.js';

describe('faturacao-stats', () => {
  const sample = [
    {
      date: '2026-03-15',
      tipo: 'Visita',
      cliente: 'Cliente A',
      valor: 200,
      estado: 'pago',
      estadoLabel: 'Pago',
    },
    {
      date: '2026-03-20',
      tipo: 'Relatório',
      cliente: 'Cliente B',
      valor: 150,
      estado: 'pendente',
      estadoLabel: 'Pendente',
    },
    {
      date: '2025-12-01',
      tipo: 'Manual',
      cliente: 'Cliente C',
      valor: 80,
      estado: 'pago',
      estadoLabel: 'Pago',
    },
  ];

  it('filtra por ano', () => {
    const y2026 = filterBillingByYear(sample, '2026');
    assert.equal(y2026.length, 2);
    assert.equal(computeBillingMetrics(y2026).totalFaturado, 350);
  });

  it('agrega resumo anual', () => {
    const summary = buildBillingAuditSummary(sample, '2026');
    assert.equal(summary.metrics.invoiceCount, 2);
    assert.equal(summary.metrics.totalRecebido, 200);
    assert.equal(summary.metrics.totalDivida, 150);
    assert.equal(summary.byType.length, 2);
  });

  it('agrupa por tipo', () => {
    const byType = buildBillingByTypeRows(filterBillingByYear(sample, '2026'));
    const visita = byType.find((row) => row.tipo === 'Visita');
    assert.equal(visita.count, 1);
    assert.equal(visita.valor, 200);
  });
});
