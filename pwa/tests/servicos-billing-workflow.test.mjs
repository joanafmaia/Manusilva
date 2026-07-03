import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('servicos-billing-workflow', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    const relatoriosDb = await import('../js/relatorios-db.js');
    servicosDb.invalidateServicosCache();
    relatoriosDb.invalidateReportsCache();

    servicosDb.mergeServicoInCache({
      id: 'svc-bill',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'approved',
      faturacaoStatus: 'pendente',
      data: {},
    });
  });

  async function seedApprovedVisit() {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'rb1',
      servicoId: 'svc-bill',
      serviceType: 'manutencao_preventiva_empilhadores',
      status: 'approved',
      approvedAt: '2026-07-03T10:00:00.000Z',
      clientId: '10',
      technicianId: 'Filipe',
      faturacaoStatus: 'via_servico',
      data: {},
    });
    relatoriosDb.mergeReportInCache({
      id: 'rb2',
      servicoId: 'svc-bill',
      serviceType: 'manutencao_preventiva_bateria',
      status: 'approved',
      approvedAt: '2026-07-03T11:00:00.000Z',
      clientId: '10',
      technicianId: 'Filipe',
      faturacaoStatus: 'via_servico',
      data: {},
    });
  }

  it('isServicoPendingBilling — visita com todos os relatórios aprovados', async () => {
    await seedApprovedVisit();
    const { isServicoPendingBilling } = await import('../js/servicos-billing-workflow.js');
    const { getServico } = await import('../js/servicos-db.js');
    assert.equal(isServicoPendingBilling(getServico('svc-bill')), true);
  });

  it('getPendingBillingItems — uma linha por visita, não por relatório', async () => {
    await seedApprovedVisit();
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'legacy-r',
      serviceType: 'reparacao_carregador',
      status: 'approved',
      approvedAt: '2026-07-02T09:00:00.000Z',
      clientId: '11',
      technicianId: 'Filipe',
      faturacaoStatus: 'pendente',
      data: {},
    });

    const { getPendingBillingItems } = await import('../js/servicos-billing-workflow.js');
    const items = getPendingBillingItems();
    assert.equal(items.length, 2);
    assert.equal(items.filter((i) => i.kind === 'servico').length, 1);
    assert.equal(items.filter((i) => i.kind === 'report').length, 1);
  });

  it('resolveBillingFocusTarget — relatório com servicoId destaca visita', async () => {
    await seedApprovedVisit();
    const { resolveBillingFocusTarget } = await import('../js/servicos-billing-workflow.js');
    const { getReport } = await import('../js/entity-lookups.js');
    const target = resolveBillingFocusTarget('rb1', getReport);
    assert.equal(target.servicoId, 'svc-bill');
    assert.equal(target.reportId, null);
  });

  it('isPendingBilling — exclui relatórios ligados a serviço', async () => {
    await seedApprovedVisit();
    const { isPendingBilling } = await import('../js/billing-workflow.js');
    const { getReport } = await import('../js/entity-lookups.js');
    assert.equal(isPendingBilling(getReport('rb1')), false);
  });

  it('isServicoPendingBilling — visita com relatório técnico e pedido de orçamento', async () => {
    const relatoriosDb = await import('../js/relatorios-db.js');
    relatoriosDb.mergeReportInCache({
      id: 'r-orc-visita',
      servicoId: 'svc-bill',
      serviceType: 'folha_intervencao_avarias',
      status: 'approved',
      approvedAt: '2026-07-02T09:00:00.000Z',
      clientId: '10',
      technicianId: 'Hugo',
      data: { values: { pedido_orcamento: 'Sim' } },
    });

    const { isServicoPendingBilling } = await import('../js/servicos-billing-workflow.js');
    const { getServico } = await import('../js/servicos-db.js');
    assert.equal(isServicoPendingBilling(getServico('svc-bill')), true);
  });
});
