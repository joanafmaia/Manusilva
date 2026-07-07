/**
 * Faturação por visita (serviço) — uma fatura por serviço quando todos os relatórios estão aprovados.
 */

import { getServico, getServicosSnapshot, updateServico, formatServicosError } from './servicos-db.js';
import { updateRelatorio } from './relatorios-db.js';
import { sameEntityId } from './entity-id.js';
import {
  isServicoReportBillable,
  normalizeInvoiceAmountInput,
  resolveInvoiceBillingFields,
  getPendingBillingReports,
} from './billing-workflow.js';
import { getClient } from './entity-lookups.js';
import { getServicoActiveReports, isServicoVisitFullyApproved } from './servicos-email-workflow.js';
import { getPendingOrcamentoBillingReports } from './orcamento-billing-workflow.js';
import { getPendingBillingFolhasObra } from './folhas-obra-db.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { reportPedidoOrcamentoRoutesToOrcamentosTab } from './pedido-orcamento.js';

/** Relatório com faturação delegada ao serviço (não aparece na fila por relatório). */
export const REPORT_FATURACAO_VIA_SERVICO = 'via_servico';

function safeGetClient(clientId) {
  if (clientId == null || clientId === '') return null;
  try {
    return getClient(clientId);
  } catch {
    return null;
  }
}

function servicoRoutesTestPedidoOrcamentoToOrcamentos(servico) {
  if (!servico?.clientId) return false;
  const client = safeGetClient(servico.clientId);
  return getServicoActiveReports(servico.id).some((report) =>
    reportPedidoOrcamentoRoutesToOrcamentosTab(report, client),
  );
}

export function isServicoPendingBilling(servico) {
  if (!servico) return false;
  if (servicoRoutesTestPedidoOrcamentoToOrcamentos(servico)) return false;
  const fs = servico.faturacaoStatus;
  if (fs && fs !== 'pendente') return false;
  const reports = getServicoActiveReports(servico.id);
  if (!reports.length) return false;
  if (!reports.every((r) => r.status === 'approved')) return false;
  return reports.some((r) => isServicoReportBillable(r));
}

export function getPendingBillingServicos() {
  return getServicosSnapshot()
    .filter(isServicoPendingBilling)
    .sort((a, b) => servicoBillingSortKey(a).localeCompare(servicoBillingSortKey(b)));
}

function servicoBillingSortKey(servico) {
  const reports = getServicoActiveReports(servico.id);
  const dates = reports
    .map((r) => String(r.approvedAt || '').split('T')[0])
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || String(servico.approvedAt || servico.date || '');
}

/** Fila «por faturar»: visitas + relatórios legados + propostas standalone aceites. */
export function getPendingBillingItems() {
  const servicos = getPendingBillingServicos().map((servico) => ({
    kind: 'servico',
    id: String(servico.id),
    servico,
    reports: getServicoActiveReports(servico.id),
  }));
  const reports = getPendingBillingReports().map((report) => ({
    kind: 'report',
    id: String(report.id),
    report,
  }));
  const orcamentos = getPendingOrcamentoBillingReports().map((report) => ({
    kind: 'orcamento',
    id: String(report.id),
    report,
  }));
  const folhasObra = getPendingBillingFolhasObra().map((folha) => ({
    kind: 'folha_obra',
    id: String(folha.id),
    folha,
  }));
  return [...servicos, ...reports, ...orcamentos, ...folhasObra].sort((a, b) =>
    billingItemSortKey(a).localeCompare(billingItemSortKey(b)),
  );
}

function billingItemSortKey(item) {
  if (item.kind === 'servico') return servicoBillingSortKey(item.servico);
  if (item.kind === 'orcamento') {
    const meta = getReportOrcamentoMeta(item.report);
    return String(meta?.respostaClienteEm || item.report?.approvedAt || '').split('T')[0];
  }
  if (item.kind === 'folha_obra') {
    return String(item.folha?.submittedAt || item.folha?.maquinaConcluidaEm || '').split('T')[0];
  }
  return String(item.report?.approvedAt || '').split('T')[0];
}

export function getPendingBillingCount() {
  return getPendingBillingItems().length;
}

/** Quando todos os relatórios da visita estão aprovados, marca o serviço como pendente de faturação. */
export async function markServicoPendingBillingIfReady(servicoId) {
  if (!servicoId || !isServicoVisitFullyApproved(servicoId)) return false;

  const servico = getServico(servicoId);
  if (!servico) return false;
  if (servicoRoutesTestPedidoOrcamentoToOrcamentos(servico)) return false;

  const fs = servico.faturacaoStatus;
  if (fs && fs !== 'pendente') return false;

  const reports = getServicoActiveReports(servicoId);
  if (!reports.some((r) => isServicoReportBillable(r))) return false;

  const latestApproval = reports
    .map((r) => r.approvedAt)
    .filter(Boolean)
    .sort()
    .pop();

  await updateServico(servicoId, {
    faturacao_status: 'pendente',
    aprovado_em: latestApproval || servico.approvedAt || new Date().toISOString(),
    estado: 'approved',
  });
  return true;
}

