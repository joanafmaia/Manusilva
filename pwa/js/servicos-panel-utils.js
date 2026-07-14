/**
 * Utilitários do calendário RH — serviços como visitas multi-relatório.
 */

import { getAllJobs, getJob, getServiceType, getJobTechnicianLabel, getTechnician, jobAssignedToTechnician } from './entity-lookups.js';
import { sameEntityId } from './entity-id.js';
import { filterOutLocallyDeletedReports } from './report-deleted-local.js';
import { getReportsSnapshot, getCanonicalReportForJob, getReportsSnapshotByServicoId } from './relatorios-db.js';
import { getServico, getServicosSnapshot } from './servicos-db.js';

/** Id do serviço/visita a que o relatório pertence (servico_id ou trabalho legado com o mesmo id). */
export function resolveServicoIdForReport(report) {
  if (!report) return '';
  const direct = report.servicoId ? String(report.servicoId) : '';
  if (direct) return direct;
  const jobId = report.jobId ? String(report.jobId) : '';
  if (jobId && getServico(jobId)) return jobId;
  if (jobId) {
    const job = getJob(jobId);
    const viaJob = job?.servicoId ? String(job.servicoId) : '';
    if (viaJob && getServico(viaJob)) return viaJob;
  }
  return '';
}

/** Relatório pertence a esta visita (servico_id, trabalho.servico_id ou id legado). */
export function reportBelongsToServico(report, servicoId) {
  if (!report || servicoId == null || servicoId === '') return false;
  return sameEntityId(resolveServicoIdForReport(report), String(servicoId));
}

function parseNumeroOrdemFromReportValues(report) {
  const raw = report?.data?.values?.numero_ordem;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const opMatch = s.match(/OP\s*[-–]?\s*\d{4}\s*[-–]?\s*(\d+)/i);
  if (opMatch?.[1]) {
    const n = Number(opMatch[1]);
    return Number.isFinite(n) ? n : null;
  }
  const plain = s.match(/^(\d{1,4})$/);
  if (plain) return Number(plain[1]);
  return null;
}

/** OP oficial do relatório (coluna, trabalho ou valor legado no formulário). */
export function getReportNumeroOrdem(report) {
  if (!report) return null;
  if (report.numeroOrdem != null && Number.isFinite(Number(report.numeroOrdem))) {
    return Number(report.numeroOrdem);
  }
  if (report.jobId) {
    const job = getJob(report.jobId);
    const n = job?.numeroOrdem;
    if (n != null && Number.isFinite(Number(n))) return Number(n);
  }
  return parseNumeroOrdemFromReportValues(report);
}

/** Relatórios ligados à visita, incluindo fallback por OP + cliente (visita faturada). */
function collectReportsLinkedToServico(servicoId) {
  if (servicoId == null || servicoId === '') return [];
  const key = String(servicoId);
  const servico = getServico(key);
  const seen = new Set();
  const out = [];

  const add = (report) => {
    if (!report?.id) return;
    const id = String(report.id);
    if (seen.has(id)) return;
    seen.add(id);
    out.push(report);
  };

  for (const report of getReportsSnapshotByServicoId(key)) {
    add(report);
  }

  // Legacy: relatórios ligados só por trabalho_id = id da visita (sem servico_id na BD)
  for (const report of filterOutLocallyDeletedReports(getReportsSnapshot())) {
    if (sameEntityId(report.servicoId, key) || sameEntityId(report.jobId, key)) {
      add(report);
    }
  }

  return out;
}

function normalizeServicoVisitReports(raw) {
  return dropSupersededServicoDrafts(raw);
}

/** Remove rascunhos obsoletos quando já existe relatório aprovado (mesma OP ou mesmo tipo). */
export function dropSupersededServicoDrafts(reports = []) {
  const list = Array.isArray(reports) ? reports : [];
  if (list.length < 2) return list;

  const approvedOrdens = new Set();
  const approvedJobIds = new Set();
  const approvedTypes = new Set();

  for (const other of list) {
    if (other?.status !== 'approved') continue;
    const ordem = getReportNumeroOrdem(other);
    if (ordem != null) approvedOrdens.add(ordem);
    if (other.jobId) approvedJobIds.add(String(other.jobId));
    if (other.serviceType) approvedTypes.add(other.serviceType);
  }

  return list.filter((draft) => {
    if (draft?.status !== 'draft') return true;
    const ordem = getReportNumeroOrdem(draft);
    if (ordem != null && approvedOrdens.has(ordem)) return false;
    if (draft.jobId && approvedJobIds.has(String(draft.jobId))) return false;
    if (draft.serviceType && approvedTypes.has(draft.serviceType)) return false;
    return true;
  });
}

