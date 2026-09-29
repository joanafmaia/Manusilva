import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';
import {
  FATURACAO_AGUARDA_ACEITE_ORCAMENTO,
  defaultOrcamentoFaturarProposta,
  isPendingOrcamentoBilling,
  getPendingOrcamentoBillingReports,
  resolveOrcamentoBillingTotal,
  resolveOrcamentoFaturarProposta,
  shouldClearStandaloneWithoutBilling,
  shouldDetachPedidoOrcamentoFromProposalBilling,
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

  it('isPendingOrcamentoBilling — pedido técnico aceite não entra na fila (fatura a visita)', () => {
    const report = propostaAceite({
      serviceType: 'reparacao_avarias_bateria',
      faturacaoStatus: 'pendente',
      data: {
        values: { pedido_orcamento: 'Sim', detalhe_pedido_orcamento: 'Bateria' },
        orcamento: propostaAceite().data.orcamento,
        orcamentoOrigem: null,
        faturacaoOrigem: 'orcamento_aceite',
      },
    });
    assert.equal(isPendingOrcamentoBilling(report), false);
    assert.equal(shouldRepairOrcamentoBilling(report), false);
    assert.equal(shouldDetachPedidoOrcamentoFromProposalBilling(report), true);
  });

  it('isPendingOrcamentoBilling — pedido com caixa «vai a faturação» entra na fila', () => {
    const report = propostaAceite({
      serviceType: 'reparacao_avarias_bateria',
      faturacaoStatus: 'pendente',
      data: {
        values: { pedido_orcamento: 'Sim' },
        orcamento: {
          ...propostaAceite().data.orcamento,
          faturarProposta: true,
        },
        orcamentoOrigem: null,
      },
    });
    assert.equal(resolveOrcamentoFaturarProposta(report), true);
    assert.equal(isPendingOrcamentoBilling(report), true);
    assert.equal(shouldDetachPedidoOrcamentoFromProposalBilling(report), false);
  });

  it('isPendingOrcamentoBilling — proposta RH com caixa desmarcada não entra', () => {
    const report = propostaAceite({
      data: {
        ...propostaAceite().data,
        orcamento: {
          ...propostaAceite().data.orcamento,
          faturarProposta: false,
        },
      },
    });
    assert.equal(resolveOrcamentoFaturarProposta(report), false);
    assert.equal(isPendingOrcamentoBilling(report), false);
    assert.equal(shouldClearStandaloneWithoutBilling(report), true);
  });

  it('defaults da caixa — RH sim, pedido não', () => {
    assert.equal(defaultOrcamentoFaturarProposta(propostaAceite()), true);
    assert.equal(
      defaultOrcamentoFaturarProposta({
        serviceType: 'folha_intervencao_avarias',
        data: { values: { pedido_orcamento: 'Sim' } },
      }),
      false,
    );
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

  it('migração 045 tira pedidos de relatório da fila de proposta', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile(
      new URL('../supabase/migrations/045_pedido_orcamento_fatura_visita.sql', import.meta.url),
      'utf8',
    );
    assert.match(sql, /via_servico_visita/);
    assert.match(sql, /pedido_orcamento/);
    assert.match(sql, /proposta_ms015_rh/);
  });

  it('UI expõe a caixa «Esta proposta vai a faturação»', async () => {
    const fs = await import('node:fs/promises');
    const list = await fs.readFile(new URL('../js/views/orcamentos.js', import.meta.url), 'utf8');
    const editor = await fs.readFile(new URL('../js/orcamento-rh-editor.js', import.meta.url), 'utf8');
    assert.match(list, /renderOrcamentoFaturarCheckbox/);
    assert.match(list, /applyInlineFaturarToggle|applyOrcamentoFaturarPropostaChoice/);
    assert.match(list, /workflow === 'aceite'/);
    assert.match(editor, /Esta proposta vai a faturação|renderOrcamentoFaturarCheckbox/);
    const { renderOrcamentoFaturarCheckbox } = await import('../js/orcamento-faturar-flag.js');
    assert.match(renderOrcamentoFaturarCheckbox(propostaAceite()), /vai a faturação/);
  });

  it('applyOrcamentoFaturarPropostaChoice existe para retirar das atuais', async () => {
    const { applyOrcamentoFaturarPropostaChoice } = await import('../js/orcamento-billing-workflow.js');
    assert.equal(typeof applyOrcamentoFaturarPropostaChoice, 'function');
  });
});
