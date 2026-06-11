import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLoginEmail,
  resolveLoginEmailCandidates,
  SYSTEM_LOGIN_EMAIL_DOMAIN,
  LEGACY_RH_LOGIN_EMAIL_DOMAIN,
} from '../js/auth.js';
import { FILIPA_AUTH_EMAIL, FILIPA_LEGACY_AUTH_EMAIL } from '../js/mock_data.js';

describe('resolveLoginEmailCandidates', () => {
  it('mantém e-mail quando o identificador contém @', () => {
    assert.deepEqual(resolveLoginEmailCandidates('Joana@Gmail.COM'), ['joana@gmail.com']);
  });

  it('resolve Filipa com @sistema.com e legado @rh.manusilva.internal', () => {
    assert.deepEqual(resolveLoginEmailCandidates('Filipa'), [
      FILIPA_AUTH_EMAIL,
      FILIPA_LEGACY_AUTH_EMAIL,
    ]);
  });

  it('resolve Joana e Hugo para o e-mail do catálogo antes do fallback', () => {
    assert.deepEqual(resolveLoginEmailCandidates('Joana'), [
      'joanamaia97@gmail.com',
      `joana@${SYSTEM_LOGIN_EMAIL_DOMAIN}`,
    ]);
    assert.deepEqual(resolveLoginEmailCandidates('Hugo'), [
      'filipasilvahugo2013@gmail.com',
      `hugo@${SYSTEM_LOGIN_EMAIL_DOMAIN}`,
    ]);
  });

  it('resolve nome mesmo com separador de perfil (validação é pós-login)', () => {
    assert.equal(resolveLoginEmail('Filipa', 'Tecnico'), FILIPA_AUTH_EMAIL);
  });

  it('acrescenta @sistema.com para nomes desconhecidos', () => {
    assert.deepEqual(resolveLoginEmailCandidates('Maria'), [`maria@${SYSTEM_LOGIN_EMAIL_DOMAIN}`]);
    assert.deepEqual(resolveLoginEmailCandidates('  Ana Silva  '), [
      `anasilva@${SYSTEM_LOGIN_EMAIL_DOMAIN}`,
    ]);
  });

  it('devolve lista vazia para identificador vazio', () => {
    assert.deepEqual(resolveLoginEmailCandidates(''), []);
    assert.deepEqual(resolveLoginEmailCandidates('   '), []);
  });

  it('expõe domínio legado RH', () => {
    assert.equal(LEGACY_RH_LOGIN_EMAIL_DOMAIN, 'rh.manusilva.internal');
  });
});
