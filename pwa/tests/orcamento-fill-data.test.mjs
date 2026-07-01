import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOrcamentoDateLong,
  resolveOrcamentoDocumentDate,
} from '../js/orcamento-fill-data.js';

describe('resolveOrcamentoDocumentDate', () => {
  it('usa enviadoEm quando a proposta já foi enviada', () => {
    const report = {
      data: {
        values: { data_de_conclusao: '2026-01-15' },
        orcamento: { enviadoEm: '2026-06-11T10:30:00.000Z' },
      },
    };
    assert.equal(resolveOrcamentoDocumentDate(report), '2026-06-11T10:30:00.000Z');
  });

  it('ignora data da intervenção — usa enviadoEm para o texto do PDF', () => {
    const report = {
      data: {
        values: { data_de_conclusao: '2026-01-15' },
        orcamento: { enviadoEm: '2026-06-11T10:30:00.000Z' },
      },
    };
    const dataExtenso = formatOrcamentoDateLong(resolveOrcamentoDocumentDate(report));
    assert.equal(dataExtenso, '11 de Junho 2026');
    assert.notEqual(dataExtenso, '15 de Janeiro 2026');
  });
});

describe('formatOrcamentoDateLong', () => {
  it('formata ISO em português', () => {
    assert.equal(formatOrcamentoDateLong('2026-06-11'), '11 de Junho 2026');
  });
});
