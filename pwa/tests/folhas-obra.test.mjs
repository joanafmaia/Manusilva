import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('folhas-obra-db', () => {
  it('mapRowToFolhaObra converte linha Supabase', async () => {
    const { mapRowToFolhaObra, formatFolhaObraOrdemLabel } = await import('../js/folhas-obra-db.js');
    const folha = mapRowToFolhaObra({
      id: 'abc-123',
      numero_ordem: 7,
      cliente_id: 42,
      tecnico_id: 'Hugo',
      tipo: 'Empilhador',
      marca_modelo: 'Toyota 8FB',
      numero_serie: 'SN-001',
      etq: 'ETQ-88',
      data_rececao: '2026-07-01',
      intervencoes: [{ data_intervencao: '2026-07-02', material_servico: 'Óleo', quantidade: '2', horas: '1.5', realizado_por: 'Hugo' }],
      maquina_concluida_em: '2026-07-03',
      responsavel: 'Hugo',
      estado: 'pendente_faturacao',
      faturacao_status: 'pendente',
      submetido_em: '2026-07-03T10:00:00Z',
    });
    assert.equal(folha.id, 'abc-123');
    assert.equal(folha.numeroOrdem, 7);
    assert.equal(folha.clientId, '42');
    assert.equal(folha.intervencoes.length, 1);
    assert.equal(folha.intervencoes[0].material_servico, 'Óleo');
    assert.equal(formatFolhaObraOrdemLabel(folha), 'FO-7');
  });

  it('isFolhaObraPendingBilling — só concluídas pendentes', async () => {
    const { isFolhaObraPendingBilling, replaceFolhasObraCache, getPendingBillingFolhasObra } = await import('../js/folhas-obra-db.js');
    replaceFolhasObraCache([
      { id: '1', estado: 'rascunho', faturacaoStatus: null },
      { id: '2', estado: 'pendente_faturacao', faturacaoStatus: 'pendente', submittedAt: '2026-07-01' },
      { id: '3', estado: 'pendente_faturacao', faturacaoStatus: 'faturado' },
    ]);
    assert.equal(isFolhaObraPendingBilling({ estado: 'pendente_faturacao', faturacaoStatus: 'pendente' }), true);
    assert.equal(getPendingBillingFolhasObra().length, 1);
    assert.equal(getPendingBillingFolhasObra()[0].id, '2');
  });

  it('normalizeIntervencoes aceita chaves legadas', async () => {
    const { normalizeIntervencoes } = await import('../js/folhas-obra-db.js');
    const rows = normalizeIntervencoes([{ data: '2026-07-01', material: 'Filtro', qtd: '1', tecnico: 'Ana' }]);
    assert.equal(rows[0].data_intervencao, '2026-07-01');
    assert.equal(rows[0].material_servico, 'Filtro');
    assert.equal(rows[0].quantidade, '1');
    assert.equal(rows[0].realizado_por, 'Ana');
  });
});

describe('folhas-obra-workflow', () => {
  it('estimateFolhaObraValue usa horas das intervenções', async () => {
    const { estimateFolhaObraValue } = await import('../js/folhas-obra-workflow.js');
    const val = estimateFolhaObraValue({
      intervencoes: [{ horas: '2' }, { horas: '1.5' }],
    });
    assert.ok(val >= 80);
  });
});

describe('servicos-billing-workflow folha_obra', () => {
  it('getPendingBillingItems inclui folhas de obra', async () => {
    const { replaceFolhasObraCache } = await import('../js/folhas-obra-db.js');
    const { getPendingBillingItems } = await import('../js/servicos-billing-workflow.js');
    replaceFolhasObraCache([
      {
        id: 'fo-1',
        clientId: '1',
        estado: 'pendente_faturacao',
        faturacaoStatus: 'pendente',
        submittedAt: '2026-07-05',
      },
    ]);
    const items = getPendingBillingItems().filter((i) => i.kind === 'folha_obra');
    assert.equal(items.length, 1);
    assert.equal(items[0].folha.id, 'fo-1');
  });
});
