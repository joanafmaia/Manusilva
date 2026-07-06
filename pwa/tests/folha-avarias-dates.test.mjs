import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('folha avarias dates', () => {
  it('resolveFolhaAvariasConclusionDate usa Data 2 quando existe', async () => {
    const { resolveFolhaAvariasConclusionDate } = await import('../js/pdf-format-utils.js');
    assert.equal(
      resolveFolhaAvariasConclusionDate({
        data_1: '2026-06-30',
        data_2: '2026-07-02',
      }),
      '02/07/2026',
    );
  });

  it('resolveFolhaAvariasServiceDate usa Data 1 quando há Data 2', async () => {
    const { resolveFolhaAvariasServiceDate } = await import('../js/pdf-format-utils.js');
    assert.equal(
      resolveFolhaAvariasServiceDate(
        { data_1: '2026-06-30', data_2: '2026-07-02' },
        { date: '2026-07-02' },
        null,
      ),
      '30/06/2026',
    );
  });

  it('buildFolhaAvariasServiceInfoMeta alinha conclusão e serviço', async () => {
    const { buildFolhaAvariasServiceInfoMeta } = await import('../js/pdf-service-info-meta.js');
    const meta = buildFolhaAvariasServiceInfoMeta(
      { submittedAt: '2026-07-03T10:00:00Z' },
      { date: '2026-07-02' },
      {
        data_1: '2026-06-30',
        data_2: '2026-07-02',
        visitas_realizadas: 2,
      },
    );
    assert.equal(meta.serviceDateLabel, 'Data de Conclusão');
    assert.equal(meta.serviceDate, '02/07/2026');
    assert.equal(meta.scheduledDateLabel, 'Data do Serviço');
    assert.equal(meta.scheduledDate, '30/06/2026');
    assert.equal(meta.numeroVisitas, '2');
  });

  it('resolveReportInterventionDatePt prioriza data_2 na folha de avarias', async () => {
    const { resolveReportInterventionDatePt } = await import('../js/report-intervention-date.js');
    assert.equal(
      resolveReportInterventionDatePt(
        {
          serviceType: 'folha_intervencao_avarias',
          data: { data_1: '2026-06-30', data_2: '2026-07-02' },
        },
        { date: '2026-06-30' },
      ),
      '02/07/2026',
    );
  });
});
