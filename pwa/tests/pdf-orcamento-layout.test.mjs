import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeOrcamentoTableLayout,
  estimateOrcamentoMachineGroupBlockHeight,
  formatOrcamentoPdfMoneyCell,
  formatPrazoEntregaForPdf,
  normalizeLegalParagraphs,
} from '../js/pdf-orcamento.js';
import {
  filterOrcamentoPdfGroupLinhas,
  groupOrcamentoLinhasByEquipamento,
} from '../js/orcamento-maquinas.js';

describe('pdf-orcamento layout', () => {
  it('ancora a tabela acima do rodapé fixo mesmo com muitas linhas vazias', () => {
    const linhas = [
      { descricao: 'Substituir contactores', qtd: '2', precoUnit: '45' },
      { descricao: 'Mão de obra', qtd: '1', precoUnit: '120' },
    ];
    const layout = computeOrcamentoTableLayout(linhas, []);
    assert.ok(layout.anchoredStartY < 189, 'cabeçalho da tabela deve ficar acima do rodapé (y≈189)');
    assert.equal(layout.dataRows.length, 2);
    assert.ok(layout.anchoredStartY + layout.blockH < 189);
  });

  it('posiciona a tabela após o equipamento quando o conteúdo empurra o fluxo', () => {
    const linhas = [{ descricao: 'Roda de Tração', qtd: '1', precoUnit: '145' }];
    const layout = computeOrcamentoTableLayout(linhas, [], { contentEndY: 165 });
    assert.ok(layout.startY >= 168);
    assert.ok(layout.startY > layout.anchoredStartY, 'tabela deve seguir o fluxo do conteúdo');
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

  it('formata prazo de entrega só numérico com dias úteis', () => {
    assert.equal(formatPrazoEntregaForPdf('5'), '5 dias úteis');
    assert.equal(formatPrazoEntregaForPdf('5 dias'), '5 dias');
    assert.equal(formatPrazoEntregaForPdf('—'), '—');
  });

  it('formata células monetárias da tabela com €', () => {
    assert.equal(formatOrcamentoPdfMoneyCell('300,00'), '300,00 €');
    assert.equal(formatOrcamentoPdfMoneyCell('12,00 €'), '12,00 €');
    assert.equal(formatOrcamentoPdfMoneyCell(''), '');
  });

  it('remove pontuação duplicada no texto legal', () => {
    const paras = normalizeLegalParagraphs('Serviços da Manusilva. . Outro parágrafo.');
    assert.ok(paras.some((p) => /Manusilva\.\s*Outro/.test(p) || p.includes('Manusilva.')));
    assert.equal(paras.join(' ').includes('. .'), false);
  });

  it('agrupa e mantém todas as linhas do equipamento 2', () => {
    const linhas = Array.from({ length: 5 }, (_, index) => ({
      descricao: `Peça ${index + 1}`,
      qtd: '1',
      precoUnit: '10',
      equipamentoIndex: 1,
    }));
    const groups = groupOrcamentoLinhasByEquipamento(linhas, [{ marca: 'A' }, { marca: 'B' }]);
    assert.equal(groups[1].linhas.length, 5);
    assert.equal(filterOrcamentoPdfGroupLinhas(groups[1].linhas).length, 5);
  });

  it('reserva altura para tabela com várias linhas por equipamento', () => {
    const linhas = Array.from({ length: 5 }, (_, index) => ({
      descricao: `Artigo ${index + 1}`,
      qtd: '1',
      precoUnit: '20',
      equipamentoIndex: 1,
    }));
    const blockH = estimateOrcamentoMachineGroupBlockHeight(linhas, 4);
    assert.ok(blockH >= 6.5 * (1 + 5) + 8, 'cabeçalho + 5 linhas + campos do equipamento');
  });
});
