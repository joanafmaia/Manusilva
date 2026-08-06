/**
 * Flag RH — proposta associada a avaria / reclamação em garantia (auditoria).
 * Não aparece no PDF ao cliente; só meta interna + lista/exportações.
 */

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

/** Campo select para o editor RH (orçamento livre e templates). */
export function renderReclamacaoGarantiaField(meta = {}) {
  const current = normalizeReclamacaoGarantia(meta.reclamacaoGarantia);
  const options = RECLAMACAO_GARANTIA_OPTIONS.map(
    ({ value, label }) =>
      `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`,
  ).join('');
  return `
    <label class="review-orc-field review-orc-field--reclamacao-garantia">
      <span>Avaria / reclamação em garantia?</span>
      <select class="review-orc-input" data-orc-field="reclamacaoGarantia">
        ${options}
      </select>
      <span class="review-orc-field-hint text-muted">
        Decisão RH com base no histórico. Registo para auditoria — não entra no PDF ao cliente.
      </span>
    </label>`;
}
