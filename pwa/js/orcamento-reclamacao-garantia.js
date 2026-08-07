/**
 * Flag RH — proposta associada a avaria / reclamação em garantia (auditoria).
 * Não aparece no PDF ao cliente; só meta interna + lista/exportações.
 * Em «Proposta de venda» não se aplica (N/A).
 */

import { getReportsSnapshot } from './relatorios-db.js';
import {
  resolveTituloColunaArtigosState,
  TITULO_COLUNA_ARTIGOS_PRESET,
} from './orcamento-coluna-artigos.js';

export const RECLAMACAO_GARANTIA_OPTIONS = [
  { value: '', label: '— Não indicado' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'na', label: 'N/A' },
];

/** @returns {''|'sim'|'nao'|'na'} */
export function normalizeReclamacaoGarantia(value) {
  if (value === true || value === 1) return 'sim';
  if (value === false || value === 0) return 'nao';
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (raw === 'sim' || raw === 's' || raw === 'yes' || raw === 'true') return 'sim';
  if (raw === 'nao' || raw === 'n' || raw === 'no' || raw === 'false') return 'nao';
  if (
    raw === 'na' ||
    raw === 'n/a' ||
    raw === 'n.a.' ||
    raw === 'n.a' ||
    raw === 'nao aplicavel' ||
    raw === 'nao se aplica'
  ) {
    return 'na';
  }
  return '';
}

/** Meta do orçamento ou relatório — true quando o título da coluna é «Proposta de venda». */
export function isOrcamentoPropostaVenda(metaOrReport) {
  const meta =
    metaOrReport?.data?.orcamento && typeof metaOrReport.data.orcamento === 'object'
      ? metaOrReport.data.orcamento
      : metaOrReport && typeof metaOrReport === 'object'
        ? metaOrReport
        : {};
  return resolveTituloColunaArtigosState(meta).preset === TITULO_COLUNA_ARTIGOS_PRESET.VENDA;
}

/** Propostas de venda não pedem Sim/Não de garantia. */
export function orcamentoNeedsReclamacaoGarantia(metaOrReport) {
  return !isOrcamentoPropostaVenda(metaOrReport);
}

export function formatReclamacaoGarantiaLabel(value, { empty = '—' } = {}) {
  const key = normalizeReclamacaoGarantia(value);
  if (key === 'sim') return 'Sim';
  if (key === 'nao') return 'Não';
  if (key === 'na') return 'N/A';
  return empty;
}

export function formatReclamacaoGarantiaAuditLabel(value) {
  const key = normalizeReclamacaoGarantia(value);
  if (key === 'sim') return 'Sim';
  if (key === 'nao') return 'Não';
  if (key === 'na') return 'N/A';
  return 'Não indicado';
}

export function getReportReclamacaoGarantia(report) {
  const meta = report?.data?.orcamento;
  if (!meta || typeof meta !== 'object') {
    return isOrcamentoPropostaVenda(report) ? 'na' : '';
  }
  const stored = normalizeReclamacaoGarantia(meta.reclamacaoGarantia);
  if (stored) return stored;
  if (isOrcamentoPropostaVenda(meta) || isOrcamentoPropostaVenda(report)) return 'na';
  return '';
}

/** True se já há indicação útil (Sim/Não/N/A) — não pede confirmação ao aceitar. */
export function reportHasReclamacaoGarantiaIndicacao(report) {
  return Boolean(getReportReclamacaoGarantia(report));
}

/**
 * Valor a persistir: força N/A em proposta de venda.
 * @param {string} value
 * @param {object} [metaOrReport]
 */
export function resolveReclamacaoGarantiaForSave(value, metaOrReport) {
  if (isOrcamentoPropostaVenda(metaOrReport)) return 'na';
  return normalizeReclamacaoGarantia(value);
}

export function readReclamacaoGarantiaFromDom(root) {
  const el = root?.querySelector('[data-orc-field="reclamacaoGarantia"]');
  return normalizeReclamacaoGarantia(el?.value);
}

function normalizeSerialKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Nº de série / interno usado para cruzar histórico de garantia. */
export function resolveReportGarantiaSerialKeys(report) {
  const meta = report?.data?.orcamento || {};
  const values = report?.data?.values || {};
  const keys = [
    report?.forkliftSerial,
    meta.numeroSerie,
    meta.numeroInterno,
    values.numero_serie,
    values.numero_de_serie,
    values.n_interno,
    values.numero_interno,
  ]
    .map(normalizeSerialKey)
    .filter(Boolean);
  return [...new Set(keys)];
}

/**
 * Sugere reclamacaoGarantia a partir de propostas anteriores com o mesmo nº de série
 * (ou, em último caso, o mesmo cliente).
 * @param {object} report
 * @param {object[]} [allReports]
 * @returns {''|'sim'|'nao'|'na'}
 */
export function suggestReclamacaoGarantia(report, allReports = null) {
  if (!report) return '';
  if (isOrcamentoPropostaVenda(report)) return 'na';

  const stored = normalizeReclamacaoGarantia(report?.data?.orcamento?.reclamacaoGarantia);
  if (stored === 'sim' || stored === 'nao') return stored;

  const snapshot = Array.isArray(allReports) ? allReports : getReportsSnapshot();
  const serialKeys = new Set(resolveReportGarantiaSerialKeys(report));
  const clientId = String(report.clientId || '').trim();
  let byClient = '';

  for (const other of snapshot) {
    if (!other || String(other.id) === String(report.id)) continue;
    if (isOrcamentoPropostaVenda(other)) continue;
    const flag = normalizeReclamacaoGarantia(other?.data?.orcamento?.reclamacaoGarantia);
    if (flag !== 'sim' && flag !== 'nao') continue;

    const otherKeys = resolveReportGarantiaSerialKeys(other);
    if (serialKeys.size && otherKeys.some((k) => serialKeys.has(k))) {
      return flag;
    }

    if (!byClient && clientId && String(other.clientId || '') === clientId) {
      byClient = flag;
    }
  }

  return serialKeys.size ? '' : byClient;
}

/**
 * @param {object} [meta]
 * @param {{ suggested?: ''|'sim'|'nao'|'na' }} [options]
 */
export function renderReclamacaoGarantiaField(meta = {}, { suggested = '' } = {}) {
  if (isOrcamentoPropostaVenda(meta)) {
    return `
    <div class="review-orc-field review-orc-field--reclamacao-garantia review-orc-field--readonly" data-orc-garantia-wrap>
      <span>Avaria / reclamação em garantia?</span>
      <p class="review-orc-readonly" aria-readonly="true">N/A</p>
      <input type="hidden" data-orc-field="reclamacaoGarantia" value="na" />
      <span class="review-orc-field-hint text-muted">Não se aplica a proposta de venda.</span>
    </div>`;
  }

  const stored = normalizeReclamacaoGarantia(meta.reclamacaoGarantia);
  const suggestion = normalizeReclamacaoGarantia(suggested);
  const current = stored === 'na' ? '' : stored || (suggestion === 'na' ? '' : suggestion);
  const options = RECLAMACAO_GARANTIA_OPTIONS.filter((o) => o.value !== 'na')
    .map(
      ({ value, label }) =>
        `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`,
    )
    .join('');
  const hint =
    !stored && suggestion && suggestion !== 'na'
      ? `Sugerido pelo histórico (${suggestion === 'sim' ? 'Sim' : 'Não'}) — confirme ou altere. Registo para auditoria — não entra no PDF ao cliente.`
      : 'Decisão RH com base no histórico. Registo para auditoria — não entra no PDF ao cliente.';
  return `
    <label class="review-orc-field review-orc-field--reclamacao-garantia" data-orc-garantia-wrap>
      <span>Avaria / reclamação em garantia?</span>
      <select class="review-orc-input" data-orc-field="reclamacaoGarantia"${
        !stored && suggestion && suggestion !== 'na' ? ' data-orc-garantia-suggested="1"' : ''
      }>
        ${options}
      </select>
      <span class="review-orc-field-hint text-muted">${hint}</span>
    </label>`;
}
