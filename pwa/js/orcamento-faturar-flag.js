/**
 * Opção RH: a proposta MS.015 entra (ou não) em «Por faturar».
 * Separado de orcamento-linhas / billing para evitar imports circulares.
 */

import { reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';
import { escapeHtml } from './html-utils.js';

export const ORCAMENTO_FATURAR_FIELD = 'faturarProposta';

function reportHasPedidoOrcamentoLocal(report) {
  const values = report?.data?.values || {};
  return String(values.pedido_orcamento || '').trim().toLowerCase() === 'sim';
}

export function reportIsPedidoOrcamentoFromVisit(report) {
  if (!reportHasPedidoOrcamentoLocal(report)) return false;
  if (reportIsStandaloneOrcamento(report)) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  return true;
}

/** Default: proposta RH do zero = sim; pedido de relatório / folha = não. */
export function defaultOrcamentoFaturarProposta(report) {
  if (!report) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (reportIsStandaloneOrcamento(report)) return true;
  return false;
}

export function normalizeOrcamentoFaturarProposta(value, report = null) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return defaultOrcamentoFaturarProposta(report);
}

/**
 * Lê a opção «vai a faturação». Se ainda não foi escolhida, usa o default da origem.
 * @param {object|null|undefined} report
 * @param {object|null|undefined} [meta] — dados.orcamento já lidos
 */
export function resolveOrcamentoFaturarProposta(report, meta = null) {
  if (!report) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  const orc = meta || report?.data?.orcamento || {};
  const raw = orc?.[ORCAMENTO_FATURAR_FIELD];
  if (raw === true || raw === false) return raw;
  if (raw === 'true' || raw === '1' || raw === 1) return true;
  if (raw === 'false' || raw === '0' || raw === 0) return false;
  return defaultOrcamentoFaturarProposta(report);
}

export function readOrcamentoFaturarFromDom(root, report = null) {
  const el = root?.querySelector?.(`[data-orc-field="${ORCAMENTO_FATURAR_FIELD}"]`);
  if (!el) return resolveOrcamentoFaturarProposta(report);
  return Boolean(el.checked);
}

/** Caixa para o RH escolher se a proposta entra em «Por faturar». */
export function renderOrcamentoFaturarCheckbox(report, { id = '', compact = false } = {}) {
  if (reportIsFolhaObraOrcamento(report)) return '';
  const checked = resolveOrcamentoFaturarProposta(report);
  const inputId = id || `orc-faturar-${String(report?.id || 'x').replace(/[^\w-]/g, '')}`;
  const hint = reportIsPedidoOrcamentoFromVisit(report)
    ? 'Por omissão não: fatura-se a visita. Marque só se quiser faturar esta proposta.'
    : 'Por omissão sim: após aceite, a proposta entra em Faturação.';
  const cls = compact
    ? 'orcamentos-faturar-check orcamentos-faturar-check--compact'
    : 'review-orc-field review-orc-faturar-check';
  return `
    <label class="${cls}" title="${escapeHtml(hint)}">
      <input type="checkbox" id="${escapeHtml(inputId)}" data-orc-field="${ORCAMENTO_FATURAR_FIELD}" ${checked ? 'checked' : ''} />
      <span>Esta proposta vai a faturação</span>
    </label>`;
}
