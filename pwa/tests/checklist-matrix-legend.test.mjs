import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DL50_MATRIX_LEGEND,
  formatDl50MatrixLegendText,
  dl50MatrixLegendLabel,
  dl50MatrixOptionDisplay,
} from '../js/inspecao-dl50-categories.js';
import {
  formatEmpilhadoresMatrixLegendText,
  empilhadoresMatrixLegendLabel,
  EMPILHADORES_NA_DISPLAY,
} from '../js/preventiva-empilhadores-items.js';
import {
  pdfMatrixStateRgb,
  PDF_MATRIX_COLOR_OK,
  PDF_MATRIX_COLOR_WARN,
  PDF_MATRIX_COLOR_FAIL,
  PDF_MATRIX_COLOR_NA,
} from '../js/pdf-design-system.js';

describe('legendas checklist DL50 e empilhadores', () => {
  it('DL50 explica B, N, D e N.A.', () => {
    assert.equal(dl50MatrixLegendLabel('B'), 'Bom');
    assert.equal(dl50MatrixLegendLabel('N'), 'Normal');
    assert.equal(dl50MatrixLegendLabel('D'), 'Danificado');
    assert.equal(dl50MatrixLegendLabel('N.A.'), 'Não aplicável');
    assert.equal(dl50MatrixOptionDisplay('N.A.'), 'N.A.');
    assert.equal(dl50MatrixOptionDisplay('NA'), 'N.A.');
    assert.equal(DL50_MATRIX_LEGEND.length, 4);
    const text = formatDl50MatrixLegendText();
    assert.match(text, /B = Bom/);
    assert.match(text, /N = Normal/);
    assert.match(text, /D = Danificado/);
    assert.match(text, /N\.A\. = Não aplicável/);
  });

  it('empilhadores explica OK, Não OK e N.A.', () => {
    assert.equal(empilhadoresMatrixLegendLabel('OK'), 'Conforme');
    assert.equal(empilhadoresMatrixLegendLabel('Não OK'), 'Não conforme');
    assert.equal(empilhadoresMatrixLegendLabel('N/A'), 'Não aplicável');
    const text = formatEmpilhadoresMatrixLegendText();
    assert.match(text, /OK = Conforme/);
    assert.match(text, /Não OK = Não conforme/);
    assert.match(text, new RegExp(`${EMPILHADORES_NA_DISPLAY} = Não aplicável`));
  });

  it('cores PDF alinhadas com CSS (--success / --warning / --danger / muted)', () => {
    assert.deepEqual(pdfMatrixStateRgb('B'), PDF_MATRIX_COLOR_OK);
    assert.deepEqual(pdfMatrixStateRgb('OK'), PDF_MATRIX_COLOR_OK);
    assert.deepEqual(pdfMatrixStateRgb('N'), PDF_MATRIX_COLOR_WARN);
    assert.deepEqual(pdfMatrixStateRgb('D'), PDF_MATRIX_COLOR_FAIL);
    assert.deepEqual(pdfMatrixStateRgb('Não OK'), PDF_MATRIX_COLOR_FAIL);
    assert.deepEqual(pdfMatrixStateRgb('N.A.'), PDF_MATRIX_COLOR_NA);
    assert.deepEqual(pdfMatrixStateRgb('N/A'), PDF_MATRIX_COLOR_NA);
    assert.deepEqual(PDF_MATRIX_COLOR_OK, [47, 122, 82]);
    assert.deepEqual(PDF_MATRIX_COLOR_WARN, [183, 121, 31]);
    assert.deepEqual(PDF_MATRIX_COLOR_FAIL, [197, 48, 48]);
  });
});
