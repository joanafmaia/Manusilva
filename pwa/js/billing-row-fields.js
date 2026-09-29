/**
 * Colunas de faturação — técnicos/armazém não as devem enviar no PATCH.
 * A app mapeia NULL da BD para '' / 'pendente'; o trigger 042 trata isso como alteração.
 */

export const INVOICE_ROW_KEYS = Object.freeze([
  'faturacao_status',
  'numero_fatura',
  'data_fatura',
  'valor_faturado',
  'valor_recebido',
  'condicao_pagamento',
  'status_recebimento',
  'data_vencimento',
  'data_recebimento',
  'faturado_por',
]);

export function stripInvoiceRowFields(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  for (const key of INVOICE_ROW_KEYS) {
    delete next[key];
  }
  return next;
}

export function rowForInvoiceAwareWrite(row, isRhAdmin) {
  if (!row || isRhAdmin) return row;
  return stripInvoiceRowFields(row);
}
