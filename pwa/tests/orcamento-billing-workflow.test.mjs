import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';
import {
  FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
  isPendingOrcamentoBilling,
  getPendingOrcamentoBillingReports,
  resolveOrcamentoBillingTotal,
  shouldRepairOrcamentoBilling,
} from '../js/orcamento-billing-workflow.js';
import { isPendingBilling } from '../js/billing-workflow.js';
import { STANDALONE_ORCAMENTO_ORIGEM, STANDALONE_ORCAMENTO_SERVICE_TYPE } from '../js/orcamento-standalone.js';

function propostaAceite(overrides = {}) {
  return {
    id: 'orc-aceite',
    status: 'approved',
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    clientId: '10',
    faturacaoStatus: 'pendente',
    data: {
      orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
      urlPdfOrcamento: 'https://example.com/ms015.pdf',
      faturacaoValorSugerido: 123,
      orcamento: {
        enviadoEm: '2026-06-01T10:00:00.000Z',
        respostaCliente: ORCAMENTO_RESPOSTA.ACEITE,
        respostaClienteEm: '2026-06-15T10:00:00.000Z',
        numeroFormatado: '5.0/2026',
        linhas: [{ descricao: 'Serviço', qtd: '1', precoUnit: '100', total: '100' }],
      },
    },
    ...overrides,
  };
}

describe('orcamento-billing-workflow', () => {
  beforeEach(async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
  });

  it('isPendingOrcamentoBilling — proposta aceite e enviada entra na fila', () => {
    assert.equal(isPendingOrcamentoBilling(propostaAceite()), true);
  });

  it('isPendingOrcamentoBilling — proposta enviada sem aceite não entra', () => {
    const report = propostaAceite({
      faturacaoStatus: FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
      data: {
        ...propostaAceite().data,
        faturacaoValorSugerido: null,
        orcamento: {
          enviadoEm: '2026-06-01T10:00:00.000Z',
          respostaCliente: null,
        },
      },
    });
    assert.equal(isPendingOrcamentoBilling(report), false);
  });

  it('isPendingOrcamentoBilling — standalone aguarda aceite não entra', () => {
    const report = propostaAceite({
      faturacaoStatus: FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
      data: {
        orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
        orcamento: { atualizadoEm: '2026-06-11T10:00:00.000Z' },
      },
    });
    assert.equal(isPendingOrcamentoBilling(report), false);
  });

  it('isPendingOrcamentoBilling — pedido técnico aceite entra na fila', () => {
    const report = propostaAceite({
      serviceType: 'reparacao_avarias_bateria',
      data: {
        values: { pedido_orcamento: 'Sim', detalhe_pedido_orcamento: 'Bateria' },
        orcamento: propostaAceite().data.orcamento,
        orcamentoOrigem: null,
      },
    });
    assert.equal(isPendingOrcamentoBilling(report), true);
  });

  it('shouldRepairOrcamentoBilling — aceite com dispensado legado (migração 021)', () => {
    const report = propostaAceite({
      faturacaoStatus: 'dispensado',
      data: {
        ...propostaAceite().data,
        faturacaoOrigem: null,
        faturacaoValorSugerido: null,
      },
    });
    assert.equal(shouldRepairOrcamentoBilling(report), true);
    assert.equal(isPendingOrcamentoBilling(report), false);
  });

  it('isPendingBilling — exclui propostas RH (mesmo com pendente)', () => {
    assert.equal(isPendingBilling(propostaAceite()), false);
  });

  it('getPendingBillingItems — inclui propostas standalone aceites', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache(propostaAceite());
    relatoriosDb.mergeReportInCache(
      propostaAceite({
        id: 'orc-enviada',
        faturacaoStatus: FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
        data: {
          orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
          urlPdfOrcamento: 'https://example.com/outra.pdf',
          orcamento: { enviadoEm: '2026-06-02T10:00:00.000Z' },
        },
      }),
    );

    const { getPendingBillingItems } = await import('../js/servicos-billing-workflow.js');
    const items = getPendingBillingItems();
    assert.equal(items.filter((i) => i.kind === 'orcamento').length, 1);
    assert.equal(items.filter((i) => i.kind === 'orcamento')[0].report.id, 'orc-aceite');
    assert.ok(getPendingOrcamentoBillingReports().length >= 1);
  });

  it('resolveOrcamentoBillingTotal — usa valor guardado ou calcula das linhas', () => {
    assert.equal(resolveOrcamentoBillingTotal(propostaAceite()), 123);
    const semStored = propostaAceite({
      data: {
        ...propostaAceite().data,
        faturacaoValorSugerido: null,
      },
    });
    const total = resolveOrcamentoBillingTotal(semStored);
    assert.ok(total > 100, `total com IVA esperado > 100, obteve ${total}`);
  });
});
