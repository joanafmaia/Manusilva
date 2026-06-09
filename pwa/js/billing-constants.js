/**
 * Constantes de faturação / contas a receber (relatórios faturados).
 */

export const FATURA_CONDICAO_OPCOES = [
  { value: 'pronto_pagamento', label: 'Pronto-pagamento' },
  { value: '30_dias', label: '30 Dias' },
  { value: '60_dias', label: '60 Dias' },
];

export const STATUS_RECEBIMENTO_OPCOES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
];

export const FATURA_CONDICAO_LABELS = Object.fromEntries(
  FATURA_CONDICAO_OPCOES.map((o) => [o.value, o.label]),
);

export const STATUS_RECEBIMENTO_LABELS = Object.fromEntries(
  STATUS_RECEBIMENTO_OPCOES.map((o) => [o.value, o.label]),
);

const CONDICAO_VALIDAS = new Set(FATURA_CONDICAO_OPCOES.map((o) => o.value));
const STATUS_VALIDOS = new Set(STATUS_RECEBIMENTO_OPCOES.map((o) => o.value));

/** Converte condição do cadastro do cliente para slug da fatura. */
export function condicaoFromClientCatalog(clientCondicao) {
  const raw = String(clientCondicao || '').trim().toLowerCase();
  if (raw.includes('60')) return '60_dias';
  if (raw.includes('30')) return '30_dias';
  return 'pronto_pagamento';
}

/** Compatibilidade com dados gravados antes da separação de campos (008). */
export function legacyPrazoToCondicao(prazo) {
  const map = {
    pronto: 'pronto_pagamento',
    pronto_pagamento: 'pronto_pagamento',
    '30_dias': '30_dias',
    '60_dias': '60_dias',
    pendente: 'pronto_pagamento',
  };
  return map[String(prazo || '').trim()] || null;
}

export function labelFaturaCondicao(value) {
  return FATURA_CONDICAO_LABELS[value] || value || '—';
}

export function labelStatusRecebimento(value) {
  return STATUS_RECEBIMENTO_LABELS[value] || value || '—';
}

export function normalizeFaturaCondicao(value) {
  const v = String(value || '').trim();
  if (CONDICAO_VALIDAS.has(v)) return v;
  const fromLegacy = legacyPrazoToCondicao(v);
  if (fromLegacy) return fromLegacy;
  throw new Error('Condição de pagamento inválida.');
}

export function normalizeStatusRecebimento(value) {
  const v = String(value || 'pendente').trim();
  if (STATUS_VALIDOS.has(v)) return v;
  throw new Error('Estado de recebimento inválido.');
}
