import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  reportIsRhOrcamento,
  reportHasPedidoOrcamento,
  isRhOrcamentoQueueReport,
  reportOrcamentoPorPreparar,
  reportPedidoOrcamentoRoutesToOrcamentosTab,
} from '../js/pedido-orcamento.js';
import {
  reportIsStandaloneOrcamento,
  STANDALONE_ORCAMENTO_ORIGEM,
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
} from '../js/orcamento-standalone.js';

function standaloneReport(overrides = {}) {
  return {
    id: 'r-1',
    status: 'approved',
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    clientId: '42',
    data: {
      orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
      values: { cliente: 'Cliente Teste' },
      orcamento: null,
    },
    ...overrides,
  };
}

describe('orcamento standalone', () => {
  it('deteta proposta RH sem pedido técnico', () => {
    const report = standaloneReport();
    assert.equal(reportHasPedidoOrcamento(report), false);
    assert.equal(reportIsStandaloneOrcamento(report), true);
    assert.equal(reportIsRhOrcamento(report), true);
  });

  it('inclui proposta standalone na fila de orçamentos', () => {
    const report = standaloneReport();
    assert.equal(isRhOrcamentoQueueReport(report), true);
    assert.equal(reportOrcamentoPorPreparar(report), true);
  });

  it('proposta standalone guardada continua na fila', () => {
    const report = standaloneReport({
      data: {
        orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
        values: { cliente: 'Cliente Teste' },
        urlPdfOrcamento: 'https://example.com/ms015.pdf',
        orcamento: { atualizadoEm: '2026-06-11T10:00:00Z' },
      },
    });
    assert.equal(isRhOrcamentoQueueReport(report), true);
    assert.equal(reportOrcamentoPorPreparar(report), false);
  });

  it('pedido técnico continua a ser detetado', () => {
    const report = {
      status: 'pending_review',
      data: { values: { pedido_orcamento: 'Sim' } },
    };
    assert.equal(reportHasPedidoOrcamento(report), true);
    assert.equal(reportIsStandaloneOrcamento(report), false);
    assert.equal(isRhOrcamentoQueueReport(report), true);
  });

  it('cliente teste com pedido de orçamento vai para aba Orçamentos', () => {
    const report = {
      status: 'approved',
      clientId: '99',
      data: { values: { pedido_orcamento: 'Sim' } },
    };
    const testClient = { id: '99', name: 'Cliente Teste A', ehTeste: true };
    const realClient = { id: '1', name: 'Sinflex', ehTeste: false };

    assert.equal(reportPedidoOrcamentoRoutesToOrcamentosTab(report, testClient), true);
    assert.equal(reportPedidoOrcamentoRoutesToOrcamentosTab(report, realClient), false);
    assert.equal(isRhOrcamentoQueueReport(report), true);
  });
});
