import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ORCAMENTO_RESPOSTA } from '../js/orcamento-workflow.js';
import {
  resolveOrcamentoBillingTotal,
} from '../js/orcamento-billing-workflow.js';
import {
  resolveOrcamentoValorAceiteNumber,
  resolveOrcamentoValorParaFaturacao,
  resolveOrcamentoValorPropostaOriginal,
  normalizeValorAceiteInput,
  renderOrcamentoValorAceiteFields,
} from '../js/orcamento-valor-aceite.js';
import { STANDALONE_ORCAMENTO_ORIGEM, STANDALONE_ORCAMENTO_SERVICE_TYPE } from '../js/orcamento-standalone.js';

function propostaBase(overrides = {}) {
  return {
    id: 'orc-neg',
    status: 'approved',
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    clientId: '10',
    faturacaoStatus: 'pendente',
    data: {
      orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
      orcamento: {
        enviadoEm: '2026-06-01T10:00:00.000Z',
        respostaCliente: ORCAMENTO_RESPOSTA.ACEITE,
        total: '246,00',
        linhas: [{ descricao: 'Serviço', qtd: '1', precoUnit: '200', total: '200' }],
        taxasSaida: [],
      },
    },
    ...overrides,
  };
}

describe('orcamento-valor-aceite', () => {
  it('usa valor negociado na faturação quando existe', () => {
    const report = propostaBase({
      data: {
        ...propostaBase().data,
        orcamento: {
          ...propostaBase().data.orcamento,
          valorAceite: 180.5,
          motivoValorAceite: 'Aceite parcial — só carregador',
        },
      },
    });
    assert.equal(resolveOrcamentoValorPropostaOriginal(report) > 200, true);
    assert.equal(resolveOrcamentoValorAceiteNumber(report), 180.5);
    assert.equal(resolveOrcamentoValorParaFaturacao(report), 180.5);
    assert.equal(resolveOrcamentoBillingTotal(report), 180.5);
  });

  it('sem valor aceite usa o total da proposta', () => {
    const report = propostaBase();
    const original = resolveOrcamentoValorPropostaOriginal(report);
    assert.ok(original > 0);
    assert.equal(resolveOrcamentoValorAceiteNumber(report), null);
    assert.equal(resolveOrcamentoBillingTotal(report), original);
  });

  it('normalizeValorAceiteInput aceita vírgula', () => {
    assert.equal(normalizeValorAceiteInput('180,50'), 180.5);
    assert.equal(normalizeValorAceiteInput(''), null);
    assert.throws(() => normalizeValorAceiteInput('abc'), /valor aceite válido/i);
  });

  it('UI do editor inclui valor e motivo', () => {
    const html = renderOrcamentoValorAceiteFields(propostaBase());
    assert.match(html, /Valor aceite \/ negociado/);
    assert.match(html, /Motivo \/ nota do aceite/);
    assert.match(html, /valorAceite/);
    assert.match(html, /motivoValorAceite/);
  });
});
