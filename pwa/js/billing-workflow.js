/**
 * Faturação interna — contas a receber e fluxo de caixa.
 */

import {
  dedupeReportsForDisplay,
  formatRelatoriosError,
  getReportsSnapshot,
  updateRelatorio,
} from './relatorios-db.js';
import { normalizeStatusRecebimento } from './billing-constants.js';
import { sameEntityId } from './entity-id.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { getClient } from './entity-lookups.js';
import {
  getReportOrcamentoPdfUrl,
  getReportTechnicalPdfUrl,
  reportIsCommercialOrcamento,
  reportPedidoOrcamentoRoutesToOrcamentosTab,
} from './pedido-orcamento.js';
import { isPendingOrcamentoBilling } from './orcamento-billing-workflow.js';
import { getInvoicedServicos } from './servicos-db.js';
import { getJob } from './entity-lookups.js';

function findReport(reportId) {
  return getReportsSnapshot().find((r) => sameEntityId(r.id, reportId)) || null;
}

function safeGetClient(clientId) {
  if (clientId == null || clientId === '') return null;
  try {
    return getClient(clientId);
  } catch {
    return null;
  }
}

function reportNumeroOrdem(report) {
  if (!report?.jobId) return null;
  const job = getJob(report.jobId);
  const n = job?.numeroOrdem;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : null;
}

/** Outro relatório da mesma OP é proposta comercial — não faturar duplicado técnico. */
function sharesNumeroOrdemWithCommercialOrcamento(report, allReports) {
  const ordem = reportNumeroOrdem(report);
  if (ordem == null) return false;
  return allReports.some((other) => {
    if (sameEntityId(other.id, report.id)) return false;
    if (!reportIsCommercialOrcamento(other)) return false;
    return reportNumeroOrdem(other) === ordem;
  });
}

/** Relatório aprovado de visita que conta para faturação (exclui só proposta MS.015). */
export function isServicoReportBillable(report) {
  if (!report || report.status !== 'approved') return false;
  return !reportIsCommercialOrcamento(report);
}

/** Compara URLs do Storage ignorando query string (?v= cache bust). */
export function normalizeStoragePdfUrl(url) {
  return String(url || '').trim().split('?')[0];
}

function isSameStoragePdfUrl(a, b) {
  const left = normalizeStoragePdfUrl(a);
  const right = normalizeStoragePdfUrl(b);
  return Boolean(left && right && left === right);
}

/** Exclui MS.015 quando a fila «por faturar» pede o relatório técnico da OP. */
function filterTechnicalBillingPdfUrls(report, urls = []) {
  const orcamentoUrl = getReportOrcamentoPdfUrl(report);
  if (!orcamentoUrl) {
    return urls.map((url) => String(url).trim()).filter(Boolean);
  }
  return urls
    .map((url) => String(url).trim())
    .filter(Boolean)
    .filter((url) => !isSameStoragePdfUrl(url, orcamentoUrl));
}

/**
 * PDFs para o painel Faturação — intervenção técnica, não MS.015.
 * Orçamento comercial só quando a proposta aceite está na fila de faturação.
 */
export function resolveBillingReportPdfEntries(report, getJobFn = getJob) {
  if (!report) return [];

  if (isPendingOrcamentoBilling(report)) {
    const orcamentoUrl = getReportOrcamentoPdfUrl(report);
    if (orcamentoUrl) {
      const meta = getReportOrcamentoMeta(report);
      const label = meta?.numeroFormatado
        ? `Proposta nº ${meta.numeroFormatado}`
        : 'Proposta comercial MS.015';
      return [{ url: orcamentoUrl, label }];
    }
  }

  const rawUrls = Array.isArray(report?.data?.urlPdfs) ? report.data.urlPdfs.filter(Boolean) : [];
  const names = Array.isArray(report?.data?.pdfFilenames) ? report.data.pdfFilenames : [];
  const urls = filterTechnicalBillingPdfUrls(report, rawUrls);
  if (urls.length) {
    return urls.map((url, index) => {
      const rawIndex = rawUrls.findIndex((candidate) => isSameStoragePdfUrl(candidate, url));
      const nameIndex = rawIndex >= 0 ? rawIndex : index;
      return {
        url,
        label: names[nameIndex] || `Relatório ${index + 1}`,
      };
    });
  }

  const rawTechnical = getReportTechnicalPdfUrl(report);
  const technicalUrls = rawTechnical
    ? filterTechnicalBillingPdfUrls(report, [rawTechnical])
    : [];
  if (technicalUrls.length) {
    return [{ url: technicalUrls[0], label: 'Relatório técnico' }];
  }

  const job = report.jobId ? getJobFn(report.jobId) : null;
  const jobUrl = job?.urlPdf && String(job.urlPdf).trim() ? String(job.urlPdf).trim() : '';
  const jobTechnicalUrls = filterTechnicalBillingPdfUrls(report, jobUrl ? [jobUrl] : []);
  if (jobTechnicalUrls.length) {
    return [{ url: jobTechnicalUrls[0], label: 'Relatório técnico' }];
  }

  return [];
}

/** Relatório da visita cujo PDF técnico está disponível (para botão PDF na fila). */
export function resolvePrimaryBillingReportId(reports = []) {
  for (const report of reports) {
    if (resolveBillingReportPdfEntries(report).length) {
      return String(report.id);
    }
  }
  return reports[0]?.id ? String(reports[0].id) : '';
}

