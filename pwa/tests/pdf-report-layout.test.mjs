import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfReportSrc = fs.readFileSync(path.join(__dirname, '../js/pdf-report.js'), 'utf8');

const PDF_REPORT_EXPORTS = [
  'renderInterventionPDF',
  'generateEmpilhadoresPdfBlobs',
  'generateInterventionPDFBlob',
  'generateInterventionPDF',
  'generateManutencaoBateriasGrandesPDF',
  'generateInspecaoDl50PDF',
  'generateReportPdfByServiceType',
  'loadJsPDF',
];

describe('pdf-report exports', () => {
  it('importa columnKey de material-table-field (regressão Fase 3e)', () => {
    assert.match(pdfReportSrc, /import\s*\{[^}]*\bcolumnKey\b[^}]*\}\s*from\s*'\.\/material-table-field\.js'/s);
  });

  it('expõe API pública de geração de PDF', async () => {
    const mod = await import('../js/pdf-report.js');
    for (const name of PDF_REPORT_EXPORTS) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-preventiva-bateria', () => {
  it('expõe layout da preventiva bateria', async () => {
    const mod = await import('../js/pdf-preventiva-bateria.js');
    for (const name of [
      'drawPreventivaBateriaMirrorHeader',
      'drawPreventivaBateriaBody',
      'drawPreventivaBateriaClosingSection',
      'drawPreventivaBateriaIntervencaoTable',
      'drawEstadoFinalClosedBlock',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-intervention-fotos', () => {
  it('expõe secção de fotografias', async () => {
    const { drawInterventionFotografiasSection } = await import('../js/pdf-intervention-fotos.js');
    assert.equal(typeof drawInterventionFotografiasSection, 'function');
  });
});

describe('pdf-image-loader', () => {
  it('expõe loadImageForPdf', async () => {
    const { loadImageForPdf } = await import('../js/pdf-image-loader.js');
    assert.equal(typeof loadImageForPdf, 'function');
  });
});

describe('pdf-header-blocks', () => {
  it('expõe caixa cliente e logo', async () => {
    const mod = await import('../js/pdf-header-blocks.js');
    assert.equal(typeof mod.drawCompactClientBox, 'function');
    assert.equal(typeof mod.drawLogoPlaceholder, 'function');
    assert.equal(typeof mod.formatOrdemDisplay, 'function');
    assert.equal(typeof mod.resolvePdfNumeroOrdem, 'function');
  });

  it('resolvePdfNumeroOrdem — trabalho, visita e formulário', async () => {
    const { invalidateServicosCache, mergeServicoInCache } = await import('../js/servicos-db.js');
    const { resolvePdfNumeroOrdem } = await import('../js/pdf-header-blocks.js');

    invalidateServicosCache();
    mergeServicoInCache({
      id: 'svc-op',
      clientId: 'c1',
      date: '2026-07-01',
      technicianIds: 'Filipe',
      status: 'pending_review',
      numeroOrdem: 55,
      data: {},
    });

    assert.equal(resolvePdfNumeroOrdem(null, { numeroOrdem: 12 }), 12);
    assert.equal(
      resolvePdfNumeroOrdem({ servicoId: 'svc-op', numeroOrdem: 77 }, { numeroOrdem: 99 }),
      77,
    );
    assert.equal(
      resolvePdfNumeroOrdem({ servicoId: 'svc-op' }, { numeroOrdem: 99 }),
      55,
    );
    assert.equal(
      resolvePdfNumeroOrdem({ servicoId: 'svc-op', jobId: 'job-only', numeroOrdem: 88 }, { numeroOrdem: 99 }),
      88,
    );
    assert.equal(
      resolvePdfNumeroOrdem({ servicoId: 'svc-op' }, null, {}),
      55,
    );
    assert.equal(
      resolvePdfNumeroOrdem({ data: { values: { numero_ordem: 'OP-2026-33' } } }, null, {
        numero_ordem: 'OP-2026-33',
      }),
      33,
    );
    assert.equal(resolvePdfNumeroOrdem({}, null, {}), null);
  });
});

describe('pdf-page-layout', () => {
  it('calcula zona segura inferior A4', async () => {
    const { pdfContentBottomY, pdfMaxContentHeight } = await import('../js/pdf-page-layout.js');
    assert.ok(pdfContentBottomY() > 200);
    assert.ok(pdfMaxContentHeight() > 200);
  });
});

describe('pdf-closing-estimates', () => {
  it('estima altura de assinaturas com perfil', async () => {
    const { estimateSignaturesHeight } = await import('../js/pdf-closing-estimates.js');
    const h = estimateSignaturesHeight({ sigTop: 4, sigImg: 14 });
    assert.ok(h > 20);
  });
});

describe('pdf-grid-table', () => {
  it('expõe drawPdfGridTable', async () => {
    const { drawPdfGridTable } = await import('../js/pdf-grid-table.js');
    assert.equal(typeof drawPdfGridTable, 'function');
  });
});

describe('pdf-folha-avarias', () => {
  it('expõe layout da folha de intervenção de avarias', async () => {
    const mod = await import('../js/pdf-folha-avarias.js');
    for (const name of [
      'drawFolhaAvariasTitleBar',
      'drawFolhaIntervencaoAvariasBody',
      'drawFolhaIntervencaoAvariasClosingSection',
      'drawFolhaIntervencaoOrcamentoBlock',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-reparacao-carregador', () => {
  it('expõe layout da reparação de carregador', async () => {
    const mod = await import('../js/pdf-reparacao-carregador.js');
    for (const name of [
      'drawCarregadorTitleBar',
      'drawReparacaoCarregadorTopSection',
      'drawReparacaoCarregadorBody',
      'drawReparacaoCarregadorClosingSection',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-corretiva-maquinas', () => {
  it('expõe layout da manutenção corretiva máquinas', async () => {
    const mod = await import('../js/pdf-corretiva-maquinas.js');
    for (const name of [
      'drawCorretivaTitleBar',
      'drawCorretivaMaquinasBody',
      'drawCorretivaMaquinasClosingSection',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-grandes-baterias', () => {
  it('expõe layout da manutenção baterias grandes', async () => {
    const mod = await import('../js/pdf-grandes-baterias.js');
    for (const name of [
      'drawGrandesTitleBar',
      'drawGrandesBateriasBody',
      'drawGrandesBateriasClosingSection',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });

  it('coluna C.C. no PDF tem largura suficiente e permite quebra de linha', async () => {
    const { PDF_CONTENT_W } = await import('../js/pdf-design-system.js');
    const { GRANDES_BATTERY_PDF_COL_WIDTHS, GRANDES_BATTERY_PDF_NOWRAP_COLS } = await import(
      '../js/pdf-grandes-baterias.js'
    );
    const total = GRANDES_BATTERY_PDF_COL_WIDTHS.reduce((a, b) => a + b, 0);
    assert.equal(total, PDF_CONTENT_W);
    assert.ok(GRANDES_BATTERY_PDF_COL_WIDTHS[7] >= 30, 'C.C. deve ter coluna mais larga');
    assert.equal(GRANDES_BATTERY_PDF_NOWRAP_COLS.has(7), false, 'C.C. não deve usar ellipsize');
  });
});

describe('pdf-rav-bateria', () => {
  it('expõe layout da reparação avarias bateria', async () => {
    const mod = await import('../js/pdf-rav-bateria.js');
    for (const name of [
      'drawRavBateriaTitleBar',
      'drawRavBateriaBody',
      'drawRavBateriaClosingSection',
    ]) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('pdf-empilhadores', () => {
  it('expõe layout da preventiva empilhadores', async () => {
    const mod = await import('../js/pdf-empilhadores.js');
    for (const name of [
      'EMPILHADORES_SERVICE_ID',
      'drawEmpilhadoresDualVerificationBlocks',
      'drawEmpilhadoresMaterialSectionBlock',
      'drawEmpilhadoresMachineGrid',
      'isEmpilhadoresMaterialField',
    ]) {
      assert.ok(mod[name] != null, `export em falta: ${name}`);
    }
  });
});

describe('pdf-inspecao-dl50', () => {
  it('expõe layout da inspeção DL50', async () => {
    const mod = await import('../js/pdf-inspecao-dl50.js');
    for (const name of [
      'INSPECAO_DL50_SERVICE_ID',
      'DL50_SERVICE_META_BOTTOM_MM',
      'drawDl50MachineGrid',
      'drawDl50DualMatrixInspectionBlock',
    ]) {
      assert.ok(mod[name] != null, `export em falta: ${name}`);
    }
  });
});

describe('pdf-movimento-material', () => {
  it('expõe layout de recolha/entrega no cliente', async () => {
    const mod = await import('../js/pdf-movimento-material.js');
    assert.equal(typeof mod.drawMovimentoMaterialBody, 'function');
    assert.equal(typeof mod.drawMovimentoMaterialClosingSection, 'function');
  });
});

describe('pdf-format-utils — recolha/entrega', () => {
  it('não reserva campos de equipamento no PDF de movimento', async () => {
    const { isPdfLayoutReservedField } = await import('../js/pdf-format-utils.js');
    const service = { id: 'movimento_material_cliente' };
    assert.equal(isPdfLayoutReservedField('marca', service), false);
    assert.equal(isPdfLayoutReservedField('tipo', service), false);
    assert.equal(isPdfLayoutReservedField('numero_de_serie', service), false);
  });

  it('usa data_movimento como data do serviço no PDF', async () => {
    const { formatPdfServiceDateOnly } = await import('../js/pdf-format-utils.js');
    const formatted = formatPdfServiceDateOnly(
      { submittedAt: '2026-01-01' },
      { date: '2026-02-01' },
      { data_movimento: '2026-07-08' },
    );
    assert.equal(formatted, '08/07/2026');
  });
});
