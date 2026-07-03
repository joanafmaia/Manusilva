import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeInvoiceAmountInput,
  isPendingBilling,
} from '../js/billing-workflow.js';
import { STANDALONE_ORCAMENTO_ORIGEM, STANDALONE_ORCAMENTO_SERVICE_TYPE } from '../js/orcamento-standalone.js';
import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';

describe('billing-workflow', () => {
  it('aceita valor em branco para faturação agrupada', () => {
    assert.deepEqual(normalizeInvoiceAmountInput(''), {
      value: null,
      isBlank: true,
    });
    assert.deepEqual(normalizeInvoiceAmountInput('   '), {
      value: null,
      isBlank: true,
    });
  });

  it('aceita valores numéricos com ponto ou vírgula', () => {
    assert.deepEqual(normalizeInvoiceAmountInput('125.50'), {
      value: 125.5,
      isBlank: false,
    });
    assert.deepEqual(normalizeInvoiceAmountInput('125,50'), {
      value: 125.5,
      isBlank: false,
    });
  });

  it('rejeita valores negativos ou inválidos', () => {
    assert.throws(() => normalizeInvoiceAmountInput('-1'), /valor total faturado válido/i);
    assert.throws(() => normalizeInvoiceAmountInput('abc'), /valor total faturado válido/i);
  });

  it('isPendingBilling — exclui propostas aceites mesmo com faturacaoStatus pendente', () => {
    const proposta = {
      id: 'orc-1',
      status: 'approved',
      serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
      faturacaoStatus: 'pendente',
      data: {
        orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
        urlPdfOrcamento: 'https://example.com/ms015.pdf',
        orcamento: {
          enviadoEm: '2026-06-01T10:00:00.000Z',
          respostaCliente: ORCAMENTO_RESPOSTA.ACEITE,
        },
      },
    };
    assert.equal(isPendingBilling(proposta), false);
  });

  it('isPendingBilling — inclui relatório técnico com pedido de orçamento (intervenção)', () => {
    const relatorio = {
      id: 'r-pedido-39',
      status: 'approved',
      serviceType: 'folha_intervencao_avarias',
      clientId: '10',
      faturacaoStatus: 'pendente',
      data: {
        values: { pedido_orcamento: 'Sim' },
        urlPdfOrcamento: 'https://example.com/op39.pdf',
        orcamento: { enviadoEm: '2026-06-29T12:00:00.000Z' },
      },
    };
    assert.equal(isPendingBilling(relatorio), true);
  });

  it('isPendingBilling — exclui relatório com faturacaoStatus dispensado', () => {
    const relatorio = {
      id: 'r-disp',
      status: 'approved',
      serviceType: 'folha_intervencao_avarias',
      clientId: '10',
      faturacaoStatus: 'dispensado',
      data: { values: { pedido_orcamento: 'Não' } },
    };
    assert.equal(isPendingBilling(relatorio), false);
  });

  it('isPendingBilling — exclui só proposta comercial standalone na mesma OP', async () => {
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
    trabalhosDb.invalidateJobsCache();
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-39-orc',
      cliente_id: 10,
      data: '2026-06-29',
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      estado: 'completed',
      numero_ordem: 39,
    });
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-39-tech',
      cliente_id: 10,
      data: '2026-06-29',
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      estado: 'completed',
      numero_ordem: 39,
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-proposta-50',
      jobId: 'job-39-orc',
      serviceType: 'proposta_ms015_rh',
      status: 'approved',
      clientId: '10',
      data: {
        orcamentoOrigem: 'rh_standalone',
        urlPdfOrcamento: 'https://example.com/op50.pdf',
        orcamento: { enviadoEm: '2026-06-29T12:00:00.000Z' },
      },
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-tech-39',
      jobId: 'job-39-tech',
      serviceType: 'folha_intervencao_avarias',
      status: 'approved',
      clientId: '10',
      faturacaoStatus: 'pendente',
      data: { values: { pedido_orcamento: 'Não' } },
    });
    const { isPendingBilling, getPendingBillingReports } = await import('../js/billing-workflow.js');
    const tech = relatoriosDb.getReportsSnapshot().find((r) => r.id === 'r-tech-39');
    assert.equal(isPendingBilling(tech), false);
    assert.equal(getPendingBillingReports().some((r) => r.id === 'r-tech-39'), false);
  });
});
