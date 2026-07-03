import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('report-pdf-signatures', () => {
  beforeEach(async () => {
    const servicosDb = await import('../js/servicos-db.js');
    servicosDb.invalidateServicosCache();
    servicosDb.mergeServicoInCache({
      id: 'svc-1',
      clientId: '10',
      date: '2026-07-03',
      technicianIds: 'Filipe',
      status: 'pending_review',
      data: {
        signatures: {
          technician: true,
          client: true,
          technicianData: 'data:image/png;base64,tech',
          clientData: 'data:image/png;base64,client',
        },
      },
    });
  });

  it('resolvePdfSignaturesForReport — usa assinaturas do serviço', async () => {
    const { resolvePdfSignaturesForReport } = await import('../js/report-pdf-signatures.js');
    const sigs = resolvePdfSignaturesForReport({
      servicoId: 'svc-1',
      data: { signatures: {} },
    });
    assert.equal(sigs.technicianData, 'data:image/png;base64,tech');
    assert.equal(sigs.clientData, 'data:image/png;base64,client');
  });

  it('resolvePdfSignaturesForReport — relatório legado sem servicoId', async () => {
    const { resolvePdfSignaturesForReport } = await import('../js/report-pdf-signatures.js');
    const sigs = resolvePdfSignaturesForReport({
      jobId: 'job-1',
      data: { signatures: { technicianData: 'data:image/png;base64,local' } },
    });
    assert.equal(sigs.technicianData, 'data:image/png;base64,local');
  });

  it('withServicoSignaturesForPdf — injeta no payload do PDF', async () => {
    const { withServicoSignaturesForPdf } = await import('../js/report-pdf-signatures.js');
    const enriched = withServicoSignaturesForPdf({
      servicoId: 'svc-1',
      serviceType: 'manutencao',
      data: { values: {}, signatures: {} },
    });
    assert.equal(enriched.data.signatures.clientData, 'data:image/png;base64,client');
  });
});
