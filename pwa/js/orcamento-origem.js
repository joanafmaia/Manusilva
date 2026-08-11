/**
 * Origem da proposta comercial MS.015 — RH standalone, pedido técnico ou folha R.C.
 */

import { reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';

export const ORCAMENTO_ORIGEM = Object.freeze({
  RH: 'rh',
  PEDIDO: 'pedido',
  FOLHA: 'folha',
});

export const ORCAMENTO_ORIGEM_OPTIONS = [
  { value: ORCAMENTO_ORIGEM.RH, label: 'Proposta RH' },
  { value: ORCAMENTO_ORIGEM.PEDIDO, label: 'Pedido técnico' },
  { value: ORCAMENTO_ORIGEM.FOLHA, label: 'Folha de obra' },
];

const LABEL_BY_ID = new Map(ORCAMENTO_ORIGEM_OPTIONS.map((o) => [o.value, o.label]));

/**
 * @param {object|null|undefined} report
 * @returns {{ id: 'rh'|'pedido'|'folha', label: string }}
 */
export function resolveOrcamentoOrigem(report) {
  if (reportIsFolhaObraOrcamento(report)) {
    return { id: ORCAMENTO_ORIGEM.FOLHA, label: LABEL_BY_ID.get(ORCAMENTO_ORIGEM.FOLHA) };
  }
  if (reportIsStandaloneOrcamento(report)) {
    return { id: ORCAMENTO_ORIGEM.RH, label: LABEL_BY_ID.get(ORCAMENTO_ORIGEM.RH) };
  }
  return { id: ORCAMENTO_ORIGEM.PEDIDO, label: LABEL_BY_ID.get(ORCAMENTO_ORIGEM.PEDIDO) };
}

export function formatOrcamentoOrigemLabel(reportOrId) {
  if (reportOrId && typeof reportOrId === 'object') {
    return resolveOrcamentoOrigem(reportOrId).label;
  }
  const key = String(reportOrId || '').trim();
  return LABEL_BY_ID.get(key) || 'Pedido técnico';
}

export function reportMatchesOrcamentoOrigem(report, origemFilter) {
  if (!origemFilter || origemFilter === 'all') return true;
  return resolveOrcamentoOrigem(report).id === origemFilter;
}
