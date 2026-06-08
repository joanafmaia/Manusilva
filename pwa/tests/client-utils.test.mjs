/**
 * Testes mínimos — validators e lógica de sync de e-mail.
 * Executar: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, normalizeEmail } from '../js/validators.js';

describe('isValidEmail', () => {
  it('aceita e-mails válidos', () => {
    assert.equal(isValidEmail('cliente@empresa.pt'), true);
    assert.equal(isValidEmail('  RH@ManuSilva.PT  '), true);
  });

  it('rejeita e-mails inválidos', () => {
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('sem-arroba'), false);
    assert.equal(isValidEmail('a@b'), false);
  });
});

describe('normalizeEmail', () => {
  it('normaliza para minúsculas sem espaços', () => {
    assert.equal(normalizeEmail('  Cliente@Empresa.PT '), 'cliente@empresa.pt');
  });
});

describe('syncClientEmailIfChanged (lógica)', () => {
  it('detecta diferença entre e-mails normalizados', () => {
    const current = normalizeEmail('antigo@empresa.pt');
    const next = normalizeEmail('novo@empresa.pt');
    assert.notEqual(current, next);
  });

  it('ignora quando e-mail é igual', () => {
    const current = normalizeEmail('igual@empresa.pt');
    const next = normalizeEmail('  IGUAL@empresa.pt ');
    assert.equal(current, next);
  });
});
