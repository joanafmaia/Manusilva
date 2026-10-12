import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('report-form-resume', () => {
  let store;

  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('marca, lê e consome intent de trabalho', async () => {
    const {
      markOpenReportForm,
      peekOpenReportFormIntent,
      consumeOpenReportFormIntent,
      hasOpenReportFormIntent,
      clearOpenReportForm,
    } = await import('../js/report-form-resume.js');

    assert.equal(hasOpenReportFormIntent(), false);
    markOpenReportForm({ kind: 'job', jobId: 'job-1', editPending: true });
    assert.equal(hasOpenReportFormIntent(), true);
    const peek = peekOpenReportFormIntent();
    assert.equal(peek?.kind, 'job');
    assert.equal(peek?.jobId, 'job-1');
    assert.equal(peek?.editPending, true);

    const consumed = consumeOpenReportFormIntent();
    assert.equal(consumed?.jobId, 'job-1');
    assert.equal(hasOpenReportFormIntent(), false);

    clearOpenReportForm();
    assert.equal(peekOpenReportFormIntent(), null);
  });

  it('marca intent de serviço', async () => {
    const { markOpenReportForm, peekOpenReportFormIntent } = await import(
      '../js/report-form-resume.js'
    );
    markOpenReportForm({
      kind: 'servico',
      servicoId: 'svc-9',
      serviceType: 'manutencao_preventiva',
      reportId: 'rep-1',
    });
    const peek = peekOpenReportFormIntent();
    assert.equal(peek?.kind, 'servico');
    assert.equal(peek?.servicoId, 'svc-9');
    assert.equal(peek?.serviceType, 'manutencao_preventiva');
    assert.equal(peek?.reportId, 'rep-1');
  });

  it('parseOpenReportFormIntent rejeita dados inválidos ou expirados', async () => {
    const { parseOpenReportFormIntent } = await import('../js/report-form-resume.js');
    assert.equal(parseOpenReportFormIntent(null), null);
    assert.equal(parseOpenReportFormIntent({ kind: 'job' }), null);
    assert.equal(
      parseOpenReportFormIntent({
        kind: 'job',
        jobId: 'x',
        openedAt: Date.now() - 13 * 60 * 60 * 1000,
      }),
      null,
    );
    assert.equal(
      parseOpenReportFormIntent({
        kind: 'job',
        jobId: 'x',
        openedAt: Date.now(),
      })?.jobId,
      'x',
    );
  });
});
