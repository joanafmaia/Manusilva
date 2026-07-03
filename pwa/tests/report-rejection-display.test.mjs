import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCalendarEventState } from '../js/calendar-event-state.js';
import { resolveTechActionLabel } from '../js/tech-panel-utils.js';
import {
  dedupeReportsForDisplay,
  mergeReportInCache,
  getCanonicalReportForJob,
  invalidateReportsCache,
} from '../js/relatorios-db.js';

describe('resolveCalendarEventState — reprovação', () => {
  it('reprovação prevalece sobre rascunho local', () => {
    const job = { id: 'job-1', status: 'rejected' };
    const report = { status: 'draft' };
    assert.equal(resolveCalendarEventState(job, report), 'rejected');
  });

  it('relatório rejeitado marca estado rejeitado', () => {
    const job = { id: 'job-1', status: 'scheduled' };
    const report = { status: 'rejected', rejectionNote: 'Falta foto' };
    assert.equal(resolveCalendarEventState(job, report), 'rejected');
  });

  it('pending_review marca estado pendente (editável pelo técnico)', () => {
    const job = { id: 'job-1', status: 'scheduled' };
    const report = { status: 'pending_review' };
    assert.equal(resolveCalendarEventState(job, report), 'pending');
  });
});

describe('resolveTechActionLabel — pending_review', () => {
  it('pendente RH abre com ação Editar', () => {
    assert.equal(resolveTechActionLabel('continue', 'pending'), 'Editar');
  });

  it('aprovado mantém ação Ver', () => {
    assert.equal(resolveTechActionLabel('view', 'approved'), 'Ver');
  });
});

describe('getCanonicalReportForJob', () => {
  it('prefere reprovado a rascunho duplicado no mesmo trabalho', () => {
    invalidateReportsCache();
    mergeReportInCache({
      id: 'rep-draft',
      jobId: 'job-99',
      status: 'draft',
      submittedAt: '2026-06-12T10:00:00.000Z',
    });
    mergeReportInCache({
      id: 'rep-rejected',
      jobId: 'job-99',
      status: 'rejected',
      rejectionNote: 'Corrigir',
      submittedAt: '2026-06-11T10:00:00.000Z',
    });

    const canonical = getCanonicalReportForJob('job-99');
    assert.equal(canonical?.status, 'rejected');
    assert.equal(
      dedupeReportsForDisplay([
        { id: 'a', jobId: 'job-99', status: 'draft' },
        { id: 'b', jobId: 'job-99', status: 'rejected' },
      ])[0]?.status,
      'rejected',
    );
    invalidateReportsCache();
  });
});
