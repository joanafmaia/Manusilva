import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isDraftSafelySynced } from '../js/report-draft-sync.js';
import { pendingReportKey } from '../js/trabalhos-offline.js';

describe('report-draft-sync', () => {
  it('isDraftSafelySynced — visita com servico_id', () => {
    const local = {
      servicoId: 'svc-1',
      serviceType: 'manutencao_preventiva_empilhadores',
      jobId: '',
    };
    const saved = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      servicoId: 'svc-1',
      serviceType: 'manutencao_preventiva_empilhadores',
      jobId: '',
    };
    assert.equal(isDraftSafelySynced(local, saved), true);
  });

  it('isDraftSafelySynced — rejeita se servico_id não coincide', () => {
    const local = { servicoId: 'svc-1', serviceType: 'manutencao', jobId: '' };
    const saved = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      servicoId: 'svc-2',
      serviceType: 'manutencao',
    };
    assert.equal(isDraftSafelySynced(local, saved), false);
  });

  it('isDraftSafelySynced — trabalho legado por jobId', () => {
    const local = { jobId: 'job-1', servicoId: '' };
    const saved = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      jobId: 'job-1',
      servicoId: '',
    };
    assert.equal(isDraftSafelySynced(local, saved), true);
  });
});

describe('trabalhos-offline pendingReportKey', () => {
  it('chave única por id de relatório', () => {
    assert.equal(
      pendingReportKey({
        id: '550e8400-e29b-41d4-a716-446655440099',
        servicoId: 'svc-1',
        serviceType: 'manutencao_baterias_grandes',
        jobId: '',
      }),
      '550e8400-e29b-41d4-a716-446655440099',
    );
    assert.equal(pendingReportKey({ jobId: 'job-42' }), 'job-42');
  });
});
