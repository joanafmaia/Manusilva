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
  resolveManutencaoMaquinaFooterTypography,
  resolveManutencaoBateriaPdfFooterLayout,
  resolveManutencaoBateriaFooterTypography,
  resolveOrcamentoGenericLayout,
  resolveOrcamentoGenericPageRoles,
  estimateOrcamentoGroupBlockHeight,
} from '../js/pdf-orcamento.js';
import {
  filterOrcamentoPdfGroupLinhas,
  groupOrcamentoLinhasByEquipamento,
} from '../js/orcamento-maquinas.js';
import { ORCAMENTO_TEXTO_INTRO_PLURAL } from '../js/orcamento-cabecalho.js';

describe('pdf-orcamento layout', () => {
  it('ancora a tabela acima do rodapé fixo mesmo com muitas linhas vazias', () => {
    const linhas = [
      { descricao: 'Substituir contactores', qtd: '2', precoUnit: '45' },
      { descricao: 'Mão de obra', qtd: '1', precoUnit: '120' },
    ];
    const layout = computeOrcamentoTableLayout(linhas, []);
    assert.ok(layout.anchoredStartY < 205, 'cabeçalho da tabela deve ficar acima do rodapé (caixa de assinatura compacta)');
    assert.equal(layout.dataRows.length, 2);
    assert.ok(layout.anchoredStartY + layout.blockH < 205);
  });

  it('posiciona a tabela após o equipamento quando o conteúdo empurra o fluxo', () => {
    const linhas = [{ descricao: 'Roda de Tração', qtd: '1', precoUnit: '145' }];
    const layout = computeOrcamentoTableLayout(linhas, [], { contentEndY: 192 });
    assert.ok(layout.startY >= 195);
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
    assert.equal(normalH - compactH, 5, 'lista vertical: 4 linhas + cauda mais compactas');
    assert.equal(normalH, 23 + 6.5 * 6);
    assert.equal(compactH, 18 + 6.5 * 6);
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
      footer.footerHeight < 82,
      `rodapé com tabela compacta (${footer.footerHeight}mm estimados)`,
    );
    assert.ok(estimateMaquinaBodyBeforeBullets(7) < 50, 'corpo sem bloco duplicado de máquinas');
  });

  it('a partir de 9 máquinas parte o mapa de preços para a 2.ª folha', () => {
    const base = {
      valor_deslocacao: '100',
      prazo_entrega: '5',
      forma_pagamento: 'Pronto Pagamento',
      validade_orcamento: '10 Dias',
    };
    const fill8 = {
      ...base,
      maquinas: Array.from({ length: 8 }, (_, index) => ({
        maquinaManutencaoNome: `${index + 1} teste`,
        valorManutencaoGeral: '123',
        incluirInspecaoDl50: true,
        valorInspecaoDl50: '40',
      })),
    };
    const fill9 = {
      ...base,
      maquinas: Array.from({ length: 9 }, (_, index) => ({
        maquinaManutencaoNome: `${index + 1} teste`,
        valorManutencaoGeral: '123',
        incluirInspecaoDl50: true,
        valorInspecaoDl50: '40',
      })),
    };
    const layout8 = resolveManutencaoMaquinaPdfFooterLayout(fill8);
    const layout9 = resolveManutencaoMaquinaPdfFooterLayout(fill9);
    assert.equal(layout8.splitTablePage, false);
    assert.ok(layout8.footerHeight > 0, '8 máquinas: tabela na folha 1');
    assert.equal(layout9.splitTablePage, true);
    assert.equal(layout9.footerHeight, 0, 'folha 1 sem reserva da tabela');
    assert.ok(layout9.priceFooterHeight > 0, 'altura real da tabela guardada para a folha 2');
    assert.equal(layout9.precoTable.rows.length, 9);
    assert.equal(layout9.ultraCompactPreBullet, false, 'folha 1 com mais espaço sem tabela');
  });

  it('parte o mapa de preços pelo nº de linhas da tabela, não só pelos nomes', () => {
    const base = {
      valor_deslocacao: '100',
      prazo_entrega: '5',
      forma_pagamento: 'Pronto Pagamento',
      validade_orcamento: '10 Dias',
    };
    const fillNamedEmpty = {
      ...base,
      maquinas: Array.from({ length: 9 }, (_, index) => ({
        maquinaManutencaoNome: `Máquina ${index + 1}`,
        valorManutencaoGeral: '',
        incluirInspecaoDl50: false,
      })),
    };
    const fillPricedNoName = {
      ...base,
      maquinas: Array.from({ length: 9 }, () => ({
        maquinaManutencaoNome: '',
        marca: '',
        valorManutencaoGeral: '150',
        incluirInspecaoDl50: false,
      })),
    };
    const empty = resolveManutencaoMaquinaPdfFooterLayout(fillNamedEmpty);
    const priced = resolveManutencaoMaquinaPdfFooterLayout(fillPricedNoName);
    assert.equal(empty.precoTable.rows.length, 0);
    assert.equal(empty.splitTablePage, false, '9 nomes sem preço: não parte folha vazia');
    assert.ok(empty.machineCount >= 9, 'densidade ainda reflecte 9 nomes');
    assert.equal(priced.precoTable.rows.length, 9);
    assert.equal(priced.splitTablePage, true, '9 linhas de preço: parte mesmo sem nome');
  });

  it('a partir de 9 baterias parte o mapa de preços para a 2.ª folha', () => {
    const base = {
      forma_pagamento: 'Pronto Pagamento',
      validade_orcamento: '10 Dias',
    };
    const fill8 = {
      ...base,
      maquinas: Array.from({ length: 8 }, (_, index) => ({
        periodicidadeManutencao: '3_em_3',
        valorManutencaoVisita: String(80 + index),
      })),
    };
    const fill9 = {
      ...base,
      maquinas: Array.from({ length: 9 }, (_, index) => ({
        periodicidadeManutencao: '3_em_3',
        valorManutencaoVisita: String(80 + index),
      })),
    };
    const layout8 = resolveManutencaoBateriaPdfFooterLayout(fill8);
    const layout9 = resolveManutencaoBateriaPdfFooterLayout(fill9);
    assert.equal(layout8.splitTablePage, false);
    assert.equal(layout8.batteryCount, 8);
    assert.ok(layout8.footerHeight > 0, '8 baterias: valores na folha 1');
    assert.ok(
      layout8.footerStartY + layout8.footerHeight <= layout8.footerMaxY + 0.5,
      'rodapé de 8 baterias cabe até à aprovação',
    );
    assert.ok(layout8.bodyMaxY < layout8.footerStartY, 'corpo termina acima do rodapé');
    assert.ok(
      layout8.footerTypography.valorLineStep < 5 || layout8.footerStartY < 166,
      'comprime tipografia ou sobe o rodapé para caber',
    );
    assert.equal(layout9.splitTablePage, true);
    assert.equal(layout9.batteryCount, 9);
    assert.equal(layout9.footerHeight, 0, 'folha 1 sem reserva dos valores');
    assert.ok(layout9.priceFooterHeight > 0, 'altura real dos valores para a folha 2');
    assert.equal(layout9.valorLinhas.length, 9);
    assert.ok(layout9.bodyMaxY > 200, 'folha 1 com mais espaço sem mapa de preços');
  });

  it('comprime tipografia de baterias quando o espaço do rodapé é apertado', () => {
    const roomy = resolveManutencaoBateriaFooterTypography(110, 8);
    const tight = resolveManutencaoBateriaFooterTypography(80, 8);
    assert.ok(tight.valorLineStep <= roomy.valorLineStep);
    assert.ok(tight.estimatedHeight <= 80 + 0.5);
    assert.ok(roomy.estimatedHeight <= 110 + 0.5);
    assert.ok(tight.fontSize <= roomy.fontSize || tight.valorLineStep < 5);
  });

  it('escolhe tipografia maior quando o rodapé tem espaço vertical', () => {
    const table = {
      rows: Array.from({ length: 7 }, () => ({})),
      deslocacao: '123,00 €',
    };
    const compact = resolveManutencaoMaquinaFooterTypography(62, table);
    const roomy = resolveManutencaoMaquinaFooterTypography(82, table);
    assert.ok(roomy.lineStep >= compact.lineStep);
    assert.ok(roomy.fontSize >= compact.fontSize);
  });

  it('preenche o rodapé com passo de linha uniforme', () => {
    const table = {
      rows: Array.from({ length: 7 }, () => ({})),
      deslocacao: '33,00 €',
    };
    const availableHeight = 80;
    const typography = resolveManutencaoMaquinaFooterTypography(availableHeight, table);
    // Espaço extra entre a tabela de máquinas e Deslocação / totais.
    const deslocacaoExtra = 2.6 + 1.8;
    const contentHeight =
      typography.separatorGap + typography.lineCount * typography.lineStep + deslocacaoExtra;
    assert.ok(Math.abs(contentHeight - availableHeight) < 0.2);
  });

  it('mantém 3 equipamentos numa folha sem paginação', () => {
    const fill = {
      maquinas: [{ marca: 'LGM' }, { marca: 'Nissan' }, { marca: 'Nissan' }],
      linhas: [
        { descricao: 'Elemento', qtd: '1', precoUnit: '77', equipamentoIndex: 0 },
        { descricao: 'Ecovalor', qtd: '1', precoUnit: '0.45', equipamentoIndex: 0 },
        { descricao: 'União de Cabo', qtd: '2', precoUnit: '14.5', equipamentoIndex: 0 },
        { descricao: 'Parafusos', qtd: '4', precoUnit: '2.55', equipamentoIndex: 0 },
        { descricao: 'Mão de Obra', qtd: '1', precoUnit: '41', equipamentoIndex: 0 },
        { descricao: 'Elemento', qtd: '1', precoUnit: '203', equipamentoIndex: 1 },
        { descricao: 'Ecovalor', qtd: '1', precoUnit: '0.95', equipamentoIndex: 1 },
        { descricao: 'União de Cabo', qtd: '2', precoUnit: '14.5', equipamentoIndex: 1 },
        { descricao: 'Parafusos', qtd: '4', precoUnit: '2.55', equipamentoIndex: 1 },
        { descricao: 'Mão de Obra', qtd: '1', precoUnit: '41', equipamentoIndex: 1 },
        { descricao: 'Elemento', qtd: '2', precoUnit: '137', equipamentoIndex: 2 },
        { descricao: 'Ecovalor', qtd: '2', precoUnit: '0.6', equipamentoIndex: 2 },
        { descricao: 'União de Cabo', qtd: '4', precoUnit: '14.5', equipamentoIndex: 2 },
        { descricao: 'Parafusos', qtd: '4', precoUnit: '2.55', equipamentoIndex: 2 },
        { descricao: 'Mão de Obra', qtd: '1', precoUnit: '41', equipamentoIndex: 2 },
      ],
      texto_intro: ORCAMENTO_TEXTO_INTRO_PLURAL,
    };
    const doc = {
      getTextWidth: () => 10,
      setFontSize() {},
      setFont() {},
      splitTextToSize: (text) => [text],
    };
    const layout = resolveOrcamentoGenericLayout(doc, fill, 76);
    assert.equal(layout.allowPagination, false);
    assert.equal(layout.splitTablePage, false);
    assert.ok(layout.contentEndY <= 202, 'cabe no corpo alargado com assinatura compacta');
  });

  it('pagina 3 equipamentos quando o conteúdo não cabe mesmo em triple', () => {
    const manyLinhas = [];
    for (let g = 0; g < 3; g += 1) {
      for (let i = 0; i < 12; i += 1) {
        manyLinhas.push({
          descricao: `Peça ${g}-${i}`,
          qtd: '1',
          precoUnit: '10',
          equipamentoIndex: g,
        });
      }
    }
    const fill = {
      maquinas: [{ marca: 'A' }, { marca: 'B' }, { marca: 'C' }],
      linhas: manyLinhas,
      texto_intro: ORCAMENTO_TEXTO_INTRO_PLURAL,
    };
    const doc = {
      getTextWidth: () => 10,
      setFontSize() {},
      setFont() {},
      splitTextToSize: (text) => [text],
    };
    const layout = resolveOrcamentoGenericLayout(doc, fill, 76);
    assert.equal(layout.splitTablePage, true);
    assert.equal(layout.allowPagination, true);
    assert.ok(layout.contentEndY > 187);
  });

  it('activa paginação a partir do 4.º equipamento', () => {
    const fill = {
      maquinas: [{ marca: 'A' }, { marca: 'B' }, { marca: 'C' }, { marca: 'D' }],
      linhas: [
        { descricao: 'Peça 1', qtd: '1', precoUnit: '10', equipamentoIndex: 0 },
        { descricao: 'Peça 2', qtd: '1', precoUnit: '10', equipamentoIndex: 1 },
        { descricao: 'Peça 3', qtd: '1', precoUnit: '10', equipamentoIndex: 2 },
        { descricao: 'Peça 4', qtd: '1', precoUnit: '10', equipamentoIndex: 3 },
      ],
      texto_intro: ORCAMENTO_TEXTO_INTRO_PLURAL,
    };
    const doc = {
      getTextWidth: () => 10,
      setFontSize() {},
      setFont() {},
      splitTextToSize: (text) => [text],
    };
    const layout = resolveOrcamentoGenericLayout(doc, fill, 76);
    assert.equal(layout.splitTablePage, true);
    assert.equal(layout.allowPagination, true);
  });

  it('no split genérico põe totais no mapa de preços e pagina condições', () => {
    const single = resolveOrcamentoGenericPageRoles(false);
    const split = resolveOrcamentoGenericPageRoles(true);
    assert.equal(single.footerOnPricePage, false);
    assert.equal(single.conditionsAllowPagination, false);
    assert.ok(single.conditionsMaxY < split.conditionsMaxY, 'sem rodapé na folha, mais altura para condições');
    assert.equal(split.footerOnPricePage, true);
    assert.equal(split.conditionsAllowPagination, true);
  });

  it('compacta tabelas quando há 3 equipamentos', () => {
    const fill = {
      maquinas: [{ marca: 'A' }, { marca: 'B' }, { marca: 'C' }],
      linhas: [
        { descricao: 'Peça 1', qtd: '1', precoUnit: '10', equipamentoIndex: 0 },
        { descricao: 'Peça 2', qtd: '1', precoUnit: '10', equipamentoIndex: 1 },
        { descricao: 'Peça 3', qtd: '1', precoUnit: '10', equipamentoIndex: 2 },
      ],
      texto_intro: ORCAMENTO_TEXTO_INTRO_PLURAL,
    };
    const doc = {
      getTextWidth: () => 10,
      setFontSize() {},
      setFont() {},
      splitTextToSize: (text) => [text],
    };
    const layout = resolveOrcamentoGenericLayout(doc, fill, 95);
    assert.ok(layout.density.tableRowH <= 4.8);
    assert.equal(layout.splitTablePage, false);
    assert.equal(layout.allowPagination, false);
  });

  it('reserva espaco suficiente entre grupos para a linha separadora', () => {
    const doc = {
      getTextWidth: () => 10,
      setFontSize() {},
      setFont() {},
      splitTextToSize: (text) => [text],
    };
    const density = { tableRowH: 4.2, equipLineStep: 3.2, equipTail: 1.5, separatorBefore: 1.5, separatorAfter: 3.5 };
    const equipRows = [['Marca', 'Nissan'], ['Modelo', '3']];
    const linhas = [{ descricao: 'Peça', qtd: '1', precoUnit: '10' }];
    const blockH = estimateOrcamentoGroupBlockHeight(doc, equipRows, linhas, density, true);
    const tableOnly = estimateOrcamentoGroupBlockHeight(doc, equipRows, linhas, density, false);
    assert.ok(blockH - tableOnly >= 5, 'separador deve reservar pelo menos 5mm');
  });
});
