import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPILHADORES_VERIFY_STATES,
  EMPILHADORES_MATRIX_OPTIONS,
  formatEmpilhadoresVerifyState,
  empilhadoresVerifyRowClass,
  empilhadoresVerifyBadgeClass,
  empilhadoresMatrixOptionDisplay,
  empilhadoresMatrixOptionClass,
  empilhadoresMatrixOptionDataValue,
  empilhadoresMatrixOptionFromDataValue,
} from '../js/preventiva-empilhadores-items.js';

describe('preventiva empilhadores — estados do checklist', () => {
  it('inclui vazio, OK, Não OK e N/A', () => {
    assert.deepEqual(EMPILHADORES_VERIFY_STATES, ['', 'OK', 'Não OK', 'N/A']);
  });

  it('formatEmpilhadoresVerifyState mostra traço para vazio', () => {
    assert.equal(formatEmpilhadoresVerifyState(''), '—');
    assert.equal(formatEmpilhadoresVerifyState('OK'), 'OK');
    assert.equal(formatEmpilhadoresVerifyState('N/A'), 'N/A');
  });

  it('classes CSS por estado', () => {
    assert.equal(empilhadoresVerifyRowClass(''), 'verification-card--blank');
    assert.equal(empilhadoresVerifyRowClass('OK'), 'verification-card--ok');
    assert.equal(empilhadoresVerifyRowClass('Não OK'), 'verification-card--fail');
    assert.equal(empilhadoresVerifyRowClass('N/A'), 'verification-card--na');
    assert.equal(empilhadoresVerifyBadgeClass('N/A'), 'verification-badge--na');
  });

  it('matriz com três botões (OK, Não OK, N/A)', () => {
    assert.deepEqual(EMPILHADORES_MATRIX_OPTIONS, ['OK', 'Não OK', 'N/A']);
  });

  it('empilhadoresMatrixOptionDisplay mostra rótulos completos nos botões', () => {
    assert.equal(empilhadoresMatrixOptionDisplay('OK'), 'OK');
    assert.equal(empilhadoresMatrixOptionDisplay('Não OK'), 'Não OK');
    assert.equal(empilhadoresMatrixOptionDisplay('N/A'), 'N/A');
  });

  it('empilhadoresMatrixOptionDataValue evita N/A no atributo data-value', () => {
    assert.equal(empilhadoresMatrixOptionDataValue('N/A'), 'NA_OPTION');
    assert.equal(empilhadoresMatrixOptionFromDataValue('NA_OPTION'), 'N/A');
    assert.equal(empilhadoresMatrixOptionFromDataValue('NOK'), 'Não OK');
  });

  it('empilhadoresMatrixOptionClass mapeia cores da matriz', () => {
    assert.equal(empilhadoresMatrixOptionClass('OK'), 'matrix-opt--b');
    assert.equal(empilhadoresMatrixOptionClass('Não OK'), 'matrix-opt--d');
    assert.equal(empilhadoresMatrixOptionClass('N/A'), 'matrix-opt--na');
  });
});
