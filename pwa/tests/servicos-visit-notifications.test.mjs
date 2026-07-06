import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('notificações por visita', () => {
  it('shouldNotifyTechApprovalForReport — só no último relatório aprovado', async () => {
    const panelUtils = await import('../js/servicos-panel-utils.js');
    const relatoriosDb = await import('../js/relatorios-db.js');

    relatoriosDb.mergeReportInCache({
      id: 'r-a1',
      servicoId: 'svc-n1',
      status: 'approved',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-a2',
      servicoId: 'svc-n1',
      status: 'pending_review',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });

    const first = relatoriosDb.getReportsSnapshot().find((r) => r.id === 'r-a1');
    assert.equal(panelUtils.shouldNotifyTechApprovalForReport(first), false);

    relatoriosDb.mergeReportInCache({
      id: 'r-a2',
      servicoId: 'svc-n1',
      status: 'approved',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });
    const second = relatoriosDb.getReportsSnapshot().find((r) => r.id === 'r-a2');
    assert.equal(panelUtils.shouldNotifyTechApprovalForReport(second), true);
  });

  it('shouldNotifyRhPendingForServicoReport — visita multi só quando todos pendentes', async () => {
    const panelUtils = await import('../js/servicos-panel-utils.js');
    const relatoriosDb = await import('../js/relatorios-db.js');

    relatoriosDb.mergeReportInCache({
      id: 'r-p1',
      servicoId: 'svc-n2',
      status: 'pending_review',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });
    relatoriosDb.mergeReportInCache({
      id: 'r-p2',
      servicoId: 'svc-n2',
      status: 'draft',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });

    const early = relatoriosDb.getReportsSnapshot().find((r) => r.id === 'r-p1');
    assert.equal(panelUtils.shouldNotifyRhPendingForServicoReport(early), false);

    relatoriosDb.mergeReportInCache({
      id: 'r-p2',
      servicoId: 'svc-n2',
      status: 'pending_review',
      clientId: '10',
      technicianId: 't1',
      data: { values: {} },
    });
    const ready = relatoriosDb.getReportsSnapshot().find((r) => r.id === 'r-p2');
    assert.equal(panelUtils.shouldNotifyRhPendingForServicoReport(ready), true);
  });
});
