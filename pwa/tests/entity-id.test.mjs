import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sameEntityId, normalizeEntityId } from '../js/entity-id.js';
import { fitImageInBox } from '../js/pdf-image-fit.js';
import { collectSubmitWarnings } from '../js/form-submit-checks.js';

describe('entity-id', () => {
  it('normaliza e compara ids string/number', () => {
    assert.equal(normalizeEntityId('  abc  '), 'abc');
    assert.equal(sameEntityId('42', 42), true);
    assert.equal(sameEntityId('x', 'y'), false);
  });
});

describe('pdf-image-fit', () => {
  it('mantém proporção dentro da caixa (contain)', () => {
    const fit = fitImageInBox(0, 0, 100, 50, 200, 100, 0);
    assert.equal(fit.w, 100);
    assert.equal(fit.h, 50);
    assert.equal(fit.x, 0);
    assert.equal(fit.y, 0);

    const portrait = fitImageInBox(0, 0, 40, 40, 100, 200, 0);
    assert.ok(portrait.h > portrait.w);
    assert.ok(portrait.w <= 40);
    assert.ok(portrait.h <= 40);
  });
});

describe('form-submit-checks', () => {
  it('lista avisos quando faltam fotos e assinaturas', () => {
    const warnings = collectSubmitWarnings({
      report: { data: { values: {} } },
      signaturePads: {},
      hasFotoAntes: false,
      hasFotoDepois: false,
    });
    assert.ok(warnings.some((w) => w.includes('fotos')));
    assert.ok(warnings.some((w) => w.includes('técnico')));
    assert.ok(warnings.some((w) => w.includes('cliente')));
  });
});
