/**
 * Pagamentos parciais — valor recebido vs dívida em faturas emitidas.
 */

import { labelStatusRecebimento } from './billing-constants.js';

const MONEY_EPS = 0.005;

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function mapStoredMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function serializeMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function resolveValorFaturado(entity = {}) {
  return roundMoney(entity.valorFaturado);
}

/**
 * Valor já recebido. Faturas antigas só com estado «pago» contam o total faturado.
 */
export function resolveValorRecebido(entity = {}) {
  const faturado = resolveValorFaturado(entity);
  const stored = mapStoredMoney(entity.valorRecebido);
  if (stored != null && stored > 0) return roundMoney(stored);
  if (stored === 0 && entity.statusRecebimento !== 'pago') return 0;
  if (entity.statusRecebimento === 'pago') return faturado;
  return 0;
}

export function resolveValorDivida(entity = {}) {
  const faturado = resolveValorFaturado(entity);
  const recebido = resolveValorRecebido(entity);
  if (faturado <= 0) return 0;
  return roundMoney(Math.max(0, faturado - recebido));
}

export function deriveStatusRecebimento(valorFaturado, valorRecebido) {
  const faturado = roundMoney(valorFaturado);
  const recebido = roundMoney(valorRecebido);
  if (recebido <= MONEY_EPS) return 'pendente';
  if (faturado > MONEY_EPS && recebido + MONEY_EPS < faturado) return 'parcial';
  return 'pago';
}

export function resolveStatusRecebimento(entity = {}) {
  return deriveStatusRecebimento(resolveValorFaturado(entity), resolveValorRecebido(entity));
}

export function isInvoiceFullyPaid(entity = {}) {
  return resolveStatusRecebimento(entity) === 'pago';
}

/** Tab «Por receber»: ainda há dívida (pendente ou parcial). */
export function isInvoiceAwaitingReceipt(entity = {}) {
  return !isInvoiceFullyPaid(entity);
}

export function parseReceiptAmountInput(raw) {
  const valorRaw = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (!valorRaw) return { value: null, isBlank: true };
  const value = Number(valorRaw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Indique um valor recebido válido.');
  }
  return { value: roundMoney(value), isBlank: false };
}

/**
 * Acumula um recebimento. Campo vazio = liquida o restante.
 * @returns {{ valorRecebido: number, statusRecebimento: string, dataRecebimento: string }}
 */
export function buildReceiptPatch(entity, { valorRecebidoAgora, dataRecebimento } = {}) {
  const data = String(dataRecebimento ?? new Date().toISOString())
    .trim()
    .split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Indique uma data de recebimento válida.');
  }

  const faturado = resolveValorFaturado(entity);
  const jaRecebido = resolveValorRecebido(entity);
  const emDivida = resolveValorDivida(entity);
  const parsed = parseReceiptAmountInput(valorRecebidoAgora);

  let incremento = parsed.isBlank ? emDivida : parsed.value;
  if (incremento <= MONEY_EPS) {
    if (faturado <= MONEY_EPS && parsed.isBlank) {
      throw new Error('Indique o valor recebido.');
    }
    throw new Error('Esta fatura já não tem valor em dívida.');
  }

  if (faturado > MONEY_EPS && incremento > emDivida + MONEY_EPS) {
    throw new Error(
      `O valor excede a dívida (${emDivida.toFixed(2).replace('.', ',')} €).`,
    );
  }

  const novoRecebido = roundMoney(jaRecebido + incremento);
  const capped = faturado > MONEY_EPS ? Math.min(novoRecebido, faturado) : novoRecebido;
  const statusRecebimento = deriveStatusRecebimento(faturado, capped);

  return {
    valorRecebido: capped,
    statusRecebimento,
    dataRecebimento: data,
  };
}

export function initialValorRecebidoForStatus(statusRecebimento, valorFaturado) {
  if (statusRecebimento === 'pago') return serializeMoney(valorFaturado) ?? 0;
  return 0;
}

export function describeInvoicePayment(entity = {}) {
  const status = resolveStatusRecebimento(entity);
  return {
    faturado: resolveValorFaturado(entity),
    recebido: resolveValorRecebido(entity),
    divida: resolveValorDivida(entity),
    status,
    statusLabel: labelStatusRecebimento(status),
    fullyPaid: status === 'pago',
    awaitingReceipt: status !== 'pago',
  };
}
