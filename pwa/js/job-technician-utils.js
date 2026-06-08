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
