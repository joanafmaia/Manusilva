/**
 * Revisão RH por visita (serviço) — agrupamento e navegação entre relatórios.
 */

import { formatDateLong } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { dedupeReportsForDisplay } from './relatorios-db.js';
import { getServico } from './servicos-db.js';
import { getReportsForServico, shouldDeferRhReviewForServicoReport } from './servicos-panel-utils.js';

function reportSortKey(report) {
  return String(report?.submittedAt || report?.approvedAt || '');
}

function sortReportsChronologically(reports) {
  return [...reports].sort((a, b) => reportSortKey(a).localeCompare(reportSortKey(b)));
}

/** Contagens por estado dos relatórios de uma visita. */
export function summarizeServicoReviewState(reports = []) {
  const list = dedupeReportsForDisplay(reports);
  const pending = list.filter((r) => r.status === 'pending_review').length;
  const approved = list.filter((r) => r.status === 'approved').length;
  const rejected = list.filter((r) => r.status === 'rejected').length;
  const draft = list.filter((r) => r.status === 'draft').length;
  const total = list.length;
  return {
    pending,
    approved,
    rejected,
    draft,
    total,
    allApproved: total > 0 && approved === total,
    hasPending: pending > 0,
  };
}

/**
 * Agrupa relatórios do painel RH: pastas de visita (2+ relatórios) + itens soltos.
 * Dentro da pasta mostra todos os relatórios do serviço, não só os do filtro ativo.
 * @param {object[]} filteredReports
 */
export function groupReportsForRhStack(filteredReports) {
  const list = dedupeReportsForDisplay(filteredReports || []);
  if (!list.length) return [];

  const servicoCandidates = new Set(
    list.map((r) => (r.servicoId ? String(r.servicoId) : '')).filter(Boolean),
  );

  const folderServicos = new Set();
  for (const sid of servicoCandidates) {
    if (getReportsForServico(sid).length >= 2) folderServicos.add(sid);
  }

  const items = [];
  const usedReportIds = new Set();

  const folderOrder = [...folderServicos]
    .map((sid) => {
      const visible = list.filter((r) => String(r.servicoId) === sid);
      const earliest = sortReportsChronologically(visible)[0];
      return { sid, sort: reportSortKey(earliest), reports: getReportsForServico(sid) };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort));

  for (const { sid, reports } of folderOrder) {
    const sorted = sortReportsChronologically(reports);
    items.push({ kind: 'servico', servicoId: sid, reports: sorted });
    sorted.forEach((r) => usedReportIds.add(r.id));
  }

  for (const report of sortReportsChronologically(list)) {
    if (!usedReportIds.has(report.id)) {
      items.push({ kind: 'report', report });
    }
  }

  return items.sort((a, b) => {
    const repA =
      a.kind === 'servico'
        ? a.reports.find((r) => list.some((x) => x.id === r.id)) || a.reports[0]
        : a.report;
    const repB =
      b.kind === 'servico'
        ? b.reports.find((r) => list.some((x) => x.id === r.id)) || b.reports[0]
        : b.report;
    return reportSortKey(repA).localeCompare(reportSortKey(repB));
  });
}

/** Primeiro relatório pendente da visita (para «Rever visita»). */
export function getFirstPendingReportIdForServico(servicoId) {
  const reports = getReportsForServico(servicoId);
  const pending = sortReportsChronologically(
    reports.filter(
      (r) => r.status === 'pending_review' && !shouldDeferRhReviewForServicoReport(r),
    ),
  );
  return pending[0]?.id || null;
}

/**
 * Seguinte pendente na fila — prioriza relatórios da mesma visita (ordem cronológica),
 * depois passa à visita seguinte na fila global.
 * @param {string} currentId
 * @param {object[]} reports — fila visível (filtrada)
 */
export function getNextPendingReportId(currentId, reports) {
  const pending = sortReportsChronologically(
    dedupeReportsForDisplay(reports || []).filter((r) => r.status === 'pending_review'),
  );
  if (!pending.length) return null;

  const current = pending.find((r) => r.id === currentId) || null;
  const servicoId = current?.servicoId ? String(current.servicoId) : '';

  if (servicoId) {
    const inVisit = pending.filter((r) => String(r.servicoId) === servicoId);
    const visitIdx = inVisit.findIndex((r) => r.id === currentId);
    if (visitIdx >= 0 && visitIdx < inVisit.length - 1) {
      return inVisit[visitIdx + 1].id;
    }
    const outsideVisit = pending.filter((r) => String(r.servicoId) !== servicoId);
    if (outsideVisit.length) return outsideVisit[0].id;
  }

  const globalIdx = pending.findIndex((r) => r.id === currentId);
  if (globalIdx >= 0 && globalIdx < pending.length - 1) {
    return pending[globalIdx + 1].id;
  }

  if (globalIdx < 0 && pending.length) {
    return pending[0].id;
  }

  return null;
}

/** Etiqueta do botão «Aprovar e seguinte» consoante o destino na fila. */
export function getRhApproveNextLabel(currentReport, nextReport) {
  if (!nextReport) return 'Aprovar e seguinte';
  const currentSid = currentReport?.servicoId ? String(currentReport.servicoId) : '';
  const nextSid = nextReport?.servicoId ? String(nextReport.servicoId) : '';
  if (currentSid && nextSid && currentSid === nextSid) {
    return 'Aprovar e seguinte na visita';
  }
  if (nextSid) return 'Aprovar e seguinte visita';
  return 'Aprovar e seguinte';
}

export function getServicoReviewMeta(servicoId) {
  const servico = getServico(servicoId);
  const reports = getReportsForServico(servicoId);
  const client = getClient(servico?.clientId || reports[0]?.clientId);
  const state = summarizeServicoReviewState(reports);
  const dateLabel = servico?.date ? formatDateLong(servico.date) : '—';

  return {
    servico,
    reports,
    client,
    state,
    dateLabel,
    title: client?.name || client?.Nome || 'Visita',
  };
}