/** Relatório aprovado ainda por faturar (controlo interno; exclui visitas e propostas comerciais). */
export function isPendingBilling(report, allReports = null) {
  if (!report || report.status !== 'approved') return false;
  if (reportPedidoOrcamentoRoutesToOrcamentosTab(report, safeGetClient(report.clientId))) {
    return false;
  }
  if (report.servicoId) return false;
  const snapshot = allReports || getReportsSnapshot();
  if (reportIsCommercialOrcamento(report)) return false;
  if (sharesNumeroOrdemWithCommercialOrcamento(report, snapshot)) return false;
  if (isPendingOrcamentoBilling(report)) return false;
  const fs = report.faturacaoStatus;
  if (fs === 'via_servico' || fs === 'dispensado' || fs === 'faturado') return false;
  if (fs === 'aguarda_aceite_orcamento') return false;
  return fs === 'pendente' || !fs;
}

export function getPendingBillingReports() {
  const snapshot = getReportsSnapshot();
  return dedupeReportsForDisplay(snapshot.filter((r) => isPendingBilling(r, snapshot))).sort(
    (a, b) => String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')),
  );
}

/**
 * Campos financeiros da fatura — pronto-pagamento fixo; vencimento = data de emissão.
 */
export function resolveInvoiceDueDate(_condicaoPagamento, dataEmissao) {
  return dataEmissao;
}

/** Estado de recebimento + vencimento (condição de pagamento removida da UI — sempre pronto-pagamento). */
export function resolveInvoiceBillingFields(statusRecebimento, dataEmissao) {
  const status = normalizeStatusRecebimento(statusRecebimento);
  return {
    faturaCondicaoPagamento: 'pronto_pagamento',
    statusRecebimento: status,
    dataVencimento: resolveInvoiceDueDate('pronto_pagamento', dataEmissao),
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

function accumulateInvoiceMetrics(entity, totals) {
  const valor = Number(entity.valorFaturado);
  if (!Number.isFinite(valor) || valor <= 0) return;
  totals.totalFaturado += valor;
  if (entity.statusRecebimento === 'pago') totals.totalRecebido += valor;
  else if (entity.statusRecebimento === 'pendente') totals.totalDivida += valor;
}

/** Métricas de fluxo de caixa (faturas emitidas na app — relatórios, visitas e manuais). */
export function getBillingFinancialMetrics(getManualInvoicesFn = () => []) {
  const invoicedReports = dedupeReportsForDisplay(
    getReportsSnapshot().filter((r) => r.faturacaoStatus === 'faturado' && !r.servicoId),
  );
  const totals = { totalFaturado: 0, totalRecebido: 0, totalDivida: 0 };

  invoicedReports.forEach((r) => accumulateInvoiceMetrics(r, totals));
  getInvoicedServicos().forEach((s) => accumulateInvoiceMetrics(s, totals));
  getManualInvoicesFn().forEach((item) => accumulateInvoiceMetrics(item, totals));

  return totals;
}

/** Valor da faturação pode ficar em branco quando a fatura agrega vários relatórios. */
export function normalizeInvoiceAmountInput(valorFaturado) {
  const valorRaw = String(valorFaturado ?? '').trim().replace(',', '.');
  if (!valorRaw) return { value: null, isBlank: true };
  const value = Number(valorRaw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Indique um valor total faturado válido.');
  }
  return { value, isBlank: false };
}

/** Regista fatura emitida externamente — contas a receber */
export async function registerReportInvoice(
  reportId,
  { numeroFatura, dataFatura, valorFaturado, statusRecebimento },
) {
  const report = findReport(reportId);
  if (!report) throw new Error('Relatório não encontrado.');
  if (!isPendingBilling(report) && !isPendingOrcamentoBilling(report)) {
    throw new Error('Este relatório já não está pendente de faturação.');
  }

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const { value: valor } = normalizeInvoiceAmountInput(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');

  const billing = resolveInvoiceBillingFields(statusRecebimento, data);

  await updateRelatorio(reportId, {
    faturacaoStatus: 'faturado',
    numeroFatura: numero,
    dataFatura: data,
    valorFaturado: valor == null ? null : Math.round(valor * 100) / 100,
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
  if (!isPendingBilling(report) && !isPendingOrcamentoBilling(report)) {
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

/**
 * Reverte fatura de relatório para «por faturar» (ex.: valor errado).
 * Só permitido enquanto o recebimento não foi confirmado.
 */
export async function revertReportInvoice(reportId) {
  const report = findReport(reportId);
  if (!report) throw new Error('Relatório não encontrado.');
  if (report.servicoId) {
    throw new Error('Esta fatura pertence a uma visita — corrija pela linha da visita.');
  }
  if (report.faturacaoStatus !== 'faturado') {
    throw new Error('Este relatório ainda não foi faturado.');
  }
  if (report.statusRecebimento === 'pago') {
    throw new Error('Não é possível reverter — o recebimento já foi confirmado.');
  }

  await updateRelatorio(reportId, {
    faturacaoStatus: 'pendente',
    numeroFatura: null,
    dataFatura: null,
    valorFaturado: null,
    faturaCondicaoPagamento: null,
    statusRecebimento: null,
    dataVencimento: null,
    dataRecebimento: null,
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}
