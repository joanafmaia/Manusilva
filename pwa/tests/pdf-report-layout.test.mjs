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
