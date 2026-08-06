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
  reportUsesFreeformOrcamentoCliente,
  resolveStandaloneClienteForCreate,
  STANDALONE_ORCAMENTO_ORIGEM,
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
} from '../js/orcamento-standalone.js';
import {
  FOLHA_OBRA_ORCAMENTO_ORIGEM,
  reportIsFolhaObraOrcamento,
} from '../js/folha-obra-orcamento.js';
import { isPendingBilling } from '../js/billing-workflow.js';
import { isPendingOrcamentoBilling } from '../js/orcamento-billing-workflow.js';
import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';

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

function folhaOrcamentoReport(overrides = {}) {
  return {
    id: 'folha-orc-1',
    status: 'approved',
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    clientId: '42',
    faturacaoStatus: 'via_folha_obra',
    data: {
      orcamentoOrigem: FOLHA_OBRA_ORCAMENTO_ORIGEM,
      folhaObraId: 'folha-1',
      values: { cliente: 'Cliente Oficina', observacoes_orcamento: 'Diagnóstico: rolamento' },
      orcamento: { tipoProposta: 'orcamento' },
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

  it('folha R.C. com serviceType MS.015 não é standalone', () => {
    const report = folhaOrcamentoReport();
    assert.equal(reportIsFolhaObraOrcamento(report), true);
    assert.equal(reportIsStandaloneOrcamento(report), false);
    assert.equal(reportIsRhOrcamento(report), true);
    assert.equal(isRhOrcamentoQueueReport(report), true);
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

  it('pedido técnico aprovado não entra na faturação de visita', () => {
    const report = {
      id: 'tech-pedido',
      status: 'approved',
      serviceType: 'reparacao_avarias_bateria',
      clientId: '10',
      faturacaoStatus: 'pendente',
      data: { values: { pedido_orcamento: 'Sim' } },
    };
    assert.equal(isPendingBilling(report), false);
    assert.equal(isPendingOrcamentoBilling(report), false);
  });

  it('folha aceite não entra na faturação de propostas', () => {
    const report = folhaOrcamentoReport({
      data: {
        ...folhaOrcamentoReport().data,
        orcamento: {
          enviadoEm: '2026-06-01T10:00:00.000Z',
          respostaCliente: ORCAMENTO_RESPOSTA.ACEITE,
          respostaClienteEm: '2026-06-15T10:00:00.000Z',
        },
      },
    });
    assert.equal(isPendingOrcamentoBilling(report), false);
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

  it('resolveStandaloneClienteForCreate — aceita nome livre sem id', () => {
    const resolved = resolveStandaloneClienteForCreate({ clienteNome: 'Empresa Nova Lda' });
    assert.equal(resolved.clientId, '');
    assert.equal(resolved.nome, 'Empresa Nova Lda');
  });

  it('resolveStandaloneClienteForCreate — prefere cliente da lista quando há id', () => {
    const resolved = resolveStandaloneClienteForCreate({
      clientId: '42',
      clientRecord: { id: '42', Nome: 'Cliente Catálogo' },
      clienteNome: 'Outro nome',
    });
    assert.equal(resolved.clientId, '42');
    assert.equal(resolved.nome, 'Cliente Catálogo');
  });

  it('reportUsesFreeformOrcamentoCliente — standalone sem clientId', () => {
    const report = standaloneReport({ clientId: '' });
    assert.equal(reportUsesFreeformOrcamentoCliente(report), true);
    assert.equal(reportUsesFreeformOrcamentoCliente(standaloneReport({ clientId: '42' })), false);
    assert.equal(reportUsesFreeformOrcamentoCliente(folhaOrcamentoReport()), false);
  });
});
