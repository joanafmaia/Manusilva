import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveLoginEmail,
  resolveLoginEmailCandidates,
  SYSTEM_LOGIN_EMAIL_DOMAIN,
  LEGACY_RH_LOGIN_EMAIL_DOMAIN,
  isTransientAuthError,
  formatAuthError,
} from '../js/auth.js';
import { FILIPA_AUTH_EMAIL, FILIPA_LEGACY_AUTH_EMAIL } from '../js/mock_data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSrc = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');

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

  it('não herda role ou technicianId do catálogo local no perfil autenticado', () => {
    assert.doesNotMatch(authSrc, /meta\.role\s*\|\|\s*fromPool\?\.role/);
    assert.doesNotMatch(authSrc, /meta\.technician_id\s*\|\|\s*meta\.technicianId\s*\|\|\s*fromPool\?\.technicianId/);
  });

  it('não promove a RH só por metadata.nome (alinhado com is_rh_admin / 036)', () => {
    assert.doesNotMatch(authSrc, /isRhOrAdminName\s*\(/);
  });
});

describe('erros de autenticação transitórios', () => {
  it('trata HTTP 504 como erro temporário, não como credenciais', () => {
    assert.equal(isTransientAuthError({ message: 'HTTP 504', status: 504 }), true);
    assert.equal(
      isTransientAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }),
      true,
    );
    assert.equal(
      isTransientAuthError({ message: 'Invalid login credentials', status: 400 }),
      false,
    );
  });

  it('não mostra o código HTTP cru no ecrã de login', () => {
    const msg = formatAuthError({ message: 'HTTP 504', status: 504 });
    assert.equal(msg.includes('504'), false);
    assert.match(msg, /não respondeu a tempo/i);
  });
});