/** Regista fatura emitida externamente — ao nível da visita. */
export async function registerServicoInvoice(
  servicoId,
  { numeroFatura, dataFatura, valorFaturado, statusRecebimento },
) {
  const servico = getServico(servicoId);
  if (!servico) throw new Error('Visita não encontrada.');
  if (!isServicoPendingBilling(servico)) {
    throw new Error('Esta visita já não está pendente de faturação.');
  }

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const { value: valor } = normalizeInvoiceAmountInput(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');

  const billing = resolveInvoiceBillingFields(statusRecebimento, data);

  await updateServico(servicoId, {
    faturacao_status: 'faturado',
    numero_fatura: numero,
    data_fatura: data,
    valor_faturado: valor == null ? null : Math.round(valor * 100) / 100,
    condicao_pagamento: billing.faturaCondicaoPagamento,
    status_recebimento: billing.statusRecebimento,
    data_vencimento: billing.dataVencimento,
  });

  const reports = getServicoActiveReports(servicoId).filter((r) => r.status === 'approved');
  await Promise.all(
    reports.map((r) =>
      updateRelatorio(r.id, {
        faturacaoStatus: REPORT_FATURACAO_VIA_SERVICO,
      }),
    ),
  );

  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/**
 * Reverte fatura de visita para «por faturar» (ex.: valor errado).
 * Só permitido enquanto o recebimento não foi confirmado.
 */
export async function revertServicoInvoice(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) throw new Error('Visita não encontrada.');
  if (servico.faturacaoStatus !== 'faturado') {
    throw new Error('Esta visita ainda não foi faturada.');
  }
  if (servico.statusRecebimento === 'pago') {
    throw new Error('Não é possível reverter — o recebimento já foi confirmado.');
  }

  await updateServico(servicoId, {
    faturacao_status: 'pendente',
    numero_fatura: null,
    data_fatura: null,
    valor_faturado: null,
    condicao_pagamento: null,
    status_recebimento: null,
    data_vencimento: null,
    data_recebimento: null,
  });

  const reports = getServicoActiveReports(servicoId).filter((r) => r.status === 'approved');
  await Promise.all(
    reports.map((r) =>
      updateRelatorio(r.id, {
        faturacaoStatus: 'pendente',
        numeroFatura: null,
        dataFatura: null,
        valorFaturado: null,
        faturaCondicaoPagamento: null,
        statusRecebimento: null,
        dataVencimento: null,
        dataRecebimento: null,
      }),
    ),
  );

  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/** Retira visita aprovada da fila «por faturar». */
export async function dismissPendingBillingServico(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Visita não encontrada.', 'error');
    return false;
  }
  if (!isServicoPendingBilling(servico)) {
    showToast('Esta visita já não está pendente de faturação.', 'info');
    return false;
  }

  try {
    await updateServico(servicoId, { faturacao_status: 'dispensado' });
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Visita retirada da lista por faturar.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] dismissPendingBillingServico:', err);
    showToast(formatServicosError(err), 'error', 9000);
    return false;
  }
}

/** Confirma recebimento de fatura pendente ao nível do serviço. */
export async function confirmServicoInvoicePayment(servicoId, { dataRecebimento } = {}) {
  const servico = getServico(servicoId);
  if (!servico) throw new Error('Fatura não encontrada.');
  if (servico.faturacaoStatus !== 'faturado') {
    throw new Error('Esta visita ainda não foi faturada.');
  }
  if (servico.statusRecebimento === 'pago') {
    throw new Error('Este recebimento já foi confirmado.');
  }

  const data = String(dataRecebimento ?? new Date().toISOString()).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Indique uma data de recebimento válida.');
  }

  await updateServico(servicoId, {
    status_recebimento: 'pago',
    data_recebimento: data,
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/** Resolve id de destaque na faturação (visita ou relatório legado). */
export function resolveBillingFocusTarget(reportId, getReportFn) {
  if (!reportId) return { servicoId: null, reportId: null };
  const report = getReportFn?.(reportId);
  if (report?.servicoId) {
    return { servicoId: String(report.servicoId), reportId: null };
  }
  return { servicoId: null, reportId: String(reportId) };
}

export function sameBillingEntityId(a, b) {
  return sameEntityId(a, b);
}
