import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterOrcamentoLoteReports,
  formatOrcamentoLoteNumeros,
  isOrcamentoLoteEnviado,
  isOrcamentoLotePendente,
} from '../js/orcamento-email-lote.js';
import { STANDALONE_ORCAMENTO_SERVICE_TYPE } from '../js/orcamento-standalone.js';

function reportFixture(overrides = {}) {
  const orcamento = {
    atualizadoEm: '2026-08-01T10:00:00.000Z',
    numeroFormatado: overrides.numero || '100.0/2026',
    ...(overrides.orcamento || {}),
  };
  return {
    id: overrides.id || 'r1',
    clientId: overrides.clientId || 'c1',
    status: 'approved',
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    data: {
      orcamentoOrigem: 'rh_standalone',
      urlPdfOrcamento: overrides.urlPdfOrcamento ?? 'https://example.supabase.co/storage/v1/object/public/pdfs/x.pdf',
      orcamento,
    },
  };
}

describe('orcamento-email-lote', () => {
  it('filtra só pendentes do mesmo cliente', () => {
    const rows = [
      reportFixture({ id: 'a', numero: '1.0/2026' }),
      reportFixture({
        id: 'b',
        numero: '2.0/2026',
        orcamento: {
          enviadoEm: '2026-08-02T10:00:00.000Z',
          atualizadoEm: '2026-08-01T10:00:00.000Z',
          numeroFormatado: '2.0/2026',
        },
      }),
      reportFixture({ id: 'c', clientId: 'c2', numero: '3.0/2026' }),
    ];
    const lote = filterOrcamentoLoteReports(rows, 'c1', { mode: 'pendentes' });
    assert.equal(lote.length, 1);
    assert.equal(lote[0].id, 'a');
    assert.equal(isOrcamentoLotePendente(rows[0]), true);
    assert.equal(isOrcamentoLoteEnviado(rows[1]), true);
  });

  it('filtra reenvio só enviadas', () => {
    const rows = [
      reportFixture({ id: 'a' }),
      reportFixture({
        id: 'b',
        orcamento: {
          enviadoEm: '2026-08-02T10:00:00.000Z',
          atualizadoEm: '2026-08-01T10:00:00.000Z',
          numeroFormatado: '2.0/2026',
        },
      }),
    ];
    const lote = filterOrcamentoLoteReports(rows, 'c1', { mode: 'reenvio' });
    assert.equal(lote.length, 1);
    assert.equal(lote[0].id, 'b');
    assert.deepEqual(formatOrcamentoLoteNumeros(lote), ['2.0/2026']);
  });

  it('filtra lote por nome livre sem clientId', () => {
    const row = reportFixture({
      id: 'sap',
      numero: '10.0/2026',
    });
    row.clientId = '';
    row.data.values = { nome_empresa: 'SAP METAL', cliente: 'SAP METAL' };
    const lote = filterOrcamentoLoteReports([row], '', {
      mode: 'pendentes',
      pastaKey: 'nome:sap metal',
      clienteNome: 'SAP METAL',
    });
    assert.equal(lote.length, 1);
    assert.equal(lote[0].id, 'sap');
  });
});
