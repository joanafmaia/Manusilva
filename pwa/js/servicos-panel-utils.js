/**
 * Utilitários do calendário RH — serviços como visitas multi-relatório.
 */

import { getAllJobs, getServiceType, jobAssignedToTechnician } from './entity-lookups.js';
import { sameEntityId } from './entity-id.js';
import { dedupeReportsForDisplay, getReportsSnapshot } from './relatorios-db.js';
import { getServicosSnapshot, isServicosCacheLoaded } from './servicos-db.js';

/** Relatórios ligados a um serviço (servico_id ou trabalho legado com o mesmo id). */
export function getReportsForServico(servicoId) {
  if (servicoId == null || servicoId === '') return [];
  const key = String(servicoId);
  return dedupeReportsForDisplay(
    getReportsSnapshot().filter(
      (r) => sameEntityId(r.servicoId, key) || sameEntityId(r.jobId, key),
    ),
  );
}

/** Relatório «principal» para badge de estado no calendário. */
export function getPrimaryReportForServico(servicoId) {
  const reports = getReportsForServico(servicoId);
  if (!reports.length) return null;
  const priority = { rejected: 0, pending_review: 1, draft: 2, approved: 3 };
  return [...reports].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9))[0];
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
  const reports = getReportsForServico(servico.id);
  if (reports.some((r) => r.status === 'rejected')) return 'rejected';
  if (reports.some((r) => r.status === 'pending_review')) return 'scheduled';
  if (reports.length && reports.every((r) => r.status === 'approved')) return 'completed';
  if (reports.length) return 'scheduled';
  if (servico.status === 'approved') return 'completed';
  return 'scheduled';
}

/**
 * Lista para o calendário RH: serviços (novo modelo) + trabalhos legados sem serviço.
 */
export function getAdminCalendarItems() {
  const servicos = getServicosSnapshot();
  const servicoIds = new Set(servicos.map((s) => String(s.id)));
  const fromServicos = servicos.map(servicoToCalendarItem);
  const legacyJobs = getAllJobs().filter((j) => !servicoIds.has(String(j.id)));
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
  const labels = [
    ...new Set(
      reports.map((r) => getServiceType(r.serviceType)?.label || r.serviceType).filter(Boolean),
    ),
  ];
  if (labels.length === 1) return labels[0];
  if (labels.length > 1) return `${labels.length} relatórios`;
  return `${reports.length} relatório(s)`;
}

export function hasServicosSupport() {
  return isServicosCacheLoaded();
}
