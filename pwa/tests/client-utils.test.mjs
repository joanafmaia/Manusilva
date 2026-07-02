/**
 * Testes mínimos — validators e lógica de sync de e-mail.
 * Executar: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  normalizeEmail,
  normalizeEmailList,
  isValidEmailList,
  formatEmailListForStorage,
} from '../js/validators.js';

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

describe('lista de e-mails (orçamentos)', () => {
  it('aceita vários e-mails separados por ponto e vírgula', () => {
    assert.deepEqual(
      normalizeEmailList('compras@empresa.pt; contabilidade@empresa.pt'),
      ['compras@empresa.pt', 'contabilidade@empresa.pt'],
    );
  });

  it('valida lista e remove duplicados', () => {
    assert.equal(
      isValidEmailList('a@empresa.pt, b@empresa.pt; a@empresa.pt'),
      true,
    );
    assert.deepEqual(
      formatEmailListForStorage('A@empresa.pt; b@empresa.pt'),
      'a@empresa.pt; b@empresa.pt',
    );
  });

  it('rejeita lista com e-mail inválido', () => {
    assert.equal(isValidEmailList('ok@empresa.pt; invalido'), false);
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
