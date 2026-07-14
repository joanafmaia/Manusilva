import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORCAMENTO_TIPO_PROPOSTA,
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  suggestOrcamentoTipoProposta,
  reportHasOrcamentoContent,
} from '../js/orcamento-tipo-proposta.js';
import { buildOrcamentoAuditSummary, buildOrcamentoAuditCsv, buildOrcamentoAuditCsvFilename } from '../js/orcamento-audit.js';

describe('orcamento-tipo-proposta', () => {
  it('sugere manutenção bateria a partir do serviceType', () => {
    const report = { serviceType: 'manutencao_preventiva_bateria', data: {} };
    assert.equal(suggestOrcamentoTipoProposta(report), ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA);
  });

  it('sugere manutenção máquina para empilhadores', () => {
    const report = { serviceType: 'manutencao_preventiva_empilhadores', data: {} };
    assert.equal(suggestOrcamentoTipoProposta(report), ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA);
  });

  it('usa valor guardado em dados.orcamento.tipoProposta', () => {
    const report = {
      serviceType: 'manutencao_preventiva_empilhadores',
      data: { orcamento: { tipoProposta: ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO } },
    };
    assert.equal(getOrcamentoTipoProposta(report), ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO);
    assert.equal(formatOrcamentoTipoPropostaLabel(ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO), 'Orçamento');
  });
});

describe('orcamento-audit', () => {
  beforeEach(() => {
    if (!globalThis.localStorage) {
      globalThis.localStorage = {
        store: {},
        getItem(key) {
          return this.store[key] ?? null;
        },
        setItem(key, value) {
          this.store[key] = String(value);
        },
        removeItem(key) {
          delete this.store[key];
        },
      };
    }
  });

  it('filtra propostas por ano e tipo', () => {
    const reports = [
      {
        id: 'p1',
        clientId: '10',
        status: 'approved',
        approvedAt: '2026-03-10T10:00:00.000Z',
        data: {
          orcamento: {
            tipoProposta: 'manutencao_maquina',
            numeroFormatado: '12.0/2026',
            total: '123,00',
            enviadoEm: '2026-03-12T09:00:00.000Z',
          },
        },
      },
      {
        id: 'p2',
        clientId: '11',
        status: 'approved',
        approvedAt: '2025-06-01T10:00:00.000Z',
        data: {
          orcamento: {
            tipoProposta: 'orcamento',
            numeroFormatado: '3.0/2025',
            enviadoEm: '2025-06-02T09:00:00.000Z',
          },
        },
      },
    ];

    const summary2026 = buildOrcamentoAuditSummary(reports, { year: 2026, tipoFilter: 'all' });
    assert.equal(summary2026.metrics.proposalCount, 1);
    assert.equal(summary2026.rows[0].reportId, 'p1');

    const summaryBateria = buildOrcamentoAuditSummary(reports, {
      year: 'all',
      tipoFilter: 'manutencao_bateria',
    });
    assert.equal(summaryBateria.metrics.proposalCount, 0);

    const summaryAceites = buildOrcamentoAuditSummary(reports, {
      year: 2026,
      estadoFilter: 'aceite',
    });
    assert.equal(summaryAceites.metrics.proposalCount, 0);

    const csv = buildOrcamentoAuditCsv(summary2026.rows);
    assert.match(csv, /Tipo proposta/);
    assert.match(csv, /Resposta cliente/);
    assert.equal(
      buildOrcamentoAuditCsvFilename({ year: 2026, tipoFilter: 'all', estadoFilter: 'aceite' }),
      'Manusilva-Propostas-2026-todos-tipos-aceite.csv',
    );

    assert.equal(reportHasOrcamentoContent(reports[0]), true);
    assert.equal(reportHasOrcamentoContent({ id: 'x', data: {} }), false);
  });
});
