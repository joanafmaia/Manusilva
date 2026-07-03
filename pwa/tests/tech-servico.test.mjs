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

  it('getAvailableServiceTypesForServico — exclui tipos já iniciados', async () => {
    const { getAvailableServiceTypesForServico } = await import('../js/servicos-panel-utils.js');
    const allTypes = [
      { id: 'manutencao', label: 'Manutenção' },
      { id: 'grandes_baterias', label: 'Grandes Baterias' },
    ];
    const available = getAvailableServiceTypesForServico('svc-1', allTypes);
    assert.deepEqual(
      available.map((t) => t.id),
      ['grandes_baterias'],
    );
  });

  it('getReportByServicoAndType — encontra relatório por tipo', async () => {
    const { getReportByServicoAndType } = await import('../js/servicos-panel-utils.js');
    const report = getReportByServicoAndType('svc-1', 'manutencao');
    assert.equal(report?.id, 'r1');
  });
});
