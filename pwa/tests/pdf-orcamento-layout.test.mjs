import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeOrcamentoTableLayout,
  estimateMaquinaBodyBeforeBullets,
  estimateOrcamentoMachineGroupBlockHeight,
  formatOrcamentoPdfMoneyCell,
  formatPrazoEntregaForPdf,
  normalizeLegalParagraphs,
  resolveManutencaoMaquinaPdfFooterLayout,
  resolveManutencaoMaquinaBulletsLayout,
  resolveManutencaoMaquinaPdfLayout,
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

  it('perfil compacto comprime espaços mas mantém linhas da tabela iguais', () => {
    const linhas = Array.from({ length: 5 }, (_, index) => ({
      descricao: `Artigo ${index + 1}`,
      qtd: '1',
      precoUnit: '20',
      equipamentoIndex: 1,
    }));
    const normalH = estimateOrcamentoMachineGroupBlockHeight(linhas, 4, 'normal');
    const compactH = estimateOrcamentoMachineGroupBlockHeight(linhas, 4, 'compact');
    assert.ok(compactH < normalH, 'perfil compacto ocupa menos altura nos espaços');
    assert.equal(normalH - compactH, 3, 'só os espaços do equipamento ficam mais compactos');
    assert.equal(normalH, 13 + 6.5 * 6);
    assert.equal(compactH, 10 + 6.5 * 6);
  });

  it('reserva espaço para a lista completa de trabalhos com 7 máquinas', () => {
    const maquinas = Array.from({ length: 7 }, (_, index) => ({
      maquinaManutencaoNome: `${index + 1} teste`,
      valorManutencaoGeral: '123',
      incluirInspecaoDl50: true,
      valorInspecaoDl50: '40',
    }));
    const fill = {
      maquinas,
      valor_deslocacao: '123',
      prazo_entrega: '5',
      forma_pagamento: 'Pronto Pagamento',
      validade_orcamento: '10 Dias',
    };
    const footer = resolveManutencaoMaquinaPdfFooterLayout(fill);
    const layout = resolveManutencaoMaquinaBulletsLayout(120, footer);
    assert.ok(layout.twoColumnBullets, 'lista de trabalhos em várias colunas');
    assert.equal(layout.bulletColumns, 3, '3 colunas com 7 máquinas');
    assert.equal(footer.precoTable.rows.length, 7, '7 linhas na tabela de preços');
    assert.equal(footer.twoColumnPrices, false, 'tabela a largura total');
    assert.ok(footer.ultraCompactPreBullet, 'cabeçalho compacto antes dos trabalhos');
    assert.ok(
      layout.bulletLineStep >= 3.1,
      `passo legível (${layout.bulletLineStep})`,
    );
    assert.ok(
      layout.bulletsMaxY - 120 >= layout.bulletLineStep * 5,
      'espaço vertical suficiente para 6 linhas lógicas (3 colunas)',
    );
    assert.ok(
      footer.footerHeight < 78,
      `rodapé com tabela compacta (${footer.footerHeight}mm estimados)`,
    );
    assert.ok(estimateMaquinaBodyBeforeBullets(7) < 50, 'corpo sem bloco duplicado de máquinas');
  });
});
