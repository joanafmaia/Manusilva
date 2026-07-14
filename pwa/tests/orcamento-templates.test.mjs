import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_TIPO_PROPOSTA } from '../js/orcamento-tipo-proposta.js';
import {
  applyManutencaoBateriaTemplateMeta,
  applyManutencaoMaquinaTemplateMeta,
  buildManutencaoBateriaLinha,
  buildManutencaoBateriaPeriodicidadeParagrafo,
  formatLinhaValorManutencaoBateria,
  formatManutencaoMaquinaPrecoLinhas,
  MANUTENCAO_BATERIA_INTRO,
  MANUTENCAO_MAQUINA_INTRO,
} from '../js/orcamento-templates.js';

describe('orcamento-templates — manutenção baterias', () => {
  it('aplica texto fixo e linha única com valor predefinido', () => {
    const meta = applyManutencaoBateriaTemplateMeta({
      tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA,
    });
    assert.equal(meta.textoIntro, MANUTENCAO_BATERIA_INTRO);
    assert.equal(meta.linhas.length, 1);
    assert.match(meta.linhas[0].descricao, /Manutenção de baterias por visita/);
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
    assert.match(meta.linhas[0].descricao, /Toyota/);
    assert.equal(meta.linhas[1].descricao, 'Inspeção segundo o DL50/2005');
    assert.equal(meta.linhas[1].precoUnit, '40,00');
    const precoLinhas = formatManutencaoMaquinaPrecoLinhas(meta);
    assert.equal(precoLinhas[0], 'Manutenção geral a máquina Toyota – 350,00 €');
    assert.equal(precoLinhas[1], 'Inspeção segundo o DL50/2005 – 40,00 €');
    assert.equal(precoLinhas[2], 'Deslocação – 25,00 €');
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
});
