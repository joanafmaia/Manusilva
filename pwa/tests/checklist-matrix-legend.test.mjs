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
} from '../js/preventiva-empilhadores-items.js';

describe('legendas checklist DL50 e empilhadores', () => {
  it('DL50 explica B, N, D e N.A.', () => {
    assert.equal(dl50MatrixLegendLabel('B'), 'Bom');
    assert.equal(dl50MatrixLegendLabel('N'), 'Normal');
    assert.equal(dl50MatrixLegendLabel('D'), 'Danificado');
    assert.equal(dl50MatrixLegendLabel('N.A.'), 'Não aplicável');
    assert.equal(dl50MatrixOptionDisplay('N.A.'), 'NA');
    assert.equal(DL50_MATRIX_LEGEND.length, 4);
    const text = formatDl50MatrixLegendText();
    assert.match(text, /B = Bom/);
    assert.match(text, /N = Normal/);
    assert.match(text, /D = Danificado/);
    assert.match(text, /NA = Não aplicável/);
  });

  it('empilhadores explica OK, Não OK e N/A', () => {
    assert.equal(empilhadoresMatrixLegendLabel('OK'), 'Conforme');
    assert.equal(empilhadoresMatrixLegendLabel('Não OK'), 'Não conforme');
    assert.equal(empilhadoresMatrixLegendLabel('N/A'), 'Não aplicável');
    const text = formatEmpilhadoresMatrixLegendText();
    assert.match(text, /OK = Conforme/);
    assert.match(text, /Não OK = Não conforme/);
    assert.match(text, /N\/A = Não aplicável/);
  });
});
