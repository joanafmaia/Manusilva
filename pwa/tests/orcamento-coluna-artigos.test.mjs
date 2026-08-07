import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferTituloColunaArtigosPreset,
  resolveTituloColunaArtigos,
  resolveTituloColunaArtigosState,
  TITULO_COLUNA_ARTIGOS_DEFAULT,
  TITULO_COLUNA_ARTIGOS_PRESET,
  TITULO_COLUNA_ARTIGOS_VENDA,
  tituloColunaArtigosForPreset,
} from '../js/orcamento-coluna-artigos.js';
import { renderOrcamentoLinhasTableHead } from '../js/orcamento-maquinas.js';
import { buildOrcamentoWordTableXml } from '../js/orcamento-table-xml.js';

describe('orcamento-coluna-artigos', () => {
  it('usa default de reparação sem meta', () => {
    assert.equal(resolveTituloColunaArtigos({}), TITULO_COLUNA_ARTIGOS_DEFAULT);
    assert.equal(resolveTituloColunaArtigosState({}).preset, TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO);
  });

  it('resolve preset de venda', () => {
    const state = resolveTituloColunaArtigosState({
      tituloColunaArtigosPreset: 'venda',
    });
    assert.equal(state.preset, TITULO_COLUNA_ARTIGOS_PRESET.VENDA);
    assert.equal(state.titulo, TITULO_COLUNA_ARTIGOS_VENDA);
  });

  it('resolve outro com texto custom e fallback se vazio', () => {
    assert.equal(
      resolveTituloColunaArtigos({
        tituloColunaArtigosPreset: 'outro',
        tituloColunaArtigos: 'Material necessário',
      }),
      'Material necessário',
    );
    assert.equal(
      resolveTituloColunaArtigos({
        tituloColunaArtigosPreset: 'outro',
        tituloColunaArtigos: '',
      }),
      TITULO_COLUNA_ARTIGOS_DEFAULT,
    );
  });

  it('infere preset a partir de título legado', () => {
    assert.equal(inferTituloColunaArtigosPreset(TITULO_COLUNA_ARTIGOS_VENDA), 'venda');
    assert.equal(inferTituloColunaArtigosPreset('Peças e mão de obra'), 'outro');
    assert.equal(tituloColunaArtigosForPreset('reparacao'), TITULO_COLUNA_ARTIGOS_DEFAULT);
  });

  it('renderiza TH da tabela com título dinâmico', () => {
    const html = renderOrcamentoLinhasTableHead([], null, 'Proposta de venda');
    assert.match(html, /data-orc-coluna-artigos-th[^>]*>Proposta de venda</);
    assert.doesNotMatch(html, /Na reparação precisa/);
  });

  it('usa título no XML Word', () => {
    const xml = buildOrcamentoWordTableXml(
      [{ descricao: 'Valor da máquina', qtd: '1', precoUnit: '100' }],
      { tituloColunaArtigos: 'Proposta de venda' },
    );
    assert.match(xml, /Proposta de venda/);
    assert.doesNotMatch(xml, /Na reparação precisa/);
  });
});
