import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

const { getSavedLoginIdentifier, loadLoginPrefs, saveLoginPrefs } = await import(
  '../js/login-prefs.js'
);

describe('login-prefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda função e identificador após login', () => {
    saveLoginPrefs({ role: 'admin', identifier: 'Joana' });
    assert.equal(loadLoginPrefs().role, 'admin');
    assert.equal(getSavedLoginIdentifier('admin'), 'Joana');
  });

  it('mantém identificadores separados por função', () => {
    saveLoginPrefs({ role: 'technician', identifier: 'Hugo' });
    saveLoginPrefs({ role: 'warehouse', identifier: 'Hugo' });
    saveLoginPrefs({ role: 'admin', identifier: 'joanamaia97@gmail.com' });
    assert.equal(getSavedLoginIdentifier('technician'), 'Hugo');
    assert.equal(getSavedLoginIdentifier('warehouse'), 'Hugo');
    assert.equal(getSavedLoginIdentifier('admin'), 'joanamaia97@gmail.com');
  });
});
