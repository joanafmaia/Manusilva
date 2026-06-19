import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePdfInterventionFotosHeight,
  PDF_AUTOTABLE_MARGIN_BOTTOM_MM,
  PDF_CONTENT_SAFE_BOTTOM_MM,
  PDF_INTERVENTION_FOTO_BAR_H_MM,
  PDF_INTERVENTION_FOTO_MAX_H_MM,
  PDF_PAGE_H,
  PDF_PAGE_NUMBER_Y,
} from '../js/pdf-design-system.js';

describe('pdf-design-system fotos', () => {
  it('altura da secção de fotos é consistente entre relatórios', () => {
    const base = estimatePdfInterventionFotosHeight();
    const withGap = estimatePdfInterventionFotosHeight(8);
    assert.ok(base > PDF_INTERVENTION_FOTO_BAR_H_MM + PDF_INTERVENTION_FOTO_MAX_H_MM);
    assert.equal(withGap - base, 4);
  });

  it('autoTable e conteúdo manual partilham a mesma margem inferior', () => {
    assert.equal(PDF_AUTOTABLE_MARGIN_BOTTOM_MM, PDF_CONTENT_SAFE_BOTTOM_MM);
    const contentBottomY = PDF_PAGE_H - PDF_CONTENT_SAFE_BOTTOM_MM;
    assert.ok(contentBottomY < PDF_PAGE_NUMBER_Y - 2);
  });
});
