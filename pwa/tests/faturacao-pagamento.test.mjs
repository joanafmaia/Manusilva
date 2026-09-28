import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReceiptPatch,
  deriveStatusRecebimento,
  describeInvoicePayment,
  parseReceiptAmountInput,
  resolveValorDivida,
  resolveValorRecebido,
} from '../js/faturacao-pagamento.js';

describe('faturacao-pagamento', () => {
  it('trata faturas antigas pagas como recebidas na totalidade', () => {
    const entity = { valorFaturado: 800, statusRecebimento: 'pago' };
    assert.equal(resolveValorRecebido(entity), 800);
    assert.equal(resolveValorDivida(entity), 0);
    assert.equal(describeInvoicePayment(entity).status, 'pago');
  });

  it('calcula dívida depois de um recebimento parcial', () => {
    const entity = { valorFaturado: 1000, valorRecebido: 400, statusRecebimento: 'parcial' };
    assert.equal(resolveValorRecebido(entity), 400);
    assert.equal(resolveValorDivida(entity), 600);
    assert.equal(deriveStatusRecebimento(1000, 400), 'parcial');
  });

  it('campo vazio liquida o restante da dívida', () => {
    const patch = buildReceiptPatch(
      { valorFaturado: 1000, valorRecebido: 400, statusRecebimento: 'parcial' },
      { dataRecebimento: '2026-09-28' },
    );
    assert.equal(patch.valorRecebido, 1000);
    assert.equal(patch.statusRecebimento, 'pago');
    assert.equal(patch.dataRecebimento, '2026-09-28');
  });

  it('acumula o valor recebido agora e recusa excesso da dívida', () => {
    const entity = { valorFaturado: 1000, valorRecebido: 400, statusRecebimento: 'parcial' };
    const patch = buildReceiptPatch(entity, {
      valorRecebidoAgora: '250,00',
      dataRecebimento: '2026-09-28',
    });
    assert.equal(patch.valorRecebido, 650);
    assert.equal(patch.statusRecebimento, 'parcial');
    assert.throws(
      () =>
        buildReceiptPatch(entity, {
          valorRecebidoAgora: '700',
          dataRecebimento: '2026-09-28',
        }),
      /excede a dívida/i,
    );
  });

  it('aceita vírgula no valor recebido', () => {
    assert.deepEqual(parseReceiptAmountInput('250,50'), { value: 250.5, isBlank: false });
    assert.equal(parseReceiptAmountInput('').isBlank, true);
  });
});
