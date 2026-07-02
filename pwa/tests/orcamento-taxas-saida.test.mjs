import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOrcamentoTotals,
  formatTaxasSaidaMetaFromSlots,
  normalizeTaxasSaida,
  taxasSaidaSlotsFromMeta,
} from '../js/orcamento-linhas.js';

describe('normalizeTaxasSaida', () => {
  it('lê taxa única legada em taxaSaida', () => {
    assert.deepEqual(normalizeTaxasSaida({ taxaSaida: '50,00' }), ['50,00']);
  });

  it('lê várias taxas em taxasSaida', () => {
    assert.deepEqual(normalizeTaxasSaida({ taxasSaida: ['50,00', '30,00'] }), ['50,00', '30,00']);
  });

  it('ignora taxas em branco', () => {
    assert.deepEqual(normalizeTaxasSaida(['50', '', '30']), ['50', '30']);
  });
});

describe('taxasSaidaSlotsFromMeta', () => {
  it('preenche até 3 campos no editor', () => {
    assert.deepEqual(taxasSaidaSlotsFromMeta({ taxasSaida: ['50,00'] }), ['50,00', '', '']);
  });
});

describe('computeOrcamentoTotals com várias taxas', () => {
  const linhas = [{ descricao: 'Peça', qtd: '1', precoUnit: '100' }];

  it('soma taxas no subtotal', () => {
    const totals = computeOrcamentoTotals(linhas, ['50', '30']);
    assert.equal(totals.taxaSaida, 80);
    assert.equal(totals.subtotal, 180);
    assert.equal(totals.iva, 41.4);
    assert.equal(totals.total, 221.4);
  });

  it('mantém compatibilidade com taxa única legada', () => {
    const totals = computeOrcamentoTotals(linhas, { taxaSaida: '25' });
    assert.equal(totals.subtotal, 125);
  });
});

describe('formatTaxasSaidaMetaFromSlots', () => {
  it('guarda lista e total formatados', () => {
    const meta = formatTaxasSaidaMetaFromSlots(['50', '', '30']);
    assert.deepEqual(meta.taxasSaida, ['50,00', '30,00']);
    assert.equal(meta.taxaSaida, '80,00');
  });
});
