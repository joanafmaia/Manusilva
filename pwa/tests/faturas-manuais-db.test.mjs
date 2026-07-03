import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapRowToManualInvoice, mapManualInvoiceToRow, mapRowToDeletedManualInvoiceLog } from '../js/faturas-manuais-db.js';

describe('faturas-manuais-db', () => {
  it('mapRowToManualInvoice — converte linha Supabase', () => {
    const invoice = mapRowToManualInvoice({
      id: 'abc-123',
      cliente_id: 42,
      numero_fatura: 'FT 2026/99',
      data_fatura: '2026-06-15',
      valor_faturado: 250.5,
      condicao_pagamento: '30_dias',
      status_recebimento: 'pendente',
      data_vencimento: '2026-07-15',
      data_recebimento: null,
      descricao: 'Material avulso',
      criado_em: '2026-06-15T10:00:00.000Z',
    });

    assert.equal(invoice.id, 'abc-123');
    assert.equal(invoice.clientId, '42');
    assert.equal(invoice.numeroFatura, 'FT 2026/99');
    assert.equal(invoice.dataFatura, '2026-06-15');
    assert.equal(invoice.valorFaturado, 250.5);
    assert.equal(invoice.faturaCondicaoPagamento, '30_dias');
    assert.equal(invoice.statusRecebimento, 'pendente');
    assert.equal(invoice.descricao, 'Material avulso');
  });

  it('mapManualInvoiceToRow — persiste campos financeiros', () => {
    const row = mapManualInvoiceToRow({
      clientId: '7',
      numeroFatura: 'FT 1',
      dataFatura: '2026-01-10',
      valorFaturado: 100,
      faturaCondicaoPagamento: 'pronto_pagamento',
      statusRecebimento: 'pago',
      dataVencimento: '2026-01-10',
      dataRecebimento: '2026-01-12',
      descricao: 'Serviço antigo',
    });

    assert.equal(row.cliente_id, 7);
    assert.equal(row.numero_fatura, 'FT 1');
    assert.equal(row.data_fatura, '2026-01-10');
    assert.equal(row.valor_faturado, 100);
    assert.equal(row.descricao, 'Serviço antigo');
  });

  it('mapRowToDeletedManualInvoiceLog — converte linha de auditoria', () => {
    const entry = mapRowToDeletedManualInvoiceLog({
      id: 'log-1',
      fatura_id: 'abc-123',
      cliente_id: 42,
      numero_fatura: 'FT 2026/99',
      data_fatura: '2026-06-15',
      valor_faturado: 250.5,
      descricao: 'Material avulso',
      status_recebimento: 'pendente',
      eliminado_por: 'Joana',
      eliminado_em: '2026-07-03T16:00:00.000Z',
      snapshot: { id: 'abc-123' },
    });

    assert.equal(entry.id, 'log-1');
    assert.equal(entry.faturaId, 'abc-123');
    assert.equal(entry.clientId, '42');
    assert.equal(entry.eliminadoPor, 'Joana');
    assert.equal(entry.valorFaturado, 250.5);
    assert.deepEqual(entry.snapshot, { id: 'abc-123' });
  });
});
