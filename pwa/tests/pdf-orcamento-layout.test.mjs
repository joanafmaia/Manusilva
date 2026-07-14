import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeOrcamentoTableLayout, normalizeLegalParagraphs } from '../js/pdf-orcamento.js';

describe('pdf-orcamento layout', () => {
  it('ancora a tabela acima do rodapé fixo mesmo com muitas linhas vazias', () => {
    const linhas = [
      { descricao: 'Substituir contactores', qtd: '2', precoUnit: '45' },
      { descricao: 'Mão de obra', qtd: '1', precoUnit: '120' },
    ];
    const layout = computeOrcamentoTableLayout(linhas, []);
    assert.ok(layout.startY < 189, 'cabeçalho da tabela deve ficar acima do rodapé (y≈189)');
    assert.equal(layout.dataRows.length, 2);
    assert.ok(layout.startY + layout.blockH < 189);
  });

  it('mantém pelo menos uma linha quando não há artigos', () => {
    const layout = computeOrcamentoTableLayout([{ descricao: '', qtd: '1', precoUnit: '' }], []);
    assert.equal(layout.dataRows.length, 1);
    assert.equal(layout.dataRows[0].descricao, '—');
  });

  it('separa parágrafos legais colados (Cliente, alíneas)', () => {
    const raw =
      'III – Deveres do ClienteO cliente obriga-se a:a) Enviar o equipamento.b) Outro ponto.';
    const paras = normalizeLegalParagraphs(raw);
    assert.ok(paras.some((p) => /^III – Deveres do Cliente$/i.test(p)));
    assert.ok(paras.some((p) => /^O cliente obriga-se a:$/i.test(p)));
    assert.ok(paras.some((p) => /^a\)/.test(p)));
  });
});
