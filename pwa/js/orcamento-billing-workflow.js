/**
 * Faturação de propostas MS.015 — escolha RH + defaults por origem.
 * Pedido no relatório: por omissão não fatura a proposta (fatura a visita).
 * Proposta RH do zero: por omissão vai a faturação após aceite.
 * Folha R.C.: nunca fatura como proposta (fatura a folha).
 */

import {
  computeOrcamentoTotals,
  getReportOrcamentoMeta,
} from './orcamento-linhas.js';
import { ORCAMENTO_RESPOSTA } from './orcamento-workflow.js';
import { reportIsRhOrcamento, reportIsStandaloneOrcamento } from './pedido-orcamento.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';
import { resolveServicoIdForReport } from './servicos-panel-utils.js';
import {
  formatRelatoriosError,
  getReportsSnapshot,
  uniqueReportsById,
  updateRelatorio,
} from './relatorios-db.js';
import { showToast } from './toast-modal.js';
import {
  ORCAMENTO_FATURAR_FIELD,
  defaultOrcamentoFaturarProposta,
  normalizeOrcamentoFaturarProposta,
  readOrcamentoFaturarFromDom,
  renderOrcamentoFaturarCheckbox,
  reportIsPedidoOrcamentoFromVisit,
  resolveOrcamentoFaturarProposta,
} from './orcamento-faturar-flag.js';

export {
  ORCAMENTO_FATURAR_FIELD,
  defaultOrcamentoFaturarProposta,
  normalizeOrcamentoFaturarProposta,
  readOrcamentoFaturarFromDom,
  renderOrcamentoFaturarCheckbox,
  reportIsPedidoOrcamentoFromVisit,
  resolveOrcamentoFaturarProposta,
};

/** Proposta comercial — aguarda aceite do cliente (não aparece em «por faturar»). */
export const FATURACAO_AGUARDA_ACEITE_ORCAMENTO = 'aguarda_aceite_orcamento';

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
 * Entra em «Por faturar» se aceite e o RH marcou «vai a faturação»
 * (default: só propostas RH do zero).
 */
export function isPendingOrcamentoBilling(report) {
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (!isOrcamentoClienteAceite(report)) return false;
  if (!resolveOrcamentoFaturarProposta(report)) return false;
  if (!reportIsStandaloneOrcamento(report) && !reportIsPedidoOrcamentoFromVisit(report)) {
    return false;
  }

  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'dispensado' || fs === 'via_servico') return false;
  return fs === 'pendente' || !fs || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO;
}

/** Aceite registado mas faturacao_status ainda não sincronizado (reparar na abertura de Faturação). */
export function shouldRepairOrcamentoBilling(report) {
  if (!isOrcamentoClienteAceite(report)) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (!resolveOrcamentoFaturarProposta(report)) return false;
  if (!reportIsStandaloneOrcamento(report) && !reportIsPedidoOrcamentoFromVisit(report)) {
    return false;
  }
  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'via_servico') return false;
  if (fs === 'pendente' && report.data?.faturacaoOrigem === 'orcamento_aceite') return false;
  return true;
}

/** Pedido de relatório sem opção de faturar proposta — alinhar com a visita. */
export function shouldDetachPedidoOrcamentoFromProposalBilling(report) {
  if (!reportIsPedidoOrcamentoFromVisit(report)) return false;
  if (resolveOrcamentoFaturarProposta(report)) return false;
  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'via_servico' || fs === 'dispensado') return false;
  return fs === 'pendente' || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO || !fs;
}

/** Standalone aceite com «não faturar» ainda em pendente. */
export function shouldClearStandaloneWithoutBilling(report) {
  if (!reportIsStandaloneOrcamento(report)) return false;
  if (reportIsFolhaObraOrcamento(report)) return false;
  if (!isOrcamentoClienteAceite(report)) return false;
  if (resolveOrcamentoFaturarProposta(report)) return false;
  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'dispensado' || fs === 'via_servico') return false;
  return fs === 'pendente' || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO || !fs;
}

