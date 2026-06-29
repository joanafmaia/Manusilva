import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUtilizadores, stripPasswordsFromDb } from '../js/local-db-sanitize.js';

describe('local-db-sanitize', () => {
  it('remove campo password de utilizadores', () => {
    const list = [{ nome: 'Hugo', password: 'secret' }, { nome: 'Joana' }];
    const out = sanitizeUtilizadores(list);
    assert.equal(out[0].nome, 'Hugo');
    assert.equal('password' in out[0], false);
    assert.equal(out[1].nome, 'Joana');
  });

  it('stripPasswordsFromDb só altera quando há passwords', () => {
    const db = { utilizadores: [{ nome: 'A', password: 'x' }] };
    assert.equal(stripPasswordsFromDb(db), true);
    assert.equal('password' in db.utilizadores[0], false);

    const clean = { utilizadores: [{ nome: 'B' }] };
    assert.equal(stripPasswordsFromDb(clean), false);
  });
});
