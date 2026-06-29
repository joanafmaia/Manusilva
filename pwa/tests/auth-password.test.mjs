import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INITIAL_PASSWORD_SUFFIX,
  buildInitialPasswordHint,
  matchesInitialPasswordPattern,
} from '../js/auth-password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiAuthPasswordSrc = fs.readFileSync(
  path.join(__dirname, '../api/lib/auth-password.js'),
  'utf8',
);

describe('auth-password', () => {
  it('partilha o sufixo .2026 com a API', () => {
    assert.equal(INITIAL_PASSWORD_SUFFIX, '.2026');
    assert.match(apiAuthPasswordSrc, /INITIAL_PASSWORD_SUFFIX = '\.2026'/);
  });

  it('gera hint com PrimeiraLetra + resto + .2026', () => {
    assert.equal(buildInitialPasswordHint('Hugo'), 'Hugo.2026');
    assert.equal(buildInitialPasswordHint('filipa'), 'Filipa.2026');
  });

  it('usa exemplo Tecnico quando o nome está vazio', () => {
    assert.equal(buildInitialPasswordHint(''), 'Ex.: Tecnico.2026');
  });

  it('matchesInitialPasswordPattern valida a password inicial', () => {
    assert.equal(matchesInitialPasswordPattern('Joana.2026', 'joana'), true);
    assert.equal(matchesInitialPasswordPattern('Joana.2025', 'joana'), false);
  });

  it('API buildInitialPassword segue o mesmo algoritmo', () => {
    assert.match(apiAuthPasswordSrc, /buildInitialPassword/);
    assert.match(apiAuthPasswordSrc, /charAt\(0\)\.toUpperCase\(\)/);
  });
});
