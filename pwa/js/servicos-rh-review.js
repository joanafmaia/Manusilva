/**
 * Revisão RH por visita (serviço) — agrupamento e navegação entre relatórios.
 */

import { formatDateLong, isToday, addDaysToIsoDate } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { dedupeReportsForDisplay } from './relatorios-db.js';
import { getServico } from './servicos-db.js';
import { getReportsForServico, resolveServicoIdForReport, shouldDeferRhReviewForServicoReport } from './servicos-panel-utils.js';

function reportSortKey(report) {
  return String(report?.submittedAt || report?.approvedAt || '');
}

function toLocalIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoDateFromTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return toLocalIsoDate(d);
}

function normalizeIsoDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return isoDateFromTimestamp(raw);
}

/** Data de trabalho/visita usada para agrupar relatórios no painel RH. */
export function resolveReportDisplayDateIso(report, getJobFn = null) {
  if (!report) return '';

  if (report.servicoId) {
    const servico = getServico(String(report.servicoId));
    const servicoDate = normalizeIsoDate(servico?.date);
    if (servicoDate) return servicoDate;
  }

  if (report.jobId && typeof getJobFn === 'function') {
    const job = getJobFn(report.jobId);
    const jobDate = normalizeIsoDate(job?.date);
    if (jobDate) return jobDate;
  }

  return normalizeIsoDate(report.submittedAt || report.approvedAt);
}

export function formatRhDayGroupLabel(iso) {
  if (!iso) return 'Sem data definida';
  if (isToday(iso)) return 'Hoje';
  const yesterdayIso = addDaysToIsoDate(toLocalIsoDate(), -1);
  if (iso === yesterdayIso) return 'Ontem';
  return formatDateLong(iso);
}

function resolveStackItemDateIso(item, getJobFn) {
  if (item.kind === 'servico') {
    const servico = getServico(String(item.servicoId));
    const servicoDate = normalizeIsoDate(servico?.date);
    if (servicoDate) return servicoDate;
    const report = item.reports?.[0];
    return resolveReportDisplayDateIso(report, getJobFn);
  }
  return resolveReportDisplayDateIso(item.report, getJobFn);
}

/**
 * Agrupa itens do painel RH (pastas de visita + relatórios soltos) por dia de trabalho.
 * Dias mais recentes aparecem primeiro.
 */
export function groupRhStackItemsByDay(items = [], getJobFn = null) {
  const buckets = new Map();
  const undated = [];

  for (const item of items) {
    const iso = resolveStackItemDateIso(item, getJobFn);
    if (!iso) {
      undated.push(item);
      continue;
    }
    if (!buckets.has(iso)) buckets.set(iso, []);
    buckets.get(iso).push(item);
  }

  const groups = [...buckets.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((dateIso) => ({
      dateIso,
      label: formatRhDayGroupLabel(dateIso),
      items: buckets.get(dateIso) || [],
    }));

  if (undated.length) {
    groups.push({
      dateIso: '',
      label: formatRhDayGroupLabel(''),
      items: undated,
    });
  }

  return groups;
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

  const visibleByServico = new Map();
  for (const report of list) {
    const sid = resolveServicoIdForReport(report);
    if (!sid) continue;
    visibleByServico.set(sid, (visibleByServico.get(sid) || 0) + 1);
  }

  const folderServicos = new Set();
  for (const [sid, visibleCount] of visibleByServico) {
    const totalInServico = getReportsForServico(sid).length;
    if (visibleCount >= 2 || totalInServico >= 2) {
      folderServicos.add(sid);
    }
  }

  const items = [];
  const usedReportIds = new Set();
  const listIdSet = new Set(list.map((r) => r.id));

  const folderOrder = [...folderServicos]
    .map((sid) => {
      const visible = list.filter((r) => resolveServicoIdForReport(r) === sid);
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

  const itemSortKeys = new Map(
    items.map((item) => {
      const rep =
        item.kind === 'servico'
          ? item.reports.find((r) => listIdSet.has(r.id)) || item.reports[0]
          : item.report;
      return [item, reportSortKey(rep)];
    }),
  );

  return items.sort((a, b) => itemSortKeys.get(a).localeCompare(itemSortKeys.get(b)));
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
