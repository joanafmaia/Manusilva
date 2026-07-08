import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const prevLocalStorage = globalThis.localStorage;
const storage = new Map();

beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
});

afterEach(() => {
  globalThis.localStorage = prevLocalStorage;
});

describe('network-status', () => {
  it('isBrowserOffline devolve boolean', async () => {
    const { isBrowserOffline } = await import('../js/network-status.js');
    assert.equal(typeof isBrowserOffline(), 'boolean');
  });
});

describe('ops-snapshot', () => {
  it('replaceJobsCache e getJobsSnapshot', async () => {
    const { replaceJobsCache, getJobsSnapshot } = await import('../js/trabalhos-db.js');
    replaceJobsCache([{ id: 'j1', date: '2026-07-01', technicianId: 'Técnico A' }]);
    const snap = getJobsSnapshot();
    assert.equal(snap.length, 1);
    assert.equal(snap[0].id, 'j1');
  });

  it('replaceServicosCache e getServicosSnapshot', async () => {
    const { replaceServicosCache, getServicosSnapshot } = await import('../js/servicos-db.js');
    replaceServicosCache([{ id: 's1', date: '2026-07-02', technicianIds: 'Técnico A' }]);
    const snap = getServicosSnapshot();
    assert.equal(snap.length, 1);
    assert.equal(snap[0].id, 's1');
  });

  it('replaceReportsCache e getReportsSnapshot', async () => {
    const { replaceReportsCache, getReportsSnapshot } = await import('../js/relatorios-db.js');
    replaceReportsCache([{ id: 'r1', jobId: 'j1', serviceType: 'preventiva' }]);
    const snap = getReportsSnapshot();
    assert.equal(snap.length, 1);
    assert.equal(snap[0].jobId, 'j1');
  });
});

describe('clients-catalog offline', () => {
  it('hydrata catálogo a partir de manusilva_db.clients', async () => {
    const { invalidateDbMemoryCache } = await import('../js/local-db.js');
    invalidateDbMemoryCache();

    globalThis.localStorage.setItem(
      'manusilva_db',
      JSON.stringify({
        schemaVersion: 24,
        clients: [{ id: 'c1', Nome: 'Cliente Teste', NIF: '123456789' }],
        technicians: [],
        utilizadores: [],
        offlineQueue: [],
        settings: { offline: true },
      }),
    );

    const { resetProductionCatalogCache, ensureProductionCatalog, getProductionClientsCatalog } =
      await import('../js/clients-catalog.js');
    resetProductionCatalogCache();

    await ensureProductionCatalog();
    const catalog = getProductionClientsCatalog({ warn: false });
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].Nome, 'Cliente Teste');
  });

  it('não deixa o localStorage trocar nomes vindos do Supabase', async () => {
    globalThis.localStorage.setItem(
      'manusilva_db',
      JSON.stringify({
        schemaVersion: 24,
        clients: [{ id: '7', Nome: 'Nome Antigo Local', NIF: '700000000' }],
        technicians: [],
        utilizadores: [],
        offlineQueue: [],
        settings: { offline: false },
      }),
    );

    const { resetProductionCatalogCache, registerClientInCatalog, mergeClientsFromStorage, getClientFromCatalog } =
      await import('../js/clients-catalog.js');

    resetProductionCatalogCache();
    registerClientInCatalog({ id: 7, nome_empresa: 'Nome Certo Supabase', nif: '700000000' });
    mergeClientsFromStorage();

    const record = getClientFromCatalog('7');
    assert.equal(record?.Nome, 'Nome Certo Supabase');
  });

  it('preserva nomes antigos como alias para históricos e pesquisas legadas', async () => {
    globalThis.localStorage.setItem(
      'manusilva_db',
      JSON.stringify({
        schemaVersion: 24,
        clients: [{ id: '8', Nome: 'Cliente Nome Antigo', NIF: '800000000' }],
        technicians: [],
        utilizadores: [],
        offlineQueue: [],
        settings: { offline: false },
      }),
    );

    const { resetProductionCatalogCache, registerClientInCatalog, mergeClientsFromStorage, getClientFromCatalog } =
      await import('../js/clients-catalog.js');

    resetProductionCatalogCache();
    registerClientInCatalog({ id: 8, nome_empresa: 'Cliente Nome Novo', nif: '800000000' });
    mergeClientsFromStorage();

    const record = getClientFromCatalog('8');
    assert.equal(record?.Nome, 'Cliente Nome Novo');
    assert.deepEqual(record?.aliasNames, ['Cliente Nome Novo', 'Cliente Nome Antigo']);
  });
});
