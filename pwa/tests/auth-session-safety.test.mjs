import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loginSrc = fs.readFileSync(path.join(__dirname, '../js/views/login.js'), 'utf8');
const supabaseClientSrc = fs.readFileSync(
  path.join(__dirname, '../js/supabase-client.js'),
  'utf8',
);
const authSrc = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');

describe('auth session safety', () => {
  it('usa lockout por utilizador/perfil em vez de contador global único', () => {
    assert.match(loginSrc, /FAILED_COUNT_KEY_PREFIX/);
    assert.match(loginSrc, /normalizeIdentifierKey/);
    assert.doesNotMatch(loginSrc, /const FAILED_COUNT_KEY = 'manusilva_login_failed_count'/);
  });

  it('não limpa todo o localStorage em logout ou sessão fatal', () => {
    assert.doesNotMatch(authSrc, /localStorage\.clear\(\)/);
    assert.doesNotMatch(authSrc, /sessionStorage\.clear\(\)/);
    assert.doesNotMatch(supabaseClientSrc, /localStorage\.clear\(\)/);
    assert.doesNotMatch(supabaseClientSrc, /sessionStorage\.clear\(\)/);
    assert.match(authSrc, /clearAuthStorage\(\)/);
    assert.match(supabaseClientSrc, /clearAuthStorage\(\)/);
  });
});
