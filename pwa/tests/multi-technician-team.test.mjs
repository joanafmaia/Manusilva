import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('multi-technician visit team', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    const trabalhosDb = await import('../js/trabalhos-db.js');
    servicosDb.invalidateServicosCache();
    relatoriosDb.invalidateReportsCache();
    trabalhosDb.invalidateJobsCache();

    servicosDb.mergeServicoInCache({
      id: 'svc-team',
      clientId: '10',
      date: '2026-07-10',
      technicianIds: 'Hugo, Filipe',
      status: 'scheduled',
      data: {},
    });

    relatoriosDb.mergeReportInCache({
      id: 'r-team',
      servicoId: 'svc-team',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'tech-1',
      submittedAt: '2026-07-10T12:00:00Z',
      approvedAt: '2026-07-10T14:00:00Z',
      data: { values: {}, signatures: {}, photos: [] },
    });

    trabalhosDb.mergeJobFromRealtime({
      id: 'job-team',
      servico_id: 'svc-team',
      cliente_id: 10,
      data: '2026-07-10',
      tecnico_id: 'tech-1',
      tipo_servico: 'manutencao',
      estado: 'completed',
    });
  });

  it('resolveJobContextForReport — prioriza equipa do serviço', async () => {
    const { resolveJobContextForReport } = await import('../js/servicos-panel-utils.js');
    const { getReportsSnapshot } = await import('../js/relatorios-db.js');

    const report = getReportsSnapshot().find((r) => r.id === 'r-team');
    const ctx = resolveJobContextForReport({ ...report, jobId: 'job-team' });
    assert.equal(ctx.technicianId, 'Hugo, Filipe');
  });

  it('resolveReportTechnicianLabel — mostra ambos os técnicos', async () => {
    const { resolveReportTechnicianLabel } = await import('../js/servicos-panel-utils.js');
    const { getReportsSnapshot } = await import('../js/relatorios-db.js');

    const report = getReportsSnapshot().find((r) => r.id === 'r-team');
    const label = resolveReportTechnicianLabel({ ...report, jobId: 'job-team' });
    assert.match(label, /Hugo/);
    assert.match(label, /Filipe/);
  });

  it('getConcluidosForTechnician — conta para o 2.º técnico da equipa', async () => {
    const { getConcluidosForTechnician } = await import('../js/team-stats.js');
    const items = getConcluidosForTechnician({ id: 'tech-2', name: 'Filipe' });
    assert.equal(items.length, 1);
    assert.equal(items[0].report.id, 'r-team');
  });
});
