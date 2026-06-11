/**
 * Correspondência técnico ↔ valor em trabalhos.tecnico_id (id legado ou «Nome1, Nome2»).
 */

export function splitTechnicianStoredValue(stored) {
  if (stored == null || stored === '') return [];
  return String(stored)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} stored — valor em trabalhos.tecnico_id
 * @param {{ techId?: string, techName?: string }} match
 */
export function jobMatchesTechnician(stored, { techId, techName }) {
  if (stored == null || stored === '') return false;
  const value = String(stored);
  if (techId && value === techId) return true;
  if (!techName) return false;
  if (!value.includes(',')) {
    return value === techName;
  }
  return splitTechnicianStoredValue(value).includes(techName);
}

/**
 * O relatório pertence à equipa do técnico?
 * O relatório guarda apenas quem o digitou (tecnico_id de sessão), mas o trabalho
 * associado guarda a equipa completa («Hugo, Filipe»). Conta para todos os envolvidos.
 *
 * @param {object} report — relatório (technicianId = submissor)
 * @param {object|null} job — trabalho associado (technicianId pode ser lista CSV)
 * @param {{ techId?: string, techName?: string }} match
 */
export function reportMatchesTechnicianTeam(report, job, { techId, techName }) {
  if (jobMatchesTechnician(report?.technicianId, { techId, techName })) return true;
  return jobMatchesTechnician(job?.technicianId, { techId, techName });
}
