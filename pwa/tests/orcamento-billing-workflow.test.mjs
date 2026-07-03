import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';
import {
  FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
  isPendingOrcamentoBilling,
  getPendingOrcamentoBillingReports,
  resolveOrcamentoBillingTotal,
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

  it('isPendingBilling — exclui propostas RH (mesmo com pendente)', () => {
    assert.equal(isPendingBilling(propostaAceite()), false);
  });

  it('getPendingOrcamentoBillingReports — inclui aceites na cache', async () => {
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
    const orcamentos = items.filter((i) => i.kind === 'orcamento');
    assert.equal(orcamentos.length, 1);
    assert.equal(orcamentos[0].report.id, 'orc-aceite');
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
