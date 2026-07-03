/**
 * Tombstones locais — relatórios eliminados pelo técnico não devem reaparecer
 * após hidratação, sync ou recarregar dados do servidor (especialmente offline).
 */

const STORAGE_KEY = 'manusilva_relatorios_eliminados';
const MAX_ENTRIES = 300;

function readEntries() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeEntries(list) {
  if (typeof localStorage === 'undefined') return;
  const trimmed = (list || []).slice(-MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Marca relatório como eliminado neste dispositivo.
 * @param {{ id?: string, servicoId?: string, serviceType?: string }} report
 */
export function markReportLocallyDeleted(report) {
  const id = report?.id ? String(report.id) : '';
  if (!id) return;

  const entries = readEntries();
  if (entries.some((e) => String(e.id) === id)) return;

  entries.push({
    id,
    servicoId: report.servicoId ? String(report.servicoId) : '',
    serviceType: report.serviceType || '',
    deletedAt: new Date().toISOString(),
  });
  writeEntries(entries);
}

export function isReportLocallyDeleted(reportOrId) {
  const id =
    typeof reportOrId === 'object' && reportOrId != null
      ? reportOrId.id
      : reportOrId;
  if (id == null || id === '') return false;
  const key = String(id);
  return readEntries().some((e) => String(e.id) === key);
}

export function clearReportLocallyDeleted(reportId) {
  if (reportId == null || reportId === '') return;
  const key = String(reportId);
  writeEntries(readEntries().filter((e) => String(e.id) !== key));
}

/** Remove do array relatórios marcados como eliminados localmente. */
export function filterOutLocallyDeletedReports(reports = []) {
  return reports.filter((r) => !isReportLocallyDeleted(r));
}

/** Limpa o cache em memória de relatórios com tombstone local. */
export async function purgeLocallyDeletedFromCache() {
  const { getReportsSnapshot, removeReportFromCache } = await import('./relatorios-db.js');
  for (const report of getReportsSnapshot()) {
    if (isReportLocallyDeleted(report)) {
      removeReportFromCache(report.id);
    }
  }
}

/**
 * Com rede: confirma eliminação no Supabase e limpa tombstones resolvidos.
 * @returns {Promise<{ reconciled: number, pending: number }>}
 */
export async function reconcileLocallyDeletedReports() {
  const entries = readEntries();
  if (!entries.length) return { reconciled: 0, pending: 0 };

  const { canSyncToServer } = await import('./trabalhos-offline.js');
  if (!canSyncToServer()) {
    return { reconciled: 0, pending: entries.length };
  }

  const { deleteRelatorioById, isUuid } = await import('./relatorios-db.js');
  let reconciled = 0;

  for (const entry of entries) {
    const id = String(entry.id || '');
    if (!id) {
      continue;
    }

    if (!isUuid(id)) {
      clearReportLocallyDeleted(id);
      reconciled += 1;
      continue;
    }

    try {
      await deleteRelatorioById(id);
      clearReportLocallyDeleted(id);
      reconciled += 1;
    } catch (err) {
      console.warn('[ManuSilva] reconcileLocallyDeletedReports:', id, err);
    }
  }

  return { reconciled, pending: readEntries().length };
}
