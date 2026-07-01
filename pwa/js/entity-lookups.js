/**
 * Resolução de entidades (clientes, técnicos, trabalhos, relatórios).
 */

import {
  CLIENTS,
  DEMO_CLIENT_FORKLIFTS,
  mapClientToLegacy,
  TECHNICIANS,
  SERVICE_TYPES,
  reportTemplates,
} from './mock_data.js';
import { getClientFromCatalog } from './clients-catalog.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import { getReportsSnapshot, dedupeReportsForDisplay } from './relatorios-db.js';
import { sameEntityId } from './entity-id.js';
import { isDevMockEnabled } from './env.js';
import {
  jobMatchesTechnician,
  splitTechnicianStoredValue,
} from './job-technician-utils.js';
import { getDB } from './local-db.js';

export function getClient(id) {
  const raw = (getDB().clients || []).find((c) => sameEntityId(c.id, id));
  if (raw) {
    const legacy = raw.name ? raw : mapClientToLegacy(raw);
    if (isDevMockEnabled()) {
      const demo = DEMO_CLIENT_FORKLIFTS[id];
      if (demo?.forklifts?.length && !legacy.forklifts?.length) {
        legacy.forklifts = demo.forklifts;
      }
    }
    return legacy;
  }

  const fromCatalog = getClientFromCatalog(id);
  if (fromCatalog) {
    const legacy = mapClientToLegacy(fromCatalog);
    if (isDevMockEnabled()) {
      const demo = DEMO_CLIENT_FORKLIFTS[id];
      if (demo?.forklifts?.length) legacy.forklifts = demo.forklifts;
    }
    return legacy;
  }

  if (isDevMockEnabled()) {
    const demoOnly = DEMO_CLIENT_FORKLIFTS[id];
    if (demoOnly) {
      return mapClientToLegacy({
        id,
        Nome: demoOnly.Nome || 'Cliente demo',
        NIF: demoOnly.NIF || '',
        forklifts: demoOnly.forklifts || [],
      });
    }
    return CLIENTS.find((c) => sameEntityId(c.id, id)) || null;
  }

  return null;
}

/** Técnicos persistidos + demonstração (sem duplicar id) */
export function getAllTechnicians() {
  const db = getDB();
  const stored = Array.isArray(db.technicians) ? db.technicians : [];
  const seen = new Set(stored.map((t) => t.id));
  const merged = [...stored];
  TECHNICIANS.forEach((t) => {
    if (!seen.has(t.id)) merged.push(t);
  });
  return merged;
}

export function getTechnician(id) {
  return getAllTechnicians().find((t) => t.id === id) || null;
}

export function parseTechnicianNamesFromJob(technicianId) {
  if (!technicianId) return [];
  const stored = String(technicianId);
  const byId = getTechnician(stored);
  if (byId?.name) return [byId.name];
  return splitTechnicianStoredValue(stored);
}

export function getJobTechnicianLabel(technicianId) {
  const names = parseTechnicianNamesFromJob(technicianId);
  return names.length ? names.join(', ') : '—';
}

export function getPrimaryTechnicianForJob(job) {
  if (!job?.technicianId) return null;
  const byId = getTechnician(job.technicianId);
  if (byId) return byId;
  const names = parseTechnicianNamesFromJob(job.technicianId);
  if (!names.length) return null;
  return getAllTechnicians().find((t) => t.name === names[0]) || null;
}

export function jobAssignedToTechnician(job, techId) {
  if (!job || !techId) return false;
  const tech = getTechnician(techId);
  return jobMatchesTechnician(job.technicianId, {
    techId,
    techName: tech?.name,
  });
}

export function getServiceType(id) {
  if (id === 'proposta_ms015_rh') {
    return { id, label: 'Proposta comercial', icon: '📋' };
  }
  return reportTemplates.find((s) => s.id === id) || SERVICE_TYPES.find((s) => s.id === id);
}

export function getForklift(clientId, serial) {
  const client = getClient(clientId);
  return client?.forklifts.find((f) => f.serial === serial);
}

export function getJob(id) {
  return getJobsSnapshot().find((j) => sameEntityId(j.id, id)) || null;
}

export function getReport(id) {
  return getReportsSnapshot().find((r) => sameEntityId(r.id, id)) || null;
}

export function getReportForJob(jobId) {
  if (jobId == null || jobId === '') return null;
  const matches = getReportsSnapshot().filter((r) => sameEntityId(r.jobId, jobId));
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return dedupeReportsForDisplay(matches)[0] || matches[0];
}

export function resolveJobForForm(jobId) {
  if (!jobId) return null;
  const cached = getJob(jobId);
  if (cached) return cached;

  const report = getReportForJob(jobId);
  if (!report) return null;

  return {
    id: String(report.jobId || jobId),
    clientId: report.clientId != null ? String(report.clientId) : '',
    serviceType: report.serviceType,
    forkliftSerial: report.forkliftSerial || '',
    date: report.submittedAt?.split('T')[0] || '',
    time: '',
    technicianId: report.technicianId,
    status: report.status === 'rejected' ? 'rejected' : 'scheduled',
    rejectionNote: report.rejectionNote ?? null,
  };
}

export function getJobsForTechnician(techId, date) {
  return getJobsSnapshot().filter((j) => j.date === date && jobAssignedToTechnician(j, techId));
}

export function getAllJobs() {
  return getJobsSnapshot();
}
