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

  it('conta partilhada Armazém não herda technicianId', async () => {
    const { normalizeSession } = await import('../js/session.js');
    const session = normalizeSession({
      nome: 'Armazém',
      email: 'armazem@sistema.com',
      role: 'Armazem',
      token: 'abc',
    });
    assert.equal(session.role, 'warehouse');
    assert.equal(session.technicianId, null);
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
    const dashboard = await fs.readFile(new URL('../js/warehouse-dashboard.js', import.meta.url), 'utf8');
    assert.match(html, /warehouse-page/);
    assert.match(html, /runManusilvaEntry\('warehouse'/);
    assert.match(html, /btn-force-app-refresh/);
    assert.match(auth, /warehouse\.html/);
    assert.match(dashboard, /bindAppRefreshButton/);
  });

  it('folha de obra permite criar novo cliente', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../js/views/folhas-obra.js', import.meta.url), 'utf8');
    assert.match(src, /folha-create-client/);
    assert.match(src, /\+ Novo cliente/);
    assert.match(src, /folha-obra-delete/);
    assert.match(src, /renderResponsavelSelect/);
    assert.match(src, /getAssignableTechnicians/);
    assert.doesNotMatch(src, /from '\.\.\/mock_data\.js'/);
  });

  it('técnicos podem entrar no painel Armazém e a migração 044 cobre o RLS', async () => {
    const fs = await import('node:fs/promises');
    const auth = await fs.readFile(new URL('../js/auth.js', import.meta.url), 'utf8');
    const sql = await fs.readFile(
      new URL('../supabase/migrations/044_armazem_tecnicos_rls.sql', import.meta.url),
      'utf8',
    );
    assert.match(auth, /técnicos podem entrar no painel Armazém/);
    assert.match(auth, /normalizedFilter === 'Armazem' && baseRole === 'Tecnico'/);
    assert.match(sql, /is_rh_admin_warehouse_or_technician/);
    assert.match(sql, /'Tecnico'/);
    assert.match(sql, /auth_delete_folhas_obra_open/);
    assert.match(sql, /invoice_status_unchanged/);
    const { formatClientInsertError } = await import('../js/clients-catalog.js');
    assert.match(formatClientInsertError({ code: '42501', message: 'permission denied' }), /perfil Armazém/);
  });
});

describe('atribuição de trabalhos', () => {
  it('usa o catálogo de técnicos, não uma lista fixa Hugo/Filipe/Adelton', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../js/admin-dashboard.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /ASSIGN_TEAM_TECHS/);
    assert.doesNotMatch(src, /\['Hugo',\s*'Filipe',\s*'Adelton'\]/);
    assert.match(src, /getAssignableTechnicians/);
  });
});
