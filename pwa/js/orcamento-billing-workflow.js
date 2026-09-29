/**
 * Faturação de propostas MS.015 — só propostas RH sem relatório de visita.
 * Pedido técnico no relatório fatura a visita; folha R.C. fatura a folha.
 */

import {
  computeOrcamentoTotals,
  getReportOrcamentoMeta,
} from './orcamento-linhas.js';
import { ORCAMENTO_RESPOSTA } from './orcamento-workflow.js';
import { reportHasPedidoOrcamento, reportIsRhOrcamento, reportIsStandaloneOrcamento } from './pedido-orcamento.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';
import { resolveServicoIdForReport } from './servicos-panel-utils.js';
import {
  formatRelatoriosError,
  getReportsSnapshot,
  uniqueReportsById,
  updateRelatorio,
} from './relatorios-db.js';
import { showToast } from './toast-modal.js';

/** Proposta comercial — aguarda aceite do cliente (não aparece em «por faturar»). */
export const FATURACAO_AGUARDA_ACEITE_ORCAMENTO = 'aguarda_aceite_orcamento';

/** Pedido de orçamento no relatório da visita — fatura-se a visita, não esta proposta. */
export function reportIsPedidoOrcamentoFromVisit(report) {
  if (!reportHasPedidoOrcamento(report)) return false;
  if (reportIsStandaloneOrcamento(report)) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  return true;
}

export function resolveOrcamentoBillingTotal(report) {
  if (!report) return 0;
  const stored = Number(report?.data?.faturacaoValorSugerido);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const meta = getReportOrcamentoMeta(report);
  if (!meta) return 0;
  const totals = computeOrcamentoTotals(meta.linhas, meta);
  return totals.total > 0 ? totals.total : 0;
}

export function isOrcamentoClienteAceite(report) {
  const meta = getReportOrcamentoMeta(report);
  if (!meta?.enviadoEm) return false;
  return String(meta.respostaCliente || '').trim().toLowerCase() === ORCAMENTO_RESPOSTA.ACEITE;
}

/**
 * Só propostas RH criadas sem relatório de visita entram em «Por faturar».
 * Pedido técnico e folha R.C. faturam a visita / a folha.
 */
export function isPendingOrcamentoBilling(report) {
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (!reportIsStandaloneOrcamento(report)) return false;
  if (!isOrcamentoClienteAceite(report)) return false;

  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'dispensado' || fs === 'via_servico') return false;
  return fs === 'pendente' || !fs || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO;
}

/** Aceite registado mas faturacao_status ainda não sincronizado (reparar na abertura de Faturação). */
export function shouldRepairOrcamentoBilling(report) {
  if (!isOrcamentoClienteAceite(report)) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (!reportIsStandaloneOrcamento(report)) return false;
  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'via_servico') return false;
  if (fs === 'pendente' && report.data?.faturacaoOrigem === 'orcamento_aceite') return false;
  // Inclui «dispensado» legado (migração 021) e «aguarda_aceite_orcamento» após aceite do cliente.
  return true;
}

/** Proposta de pedido de relatório ainda marcada como fila de faturação da proposta. */
export function shouldDetachPedidoOrcamentoFromProposalBilling(report) {
  if (!reportIsPedidoOrcamentoFromVisit(report)) return false;
  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'via_servico' || fs === 'dispensado') return false;
  return fs === 'pendente' || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO || !fs;
}

/** Sincroniza propostas aceites e tira da fila as que vieram de relatório de visita. */
export async function repairOrcamentoAceiteBillingQueue() {
  let repaired = 0;
  for (const report of getReportsSnapshot().filter(shouldRepairOrcamentoBilling)) {
    const saved = await markOrcamentoAceitePendingBilling(report.id);
    if (saved) repaired += 1;
  }
  for (const report of getReportsSnapshot().filter(shouldDetachPedidoOrcamentoFromProposalBilling)) {
    const saved = await markPedidoOrcamentoViaVisit(report.id);
    if (saved) repaired += 1;
  }
  return repaired;
}

