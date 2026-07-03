import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-panel-utils', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    const trabalhosDb = await import('../js/trabalhos-db.js');

    servicosDb.invalidateServicosCache();
    relatoriosDb.invalidateReportsCache();
    trabalhosDb.invalidateJobsCache();

    servicosDb.mergeServicoInCache({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'scheduled',
    });
    servicosDb.mergeServicoInCache({
      id: 'svc-2',
      clientId: '11',
      date: '2026-07-04',
      technicianIds: 'Hugo',
      status: 'scheduled',
    });

    trabalhosDb.mergeJobFromRealtime({
      id: 'legacy-1',
      cliente_id: 12,
      data: '2026-07-05',
      tecnico_id: 'Adelton',
      tipo_servico: 'manutencao',
      estado: 'scheduled',
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
    relatoriosDb.mergeReportInCache({
      id: 'r2',
      servicoId: 'svc-1',
      jobId: '',
      serviceType: 'grandes_baterias',
      status: 'pending_review',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [] },
    });
    relatoriosDb.mergeReportInCache({
      id: 'r3',
      jobId: 'legacy-1',
      servicoId: '',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '12',
      technicianId: 'Adelton',
      data: { values: {}, signatures: {}, photos: [] },
    });
  });

  it('getAdminCalendarItems — serviços + trabalhos legados sem duplicar', async () => {
    const { getAdminCalendarItems } = await import('../js/servicos-panel-utils.js');
    const items = getAdminCalendarItems();
    const ids = items.map((i) => i.id).sort();
    assert.deepEqual(ids, ['legacy-1', 'svc-1', 'svc-2']);
    assert.equal(items.find((i) => i.id === 'svc-1')?.isServico, true);
    assert.equal(items.find((i) => i.id === 'legacy-1')?.isServico, undefined);
  });

  it('getCalendarItemSubtitle — vários relatórios', async () => {
    const { getCalendarItemSubtitle, servicoToCalendarItem } = await import(
      '../js/servicos-panel-utils.js'
    );
    const item = servicoToCalendarItem({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'scheduled',
    });
    assert.equal(getCalendarItemSubtitle(item), '2 relatórios');
  });

  it('getReportsForServico — por servico_id', async () => {
    const { getReportsForServico } = await import('../js/servicos-panel-utils.js');
    const reports = getReportsForServico('svc-1');
    assert.equal(reports.length, 2);
  });

  it('getReportsForServico — vários relatórios com o mesmo jobId (visita)', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
    relatoriosDb.mergeReportInCache({
      id: 'rj1',
      jobId: 'svc-1',
      servicoId: '',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'rj2',
      jobId: 'svc-1',
      servicoId: '',
      serviceType: 'manutencao_baterias_grandes',
      status: 'pending_review',
      clientId: '10',
      data: {},
    });
    const { getReportsForServico } = await import('../js/servicos-panel-utils.js');
    assert.equal(getReportsForServico('svc-1').length, 2);
  });
});
