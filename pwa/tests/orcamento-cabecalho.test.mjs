import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReportObservacoesTecnico } from '../js/orcamento-cabecalho.js';

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
