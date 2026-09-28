/**
 * Destinatários de Web Push — técnicos por nome/id, RH por role.
 */

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isRhRole(role) {
  const r = normalizeToken(role);
  return r === 'rh' || r === 'admin' || r === 'administracao';
}

/**
 * @param {{ role?: string, technician_id?: string, technician_name?: string }} row
 * @param {{ audience: 'rh' | 'technicians', technicianNames?: string[], technicianIds?: string[] }} filter
 */
function subscriptionMatchesNotify(row, filter) {
  if (!row || !filter) return false;
  if (filter.audience === 'rh') return isRhRole(row.role);

  const names = new Set(
    (filter.technicianNames || []).map(normalizeToken).filter(Boolean),
  );
  const ids = new Set((filter.technicianIds || []).map(normalizeToken).filter(Boolean));
  if (!names.size && !ids.size) return false;

  const rowId = normalizeToken(row.technician_id);
  const rowName = normalizeToken(row.technician_name);
  if (rowId && ids.has(rowId)) return true;
  if (rowName && names.has(rowName)) return true;
  return false;
}

function splitTechnicianNames(stored) {
  if (stored == null || stored === '') return [];
  return String(stored)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  isRhRole,
  subscriptionMatchesNotify,
  splitTechnicianNames,
};
