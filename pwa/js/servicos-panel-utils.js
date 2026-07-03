/**
 * Utilitários do calendário RH — serviços como visitas multi-relatório.
 */

import { getAllJobs, getJob, getServiceType, jobAssignedToTechnician } from './entity-lookups.js';
import { sameEntityId } from './entity-id.js';
import { filterOutLocallyDeletedReports } from './report-deleted-local.js';
import { dedupeReportsByNumeroOrdem, getReportsSnapshot } from './relatorios-db.js';
import { getServico, getServicosSnapshot, isServicosCacheLoaded } from './servicos-db.js';

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

/** Relatório pertence a esta visita (servico_id, job legado ou trabalho.servico_id). */
export function reportBelongsToServico(report, servicoId) {
  if (!report || servicoId == null || servicoId === '') return false;
  const key = String(servicoId);
  if (sameEntityId(report.servicoId, key)) return true;
  if (sameEntityId(report.jobId, key)) return true;
  if (report.jobId) {
    const job = getJob(report.jobId);
    if (job?.servicoId && sameEntityId(job.servicoId, key)) return true;
  }
  return false;
}

/** Remove rascunhos obsoletos quando já existe relatório aprovado (mesma OP ou mesmo tipo). */
export function dropSupersededServicoDrafts(reports = []) {
  const list = Array.isArray(reports) ? reports : [];
  return list.filter((draft) => {
    if (draft?.status !== 'draft') return true;
    const ordem = getReportNumeroOrdem(draft);
    if (ordem != null) {
      return !list.some(
        (other) =>
          other.id !== draft.id &&
          other.status === 'approved' &&
          getReportNumeroOrdem(other) === ordem,
      );
    }
    if (draft.jobId) {
      return !list.some(
        (other) =>
          other.id !== draft.id &&
          other.status === 'approved' &&
          sameEntityId(other.jobId, draft.jobId),
      );
    }
    return !list.some(
      (other) =>
        other.id !== draft.id &&
        other.status === 'approved' &&
        other.serviceType === draft.serviceType,
    );
  });
}

function normalizeServicoVisitReports(raw) {
  return dropSupersededServicoDrafts(dedupeReportsByNumeroOrdem(raw));
}

/** Relatórios ligados a um serviço (servico_id ou trabalho legado com o mesmo id). */
export function getReportsForServico(servicoId) {
  if (servicoId == null || servicoId === '') return [];
  const key = String(servicoId);
  const seen = new Set();
  const raw = filterOutLocallyDeletedReports(
    getReportsSnapshot().filter((r) => {
      if (!reportBelongsToServico(r, key)) return false;
      const id = String(r.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  );
  return normalizeServicoVisitReports(raw);
}

/** Rascunho que o técnico marcou como concluído (aguarda «Concluir visita»). */
export function isServicoReportTechnicianComplete(report) {
  return report?.status === 'draft' && report?.data?.technicianCompleted === true;
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

/** OP oficial do relatório (cada relatório da visita tem o seu trabalho/OP). */
export function getReportNumeroOrdem(report) {
  if (!report?.jobId) return null;
  const job = getJob(report.jobId);
  const n = job?.numeroOrdem;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : null;
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
    numeroOrdem: servico.numeroOrdem,
    isServico: true,
  };
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
  return getReportsSnapshot().find((r) => sameEntityId(r.jobId, item.id)) || null;
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

/** Rascunhos ainda não submetidos à RH podem ser removidos pelo técnico. */
export function canRemoveServicoReport(report) {
  return report?.status === 'draft';
}
