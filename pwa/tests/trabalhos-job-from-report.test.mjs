import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('jobDataFromReport — visita multi-relatório', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    servicosDb.invalidateServicosCache();
    servicosDb.mergeServicoInCache({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-10',
      technicianIds: 'Hugo, Filipe',
      status: 'scheduled',
    });
  });

  it('liga trabalho ao serviço e usa data da visita', async () => {
    const { jobDataFromReport } = await import('../js/trabalhos-db.js');
    const data = jobDataFromReport({
      servicoId: 'svc-1',
      technicianId: 'Filipe',
      clientId: '10',
      serviceType: 'manutencao_preventiva_empilhadores',
      submittedAt: '2026-07-15T10:00:00.000Z',
    });
    assert.equal(data.servicoId, 'svc-1');
    assert.equal(data.date, '2026-07-10');
    assert.equal(data.technicianId, 'Hugo, Filipe');
  });
});
