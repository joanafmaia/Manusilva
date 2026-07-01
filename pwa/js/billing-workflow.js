/**
 * Faturação interna — contas a receber e fluxo de caixa.
 */

import {
  dedupeReportsForDisplay,
  formatRelatoriosError,
  getReportsSnapshot,
  updateRelatorio,
} from './relatorios-db.js';
import { normalizeFaturaCondicao, normalizeStatusRecebimento } from './billing-constants.js';
import { sameEntityId } from './entity-id.js';
import { addDaysToIsoDate } from './date-utils.js';
import { showToast } from './toast-modal.js';

function findReport(reportId) {
  return getReportsSnapshot().find((r) => sameEntityId(r.id, reportId)) || null;
}

/** Relatório aprovado ainda por faturar (controlo interno) */
export function isPendingBilling(report) {
  if (!report || report.status !== 'approved') return false;
  const fs = report.faturacaoStatus;
  return fs === 'pendente' || !fs;
}

export function getPendingBillingReports() {
  return dedupeReportsForDisplay(getReportsSnapshot().filter(isPendingBilling)).sort(
    (a, b) => String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')),
  );
}

/**
 * Calcula data_vencimento a partir da condição de pagamento e data de emissão.
 */
export function resolveInvoiceDueDate(condicaoPagamento, dataEmissao) {
  const condicao = normalizeFaturaCondicao(condicaoPagamento);
  if (condicao === '30_dias') return addDaysToIsoDate(dataEmissao, 30);
  if (condicao === '60_dias') return addDaysToIsoDate(dataEmissao, 60);
  return dataEmissao;
}

/** Campos financeiros da fatura (condição + recebimento independentes). */
export function resolveInvoiceBillingFields(condicaoPagamento, statusRecebimento, dataEmissao) {
  const faturaCondicaoPagamento = normalizeFaturaCondicao(condicaoPagamento);
  const status = normalizeStatusRecebimento(statusRecebimento);
  return {
    faturaCondicaoPagamento,
    statusRecebimento: status,
    dataVencimento: resolveInvoiceDueDate(faturaCondicaoPagamento, dataEmissao),
  };
}

/** Relatórios já faturados com cobrança em aberto */
export function getPendingPaymentInvoices() {
  return dedupeReportsForDisplay(
    getReportsSnapshot().filter(
      (r) => r.faturacaoStatus === 'faturado' && r.statusRecebimento === 'pendente',
    ),
  ).sort((a, b) =>
    String(a.dataVencimento || a.dataFatura || '').localeCompare(
      String(b.dataVencimento || b.dataFatura || ''),
    ),
  );
}

/** Métricas de fluxo de caixa (faturas emitidas na app) */
export function getBillingFinancialMetrics() {
  const invoiced = dedupeReportsForDisplay(
    getReportsSnapshot().filter((r) => r.faturacaoStatus === 'faturado'),
  );
  let totalFaturado = 0;
  let totalRecebido = 0;
  let totalDivida = 0;

  invoiced.forEach((r) => {
    const valor = Number(r.valorFaturado);
    if (!Number.isFinite(valor) || valor <= 0) return;
    totalFaturado += valor;
    if (r.statusRecebimento === 'pago') totalRecebido += valor;
    else if (r.statusRecebimento === 'pendente') totalDivida += valor;
  });

  return { totalFaturado, totalRecebido, totalDivida };
}

/** Regista fatura emitida externamente — contas a receber */
export async function registerReportInvoice(
  reportId,
  { numeroFatura, dataFatura, valorFaturado, condicaoPagamento, statusRecebimento },
) {
  const report = findReport(reportId);
  if (!report) throw new Error('Relatório não encontrado.');
  if (!isPendingBilling(report)) {
    throw new Error('Este relatório já não está pendente de faturação.');
  }

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const valor = Number(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Indique um valor total faturado válido.');
  }

  const billing = resolveInvoiceBillingFields(condicaoPagamento, statusRecebimento, data);

  await updateRelatorio(reportId, {
    faturacaoStatus: 'faturado',
    numeroFatura: numero,
    dataFatura: data,
    valorFaturado: Math.round(valor * 100) / 100,
    faturaCondicaoPagamento: billing.faturaCondicaoPagamento,
    statusRecebimento: billing.statusRecebimento,
    dataVencimento: billing.dataVencimento,
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/** Retira relatório aprovado da fila «por faturar» (mantém o relatório técnico). */
export async function dismissPendingBillingReport(reportId) {
  const report = findReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }
  if (!isPendingBilling(report)) {
    showToast('Este relatório já não está pendente de faturação.', 'info');
    return false;
  }

  try {
    await updateRelatorio(reportId, { faturacaoStatus: 'dispensado' });
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Relatório retirado da lista por faturar.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] dismissPendingBillingReport:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
    return false;
  }
}

/** Confirma recebimento de uma fatura pendente */
export async function confirmInvoicePayment(reportId, { dataRecebimento } = {}) {
  const report = findReport(reportId);
  if (!report) throw new Error('Fatura não encontrada.');
  if (report.faturacaoStatus !== 'faturado') {
    throw new Error('Este relatório ainda não foi faturado.');
  }
  if (report.statusRecebimento === 'pago') {
    throw new Error('Este recebimento já foi confirmado.');
  }

  const data = String(dataRecebimento ?? new Date().toISOString()).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Indique uma data de recebimento válida.');
  }

  await updateRelatorio(reportId, {
    statusRecebimento: 'pago',
    dataRecebimento: data,
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}
