import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeInvoiceAmountInput } from '../js/billing-workflow.js';

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
});
