import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReportEquipmentHint,
  reportShowsPendingBillingBadge,
} from '../js/rh-report-card-hints.js';

describe('rh-report-card-hints', () => {
  it('mostra série e tipo da bateria no cartão', () => {
    const hint = formatReportEquipmentHint({
      serviceType: 'manutencao_preventiva_bateria',
      data: {
        values: {
          numero_de_serie: 'BAT-123',
          tipo: 'Hawker 4 PzS 500',
        },
      },
    });
    assert.match(hint, /BAT-123/);
    assert.match(hint, /Hawker/);
  });

  it('deteta relatório aprovado por faturar', () => {
    const show = reportShowsPendingBillingBadge({
      status: 'approved',
      faturacaoStatus: 'pendente',
      serviceType: 'folha_intervencao_avarias',
      data: { values: {} },
    });
    assert.equal(show, true);
  });
});
