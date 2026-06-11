import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLoginEmail,
  SYSTEM_LOGIN_EMAIL_DOMAIN,
} from '../js/auth.js';
import { FILIPA_AUTH_EMAIL } from '../js/mock_data.js';

describe('resolveLoginEmail', () => {
  it('mantém e-mail quando o identificador contém @', () => {
    assert.equal(resolveLoginEmail('Joana@Gmail.COM'), 'joana@gmail.com');
    assert.equal(resolveLoginEmail('  hugo@test.pt  '), 'hugo@test.pt');
  });

  it('resolve nome no catálogo para o e-mail registado', () => {
    assert.equal(resolveLoginEmail('Filipa'), FILIPA_AUTH_EMAIL);
    assert.equal(resolveLoginEmail('filipa'), FILIPA_AUTH_EMAIL);
    assert.equal(resolveLoginEmail('Joana'), 'joanamaia97@gmail.com');
    assert.equal(resolveLoginEmail('Hugo', 'Tecnico'), 'filipasilvahugo2013@gmail.com');
  });

  it('rejeita nome com perfil errado sem usar fallback @sistema.com', () => {
    assert.equal(resolveLoginEmail('Filipa', 'Tecnico'), null);
  });

  it('acrescenta @sistema.com quando o nome não está no catálogo', () => {
    assert.equal(resolveLoginEmail('Maria'), `maria@${SYSTEM_LOGIN_EMAIL_DOMAIN}`);
    assert.equal(resolveLoginEmail('  Ana Silva  '), `anasilva@${SYSTEM_LOGIN_EMAIL_DOMAIN}`);
  });

  it('devolve null para identificador vazio', () => {
    assert.equal(resolveLoginEmail(''), null);
    assert.equal(resolveLoginEmail('   '), null);
  });
});
