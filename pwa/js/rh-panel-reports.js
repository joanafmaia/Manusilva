/**
 * Fila e filtros de relatórios no painel RH.
 */

import { dedupeReportsForDisplay, getReportsSnapshot } from './relatorios-db.js';
import { isRhOrcamentoQueueReport } from './pedido-orcamento.js';
import { resolveServicoIdForReport } from './servicos-panel-utils.js';

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

function buildServicosWithDraftReports(reports) {
  const servicosWithDrafts = new Set();
  for (const report of reports) {
    if (report?.status !== 'draft') continue;
    const servicoId = resolveServicoIdForReport(report);
    if (servicoId) servicosWithDrafts.add(String(servicoId));
  }
  return servicosWithDrafts;
}

function getPendingReviewReportsSnapshot() {
  const raw = getRhPanelReportsRaw();
  const servicosWithDrafts = buildServicosWithDraftReports(raw);
  return raw.filter((report) => {
    if (report.status !== 'pending_review') return false;
    const servicoId = resolveServicoIdForReport(report);
    if (!servicoId) return true;
    return !servicosWithDrafts.has(String(servicoId));
  });
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
  let draft = 0;
  let approved = 0;
  let rejected = 0;
  for (const report of list) {
    if (report.status === 'draft') draft += 1;
    else if (report.status === 'approved') approved += 1;
    else if (report.status === 'rejected') rejected += 1;
  }
  return {
    all: list.length,
    pending_review: pendingReview.length,
    orcamento_pendente: getRhOrcamentoQueueReports().length,
    draft,
    approved,
    rejected,
  };
}
