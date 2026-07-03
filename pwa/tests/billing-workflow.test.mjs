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
});
