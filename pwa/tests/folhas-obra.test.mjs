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

  it('registerFolhaObraEntrada exige dados de entrada', async () => {
    const { replaceFolhasObraCache } = await import('../js/folhas-obra-db.js');
    const { registerFolhaObraEntrada } = await import('../js/folhas-obra-workflow.js');
    replaceFolhasObraCache([
      {
        id: 'fo-draft',
        clientId: '1',
        estado: 'rascunho',
        tipo: '',
        marcaModelo: '',
        dataRececao: '',
      },
    ]);
    await assert.rejects(
      () => registerFolhaObraEntrada('fo-draft'),
      /tipo de equipamento/i,
    );
  });
});

describe('folhas-obra-db delete', () => {
  it('canDeleteFolhaObra — só rascunho e reparação', async () => {
    const { canDeleteFolhaObra } = await import('../js/folhas-obra-db.js');
    assert.equal(canDeleteFolhaObra({ estado: 'rascunho' }), true);
    assert.equal(canDeleteFolhaObra({ estado: 'em_reparacao' }), true);
    assert.equal(canDeleteFolhaObra({ estado: 'pendente_faturacao' }), false);
    assert.equal(canDeleteFolhaObra({ estado: 'faturado' }), false);
  });
});

describe('armazem login', () => {
  it('resolveLoginEmailCandidates — conta Armazém', async () => {
    const { resolveLoginEmailCandidates } = await import('../js/auth.js');
    const emails = resolveLoginEmailCandidates('Armazém');
    assert.ok(emails.includes('armazem@sistema.com'));
  });
});

describe('folhas-obra-db validate', () => {
  it('validateFolhaObraPayload — rascunho só exige cliente', async () => {
    const { validateFolhaObraPayload } = await import('../js/folhas-obra-db.js');
    assert.doesNotThrow(() => validateFolhaObraPayload({ clientId: '12' }, 'draft'));
    assert.throws(() => validateFolhaObraPayload({ clientId: '' }, 'draft'), /cliente válido/i);
  });

  it('validateFolhaObraPayload — entrada exige equipamento e data', async () => {
    const { validateFolhaObraPayload } = await import('../js/folhas-obra-db.js');
    assert.throws(
      () =>
        validateFolhaObraPayload(
          { clientId: '1', tipo: 'Empilhador', marcaModelo: 'X', dataRececao: '' },
          'entrada',
        ),
      /data de entrada/i,
    );
  });

  it('formatEtqNumber e buildFolhaObraEtqLabel geram número da etiqueta', async () => {
    const { formatEtqNumber, buildFolhaObraEtqLabel, assignFolhaObraEtq } = await import('../js/folhas-obra-db.js');
    assert.equal(formatEtqNumber(4), 'ETQ-4');
    assert.equal(buildFolhaObraEtqLabel({ etq: 'ETQ-9' }), 'ETQ-9');
    assert.equal(buildFolhaObraEtqLabel({ numeroOrdem: 4 }), 'ETQ-4');
    assert.equal(assignFolhaObraEtq({ numeroOrdem: 7, etq: '' }), 'ETQ-7');
  });

  it('formatFolhaObraEstadoLabel — três fases no armazém', async () => {
    const { formatFolhaObraEstadoLabel, isFolhaObraFinalizada } = await import('../js/folhas-obra-db.js');
    assert.equal(formatFolhaObraEstadoLabel('rascunho'), 'Entrada em Armazém');
    assert.equal(formatFolhaObraEstadoLabel('em_reparacao'), 'Reparação');
    assert.equal(formatFolhaObraEstadoLabel('pendente_faturacao'), 'Finalizado');
    assert.equal(formatFolhaObraEstadoLabel('faturado'), 'Finalizado');
    assert.equal(isFolhaObraFinalizada('em_reparacao'), false);
    assert.equal(isFolhaObraFinalizada({ estado: 'faturado' }), true);
  });
});

describe('folha-obra-etiqueta', () => {
  it('buildFolhaObraEtiquetaHtml inclui equipamento e data de entrada', async () => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map();
      globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
      };
    }

    const { buildFolhaObraEtiquetaHtml, ETIQUETA_PRINT_WIDTH_MM, ETIQUETA_PRINT_HEIGHT_MM } = await import('../js/folha-obra-etiqueta.js');
    const html = buildFolhaObraEtiquetaHtml({
      clientId: '5',
      tipo: 'Empilhador',
      marcaModelo: 'Toyota',
      numeroSerie: 'SN-1',
      etq: 'ETQ-2',
      dataRececao: '2026-07-07',
      numeroOrdem: 2,
      responsavel: 'Hugo',
    });
    assert.match(html, />Ent:</);
    assert.match(html, /Empilhador/);
    assert.match(html, /Toyota/);
    assert.match(html, /ETQ-2/);
    assert.match(html, />R:</);
    assert.match(html, /Hugo/);
    assert.equal(ETIQUETA_PRINT_WIDTH_MM, 25);
    assert.equal(ETIQUETA_PRINT_HEIGHT_MM, 92);
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

describe('pdf-folha-obra', () => {
  it('expõe geração e nome de ficheiro', async () => {
    const { buildFolhaObraPdfFilename, generateFolhaObraPDFBlob } = await import('../js/pdf-folha-obra.js');
    assert.equal(typeof generateFolhaObraPDFBlob, 'function');
    assert.match(
      buildFolhaObraPdfFilename({ numeroOrdem: 3, marcaModelo: 'Toyota 8FB' }),
      /Manusilva-FO-3-Toyota-8FB\.pdf/,
    );
    await assert.rejects(
      () => generateFolhaObraPDFBlob({ tipo: 'Empilhador' }),
      /cliente/i,
    );
  });
});
