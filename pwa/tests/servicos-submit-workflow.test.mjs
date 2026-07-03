import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-submit-workflow', () => {
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
      data: {},
    });
  });

  it('getServicoVisitSubmitState — bloqueia sem relatórios', async () => {
    const { getServicoVisitSubmitState } = await import('../js/servicos-submit-workflow.js');
    const state = getServicoVisitSubmitState('svc-1');
    assert.equal(state.canSubmit, false);
    assert.match(state.reason, /pelo menos um relatório/i);
  });

  it('getServicoVisitSubmitState — permite com rascunhos concluídos pelo técnico', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [], technicianCompleted: true },
    });

    const { getServicoVisitSubmitState } = await import('../js/servicos-submit-workflow.js');
    const state = getServicoVisitSubmitState('svc-1');
    assert.equal(state.canSubmit, true);
    assert.equal(state.readyDraftReports.length, 1);
  });

  it('getServicoVisitSubmitState — bloqueia rascunhos por concluir', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [] },
    });

    const { getServicoVisitSubmitState } = await import('../js/servicos-submit-workflow.js');
    const state = getServicoVisitSubmitState('svc-1');
    assert.equal(state.canSubmit, false);
    assert.match(state.reason, /Conclua cada relatório/i);
    assert.equal(state.incompleteDraftReports.length, 1);
  });

  it('getServicoVisitSubmitState — bloqueia com rejeitados', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r1',
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      status: 'rejected',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [] },
    });

    const { getServicoVisitSubmitState } = await import('../js/servicos-submit-workflow.js');
    const state = getServicoVisitSubmitState('svc-1');
    assert.equal(state.canSubmit, false);
    assert.match(state.reason, /rejeitados/i);
  });

  it('collectServicoSubmitWarnings — avisa assinaturas em falta', async () => {
    const { collectServicoSubmitWarnings } = await import('../js/servicos-submit-workflow.js');
    const warnings = collectServicoSubmitWarnings({ technician: false, client: false });
    assert.equal(warnings.length, 2);
  });
});
