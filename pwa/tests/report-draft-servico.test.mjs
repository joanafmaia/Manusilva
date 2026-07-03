import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('rascunho na visita (serviço)', () => {
  beforeEach(async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
  });

  it('getReportsForServico — rascunho com servico_id fica na visita', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    const { getReportsForServico } = await import('../js/servicos-panel-utils.js');

    relatoriosDb.mergeReportInCache({
      id: 'draft-svc-1',
      servicoId: 'svc-1',
      jobId: '',
      serviceType: 'manutencao_preventiva_empilhadores',
      status: 'draft',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, technicianCompleted: false },
    });

    const reports = getReportsForServico('svc-1');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, 'draft-svc-1');
    assert.equal(reports[0].status, 'draft');
  });

  it('mapReportToRow persiste technicianCompleted na visita', async () => {
    const { mapReportToRow } = await import('../js/relatorios-db.js');
    const row = mapReportToRow({
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'draft',
      data: { values: {}, technicianCompleted: true },
    });
    assert.equal(row.servico_id, 'svc-1');
    assert.equal(row.dados.technicianCompleted, true);
  });

  it('reportDraftStorageKey — usa id do relatório (vários do mesmo tipo)', async () => {
    const { reportDraftStorageKey } = await import('../js/report-local-storage.js');
    const key = reportDraftStorageKey({
      id: '550e8400-e29b-41d4-a716-446655440099',
      servicoId: 'svc-1',
      serviceType: 'manutencao_preventiva_empilhadores',
      jobId: '',
    });
    assert.equal(key, '550e8400-e29b-41d4-a716-446655440099');
  });
});
