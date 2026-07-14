/**
 * Tipo de proposta comercial MS.015 — classificação para listagem e relatório anual.
 */

import { isBatteryService } from './service-constants.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';

function escAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export const ORCAMENTO_TIPO_PROPOSTA = Object.freeze({
  MANUTENCAO_MAQUINA: 'manutencao_maquina',
  MANUTENCAO_BATERIA: 'manutencao_bateria',
  ORCAMENTO: 'orcamento',
});

export const ORCAMENTO_TIPO_PROPOSTA_OPTIONS = [
  { value: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA, label: 'Proposta Manutenção Máquina' },
  { value: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA, label: 'Proposta Manutenção Bateria' },
  { value: ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO, label: 'Orçamento' },
];

const LABEL_BY_VALUE = new Map(ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map((o) => [o.value, o.label]));

export function isValidOrcamentoTipoProposta(value) {
  return LABEL_BY_VALUE.has(String(value || '').trim());
}

export function formatOrcamentoTipoPropostaLabel(value) {
  const key = String(value || '').trim();
  return LABEL_BY_VALUE.get(key) || 'Orçamento';
}

/** Valor guardado em `dados.orcamento.tipoProposta` (com inferência se em falta). */
export function getOrcamentoTipoProposta(report) {
  const meta = getReportOrcamentoMeta(report);
  const stored = String(meta?.tipoProposta || '').trim();
  if (isValidOrcamentoTipoProposta(stored)) return stored;
  return suggestOrcamentoTipoProposta(report);
}

/** Sugere tipo a partir do relatório técnico de origem ou do fluxo (standalone / folha obra). */
export function suggestOrcamentoTipoProposta(report) {
  const meta = getReportOrcamentoMeta(report);
  const stored = String(meta?.tipoProposta || '').trim();
  if (isValidOrcamentoTipoProposta(stored)) return stored;

  if (reportIsStandaloneOrcamento(report) || reportIsFolhaObraOrcamento(report)) {
    return ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
  }

  const serviceType = String(report?.serviceType || '');
  if (isBatteryService(serviceType) || /bateria/i.test(serviceType)) {
    return ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA;
  }

  if (
    /empilhador|maquina|carregador|dl50|avaria|preventiva|corretiva|inspecao/i.test(serviceType) &&
    !/bateria/i.test(serviceType)
  ) {
    return ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA;
  }

  return ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
}

export function normalizeOrcamentoTipoProposta(value, report = null) {
  const key = String(value || '').trim();
  if (isValidOrcamentoTipoProposta(key)) return key;
  return report ? suggestOrcamentoTipoProposta(report) : ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
}

/** Data de referência para agrupamento anual (envio > atualização > aprovação). */
export function resolveOrcamentoReferenceDate(report) {
  const meta = getReportOrcamentoMeta(report);
  const raw =
    meta?.enviadoEm ||
    meta?.atualizadoEm ||
    report?.approvedAt ||
    report?.submittedAt ||
    '';
  const iso = String(raw || '').trim();
  if (!iso) return '';
  return iso.split('T')[0];
}

export function resolveOrcamentoReferenceYear(report) {
  const date = resolveOrcamentoReferenceDate(report);
  if (!date || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/** Proposta com conteúdo MS.015 guardado (exclui «por preparar» sem meta). */
export function reportHasOrcamentoContent(report) {
  const meta = getReportOrcamentoMeta(report);
  if (!meta || typeof meta !== 'object') return false;
  if (meta.enviadoEm || meta.numeroFormatado || meta.numeroSequencial) return true;
  const linhas = Array.isArray(meta.linhas) ? meta.linhas : [];
  return linhas.some((row) => String(row?.descricao || '').trim());
}

export function renderOrcamentoTipoPropostaSelect(value, { fieldId = 'orc-tipo-proposta', required = true } = {}) {
  const current = normalizeOrcamentoTipoProposta(value);
  const options = ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
    ({ value: v, label }) =>
      `<option value="${escAttr(v)}"${v === current ? ' selected' : ''}>${escAttr(label)}</option>`,
  ).join('');

  return `
    <label class="review-orc-field">
      <span>Tipo</span>
      <select class="review-orc-input" id="${escAttr(fieldId)}" data-orc-field="tipoProposta"${required ? ' required' : ''}>
        ${options}
      </select>
      <span class="review-orc-field-hint text-muted">Classificação para relatórios e exportação anual.</span>
    </label>`;
}
