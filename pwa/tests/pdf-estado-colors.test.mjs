import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_COLOR_DANGER,
  PDF_COLOR_SUCCESS,
  PDF_COLOR_TEXT_DARK,
} from '../js/pdf-design-system.js';
import {
  PDF_COLOR_WARNING,
  extractEstadoValueFromPdfCellText,
  resolvePdfEstadoTextColor,
} from '../js/pdf-estado-colors.js';

describe('pdf-estado-colors', () => {
  it('mapeia estados operacionais para verde', () => {
    assert.deepEqual(resolvePdfEstadoTextColor('Operacional'), PDF_COLOR_SUCCESS);
    assert.deepEqual(resolvePdfEstadoTextColor('Apta a Trabalhar'), PDF_COLOR_SUCCESS);
    assert.deepEqual(resolvePdfEstadoTextColor('Reparação Concluída'), PDF_COLOR_SUCCESS);
  });

  it('mapeia estados de atenção para amarelo', () => {
    assert.deepEqual(resolvePdfEstadoTextColor('Aguardar Peças'), PDF_COLOR_WARNING);
    assert.deepEqual(resolvePdfEstadoTextColor('Necessita Elementos Novos'), PDF_COLOR_WARNING);
    assert.deepEqual(resolvePdfEstadoTextColor('Baixo'), PDF_COLOR_WARNING);
  });

  it('mapeia estados críticos para vermelho', () => {
    assert.deepEqual(resolvePdfEstadoTextColor('Inoperacional'), PDF_COLOR_DANGER);
    assert.deepEqual(resolvePdfEstadoTextColor('Inoperacional por Segurança'), PDF_COLOR_DANGER);
    assert.deepEqual(resolvePdfEstadoTextColor('Danificado'), PDF_COLOR_DANGER);
  });

  it('extrai valor de células com rótulo', () => {
    assert.equal(
      extractEstadoValueFromPdfCellText('Estado da Máquina: Operacional'),
      'Operacional',
    );
    assert.equal(
      extractEstadoValueFromPdfCellText('Estado Geral: Inoperacional'),
      'Inoperacional',
    );
    assert.equal(
      extractEstadoValueFromPdfCellText('Estado em que Ficou a Máquina: Aguardar Peças'),
      'Aguardar Peças',
    );
  });

  it('devolve cor neutra para vazio', () => {
    assert.deepEqual(resolvePdfEstadoTextColor(''), PDF_COLOR_TEXT_DARK);
    assert.deepEqual(resolvePdfEstadoTextColor('—'), PDF_COLOR_TEXT_DARK);
  });
});
