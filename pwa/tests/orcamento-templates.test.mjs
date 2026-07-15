import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_TIPO_PROPOSTA } from '../js/orcamento-tipo-proposta.js';
import { computeOrcamentoTotals, formatEuro } from '../js/orcamento-linhas.js';
import {
  applyManutencaoBateriaTemplateMeta,
  applyManutencaoMaquinaTemplateMeta,
  buildManutencaoBateriaLinha,
  buildManutencaoBateriaLinhas,
  buildManutencaoBateriaPeriodicidadeParagrafo,
  formatLinhaValorManutencaoBateria,
  formatLinhasValorManutencaoBateria,
  formatManutencaoMaquinaPrecoLinhas,
  buildManutencaoMaquinaPrecoEquipBlocks,
  buildManutencaoMaquinaPrecoTable,
  buildManutencaoMaquinaIdentPreviewLines,
  MANUTENCAO_BATERIA_INTRO,
  MANUTENCAO_MAQUINA_INTRO,
  MANUTENCAO_MAQUINA_PRECO_LABEL,
} from '../js/orcamento-templates.js';

describe('orcamento-templates — manutenção baterias', () => {
  it('aplica texto fixo e linha única com valor predefinido', () => {
    const meta = applyManutencaoBateriaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA,
    });
    assert.equal(meta.textoIntro, MANUTENCAO_BATERIA_INTRO);
    assert.equal(meta.linhas.length, 1);
    assert.match(meta.linhas[0].descricao, /Manutenção de bateria/);
    assert.equal(meta.linhas[0].precoUnit, '85,00');
    assert.equal(
      formatLinhaValorManutencaoBateria(meta),
      'Valor de manutenção por visita para a bateria de 3 em 3 meses fica – 85,00 €',
    );
  });

  it('respeita valor e periodicidade personalizados', () => {
    const linha = buildManutencaoBateriaLinha({
      valorManutencaoVisita: '120',
      periodicidadeManutencao: 'mensal',
    });
    assert.equal(linha.precoUnit, '120,00');
    assert.match(linha.descricao, /mensal/);
    assert.match(
      formatLinhaValorManutencaoBateria({ valorManutencaoVisita: '120', periodicidadeManutencao: 'mensal' }),
      /bateria mensal fica/,
    );
  });

  it('calcula totais com IVA para o rodapé do PDF', () => {
    const meta = applyManutencaoBateriaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA,
      valorManutencaoVisita: '85',
    });
    const totals = computeOrcamentoTotals(meta.linhas, meta);
    assert.equal(formatEuro(totals.subtotal), '85,00');
    assert.equal(formatEuro(totals.iva), '19,55');
    assert.equal(formatEuro(totals.total), '104,55');
  });

  it('suporta várias baterias com periodicidade e valor distintos', () => {
    const meta = {
      maquinas: [
        { periodicidadeManutencao: 'mensal', valorManutencaoVisita: '90' },
        { periodicidadeManutencao: 'de 3 em 3 meses', valorManutencaoVisita: '75' },
      ],
    };
    const linhas = buildManutencaoBateriaLinhas(meta, meta);
    assert.equal(linhas.length, 2);
    const pdfLinhas = formatLinhasValorManutencaoBateria(meta, meta);
    assert.equal(pdfLinhas.length, 2);
    assert.match(pdfLinhas[0], /mensal/);
    assert.match(pdfLinhas[1], /de 3 em 3 meses/);
  });

  it('usa periodicidade livre no parágrafo e na linha de valor', () => {
    const texto = buildManutencaoBateriaPeriodicidadeParagrafo('semestral');
    assert.match(texto, /manutenção semestral\./);
    assert.match(
      formatLinhaValorManutencaoBateria({ periodicidadeManutencao: 'semestral' }),
      /bateria semestral fica/,
    );
  });
});

