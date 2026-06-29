import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toHtmlDateValue,
  normalizeDateForStorage,
  toHtmlTimeValue,
  resolveFieldInputType,
  DATE_FIELD_ID_RE,
} from '../js/form-date-utils.js';

describe('form-date-utils', () => {
  it('DATE_FIELD_ID_RE está definido', () => {
    assert.ok(DATE_FIELD_ID_RE.test('data_de_conclusao'));
    assert.ok(DATE_FIELD_ID_RE.test('data_1'));
  });

  it('toHtmlDateValue converte DD/MM/AAAA para ISO', () => {
    assert.equal(toHtmlDateValue('10/06/2026'), '2026-06-10');
    assert.equal(toHtmlDateValue('2026-06-10'), '2026-06-10');
  });

  it('normalizeDateForStorage mantém ISO', () => {
    assert.equal(normalizeDateForStorage('2026-06-10'), '2026-06-10');
  });

  it('toHtmlTimeValue normaliza hora', () => {
    assert.equal(toHtmlTimeValue('9:05'), '09:05');
  });

  it('resolveFieldInputType infere date por id', () => {
    assert.equal(resolveFieldInputType({ id: 'data_de_conclusao', type: 'text' }), 'date');
    assert.equal(resolveFieldInputType({ id: 'hora_inicio', type: 'text' }), 'time');
  });
});
