import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportEmailMeta, resolveReportEmailTipoRelatorio } from '../js/report-email-meta.js';
import { SERVICE_IDS } from '../js/service-constants.js';

describe('report-email-meta', () => {
  it('resolve tipoRelatorio por serviço', () => {
    assert.equal(
      resolveReportEmailTipoRelatorio({ serviceType: SERVICE_IDS.INSPECAO_DL50_2005 }),
      'dl50-2005',
    );
    assert.equal(
      resolveReportEmailTipoRelatorio({ serviceType: SERVICE_IDS.MANUTENCAO_BATERIAS_GRANDES }),
      'baterias',
    );
    assert.equal(resolveReportEmailTipoRelatorio({ serviceType: 'outro' }), 'outro');
    assert.equal(resolveReportEmailTipoRelatorio({}, { multiReport: true }), 'visita');
  });

  it('buildReportEmailMeta unifica cliente e técnico', () => {
    const meta = buildReportEmailMeta(
      {
        id: 'rep-1',
        serviceType: SERVICE_IDS.REPARACAO_AVARIAS_BATERIA,
        forkliftSerial: 'SN-9',
        data: {
          values: {
            nome_empresa: 'ACME',
            tecnico: 'Hugo',
            numero_de_serie: 'BAT-1',
          },
        },
      },
      {
        client: { Nome: 'Cliente BD' },
        job: { numeroOrdem: 42 },
        technicianName: 'Fallback',
      },
    );

    assert.equal(meta.tipoRelatorio, 'outro');
    assert.equal(meta.reportId, 'rep-1');
    assert.equal(meta.clienteNome, 'ACME');
    assert.equal(meta.tecnico, 'Hugo');
    assert.equal(meta.serieFrota, 'BAT-1');
    assert.equal(meta.numeroOrdem, 42);
  });
});
