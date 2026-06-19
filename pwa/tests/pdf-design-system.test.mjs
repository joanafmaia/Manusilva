import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePdfInterventionFotosHeight,
  PDF_INTERVENTION_FOTO_BAR_H_MM,
  PDF_INTERVENTION_FOTO_MAX_H_MM,
} from '../js/pdf-design-system.js';

describe('pdf-design-system fotos', () => {
  it('altura da secção de fotos é consistente entre relatórios', () => {
    const base = estimatePdfInterventionFotosHeight();
    const withGap = estimatePdfInterventionFotosHeight(8);
    assert.ok(base > PDF_INTERVENTION_FOTO_BAR_H_MM + PDF_INTERVENTION_FOTO_MAX_H_MM);
    assert.equal(withGap - base, 4);
  });
});
