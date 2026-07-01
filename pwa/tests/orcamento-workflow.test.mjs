import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORCAMENTO_RESPOSTA,
  orcamentoAguardaRespostaCliente,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
} from '../js/orcamento-workflow.js';

describe('resolveOrcamentoWorkflowStatus', () => {
  it('prioriza aceite sobre enviada', () => {
    const report = {
      data: {
        orcamento: {
          enviadoEm: '2026-06-01T10:00:00Z',
          respostaCliente: ORCAMENTO_RESPOSTA.ACEITE,
        },
      },
    };
    assert.equal(resolveOrcamentoWorkflowStatus(report), 'aceite');
  });

  it('marca recusada', () => {
    const report = {
      data: {
        orcamento: {
          enviadoEm: '2026-06-01T10:00:00Z',
          respostaCliente: ORCAMENTO_RESPOSTA.RECUSADA,
        },
      },
    };
    assert.equal(resolveOrcamentoWorkflowStatus(report), 'recusada');
  });

  it('enviada sem resposta do cliente', () => {
    const report = {
      data: {
        orcamento: { enviadoEm: '2026-06-01T10:00:00Z' },
        urlPdfOrcamento: 'https://example.com/p.pdf',
      },
    };
    assert.equal(resolveOrcamentoWorkflowStatus(report), 'enviada');
    assert.equal(orcamentoAguardaRespostaCliente(report), true);
  });
});

describe('resolveOrcamentoWorkflowLabel', () => {
  it('traduz estados', () => {
    assert.equal(resolveOrcamentoWorkflowLabel('aceite'), 'Aceite');
    assert.equal(resolveOrcamentoWorkflowLabel('recusada'), 'Recusada');
  });
});
