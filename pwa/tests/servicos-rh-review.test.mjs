import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-rh-review', () => {
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
      data: { signatures: { technicianData: 'x', clientData: 'y' } },
    });
  });

  async function seedReports() {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'pending_review',
      submittedAt: '2026-07-03T10:00:00Z',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'r2',
      servicoId: 'svc-1',
      serviceType: 'manutencao_baterias_grandes',
      status: 'pending_review',
      submittedAt: '2026-07-03T11:00:00Z',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'r3',
      servicoId: '',
      jobId: 'job-legacy',
      serviceType: 'manutencao',
      status: 'pending_review',
      submittedAt: '2026-07-02T10:00:00Z',
      clientId: '10',
      technicianId: 'Filipe',
      data: {},
    });
  }

  it('groupReportsForRhStack — agrupa visita com 2+ relatórios', async () => {
    await seedReports();
    const { groupReportsForRhStack } = await import('../js/servicos-rh-review.js');
    const filtered = [
      { id: 'r1', servicoId: 'svc-1', status: 'pending_review', submittedAt: '2026-07-03T10:00:00Z' },
      { id: 'r2', servicoId: 'svc-1', status: 'pending_review', submittedAt: '2026-07-03T11:00:00Z' },
      { id: 'r3', servicoId: '', status: 'pending_review', submittedAt: '2026-07-02T10:00:00Z' },
    ];
    const groups = groupReportsForRhStack(filtered);
    assert.equal(groups.length, 2);
    const folder = groups.find((g) => g.kind === 'servico');
    const solo = groups.find((g) => g.kind === 'report');
    assert.ok(folder);
    assert.equal(folder.reports.length, 2);
    assert.ok(solo);
  });

  it('getNextPendingReportId — prioriza mesma visita', async () => {
    await seedReports();
    const { getNextPendingReportId } = await import('../js/servicos-rh-review.js');
    const queue = [
      { id: 'r1', servicoId: 'svc-1', status: 'pending_review' },
      { id: 'r2', servicoId: 'svc-1', status: 'pending_review' },
      { id: 'r3', servicoId: '', status: 'pending_review' },
    ];
    assert.equal(getNextPendingReportId('r1', queue), 'r2');
    assert.equal(getNextPendingReportId('r2', queue), 'r1');
  });

  it('getFirstPendingReportIdForServico', async () => {
    await seedReports();
    const { getFirstPendingReportIdForServico } = await import('../js/servicos-rh-review.js');
    assert.equal(getFirstPendingReportIdForServico('svc-1'), 'r1');
  });

  it('summarizeServicoReviewState', async () => {
    const { summarizeServicoReviewState } = await import('../js/servicos-rh-review.js');
    const state = summarizeServicoReviewState([
      { id: 'a', status: 'pending_review' },
      { id: 'b', status: 'approved' },
    ]);
    assert.equal(state.pending, 1);
    assert.equal(state.approved, 1);
    assert.equal(state.allApproved, false);
  });
});
