import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveServicoStatusFromReports,
  isServicoReadyForClientEmail,
  mapRowToServico,
} from '../js/servicos-db.js';

describe('servicos-db', () => {
  it('deriveServicoStatusFromReports — pending se algum relatório aguarda RH', () => {
    const status = deriveServicoStatusFromReports(
      { status: 'scheduled' },
      [
        { status: 'approved' },
        { status: 'pending_review' },
      ],
    );
    assert.equal(status, 'pending_review');
  });

  it('deriveServicoStatusFromReports — approved só quando todos aprovados', () => {
    const status = deriveServicoStatusFromReports(
      { status: 'in_progress' },
      [{ status: 'approved' }, { status: 'approved' }],
    );
    assert.equal(status, 'approved');
  });

  it('isServicoReadyForClientEmail — exige todos aprovados', () => {
    assert.equal(
      isServicoReadyForClientEmail([{ status: 'approved' }, { status: 'pending_review' }]),
      false,
    );
    assert.equal(
      isServicoReadyForClientEmail([{ status: 'approved' }, { status: 'approved' }]),
      true,
    );
  });

  it('mapRowToServico — assinaturas em dados.signatures', () => {
    const servico = mapRowToServico({
      id: 'abc',
      numero_ordem: 45,
      cliente_id: 1,
      data: '2026-07-02',
      tecnico_ids: 'Filipe, Hugo',
      estado: 'scheduled',
      dados: { signatures: { technician: 'data:image/png;base64,x' } },
    });
    assert.equal(servico.id, 'abc');
    assert.equal(servico.numeroOrdem, 45);
    assert.equal(servico.data.signatures.technician, 'data:image/png;base64,x');
  });
});
