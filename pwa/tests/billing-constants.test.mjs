import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FATURA_CONDICAO,
  condicaoFromClientCatalog,
} from '../js/billing-constants.js';
import {
  resolveInvoiceBillingFields,
  resolveInvoiceDueDate,
} from '../js/billing-workflow.js';

describe('condição de pagamento — padrão 30 dias', () => {
  it('usa 30 dias quando o cliente não tem prazo definido', () => {
    assert.equal(DEFAULT_FATURA_CONDICAO, '30_dias');
    assert.equal(condicaoFromClientCatalog(''), '30_dias');
    assert.equal(condicaoFromClientCatalog(null), '30_dias');
  });

  it('respeita o prazo gravado na ficha do cliente', () => {
    assert.equal(condicaoFromClientCatalog('Pronto-pagamento'), 'pronto_pagamento');
    assert.equal(condicaoFromClientCatalog('30_dias'), '30_dias');
    assert.equal(condicaoFromClientCatalog('60 dias'), '60_dias');
  });

  it('calcula o vencimento a 30 dias a partir da emissão', () => {
    assert.equal(resolveInvoiceDueDate('30_dias', '2026-09-01'), '2026-10-01');
    assert.equal(resolveInvoiceDueDate('pronto_pagamento', '2026-09-01'), '2026-09-01');
    const fields = resolveInvoiceBillingFields('pendente', '2026-09-01');
    assert.equal(fields.faturaCondicaoPagamento, '30_dias');
    assert.equal(fields.dataVencimento, '2026-10-01');
  });
});
