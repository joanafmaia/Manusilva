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

  it('getAdminCalendarItems — oculta trabalhos dos relatórios de um serviço', async () => {
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-r1',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Adelton',
      tipo_servico: 'manutencao',
      estado: 'completed',
    });
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-r2',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Adelton',
      tipo_servico: 'grandes_baterias',
      estado: 'completed',
    });
    relatoriosDb.mergeReportInCache({
      id: 'rx1',
      servicoId: 'svc-1',
      jobId: 'job-r1',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'Adelton',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'rx2',
      servicoId: 'svc-1',
      jobId: 'job-r2',
      serviceType: 'grandes_baterias',
      status: 'approved',
      clientId: '10',
      technicianId: 'Adelton',
      data: {},
    });
    const { getAdminCalendarItems } = await import('../js/servicos-panel-utils.js');
    const items = getAdminCalendarItems();
    const ids = items.map((i) => i.id);
    assert.ok(ids.includes('svc-1'));
    assert.ok(!ids.includes('job-r1'));
    assert.ok(!ids.includes('job-r2'));
    assert.equal(items.filter((i) => i.clientId === '10' && i.date === '2026-07-03').length, 1);
  });

  it('getAdminCalendarItems — oculta trabalho legado com OP já na visita', async () => {
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-op43',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao',
      estado: 'scheduled',
      numero_ordem: 43,
    });
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-op43-approved',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao',
      estado: 'completed',
      numero_ordem: 43,
      servico_id: 'svc-1',
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-approved-43',
      servicoId: 'svc-1',
      jobId: 'job-op43-approved',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'Hugo',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-stale-draft-43',
      jobId: 'job-op43',
      servicoId: '',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Hugo',
      data: {},
    });
    const { getAdminCalendarItems } = await import('../js/servicos-panel-utils.js');
    const items = getAdminCalendarItems();
    const ids = items.map((i) => i.id);
    assert.ok(ids.includes('svc-1'));
    assert.ok(!ids.includes('job-op43'));
    assert.ok(!ids.includes('job-op43-approved'));
    assert.equal(items.filter((i) => i.clientId === '10' && i.date === '2026-07-03').length, 1);
  });

  it('getReportsForServico — deduplica rascunho órfão quando já existe aprovado com a mesma OP', async () => {
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-a',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao',
      estado: 'completed',
      numero_ordem: 43,
      servico_id: 'svc-1',
    });
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-b',
      cliente_id: 10,
      data: '2026-07-03',
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao',
      estado: 'scheduled',
      numero_ordem: 43,
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-approved',
      servicoId: 'svc-1',
      jobId: 'job-a',
      serviceType: 'manutencao',
      status: 'approved',
      clientId: '10',
      technicianId: 'Hugo',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-stale',
      servicoId: 'svc-1',
      jobId: 'job-b',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Hugo',
      data: {},
    });
    const { getReportsForServico, getPrimaryReportForServico } = await import(
      '../js/servicos-panel-utils.js'
    );
    const reports = getReportsForServico('svc-1');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, 'r-approved');
    assert.equal(getPrimaryReportForServico('svc-1')?.status, 'approved');
  });

  it('getCalendarItemSubtitle — vários relatórios do mesmo tipo', async () => {
    const { getCalendarItemSubtitle, servicoToCalendarItem } = await import(
      '../js/servicos-panel-utils.js'
    );
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r-same',
      servicoId: 'svc-1',
      jobId: '',
      serviceType: 'manutencao',
      status: 'draft',
      clientId: '10',
      technicianId: 'Filipe',
      data: { values: {}, signatures: {}, photos: [] },
    });
    const item = servicoToCalendarItem({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'scheduled',
    });
    assert.equal(getCalendarItemSubtitle(item), '3 relatórios');
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

  it('getReportsForServico — inclui relatório aprovado ligado só via trabalho.servico_id', async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const trabalhosDb = await import('../js/trabalhos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
    servicosDb.mergeServicoInCache({
      id: 'svc-op43',
      clientId: '10',
      date: '2026-06-29',
      technicianIds: 'Hugo',
      status: 'scheduled',
      faturacaoStatus: 'faturado',
    });
    trabalhosDb.mergeJobFromRealtime({
      id: 'job-via-servico',
      cliente_id: 10,
      data: '2026-06-29',
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao_preventiva_empilhadores',
      estado: 'completed',
      numero_ordem: 43,
      servico_id: 'svc-op43',
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-approved-via-job',
      servicoId: '',
      jobId: 'job-via-servico',
      serviceType: 'manutencao_preventiva_empilhadores',
      status: 'approved',
      clientId: '10',
      technicianId: 'Hugo',
      data: { values: { numero_ordem: '43' } },
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-stale-draft-servico',
      servicoId: 'svc-op43',
      jobId: '',
      serviceType: 'manutencao_preventiva_empilhadores',
      status: 'draft',
      clientId: '10',
      technicianId: 'Hugo',
      data: { values: { numero_ordem: '43' } },
    });
    const { getReportsForServico, getPrimaryReportForServico, servicoToCalendarItem } =
      await import('../js/servicos-panel-utils.js');
    const reports = getReportsForServico('svc-op43');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, 'r-approved-via-job');
    assert.equal(getPrimaryReportForServico('svc-op43')?.status, 'approved');
    const item = servicoToCalendarItem(servicosDb.getServico('svc-op43'));
    assert.equal(item.status, 'completed');
  });

  it('getReportsForServico — fallback por OP da visita e cliente quando falta servico_id', async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.invalidateReportsCache();
    servicosDb.mergeServicoInCache({
      id: 'svc-op43-fallback',
      clientId: '10',
      date: '2026-06-29',
      technicianIds: 'Hugo',
      status: 'approved',
      numeroOrdem: 43,
      faturacaoStatus: 'faturado',
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-op43-orphan',
      servicoId: '',
      jobId: '',
      serviceType: 'manutencao_preventiva_empilhadores',
      status: 'approved',
      clientId: '10',
      technicianId: 'Hugo',
      faturacaoStatus: 'via_servico',
      data: { values: { numero_ordem: '43' } },
    });
    const { getReportsForServico, getApprovedReportsForServico } = await import(
      '../js/servicos-panel-utils.js'
    );
    const reports = getReportsForServico('svc-op43-fallback');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, 'r-op43-orphan');
    assert.equal(getApprovedReportsForServico('svc-op43-fallback').length, 1);
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
