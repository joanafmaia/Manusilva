import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORCAMENTO_RESPOSTA,
  formatOrcamentoRespostaDataLabel,
  normalizeRespostaClienteEm,
  orcamentoAguardaRespostaCliente,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  todayLocalDateInputValue,
  toLocalDateInputValue,
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

describe('data de aceite/recusa', () => {
  it('converte AAAA-MM-DD e ISO para o input date', () => {
    assert.equal(toLocalDateInputValue('2026-03-15T18:00:00.000Z'), '2026-03-15');
    assert.equal(toLocalDateInputValue('15/03/2026'), '2026-03-15');
    assert.match(todayLocalDateInputValue(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('normaliza data escolhida para ISO estável', () => {
    const iso = normalizeRespostaClienteEm('2026-08-01');
    assert.equal(toLocalDateInputValue(iso), '2026-08-01');
    assert.equal(normalizeRespostaClienteEm('', { fallbackNow: false }), null);
  });

  it('formata etiqueta DD/MM/AAAA', () => {
    assert.equal(
      formatOrcamentoRespostaDataLabel({
        respostaClienteEm: '2026-08-01T12:00:00.000Z',
      }),
      '01/08/2026',
    );
  });
});
