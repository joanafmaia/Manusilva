import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILIPA_LEGACY_AUTH_EMAIL, UTILIZADORES } from '../js/mock_data.js';
import { getRhAdminConfigSnapshot } from '../js/auth-roles-core.js';
import rhConfig from '../shared/rh-admin-config.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../shared/rh-admin-config.json');

function buildExpectedConfig() {
  const tecnicoEmails = new Set(
    UTILIZADORES.filter((u) => u.role === 'Tecnico').map((u) => u.email.toLowerCase()),
  );
  const emails = [
    ...new Set(
      [
        ...UTILIZADORES.filter((u) => u.role === 'RH')
          .map((u) => u.email.toLowerCase())
          .filter((email) => email && !tecnicoEmails.has(email)),
        FILIPA_LEGACY_AUTH_EMAIL.toLowerCase(),
      ].filter(Boolean),
    ),
  ].sort();
  const names = [
    ...new Set(UTILIZADORES.filter((u) => u.role === 'RH').map((u) => u.nome.toLowerCase())),
  ].sort();
  return { emails, names };
}

describe('rh-admin-config', () => {
  it('JSON da API e auth-roles-core.js estão alinhados com UTILIZADORES', () => {
    assert.ok(fs.existsSync(configPath), 'Correr npm run sync:rh-config');
    const expected = buildExpectedConfig();
    const browser = getRhAdminConfigSnapshot();
    assert.deepEqual([...rhConfig.emails].sort(), expected.emails);
    assert.deepEqual([...rhConfig.names].sort(), expected.names);
    assert.deepEqual([...browser.emails].sort(), expected.emails);
    assert.deepEqual([...browser.names].sort(), expected.names);
  });
});
