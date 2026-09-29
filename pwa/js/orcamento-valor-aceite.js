/**
 * Valor aceite / negociado da proposta MS.015 (aceite parcial).
 * O PDF original não muda; o valor para faturação pode ser outro, com motivo.
 */

import {
  computeOrcamentoTotals,
  formatEuro,
  getReportOrcamentoMeta,
  parseOrcamentoNumber,
} from './orcamento-linhas.js';
import { escapeHtml } from './html-utils.js';

export const ORCAMENTO_VALOR_ACEITE_FIELD = 'valorAceite';
export const ORCAMENTO_MOTIVO_VALOR_FIELD = 'motivoValorAceite';

/** Total original da proposta (linhas + taxas, com IVA). */
export function resolveOrcamentoValorPropostaOriginal(report) {
  const meta = getReportOrcamentoMeta(report);
  if (!meta) return 0;
  const fromMeta = parseOrcamentoNumber(meta.total);
  if (fromMeta > 0) return fromMeta;
  const totals = computeOrcamentoTotals(meta.linhas, meta);
  return totals.total > 0 ? totals.total : 0;
}

/** Valor aceite registado (negociação / aceite parcial), ou null se igual ao original. */
export function resolveOrcamentoValorAceiteNumber(report) {
  const meta = getReportOrcamentoMeta(report) || {};
  const raw = meta[ORCAMENTO_VALOR_ACEITE_FIELD];
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseOrcamentoNumber(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolveOrcamentoMotivoValorAceite(report) {
  const meta = getReportOrcamentoMeta(report) || {};
  return String(meta[ORCAMENTO_MOTIVO_VALOR_FIELD] || '').trim();
}

/**
 * Valor a faturar: aceite/negociado se existir; senão total da proposta.
 * (Não usa faturacaoValorSugerido — esse é atualizado a partir daqui no aceite.)
 */
export function resolveOrcamentoValorParaFaturacao(report) {
  const aceite = resolveOrcamentoValorAceiteNumber(report);
  if (aceite != null) return aceite;
  return resolveOrcamentoValorPropostaOriginal(report);
}

export function normalizeValorAceiteInput(value) {
  const pure = String(value ?? '').trim();
  if (!pure) return null;
  const normalized = pure.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Indique um valor aceite válido (€).');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Indique um valor aceite válido (€).');
  }
  return Math.round(n * 100) / 100;
}

export function formatOrcamentoValorAceiteInput(report) {
  const n = resolveOrcamentoValorAceiteNumber(report);
  if (n == null) return '';
  return formatEuro(n);
}

export function readOrcamentoValorAceiteFromDom(root) {
  const valorEl = root?.querySelector?.(`[data-orc-field="${ORCAMENTO_VALOR_ACEITE_FIELD}"]`);
  const motivoEl = root?.querySelector?.(`[data-orc-field="${ORCAMENTO_MOTIVO_VALOR_FIELD}"]`);
  if (!valorEl && !motivoEl) return null;
  return {
    valorAceite: valorEl ? String(valorEl.value || '').trim() : '',
    motivoValorAceite: motivoEl ? String(motivoEl.value || '').trim() : '',
  };
}

/** Campos no editor (após envio / resposta do cliente). */
export function renderOrcamentoValorAceiteFields(report) {
  const original = resolveOrcamentoValorPropostaOriginal(report);
  const valorValue = escapeHtml(formatOrcamentoValorAceiteInput(report));
  const motivoValue = escapeHtml(resolveOrcamentoMotivoValorAceite(report));
  const originalLabel = original > 0 ? `${formatEuro(original)} €` : '—';
  return `
    <div class="review-orc-valor-aceite" data-orc-valor-aceite-block>
      <p class="review-orc-valor-aceite__original text-muted">
        Valor da proposta enviada: <strong>${escapeHtml(originalLabel)}</strong>
      </p>
      <label class="review-orc-field">
        <span>Valor aceite / negociado (€)</span>
        <input
          type="text"
          class="review-orc-input review-orc-input--money"
          data-orc-field="${ORCAMENTO_VALOR_ACEITE_FIELD}"
          value="${valorValue}"
          inputmode="decimal"
          placeholder="${escapeHtml(original > 0 ? formatEuro(original) : '0,00')}"
        />
        <span class="review-orc-field-hint text-muted">
          Deixe vazio para usar o total da proposta. Preencha se o cliente aceitou só parte ou negociou outro valor (com IVA).
        </span>
      </label>
      <label class="review-orc-field">
        <span>Motivo / nota do aceite</span>
        <textarea
          class="review-orc-input"
          data-orc-field="${ORCAMENTO_MOTIVO_VALOR_FIELD}"
          rows="2"
          placeholder="ex.: Aceitou só a reparação do carregador; desconto comercial 10%"
        >${motivoValue}</textarea>
      </label>
    </div>`;
}

/** Campos compactos na lista de Orçamentos (junto ao Aceite). */
export function renderOrcamentoValorAceiteInline(report, { idPrefix = '' } = {}) {
  const original = resolveOrcamentoValorPropostaOriginal(report);
  const valorValue = escapeHtml(formatOrcamentoValorAceiteInput(report));
  const motivoValue = escapeHtml(resolveOrcamentoMotivoValorAceite(report));
  const prefix = idPrefix || String(report?.id || 'x').replace(/[^\w-]/g, '');
  return `
    <div class="orcamentos-valor-aceite-inline" data-orc-valor-aceite-inline="${escapeHtml(String(report?.id || ''))}">
      <label class="orcamentos-valor-aceite-inline__valor" title="Valor aceite (€). Vazio = total da proposta (${original > 0 ? formatEuro(original) : '—'} €)">
        <span class="orcamentos-valor-aceite-inline__label">€</span>
        <input
          type="text"
          class="form-input form-input-sm orcamentos-valor-aceite-input"
          id="orc-valor-aceite-${escapeHtml(prefix)}"
          data-orc-field="${ORCAMENTO_VALOR_ACEITE_FIELD}"
          value="${valorValue}"
          inputmode="decimal"
          placeholder="${escapeHtml(original > 0 ? formatEuro(original) : 'valor')}"
          aria-label="Valor aceite ou negociado em euros"
        />
      </label>
      <input
        type="text"
        class="form-input form-input-sm orcamentos-motivo-aceite-input"
        id="orc-motivo-aceite-${escapeHtml(prefix)}"
        data-orc-field="${ORCAMENTO_MOTIVO_VALOR_FIELD}"
        value="${motivoValue}"
        placeholder="Motivo (opcional)"
        title="Motivo do valor aceite / aceite parcial"
        aria-label="Motivo do valor aceite"
      />
    </div>`;
}
