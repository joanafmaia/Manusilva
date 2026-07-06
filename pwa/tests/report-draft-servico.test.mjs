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

  it('mapReportToRow não usa trabalho_id como servico_id', async () => {
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const { mapReportToRow } = await import('../js/relatorios-db.js');

    trabalhosDb.invalidateJobsCache();
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-uuid-1',
      numero_ordem: 99,
      servico_id: 'svc-linked',
      tecnico_id: 'Filipe',
      cliente_id: 10,
      tipo_servico: 'manutencao',
      data: '2026-07-01',
      estado: 'scheduled',
    });

    const standalone = mapReportToRow({
      jobId: 'job-uuid-1',
      serviceType: 'proposta_ms015_rh',
      status: 'approved',
      data: { orcamentoOrigem: 'rh_standalone', values: {} },
    });
    assert.equal(standalone.servico_id, 'svc-linked');
    assert.equal(standalone.trabalho_id, 'job-uuid-1');

    const withoutServico = mapReportToRow({
      jobId: 'job-uuid-standalone',
      serviceType: 'proposta_ms015_rh',
      status: 'approved',
      data: { orcamentoOrigem: 'rh_standalone', values: {} },
    });
    assert.equal(withoutServico.servico_id, null);
    assert.equal(withoutServico.trabalho_id, 'job-uuid-standalone');
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
