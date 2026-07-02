import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPILHADORES_VERIFY_STATES,
  formatEmpilhadoresVerifyState,
  empilhadoresVerifyRowClass,
  empilhadoresVerifyBadgeClass,
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
});
