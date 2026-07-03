/**
 * Faturação de propostas MS.015 — entra na fila quando o cliente aceita.
 */

import {
  computeOrcamentoTotals,
  getReportOrcamentoMeta,
} from './orcamento-linhas.js';
import { ORCAMENTO_RESPOSTA } from './orcamento-workflow.js';
import { reportIsRhOrcamento } from './pedido-orcamento.js';
import {
  dedupeReportsForDisplay,
  formatRelatoriosError,
  getReportsSnapshot,
  updateRelatorio,
} from './relatorios-db.js';
import { showToast } from './toast-modal.js';

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

/** Proposta aceite pelo cliente, ainda por faturar. */
export function isPendingOrcamentoBilling(report) {
  if (!reportIsRhOrcamento(report)) return false;
  if (!isOrcamentoClienteAceite(report)) return false;

  const fs = report.faturacaoStatus;
  if (fs === 'faturado' || fs === 'dispensado' || fs === 'via_servico') return false;
  return fs === 'pendente' || !fs || fs === FATURACAO_AGUARDA_ACEITE_ORCAMENTO;
}

export function getPendingOrcamentoBillingReports() {
  return dedupeReportsForDisplay(getReportsSnapshot().filter(isPendingOrcamentoBilling)).sort(
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

/**
 * Marca proposta aceite como pendente de faturação (valor sugerido = total MS.015).
 * @param {string} reportId
 */
export async function markOrcamentoAceitePendingBilling(reportId) {
  const { getReport } = await import('./app.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report || !reportIsRhOrcamento(report)) return null;

  const meta = getReportOrcamentoMeta(report) || {};
  const aceiteEm = meta.respostaClienteEm || new Date().toISOString();
  const total = resolveOrcamentoBillingTotal({ ...report, data: { ...report.data, orcamento: meta } });

  const saved = await updateRelatorio(reportId, {
    faturacaoStatus: 'pendente',
    approvedAt: aceiteEm,
    data: {
      faturacaoValorSugerido: total > 0 ? total : null,
      faturacaoOrigem: 'orcamento_aceite',
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
