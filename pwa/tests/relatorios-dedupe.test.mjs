import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('dedupeReportsForDisplay', () => {
  it('mantém só um relatório por OP oficial', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');
    const { mergeJobFromRealtime } = await import('../js/trabalhos-db.js');

    mergeJobFromRealtime({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      numero_ordem: 38,
      cliente_id: 1,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-01',
      hora: null,
      estado: 'completed',
    });
    mergeJobFromRealtime({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      numero_ordem: 38,
      cliente_id: 2,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-02',
      hora: null,
      estado: 'completed',
    });

    const reports = [
      {
        id: 'rep-old',
        jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        clientId: '1',
        status: 'approved',
        approvedAt: '2026-06-01T10:00:00.000Z',
        serviceType: 'folha_intervencao_avarias',
      },
      {
        id: 'rep-new',
        jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        clientId: '2',
        status: 'approved',
        approvedAt: '2026-06-10T10:00:00.000Z',
        serviceType: 'folha_intervencao_avarias',
      },
    ];

    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-new');
  });

  it('remove duplicados do mesmo trabalho', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');

    const reports = [
      {
        id: 'rep-draft',
        jobId: 'job-x',
        status: 'draft',
        submittedAt: '2026-06-01T10:00:00.000Z',
      },
      {
        id: 'rep-approved',
        jobId: 'job-x',
        status: 'approved',
        approvedAt: '2026-06-02T10:00:00.000Z',
      },
    ];

    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-approved');
  });

  it('prefere relatório técnico sobre proposta na mesma OP', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');
    const { mergeJobFromRealtime, invalidateJobsCache } = await import('../js/trabalhos-db.js');
    invalidateJobsCache();
    mergeJobFromRealtime({
      id: 'job-tech-43',
      numero_ordem: 43,
      cliente_id: 10,
      tecnico_id: 'Hugo',
      tipo_servico: 'manutencao_preventiva_empilhadores',
      data: '2026-06-29',
      estado: 'completed',
    });
    mergeJobFromRealtime({
      id: 'job-orc-43',
      numero_ordem: 43,
      cliente_id: 10,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-29',
      estado: 'completed',
    });
    const reports = [
      {
        id: 'rep-proposta',
        jobId: 'job-orc-43',
        clientId: '10',
        status: 'approved',
        approvedAt: '2026-06-29T12:00:00.000Z',
        serviceType: 'proposta_ms015_rh',
        data: {
          orcamentoOrigem: 'rh_standalone',
          urlPdfOrcamento: 'https://example.com/ms015.pdf',
          orcamento: { enviadoEm: '2026-06-29T11:00:00.000Z' },
        },
      },
      {
        id: 'rep-tech',
        jobId: 'job-tech-43',
        clientId: '10',
        status: 'approved',
        approvedAt: '2026-06-29T10:00:00.000Z',
        serviceType: 'manutencao_preventiva_empilhadores',
        data: { values: {} },
      },
    ];
    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-tech');
  });

  it('mantém relatório técnico com pedido de orçamento na deduplicação por OP', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');
    const { mergeJobFromRealtime, invalidateJobsCache } = await import('../js/trabalhos-db.js');
    invalidateJobsCache();
    mergeJobFromRealtime({
      id: 'job-pedido-39',
      numero_ordem: 39,
      cliente_id: 10,
      tecnico_id: 'Hugo',
      tipo_servico: 'folha_intervencao_avarias',
      data: '2026-06-29',
      estado: 'completed',
    });
    const reports = [
      {
        id: 'rep-pedido',
        jobId: 'job-pedido-39',
        clientId: '10',
        status: 'approved',
        approvedAt: '2026-06-29T10:00:00.000Z',
        serviceType: 'folha_intervencao_avarias',
        data: {
          values: { pedido_orcamento: 'Sim' },
          urlPdfOrcamento: 'https://example.com/ms015.pdf',
          orcamento: { enviadoEm: '2026-06-29T11:00:00.000Z' },
        },
      },
    ];
    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'rep-pedido');
  });

  it('mantém todos os relatórios de uma visita com o mesmo jobId legado', async () => {
    const { dedupeReportsForDisplay } = await import('../js/relatorios-db.js');
    const { mergeServicoInCache, invalidateServicosCache } = await import('../js/servicos-db.js');
    invalidateServicosCache();
    mergeServicoInCache({
      id: 'svc-multi',
      clientId: '10',
      date: '2026-07-10',
      technicianIds: 'Filipe',
      status: 'pending_review',
      data: {},
    });

    const reports = [
      {
        id: 'r-a',
        jobId: 'svc-multi',
        servicoId: 'svc-multi',
        serviceType: 'manutencao_preventiva_empilhadores',
        status: 'pending_review',
        clientId: '10',
        numeroOrdem: 88,
      },
      {
        id: 'r-b',
        jobId: 'svc-multi',
        servicoId: 'svc-multi',
        serviceType: 'manutencao_preventiva_bateria',
        status: 'pending_review',
        clientId: '10',
        numeroOrdem: 89,
      },
      {
        id: 'r-c',
        jobId: 'svc-multi',
        servicoId: 'svc-multi',
        serviceType: 'reparacao_carregador',
        status: 'pending_review',
        clientId: '10',
        numeroOrdem: 90,
      },
    ];

    const deduped = dedupeReportsForDisplay(reports);
    assert.equal(deduped.length, 3);
    assert.deepEqual(
      deduped.map((r) => r.id).sort(),
      ['r-a', 'r-b', 'r-c'],
    );
  });
});