export function getPendingOrcamentoBillingReports() {
  return uniqueReportsById(getReportsSnapshot().filter(isPendingOrcamentoBilling)).sort(
    (a, b) => {
      const da =
        getReportOrcamentoMeta(a)?.respostaClienteEm ||
        a.approvedAt ||
        a.submittedAt ||
        '';
      const db =
        getReportOrcamentoMeta(b)?.respostaClienteEm ||
        b.approvedAt ||
        b.submittedAt ||
        '';
      return String(da).localeCompare(String(db));
    },
  );
}

/** Liga o pedido de orçamento à faturação da visita (não cria linha de proposta). */
export async function markPedidoOrcamentoViaVisit(reportId) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsPedidoOrcamentoFromVisit(report)) return null;
  if (report.faturacaoStatus === 'faturado') return report;

  const saved = await updateRelatorio(reportId, {
    faturacaoStatus: 'via_servico',
    data: {
      faturacaoOrigem: 'via_servico_visita',
      faturacaoValorSugerido: null,
    },
  });

  if (saved) mergeReportInCache(saved);

  const servicoId = resolveServicoIdForReport(saved || report);
  if (servicoId) {
    try {
      const { markServicoPendingBillingIfReady } = await import('./servicos-billing-workflow.js');
      await markServicoPendingBillingIfReady(servicoId);
    } catch (err) {
      console.warn('[ManuSilva] markPedidoOrcamentoViaVisit visita:', err);
    }
  }

  window.dispatchEvent(new CustomEvent('db-updated'));
  return saved;
}

/**
 * Marca proposta aceite como pendente de faturação (valor sugerido = total MS.015).
 * Pedido técnico: não entra na fila — fatura-se a visita.
 * @param {string} reportId
 */
export async function markOrcamentoAceitePendingBilling(reportId) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return null;
  if (reportIsFolhaObraOrcamento(report)) return null;
  if (reportIsPedidoOrcamentoFromVisit(report)) {
    return markPedidoOrcamentoViaVisit(reportId);
  }
  if (!reportIsStandaloneOrcamento(report)) return null;

  const meta = getReportOrcamentoMeta(report) || {};
  const aceiteEm = meta.respostaClienteEm || new Date().toISOString();
  const total = resolveOrcamentoBillingTotal({ ...report, data: { ...report.data, orcamento: meta } });

  // Não sobrescrever approvedAt (aprovação RH) com a data de aceite comercial.
  const saved = await updateRelatorio(reportId, {
    faturacaoStatus: 'pendente',
    data: {
      faturacaoValorSugerido: total > 0 ? total : null,
      faturacaoOrigem: 'orcamento_aceite',
      faturacaoAceiteEm: aceiteEm,
    },
  });

  if (saved) mergeReportInCache(saved);
  window.dispatchEvent(new CustomEvent('db-updated'));
  return saved;
}

/** Retira da fila se o aceite for revertido ou marcado como recusada. */
export async function clearOrcamentoBillingOnClienteRecusa(reportId) {
  const { getReport } = await import('./app.js');
  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return false;
  if (reportIsPedidoOrcamentoFromVisit(report)) return false;
  if (report.faturacaoStatus === 'faturado') return false;
  if (!['pendente', FATURACAO_AGUARDA_ACEITE_ORCAMENTO, null, ''].includes(report.faturacaoStatus)) {
    return false;
  }

  try {
    await updateRelatorio(reportId, {
      faturacaoStatus: 'dispensado',
      data: {
        faturacaoValorSugerido: null,
        faturacaoOrigem: null,
      },
    });
    window.dispatchEvent(new CustomEvent('db-updated'));
    return true;
  } catch (err) {
    console.error('[ManuSilva] clearOrcamentoBillingOnClienteRecusa:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
    return false;
  }
}
