import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogoItemToLinhaDescricao,
  formatCatalogoPreco,
  parseCatalogPayload,
  searchCatalogoProdutos,
} from '../js/catalogo-produtos.js';

const SAMPLE_POOL = [
  {
    tipo: 'Produto',
    codigo: 'FIL-001',
    descricao: 'Filtro óleo motor',
    unidade: 'un',
    precoVenda: 12.5,
  },
  {
    tipo: 'Serviço',
    codigo: 'MO-H',
    descricao: 'Hora mão-de-obra',
    unidade: 'h',
    precoVenda: 45,
  },
];

describe('catalogo-produtos', () => {
  it('pesquisa por código e descrição', () => {
    const byCode = searchCatalogoProdutos('FIL', SAMPLE_POOL);
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].codigo, 'FIL-001');

    const byDesc = searchCatalogoProdutos('mão', SAMPLE_POOL);
    assert.equal(byDesc.length, 1);
    assert.equal(byDesc[0].codigo, 'MO-H');
  });

  it('formata preço e descrição da linha', () => {
    assert.equal(formatCatalogoPreco(12.5), '12,50');
    assert.equal(
      catalogoItemToLinhaDescricao({ descricao: 'Filtro', codigo: 'FIL-001' }),
      'Filtro (FIL-001)',
    );
  });

  it('normaliza payload importado', () => {
    const items = parseCatalogPayload({
      items: [{ tipo: 'Produto', codigo: 'A1', descricao: 'Peça', unidade: 'un', precoVenda: 3 }],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].precoVenda, 3);
  });
});
