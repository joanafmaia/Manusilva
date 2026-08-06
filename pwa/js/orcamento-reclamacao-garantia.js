/**
 * Flag RH — proposta associada a avaria / reclamação em garantia (auditoria).
 * Não aparece no PDF ao cliente; só meta interna + lista/exportações.
 */

import { getReportsSnapshot } from './relatorios-db.js';

export const RECLAMACAO_GARANTIA_OPTIONS = [
  { value: '', label: '— Não indicado' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
];

/** @returns {''|'sim'|'nao'} */
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
  return '';
}

export function formatReclamacaoGarantiaLabel(value, { empty = '—' } = {}) {
  const key = normalizeReclamacaoGarantia(value);
  if (key === 'sim') return 'Sim';
  if (key === 'nao') return 'Não';
  return empty;
}

export function formatReclamacaoGarantiaAuditLabel(value) {
  const key = normalizeReclamacaoGarantia(value);
  if (key === 'sim') return 'Sim';
  if (key === 'nao') return 'Não';
  return 'Não indicado';
}

export function getReportReclamacaoGarantia(report) {
  const meta = report?.data?.orcamento;
  if (!meta || typeof meta !== 'object') return '';
  return normalizeReclamacaoGarantia(meta.reclamacaoGarantia);
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
 * @returns {''|'sim'|'nao'}
 */
export function suggestReclamacaoGarantia(report, allReports = null) {
  if (!report) return '';
  const current = getReportReclamacaoGarantia(report);
  if (current) return current;

  const snapshot = Array.isArray(allReports) ? allReports : getReportsSnapshot();
  const serialKeys = new Set(resolveReportGarantiaSerialKeys(report));
  const clientId = String(report.clientId || '').trim();
  let byClient = '';

  for (const other of snapshot) {
    if (!other || String(other.id) === String(report.id)) continue;
    const flag = getReportReclamacaoGarantia(other);
    if (!flag) continue;

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
 * @param {{ suggested?: ''|'sim'|'nao' }} [options]
 */
export function renderReclamacaoGarantiaField(meta = {}, { suggested = '' } = {}) {
  const stored = normalizeReclamacaoGarantia(meta.reclamacaoGarantia);
  const suggestion = normalizeReclamacaoGarantia(suggested);
  const current = stored || suggestion;
  const options = RECLAMACAO_GARANTIA_OPTIONS.map(
    ({ value, label }) =>
      `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`,
  ).join('');
  const hint =
    !stored && suggestion
      ? `Sugerido pelo histórico (${suggestion === 'sim' ? 'Sim' : 'Não'}) — confirme ou altere. Registo para auditoria — não entra no PDF ao cliente.`
      : 'Decisão RH com base no histórico. Registo para auditoria — não entra no PDF ao cliente.';
  return `
    <label class="review-orc-field review-orc-field--reclamacao-garantia">
      <span>Avaria / reclamação em garantia?</span>
      <select class="review-orc-input" data-orc-field="reclamacaoGarantia"${
        !stored && suggestion ? ' data-orc-garantia-suggested="1"' : ''
      }>
        ${options}
      </select>
      <span class="review-orc-field-hint text-muted">${hint}</span>
    </label>`;
}
