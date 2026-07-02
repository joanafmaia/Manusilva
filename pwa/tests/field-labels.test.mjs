import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LABEL_ANO_FABRICO,
  formatAnoFabricoDisplay,
} from '../js/field-labels.js';

describe('field-labels — ano de fabrico DL50', () => {
  it('LABEL_ANO_FABRICO é "Ano"', () => {
    assert.equal(LABEL_ANO_FABRICO, 'Ano');
  });

  it('formatAnoFabricoDisplay extrai ano de data ISO legada', () => {
    assert.equal(formatAnoFabricoDisplay('2018-03-15'), '2018');
    assert.equal(formatAnoFabricoDisplay('2018'), '2018');
    assert.equal(formatAnoFabricoDisplay(''), '');
    assert.equal(formatAnoFabricoDisplay(null), '');
  });
});
