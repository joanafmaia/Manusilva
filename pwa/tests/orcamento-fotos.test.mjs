import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ORCAMENTO_FOTOS, normalizeOrcamentoFotos } from '../js/orcamento-fotos.js';

describe('orcamento-fotos', () => {
  it('normalizeOrcamentoFotos limita a 2 e valida dataUrl', () => {
    const result = normalizeOrcamentoFotos({
      fotosPosicao: 'antes_tabela',
      fotos: [
        { dataUrl: 'data:image/jpeg;base64,abc', legenda: 'Avaria' },
        { dataUrl: 'data:image/jpeg;base64,def' },
        { dataUrl: 'data:image/jpeg;base64,ghi' },
        { dataUrl: 'http://invalid' },
      ],
    });
    assert.equal(result.fotos.length, MAX_ORCAMENTO_FOTOS);
    assert.equal(result.fotos[0].legenda, 'Avaria');
    assert.equal(result.fotosPosicao, 'antes_tabela');
  });

  it('posição inválida usa antes_tabela', () => {
    assert.equal(normalizeOrcamentoFotos({ fotosPosicao: 'x' }).fotosPosicao, 'antes_tabela');
    assert.equal(
      normalizeOrcamentoFotos({ fotosPosicao: 'apos_equipamento' }).fotosPosicao,
      'apos_equipamento',
    );
  });
});
