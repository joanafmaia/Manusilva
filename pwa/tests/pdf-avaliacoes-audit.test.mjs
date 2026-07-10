import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAvaliacoesAuditDetailRows,
  buildAvaliacoesAuditDistributionRows,
  buildAvaliacoesAuditKpiRows,
  buildAvaliacoesAuditMonthlyRows,
  buildAvaliacoesAuditPdfFilename,
} from '../js/pdf-avaliacoes-audit.js';
import { buildAvaliacoesAuditSummary } from '../js/avaliacoes-stats.js';

describe('pdf-avaliacoes-audit', () => {
  const sample = [
    { score: 3, criadoEm: '2026-03-15T10:00:00Z', clientName: 'Cliente A', visitSummary: '15 mar 2026', label: 'Satisfeito' },
    { score: 2, criadoEm: '2026-03-20T11:00:00Z', clientName: 'Cliente B', visitSummary: '20 mar 2026', label: 'Regular' },
    { score: 1, criadoEm: '2026-01-08T08:00:00Z', clientName: 'Cliente C', visitSummary: '8 jan 2026', label: 'Insatisfeito' },
  ];
  const summary = buildAvaliacoesAuditSummary(sample, '2026');

  it('define nome de ficheiro por ano', () => {
    assert.equal(buildAvaliacoesAuditPdfFilename('2026'), 'Manusilva-Avaliacoes-Clientes-2026.pdf');
    assert.equal(buildAvaliacoesAuditPdfFilename('all'), 'Manusilva-Avaliacoes-Clientes-todos.pdf');
  });

  it('monta linhas KPI e distribuição', () => {
    const kpi = buildAvaliacoesAuditKpiRows(summary);
    assert.equal(kpi[0][1], '3');
    assert.match(kpi[1][1], /1 \(33%\)/);

    const dist = buildAvaliacoesAuditDistributionRows(summary);
    assert.equal(dist[0][0], 'Satisfeito');
    assert.equal(dist[0][1], '1');
    assert.equal(dist[0][2], '33%');
  });

  it('monta tabela mensal e detalhe ordenado', () => {
    const monthly = buildAvaliacoesAuditMonthlyRows(summary);
    assert.equal(monthly[0][4], '1');
    assert.equal(monthly[2][4], '2');

    const detail = buildAvaliacoesAuditDetailRows(sample);
    assert.equal(detail[0][0], '2026-03-20');
    assert.equal(detail[detail.length - 1][0], '2026-01-08');
  });
});
