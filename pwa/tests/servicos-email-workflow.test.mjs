import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-email-workflow', () => {
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
      status: 'pending_review',
      data: {},
    });
  });

  async function seedTwoReports() {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'r2',
      servicoId: 'svc-1',
      serviceType: 'manutencao_baterias_grandes',
      status: 'pending_review',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
  }

  it('shouldDeferServicoVisitEmail — visita com 2+ relatórios', async () => {
    await seedTwoReports();
    const { shouldDeferServicoVisitEmail } = await import('../js/servicos-email-workflow.js');
    assert.equal(shouldDeferServicoVisitEmail({ servicoId: 'svc-1' }), true);
    assert.equal(shouldDeferServicoVisitEmail({ servicoId: '' }), false);
  });

  it('isServicoVisitFullyApproved — false com pendente', async () => {
    await seedTwoReports();
    const { isServicoVisitFullyApproved } = await import('../js/servicos-email-workflow.js');
    assert.equal(isServicoVisitFullyApproved('svc-1'), false);
  });

  it('isServicoVisitFullyApproved — true quando todos aprovados', async () => {
    await seedTwoReports();
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r2',
      servicoId: 'svc-1',
      serviceType: 'manutencao_baterias_grandes',
      status: 'approved',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
    const { isServicoVisitFullyApproved } = await import('../js/servicos-email-workflow.js');
    assert.equal(isServicoVisitFullyApproved('svc-1'), true);
  });

  it('shouldDeferServicoVisitEmail — relatório único na visita', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
    const { shouldDeferServicoVisitEmail } = await import('../js/servicos-email-workflow.js');
    assert.equal(shouldDeferServicoVisitEmail({ servicoId: 'svc-1' }), false);
  });
});
