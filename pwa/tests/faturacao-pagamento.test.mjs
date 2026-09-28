import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateReceiptAcrossInvoices,
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

  it('recibo conjunto liquida as faturas mais antigas primeiro', () => {
    const items = [
      {
        kind: 'report',
        entity: {
          id: 'ft-nova',
          numeroFatura: 'FT 2',
          dataFatura: '2026-09-20',
          dataVencimento: '2026-10-20',
          valorFaturado: 200,
          valorRecebido: 0,
        },
      },
      {
        kind: 'servico',
        entity: {
          id: 'ft-velha',
          numeroFatura: 'FT 1',
          dataFatura: '2026-08-01',
          dataVencimento: '2026-08-31',
          valorFaturado: 100,
          valorRecebido: 0,
        },
      },
    ];
    const allocation = allocateReceiptAcrossInvoices(items, '150');
    assert.equal(allocation.totalDebt, 300);
    assert.equal(allocation.lines.length, 2);
    assert.equal(allocation.lines[0].entity.id, 'ft-velha');
    assert.equal(allocation.lines[0].applied, 100);
    assert.equal(allocation.lines[1].entity.id, 'ft-nova');
    assert.equal(allocation.lines[1].applied, 50);
  });

  it('recibo conjunto vazio liquida toda a dívida selecionada', () => {
    const allocation = allocateReceiptAcrossInvoices(
      [
        { entity: { id: 'a', valorFaturado: 80, valorRecebido: 0, dataVencimento: '2026-01-01' } },
        { entity: { id: 'b', valorFaturado: 40, valorRecebido: 10, dataVencimento: '2026-02-01' } },
      ],
      '',
    );
    assert.equal(allocation.total, 110);
    assert.equal(allocation.lines[0].applied, 80);
    assert.equal(allocation.lines[1].applied, 30);
  });

  it('recibo conjunto recusa valor acima da dívida conjunta', () => {
    assert.throws(
      () =>
        allocateReceiptAcrossInvoices(
          [{ entity: { valorFaturado: 50, valorRecebido: 0 } }],
          '51',
        ),
      /dívida conjunta/i,
    );
  });
});