/** Sincroniza propostas aceites e tira da fila as que não devem faturar como proposta. */
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
  for (const report of getReportsSnapshot().filter(shouldClearStandaloneWithoutBilling)) {
    const saved = await markOrcamentoAceiteWithoutBilling(report.id);
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

/** Aceite sem meter a proposta em «Por faturar». */
export async function markOrcamentoAceiteWithoutBilling(reportId) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return null;
  if (report.faturacaoStatus === 'faturado') return report;
  if (reportIsPedidoOrcamentoFromVisit(report)) {
    return markPedidoOrcamentoViaVisit(reportId);
  }

  const saved = await updateRelatorio(reportId, {
    faturacaoStatus: 'dispensado',
    data: {
      faturacaoValorSugerido: null,
      faturacaoOrigem: 'orcamento_sem_faturar',
    },
  });
  if (saved) mergeReportInCache(saved);
  window.dispatchEvent(new CustomEvent('db-updated'));
  return saved;
}

/**
 * Marca proposta aceite conforme a caixa «vai a faturação».
 * @param {string} reportId
 * @param {{ faturarProposta?: boolean }} [options]
 */
export async function markOrcamentoAceitePendingBilling(reportId, options = {}) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return null;
  if (reportIsFolhaObraOrcamento(report)) return null;

  const meta = getReportOrcamentoMeta(report) || {};
  const faturar =
    options.faturarProposta !== undefined
      ? normalizeOrcamentoFaturarProposta(options.faturarProposta, report)
      : resolveOrcamentoFaturarProposta(report);

  if (meta[ORCAMENTO_FATURAR_FIELD] !== faturar) {
    const withFlag = await updateRelatorio(reportId, {
      data: { orcamento: { ...meta, [ORCAMENTO_FATURAR_FIELD]: faturar } },
    });
    if (withFlag) mergeReportInCache(withFlag);
  }

  if (!faturar) {
    return markOrcamentoAceiteWithoutBilling(reportId);
  }

  const fresh = getReport(reportId) || report;
  const aceiteEm =
    getReportOrcamentoMeta(fresh)?.respostaClienteEm || new Date().toISOString();
  const total = resolveOrcamentoBillingTotal(fresh);

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

/**
 * Grava a caixa «vai a faturação» e sincroniza a fila (adicionar ou retirar).
 * @param {string} reportId
 * @param {boolean} faturarProposta
 */
export async function applyOrcamentoFaturarPropostaChoice(reportId, faturarProposta) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return null;
  if (reportIsFolhaObraOrcamento(report)) return null;
  if (report.faturacaoStatus === 'faturado') {
    showToast('Esta proposta já foi faturada — não pode alterar a fila.', 'warning', 7000);
    return report;
  }

  const meta = getReportOrcamentoMeta(report) || {};
  const faturar = normalizeOrcamentoFaturarProposta(faturarProposta, report);
  const withFlag = await updateRelatorio(reportId, {
    data: { orcamento: { ...meta, [ORCAMENTO_FATURAR_FIELD]: faturar } },
  });
  if (withFlag) mergeReportInCache(withFlag);

  if (!isOrcamentoClienteAceite(withFlag || report)) {
    window.dispatchEvent(new CustomEvent('db-updated'));
    return withFlag;
  }

  if (faturar) {
    return markOrcamentoAceitePendingBilling(reportId, { faturarProposta: true });
  }
  return markOrcamentoAceiteWithoutBilling(reportId);
}

/** Retira da fila se o aceite for revertido ou marcado como recusada. */
export async function clearOrcamentoBillingOnClienteRecusa(reportId) {
  const { getReport } = await import('./app.js');
  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return false;
  if (reportIsPedidoOrcamentoFromVisit(report) && !resolveOrcamentoFaturarProposta(report)) {
    return false;
  }
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
