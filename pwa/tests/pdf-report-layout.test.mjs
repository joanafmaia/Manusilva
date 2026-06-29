import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
  it('expõe API pública de geração de PDF', async () => {
    const mod = await import('../js/pdf-report.js');
    for (const name of PDF_REPORT_EXPORTS) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
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
