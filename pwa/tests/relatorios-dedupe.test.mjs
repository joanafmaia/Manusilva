import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('dedupeReportsForDisplay', () => {
  it('mantém só um relatório por OP oficial', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');
    const { mergeJobFromRealtime } = await import('../js/trabalhos-db.js');

    mergeJobFromRealtime({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      numero_ordem: 38,
      cliente_id: 1,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-01',
      hora: null,
      estado: 'completed',
    });
    mergeJobFromRealtime({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      numero_ordem: 38,
      cliente_id: 2,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-02',
      hora: null,
      estado: 'completed',
    });

    const reports = [
      {
        id: 'rep-old',
        jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        clientId: '1',
        status: 'approved',
        approvedAt: '2026-06-01T10:00:00.000Z',
        serviceType: 'folha_intervencao_avarias',
      },
      {
        id: 'rep-new',
        jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        clientId: '2',
        status: 'approved',
        approvedAt: '2026-06-10T10:00:00.000Z',
        serviceType: 'folha_intervencao_avarias',
      },
    ];

    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-new');
  });

  it('remove duplicados do mesmo trabalho', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');

    const reports = [
      {
        id: 'rep-draft',
        jobId: 'job-x',
        status: 'draft',
        submittedAt: '2026-06-01T10:00:00.000Z',
      },
      {
        id: 'rep-approved',
        jobId: 'job-x',
        status: 'approved',
        approvedAt: '2026-06-02T10:00:00.000Z',
      },
    ];

    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-approved');
  });
});
