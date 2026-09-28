import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  scoreSearchHaystack,
  searchAdminIndex,
} from '../js/admin-command-search.js';

describe('admin-command-search', () => {
  it('normaliza acentos e maiúsculas', () => {
    assert.equal(normalizeSearchText('José  Silva'), 'jose silva');
  });

  it('pontua correspondência de OP e fatura', () => {
    assert.ok(scoreSearchHaystack('OP-2026-43 cliente x', 'op 43') >= 45);
    assert.ok(scoreSearchHaystack('FT 2026/12', 'ft 2026/12') >= 80);
  });

  it('ordena resultados pelo score', () => {
    const hits = searchAdminIndex(
      [
        { id: '1', kind: 'client', title: 'Outro', haystack: 'outro lda' },
        { id: '2', kind: 'client', title: 'José Silva', haystack: 'jose silva 123' },
        { id: '3', kind: 'invoice', title: 'FT 2026/12', haystack: 'ft 2026/12 jose' },
      ],
      'jose',
    );
    assert.equal(hits[0].id, '2');
    assert.equal(hits.some((h) => h.id === '1'), false);
  });
});
