import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function ensureTestLocalStorage() {
  if (globalThis.localStorage) return;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('report-deleted-local', () => {
  beforeEach(() => {
    ensureTestLocalStorage();
    globalThis.localStorage.removeItem('manusilva_relatorios_eliminados');
  });

  it('marca e deteta relatório eliminado localmente', async () => {
    const mod = await import('../js/report-deleted-local.js');
    assert.equal(mod.isReportLocallyDeleted('r-abc'), false);
    mod.markReportLocallyDeleted({ id: 'r-abc', servicoId: 'svc-1', serviceType: 'manutencao' });
    assert.equal(mod.isReportLocallyDeleted('r-abc'), true);
    assert.equal(mod.isReportLocallyDeleted({ id: 'r-abc' }), true);
  });

  it('filterOutLocallyDeletedReports remove tombstones', async () => {
    const mod = await import('../js/report-deleted-local.js');
    mod.markReportLocallyDeleted({ id: 'gone' });
    const filtered = mod.filterOutLocallyDeletedReports([
      { id: 'gone', status: 'draft' },
      { id: 'keep', status: 'draft' },
    ]);
    assert.deepEqual(filtered.map((r) => r.id), ['keep']);
  });

  it('clearReportLocallyDeleted limpa tombstone', async () => {
    const mod = await import('../js/report-deleted-local.js');
    mod.markReportLocallyDeleted({ id: 'tmp' });
    mod.clearReportLocallyDeleted('tmp');
    assert.equal(mod.isReportLocallyDeleted('tmp'), false);
  });
});
