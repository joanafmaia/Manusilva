import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sameEntityId, normalizeEntityId } from '../js/entity-id.js';
import { fitImageInBox } from '../js/pdf-image-fit.js';
import { collectSubmitWarnings } from '../js/form-submit-checks.js';
import { MOVIMENTO_MATERIAL_CLIENTE, REPARACAO_CARREGADOR } from '../js/mock_data.js';

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
    assert.ok(!warnings.some((w) => w.includes('observações')));
  });

  it('não avisa observações em branco se o relatório não tem esse campo', () => {
    const warnings = collectSubmitWarnings({
      report: { data: { values: {} } },
      service: REPARACAO_CARREGADOR,
      signaturePads: { technician: { toDataURL: () => 'x' }, client: { toDataURL: () => 'y' } },
      hasFotoAntes: true,
      hasFotoDepois: true,
    });
    assert.ok(!warnings.some((w) => w.includes('observações')));
  });

  it('não avisa assinaturas em falta quando skipSignatureWarnings (visita)', () => {
    const warnings = collectSubmitWarnings({
      report: { data: { values: {}, signatures: {} } },
      hasFotoAntes: true,
      hasFotoDepois: true,
      skipSignatureWarnings: true,
    });
    assert.ok(!warnings.some((w) => w.includes('assinatura')));
  });

  it('recolha/entrega — não avisa fotos nem assinaturas em falta', () => {
    const warnings = collectSubmitWarnings({
      report: { data: { values: { observacoes: '' } } },
      service: MOVIMENTO_MATERIAL_CLIENTE,
      signaturePads: {},
      hasFotoAntes: false,
      hasFotoDepois: false,
    });
    assert.equal(warnings.length, 0);
  });
});
