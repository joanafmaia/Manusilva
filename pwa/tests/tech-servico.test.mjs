import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-panel-utils — técnico', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    servicosDb.invalidateServicosCache();
    relatoriosDb.invalidateReportsCache();

    servicosDb.mergeServicoInCache({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'scheduled',
    });

    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      jobId: '',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [] },
    });
  });

  it('getAvailableServiceTypesForServico — permite repetir o mesmo tipo na visita', async () => {
    const { getAvailableServiceTypesForServico } = await import('../js/servicos-panel-utils.js');
    const allTypes = [
      { id: 'manutencao', label: 'Manutenção' },
      { id: 'grandes_baterias', label: 'Grandes Baterias' },
    ];
    const available = getAvailableServiceTypesForServico('svc-1', allTypes);
    assert.deepEqual(
      available.map((t) => t.id),
      ['manutencao', 'grandes_baterias'],
    );
  });

  it('getReportsByServicoAndType — vários relatórios do mesmo tipo', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r2',
      servicoId: 'svc-1',
      jobId: '',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      data: {},
    });
    const { getReportsByServicoAndType } = await import('../js/servicos-panel-utils.js');
    const reports = getReportsByServicoAndType('svc-1', 'manutencao');
    assert.equal(reports.length, 2);
  });

  it('getReportByServicoAndType — encontra relatório por tipo', async () => {
    const { getReportByServicoAndType } = await import('../js/servicos-panel-utils.js');
    const report = getReportByServicoAndType('svc-1', 'manutencao');
    assert.equal(report?.id, 'r1');
  });

  it('canRemoveServicoReport — só rascunhos', async () => {
    const { canRemoveServicoReport } = await import('../js/servicos-panel-utils.js');
    assert.equal(canRemoveServicoReport({ status: 'draft' }), true);
    assert.equal(canRemoveServicoReport({ status: 'pending_review' }), false);
    assert.equal(canRemoveServicoReport({ status: 'approved' }), false);
    assert.equal(canRemoveServicoReport({ status: 'rejected' }), false);
  });
});