/** Contexto de trabalho para PDF/e-mail — relatório de visita sem linha em `trabalhos`. */
export function buildJobContextForServicoReport(servico, report) {
  if (!servico) return null;
  return {
    id: report?.jobId || servico.id,
    numeroOrdem: getReportNumeroOrdem(report) ?? servico.numeroOrdem ?? null,
    servicoId: String(servico.id),
    clientId: servico.clientId || report?.clientId || '',
    date: servico.date || '',
    technicianId: servico.technicianIds || report?.technicianId || '',
    serviceType: report?.serviceType || '',
    status: 'completed',
    urlPdf: null,
  };
}

/** Trabalho efetivo para PDF/e-mail — inclui visitas sem linha em `trabalhos`. */
export function resolveJobForApprovedReport(report) {
  if (!report) return null;
  if (report.jobId) {
    const job = getJob(report.jobId);
    if (job) return job;
  }
  const servicoId = resolveServicoIdForReport(report);
  if (!servicoId) return null;
  return buildJobContextForServicoReport(getServico(servicoId), report);
}

/** Relatórios ligados a um serviço (servico_id ou trabalho legado com o mesmo id). */
export function getReportsForServico(servicoId) {
  return normalizeServicoVisitReports(collectReportsLinkedToServico(servicoId));
}

/** Relatórios aprovados da visita (para faturação, e-mail e detalhe). */
export function getApprovedReportsForServico(servicoId) {
  return getReportsForServico(servicoId).filter((r) => r.status === 'approved');
}

/** Rascunho que o técnico marcou como concluído (aguarda «Concluir visita»). */
export function isServicoReportTechnicianComplete(report) {
  return report?.status === 'draft' && report?.data?.technicianCompleted === true;
}

/**
 * Relatório de visita enviado ao RH antes da conclusão da visita
 * (ex.: ainda há rascunhos irmãos — o RH só deve rever após «Concluir visita»).
 */
export function shouldDeferRhReviewForServicoReport(report) {
  const servicoId = resolveServicoIdForReport(report);
  if (!servicoId || report?.status !== 'pending_review') return false;
  return getReportsForServico(servicoId).some(
    (r) => r.id !== report.id && r.status === 'draft',
  );
}

/** Relatórios da visita que contam para conclusão (exclui rejeitados). */
export function getServicoActiveReports(servicoId) {
  if (!servicoId) return [];
  return getReportsForServico(servicoId).filter((r) => r.status !== 'rejected');
}

/** Todos os relatórios ativos da visita estão aprovados. */
export function isServicoVisitFullyApproved(servicoId) {
  const reports = getServicoActiveReports(servicoId);
  if (!reports.length) return false;
  return reports.every((r) => r.status === 'approved');
}

/** Visita com todos os relatórios ativos submetidos ao RH (sem rascunhos). */
export function isServicoVisitReadyForRhReview(servicoId) {
  const reports = getServicoActiveReports(servicoId);
  if (!reports.length) return false;
  if (reports.some((r) => r.status === 'draft')) return false;
  return reports.every((r) => r.status === 'pending_review');
}

export function isServicoMultiReportVisit(servicoId) {
  return getServicoActiveReports(servicoId).length > 1;
}

/** Notificar RH de pendente — uma vez por visita multi-relatório quando está completa. */
export function shouldNotifyRhPendingForServicoReport(report) {
  if (!report || report.status !== 'pending_review') return false;
  if (shouldDeferRhReviewForServicoReport(report)) return false;
  const servicoId = resolveServicoIdForReport(report);
  if (!servicoId || !isServicoMultiReportVisit(servicoId)) return true;
  return isServicoVisitReadyForRhReview(servicoId);
}

/** Notificar técnico de aprovação — uma vez quando a visita multi-relatório está toda aprovada. */
export function shouldNotifyTechApprovalForReport(report) {
  if (!report || report.status !== 'approved') return false;
  const servicoId = resolveServicoIdForReport(report);
  if (!servicoId || !isServicoMultiReportVisit(servicoId)) return true;
  return isServicoVisitFullyApproved(servicoId);
}

