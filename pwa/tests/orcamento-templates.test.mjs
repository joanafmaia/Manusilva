import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_TIPO_PROPOSTA } from '../js/orcamento-tipo-proposta.js';
import {
  applyManutencaoBateriaTemplateMeta,
  buildManutencaoBateriaLinha,
  formatLinhaValorManutencaoBateria,
  MANUTENCAO_BATERIA_INTRO,
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
  });
});
