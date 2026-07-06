/**
 * Fila e filtros de relatórios no painel RH.
 */

import { dedupeReportsForDisplay, getReportsSnapshot } from './relatorios-db.js';
import { isRhOrcamentoQueueReport } from './pedido-orcamento.js';
import { shouldDeferRhReviewForServicoReport } from './servicos-panel-utils.js';

/** Estados de relatório exibidos no painel RH (histórico completo) */
export const RH_PANEL_REPORT_STATUSES = new Set([
  'pending_review',
  'draft',
  'approved',
  'rejected',
]);

function getRhPanelReportsRaw() {
  return getReportsSnapshot().filter((r) => RH_PANEL_REPORT_STATUSES.has(r.status));
}

function getPendingReviewReportsSnapshot() {
  return getRhPanelReportsRaw().filter(
    (r) => r.status === 'pending_review' && !shouldDeferRhReviewForServicoReport(r),
  );
}

function getRhPanelReports() {
  return dedupeReportsForDisplay(getRhPanelReportsRaw());
}

function getRhOrcamentoQueueReports() {
  return dedupeReportsForDisplay(
    getRhPanelReportsRaw().filter(isRhOrcamentoQueueReport),
  );
}

/** Mais antigo primeiro — prioridade FIFO na fila RH */
function sortReportsForRhPanel(a, b) {
  return String(a.submittedAt || a.approvedAt || '').localeCompare(
    String(b.submittedAt || b.approvedAt || ''),
  );
}

export function getPendingReports() {
  return dedupeReportsForDisplay(getPendingReviewReportsSnapshot());
}

/** Relatórios visíveis no painel RH (com filtro opcional por estado) */
export function getAdminReviewReports(filter = 'all') {
  if (filter === 'pending_review') {
    return dedupeReportsForDisplay(getPendingReviewReportsSnapshot()).sort(
      sortReportsForRhPanel,
    );
  }
  if (filter === 'orcamento_pendente') {
    return getRhOrcamentoQueueReports().sort(sortReportsForRhPanel);
  }
  const list = getRhPanelReports();
  const filtered = filter === 'all' ? list : list.filter((r) => r.status === filter);
  return filtered.sort(sortReportsForRhPanel);
}

/** Contagens por estado para filtros rápidos do painel RH */
export function getRhPanelReportCounts() {
  const list = getRhPanelReports();
  const pendingReview = dedupeReportsForDisplay(getPendingReviewReportsSnapshot());
  return {
    all: list.length,
    pending_review: pendingReview.length,
    orcamento_pendente: getRhOrcamentoQueueReports().length,
    draft: list.filter((r) => r.status === 'draft').length,
    approved: list.filter((r) => r.status === 'approved').length,
    rejected: list.filter((r) => r.status === 'rejected').length,
  };
}
