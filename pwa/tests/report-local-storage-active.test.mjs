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

describe('report-local-storage — rascunhos ativos', () => {
  beforeEach(() => {
    ensureTestLocalStorage();
    globalThis.localStorage.removeItem('manusilva_relatorios_eliminados');
  });

  it('saveLocalReportDraft — ignora relatório com tombstone', async () => {
    const { markReportLocallyDeleted } = await import('../js/report-deleted-local.js');
    markReportLocallyDeleted({ id: 'draft-1', servicoId: 'svc-1' });

    const { saveLocalReportDraft } = await import('../js/report-local-storage.js');
    const result = await saveLocalReportDraft({
      id: 'draft-1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'draft',
      data: {},
    });
    assert.equal(result, null);
  });

  it('filterActiveLocalReportDrafts — exclui visita inexistente', async () => {
    const servicosDb = await import('../js/servicos-db.js');
    servicosDb.invalidateServicosCache();
    servicosDb.mergeServicoInCache({
      id: 'svc-active',
      clientId: '1',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'scheduled',
    });

    const { filterActiveLocalReportDrafts } = await import('../js/report-local-storage.js');
    const active = filterActiveLocalReportDrafts(
      [
        { id: 'd-active', servicoId: 'svc-active', technicianId: 'Filipe', status: 'draft' },
        { id: 'd-orphan', servicoId: 'svc-gone', technicianId: 'Filipe', status: 'draft' },
      ],
      'Filipe',
    );
    assert.equal(active.length, 1);
    assert.equal(active[0].id, 'd-active');
  });
});

describe('report-form-autosave — tombstone', () => {
  beforeEach(() => {
    ensureTestLocalStorage();
    globalThis.localStorage.removeItem('manusilva_relatorios_eliminados');
  });

  it('canAutosaveReport — false quando relatório foi eliminado', async () => {
    const { markReportLocallyDeleted } = await import('../js/report-deleted-local.js');
    const { canAutosaveReport } = await import('../js/report-form-autosave.js');
    markReportLocallyDeleted({ id: 'gone-1' });
    assert.equal(canAutosaveReport({ id: 'gone-1', status: 'draft' }, { status: 'scheduled' }), false);
    assert.equal(canAutosaveReport({ id: 'ok-1', status: 'draft' }, { status: 'scheduled' }), true);
  });
});

describe('report-local-storage — fotos no auto-save', () => {
  it('shouldReuseExistingPhotoBlob — reutiliza blob quando o data URL não mudou', async () => {
    const { shouldReuseExistingPhotoBlob, photoInlineFingerprint } = await import(
      '../js/report-local-storage.js'
    );
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAA';
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const existing = {
      photoAntes: blob,
      photoAntesFp: photoInlineFingerprint(dataUrl),
    };
    assert.equal(
      shouldReuseExistingPhotoBlob({ fotoAntesBase64: dataUrl }, existing, 'antes'),
      true,
    );
  });

  it('shouldReuseExistingPhotoBlob — não reutiliza se veio um File novo', async () => {
    const { shouldReuseExistingPhotoBlob } = await import('../js/report-local-storage.js');
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const file = new Blob(['novo'], { type: 'image/jpeg' });
    const existing = { photoAntes: blob, photoAntesFp: 'old' };
    assert.equal(
      shouldReuseExistingPhotoBlob(
        { fotoAntesBase64: 'data:image/jpeg;base64,abc', fotoAntesFile: file },
        existing,
        'antes',
      ),
      false,
    );
  });

  it('shouldReuseExistingPhotoBlob — não reutiliza quando a foto foi apagada', async () => {
    const { shouldReuseExistingPhotoBlob } = await import('../js/report-local-storage.js');
    const existing = { photoAntes: new Blob(['x'], { type: 'image/jpeg' }) };
    assert.equal(
      shouldReuseExistingPhotoBlob({ fotoAntesUrl: null, fotoAntesBase64: null }, existing, 'antes'),
      false,
    );
  });
});