describe('orcamento-templates — manutenção máquinas', () => {
  it('aplica texto fixo e linhas de preço editáveis', () => {
    const meta = applyManutencaoMaquinaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
      maquinaManutencaoNome: 'Toyota',
      valorManutencaoGeral: '350',
      incluirInspecaoDl50: true,
      valorDeslocacao: '25',
    });
    assert.equal(meta.textoIntro, MANUTENCAO_MAQUINA_INTRO);
    assert.equal(meta.linhas.length, 3);
    assert.equal(meta.linhas[0].descricao, MANUTENCAO_MAQUINA_PRECO_LABEL);
    assert.equal(meta.linhas[1].descricao, 'Inspeção segundo o DL50/2005');
    assert.equal(meta.linhas[1].precoUnit, '40,00');
    const precoLinhas = formatManutencaoMaquinaPrecoLinhas(meta);
    assert.equal(precoLinhas[0], 'Manutenção Geral – 350,00 €');
    assert.equal(precoLinhas[1], 'Inspeção segundo o DL50/2005 – 40,00 €');
    assert.equal(precoLinhas[2], 'Deslocação – 25,00 €');
    const totals = computeOrcamentoTotals(meta.linhas, meta);
    assert.equal(formatEuro(totals.subtotal), '415,00');
    assert.equal(formatEuro(totals.iva), '95,45');
    assert.equal(formatEuro(totals.total), '510,45');
  });

  it('omite inspeção DL50 quando não selecionada', () => {
    const meta = applyManutencaoMaquinaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
      maquinaManutencaoNome: 'Still',
      valorManutencaoGeral: '200',
      incluirInspecaoDl50: false,
    });
    assert.equal(meta.linhas.length, 1);
    assert.equal(formatManutencaoMaquinaPrecoLinhas(meta).length, 2);
  });

  it('suporta várias máquinas com deslocação única', () => {
    const meta = applyManutencaoMaquinaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
      valorDeslocacao: '30',
      maquinas: [
        {
          maquinaManutencaoNome: 'Toyota',
          valorManutencaoGeral: '350',
          incluirInspecaoDl50: true,
          valorInspecaoDl50: '40',
        },
        { maquinaManutencaoNome: 'Linde', valorManutencaoGeral: '200', incluirInspecaoDl50: false },
      ],
    });
    assert.equal(meta.linhas.length, 4);
    const precoLinhas = formatManutencaoMaquinaPrecoLinhas(meta, meta);
    assert.equal(precoLinhas.length, 4);
    assert.equal(precoLinhas[0], 'Manutenção Geral — Toyota – 350,00 €');
    assert.equal(precoLinhas[2], 'Manutenção Geral — Linde – 200,00 €');
    assert.match(precoLinhas[1], /DL50/);
    assert.match(precoLinhas[3], /Deslocação/);
    const ident = buildManutencaoMaquinaIdentPreviewLines(meta, meta);
    assert.equal(ident.length, 2);
    assert.match(ident[0], /Toyota/);
    assert.match(ident[1], /Linde/);
  });

  it('agrupa nome, manutenção e DL50 num bloco por máquina', () => {
    const meta = applyManutencaoMaquinaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
      valorDeslocacao: '30',
      maquinas: [
        {
          maquinaManutencaoNome: 'Toyota 8FB15',
          valorManutencaoGeral: '350',
          incluirInspecaoDl50: true,
          valorInspecaoDl50: '40',
        },
        { maquinaManutencaoNome: 'Linde E20', valorManutencaoGeral: '200', incluirInspecaoDl50: false },
      ],
    });
    const table = buildManutencaoMaquinaPrecoTable(meta, meta);
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[0].maquina, '1. Toyota 8FB15');
    assert.equal(table.rows[0].manutencao, '350,00 €');
    assert.equal(table.rows[0].dl50, '40,00 €');
    assert.equal(table.rows[1].maquina, '2. Linde E20');
    assert.equal(table.rows[1].dl50, '—');
    assert.equal(table.deslocacao, '30,00 €');
  });
});
