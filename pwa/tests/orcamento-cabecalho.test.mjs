import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORCAMENTO_TEXTO_INTRO_PLURAL,
  ORCAMENTO_TEXTO_INTRO_SINGULAR,
  resolveOrcamentoTextoIntroForPdf,
  resolveReportObservacoesTecnico,
  suggestOrcamentoTextoIntro,
} from '../js/orcamento-cabecalho.js';

describe('suggestOrcamentoTextoIntro', () => {
  it('usa texto por defeito para uma máquina', () => {
    const report = { data: { orcamento: { maquinas: [{ marca: 'Toyota' }] } } };
    assert.equal(suggestOrcamentoTextoIntro(report), ORCAMENTO_TEXTO_INTRO_SINGULAR);
  });

  it('usa plural com várias máquinas', () => {
    const report = {
      data: {
        orcamento: {
          maquinas: [{ marca: 'A' }, { marca: 'B' }],
        },
      },
    };
    assert.equal(suggestOrcamentoTextoIntro(report), ORCAMENTO_TEXTO_INTRO_PLURAL);
  });

  it('respeita texto guardado pelo RH', () => {
    const custom = 'Texto personalizado:';
    const report = { data: { orcamento: { textoIntro: custom } } };
    assert.equal(suggestOrcamentoTextoIntro(report), custom);
  });
});

describe('resolveOrcamentoTextoIntroForPdf', () => {
  it('passa a plural quando há várias máquinas e o texto guardado é singular', () => {
    const intro = resolveOrcamentoTextoIntroForPdf(
      [{ marca: 'A' }, { marca: 'B' }],
      ORCAMENTO_TEXTO_INTRO_SINGULAR,
    );
    assert.equal(intro, ORCAMENTO_TEXTO_INTRO_PLURAL);
  });

  it('mantém texto personalizado do RH', () => {
    const custom = 'Proposta para reparação urgente:';
    assert.equal(resolveOrcamentoTextoIntroForPdf([{ marca: 'A' }, { marca: 'B' }], custom), custom);
  });
});

describe('resolveReportObservacoesTecnico', () => {
  it('usa «O que é necessário» quando há pedido de orçamento', () => {
    const report = {
      serviceType: 'folha_intervencao_avarias',
      data: {
        values: {
          pedido_orcamento: 'Sim',
          detalhe_pedido_orcamento: 'Substituir contactores e cablagem',
          observacoes: 'Cliente pediu urgência na entrega',
        },
      },
    };
    assert.equal(
      resolveReportObservacoesTecnico(report),
      'Substituir contactores e cablagem',
    );
  });

  it('não mistura observações gerais quando pedido de orçamento está vazio', () => {
    const report = {
      data: {
        values: {
          pedido_orcamento: 'Sim',
          detalhe_pedido_orcamento: '',
          observacoes: 'Só observações gerais',
        },
      },
    };
    assert.equal(resolveReportObservacoesTecnico(report), '');
  });

  it('mantém observações gerais sem pedido de orçamento', () => {
    const report = {
      data: {
        values: {
          pedido_orcamento: 'Não',
          observacoes: 'Máquina deixada operacional',
        },
      },
    };
    assert.equal(resolveReportObservacoesTecnico(report), 'Máquina deixada operacional');
  });
});