/** Rascunhos da visita ainda em edição (não concluídos pelo técnico). */
export function getIncompleteServicoDraftReports(servicoId) {
  return getReportsForServico(servicoId).filter(
    (r) => r.status === 'draft' && !isServicoReportTechnicianComplete(r),
  );
}

/** Relatório «principal» para badge de estado no calendário. */
export function getPrimaryReportForServico(servicoId) {
  const reports = getReportsForServico(servicoId);
  if (!reports.length) return null;
  const priority = { rejected: 0, pending_review: 1, draft: 2, approved: 3 };
  return [...reports].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9))[0];
}

function resolveServicoCalendarNumeroOrdem(servico) {
  if (servico?.numeroOrdem != null && Number.isFinite(Number(servico.numeroOrdem))) {
    return Number(servico.numeroOrdem);
  }
  const reports = getReportsForServico(servico.id).filter((r) => r.status === 'approved');
  const ops = [
    ...new Set(reports.map((r) => getReportNumeroOrdem(r)).filter((n) => n != null)),
  ].sort((a, b) => a - b);
  return ops[0] ?? null;
}

/** Item no formato esperado pelo calendário admin (compatível com trabalhos legados). */
export function servicoToCalendarItem(servico) {
  return {
    id: servico.id,
    clientId: servico.clientId,
    date: servico.date,
    time: servico.time || '',
    technicianId: servico.technicianIds || '',
    serviceType: '',
    forkliftSerial: '',
    status: mapServicoStatusForCalendar(servico),
    rejectionNote: servico.rejectionNote,
    numeroOrdem: resolveServicoCalendarNumeroOrdem(servico),
    isServico: true,
    servicoId: servico.id,
  };
}

/**
 * Contexto de trabalho/visita para filtros e etiquetas — prioriza a equipa do serviço
 * («Hugo, Filipe») quando o trabalho só guardou o submissor.
 */
export function resolveJobContextForReport(report) {
  if (!report) return null;

  const job = report.jobId ? getJob(report.jobId) : null;
  const servicoId = resolveServicoIdForReport(report);
  const servico = servicoId ? getServico(servicoId) : null;

  if (servico) {
    const fromServico = servicoToCalendarItem(servico);
    if (!job) return fromServico;
    return {
      ...fromServico,
      ...job,
      id: job.id,
      date: servico.date || job.date,
      numeroOrdem: getReportNumeroOrdem(report) ?? job.numeroOrdem ?? servico.numeroOrdem,
      technicianId: servico.technicianIds || job.technicianId,
      servicoId: servico.id,
      isServico: true,
    };
  }

  return job;
}

/** Nome(s) dos técnicos no relatório — equipa da visita quando existir. */
export function resolveReportTechnicianLabel(report, job = null) {
  const ctx = job || resolveJobContextForReport(report);
  if (ctx?.technicianId) {
    const label = getJobTechnicianLabel(ctx.technicianId);
    if (label && label !== '—') return label;
  }
  return getTechnician(report?.technicianId)?.name || '—';
}

function mapServicoStatusForCalendar(servico) {
  if (servico.faturacaoStatus === 'faturado' || servico.faturacaoStatus === 'dispensado') {
    return 'completed';
  }
  const reports = getReportsForServico(servico.id);
  if (reports.some((r) => r.status === 'rejected')) return 'rejected';
  if (reports.some((r) => r.status === 'pending_review')) return 'scheduled';
  if (reports.length && reports.every((r) => r.status === 'approved')) return 'completed';
  if (reports.length) return 'scheduled';
  if (servico.status === 'approved') return 'completed';
  return 'scheduled';
}

function collectCalendarHiddenJobIds(servicoIds) {
  const hidden = new Set([...servicoIds].map(String));
  const ordensOnServicos = new Set();

  for (const job of getAllJobs()) {
    if (job.servicoId) hidden.add(String(job.id));
  }

  for (const sid of servicoIds) {
    for (const report of getReportsForServico(sid)) {
      const ordem = getReportNumeroOrdem(report);
      if (ordem != null) ordensOnServicos.add(ordem);
    }
  }

  for (const report of getReportsSnapshot()) {
    const servicoId = resolveServicoIdForReport(report);
    if (!servicoId) continue;
    hidden.add(String(servicoId));
    if (report.jobId) hidden.add(String(report.jobId));
  }

  for (const job of getAllJobs()) {
    const ordem = job.numeroOrdem;
    if (ordem != null && ordensOnServicos.has(Number(ordem))) {
      hidden.add(String(job.id));
    }
  }

  return hidden;
}

