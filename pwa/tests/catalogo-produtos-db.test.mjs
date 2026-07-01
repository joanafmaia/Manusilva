import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCatalogItems } from '../js/catalogo-produtos.js';
import { parseOrcamentoLinhaToCatalogItem } from '../js/catalogo-produtos-db.js';

describe('mergeCatalogItems', () => {
  it('junta JSON e base sem duplicar por código', () => {
    const json = [{ codigo: 'A1', descricao: 'Peça A', precoVenda: 1 }];
    const db = [{ codigo: 'A1', descricao: 'Peça A atualizada', precoVenda: 2 }];
    const merged = mergeCatalogItems(json, db);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].descricao, 'Peça A');
  });

  it('acrescenta artigos novos da base', () => {
    const merged = mergeCatalogItems(
      [{ codigo: 'X', descricao: 'Antigo', precoVenda: 1 }],
      [{ codigo: '', descricao: 'Novo artigo', precoVenda: 5 }],
    );
    assert.equal(merged.length, 2);
  });
});

describe('parseOrcamentoLinhaToCatalogItem', () => {
  it('extrai código entre parênteses', () => {
    const item = parseOrcamentoLinhaToCatalogItem({
      descricao: 'Filtro óleo (FIL-001)',
      precoUnit: '12,50',
    });
    assert.equal(item.descricao, 'Filtro óleo');
    assert.equal(item.codigo, 'FIL-001');
    assert.equal(item.precoVenda, 12.5);
  });

  it('ignora linhas vazias', () => {
    assert.equal(parseOrcamentoLinhaToCatalogItem({ descricao: ' ' }), null);
  });
});
