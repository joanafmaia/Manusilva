import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('warehouse role session', () => {
  it('normalizeSession mapeia Armazem para warehouse', async () => {
    const { normalizeSession } = await import('../js/session.js');
    const session = normalizeSession({
      nome: 'Hugo',
      email: 'filipasilvahugo2013@gmail.com',
      role: 'Armazem',
      token: 'abc',
      refreshToken: 'xyz',
      loginAt: '2026-07-07T09:00:00Z',
    });

    assert.equal(session.role, 'warehouse');
    assert.equal(session.technicianId, 'tech-1');
    assert.equal(session.refreshToken, 'xyz');
  });
});

describe('warehouse role auth source', () => {
  it('login view expõe perfil Armazém', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../js/views/login.js', import.meta.url), 'utf8');
    assert.match(src, /data-role="warehouse"/);
  });

  it('armazém tem página desktop dedicada', async () => {
    const fs = await import('node:fs/promises');
    const html = await fs.readFile(new URL('../warehouse.html', import.meta.url), 'utf8');
    const auth = await fs.readFile(new URL('../js/auth-guard.js', import.meta.url), 'utf8');
    assert.match(html, /warehouse-page/);
    assert.match(html, /runManusilvaEntry\('warehouse'/);
    assert.match(auth, /warehouse\.html/);
  });

  it('folha de obra permite criar novo cliente', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../js/views/folhas-obra.js', import.meta.url), 'utf8');
    assert.match(src, /folha-create-client/);
    assert.match(src, /\+ Novo cliente/);
  });
});