/**
 * Lista para o calendário RH: serviços (novo modelo) + trabalhos legados sem serviço.
 */
export function getAdminCalendarItems() {
  const servicos = getServicosSnapshot();
  const servicoIds = new Set(servicos.map((s) => String(s.id)));
  const hiddenJobIds = collectCalendarHiddenJobIds(servicoIds);
  const fromServicos = servicos.map(servicoToCalendarItem);
  const legacyJobs = getAllJobs().filter((j) => !hiddenJobIds.has(String(j.id)));
  return [...fromServicos, ...legacyJobs];
}

export function getCalendarItemReport(item) {
  if (!item) return null;
  if (item.isServico) return getPrimaryReportForServico(item.id);
  return getCanonicalReportForJob(item.id);
}

export function getCalendarItemReports(item) {
  if (!item) return [];
  if (item.isServico) return getReportsForServico(item.id);
  const report = getCalendarItemReport(item);
  return report ? [report] : [];
}

export function filterCalendarItemsByTech(items, techId) {
  if (!techId || techId === 'all') return items;
  return items.filter((item) => jobAssignedToTechnician(item, techId));
}

/** Subtítulo no bloco do calendário. */
export function getCalendarItemSubtitle(item) {
  const reports = getCalendarItemReports(item);
  if (!reports.length) {
    return item.isServico ? 'Aguarda relatórios' : 'Sem relatório';
  }
  if (reports.length === 1) {
    const r = reports[0];
    return getServiceType(r.serviceType)?.label || r.serviceType || 'Relatório';
  }
  return `${reports.length} relatórios`;
}

export function getReportByServicoAndType(servicoId, serviceType) {
  if (!servicoId || !serviceType) return null;
  return (
    getReportsForServico(servicoId).find((r) => r.serviceType === serviceType) || null
  );
}

/** Todos os relatórios de um tipo na visita (pode haver vários da mesma máquina/tipo). */
export function getReportsByServicoAndType(servicoId, serviceType) {
  if (!servicoId || !serviceType) return [];
  return getReportsForServico(servicoId).filter((r) => r.serviceType === serviceType);
}

/** Id único para novo relatório numa visita (vários do mesmo tipo). */
export function createServicoReportId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Tipos disponíveis para adicionar — o técnico pode repetir o mesmo tipo quantas vezes precisar. */
export function getAvailableServiceTypesForServico(servicoId, allTypes = []) {
  void servicoId;
  return allTypes.filter((t) => t?.id);
}

/** Etiqueta de estado do relatório no painel RH / calendário. */
export function rhReportStatusLine(report) {
  if (!report) return 'Sem relatório iniciado';
  if (report.status === 'draft') return 'Rascunho no tablet do técnico';
  if (report.status === 'pending_review') return 'Aguarda aprovação (RH)';
  if (report.status === 'approved') return 'Relatório aprovado';
  if (report.status === 'rejected') return 'Rejeitado — correção pedida';
  return `Relatório: ${report.status}`;
}

export const RH_VISIT_DELETE_CONFIRM_WORD = 'ELIMINAR';

/**
 * Proteção contra eliminação acidental de visitas com trabalho do técnico (calendário RH).
 * @param {object|null|undefined} item — item do calendário (visita ou trabalho legado)
 */
export function getRhCalendarVisitDeleteGuard(item) {
  const reports = getCalendarItemReports(item);
  return {
    reports,
    hasReports: reports.length > 0,
    confirmWord: RH_VISIT_DELETE_CONFIRM_WORD,
  };
}

export function isRhVisitDeleteConfirmWord(value) {
  return String(value || '').trim().toUpperCase() === RH_VISIT_DELETE_CONFIRM_WORD;
}

/** Rascunhos ainda não submetidos à RH podem ser removidos pelo técnico. */
export function canRemoveServicoReport(report) {
  return report?.status === 'draft';
}
