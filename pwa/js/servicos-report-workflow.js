/**
 * Remoção de relatórios de uma visita (serviço) pelo técnico.
 */

import { sameEntityId } from './entity-id.js';
import { getServiceType } from './entity-lookups.js';
import { showToast } from './toast-modal.js';
import {
  canRemoveServicoReport,
  getReportsForServico,
} from './servicos-panel-utils.js';
import {
  deleteRelatorioById,
  isUuid,
  removeReportFromCache,
} from './relatorios-db.js';

/**
 * Remove um rascunho da visita (cache local, IndexedDB e Supabase quando possível).
 * @param {string} servicoId
 * @param {string} reportId
 * @returns {Promise<boolean>}
 */
export async function removeServicoReport(servicoId, reportId) {
  const report = getReportsForServico(servicoId).find((r) => sameEntityId(r.id, reportId));
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }

  if (!canRemoveServicoReport(report)) {
    showToast('Este relatório já foi submetido e não pode ser removido.', 'warning', 8000);
    return false;
  }

  const st = getServiceType(report.serviceType);
  const typeLabel = st?.label || report.serviceType || 'relatório';
  const ok = window.confirm(
    `Remover o relatório «${typeLabel}» desta visita?\n\nOs dados recolhidos serão perdidos.`,
  );
  if (!ok) return false;

  try {
    const { removeLocalReportDraft, reportDraftStorageKey } = await import('./report-local-storage.js');
    try {
      await removeLocalReportDraft(reportDraftStorageKey(report));
    } catch (err) {
      console.warn('[ManuSilva] removeServicoReport — rascunho local:', err);
    }

    const { removePendingSubmissionsForReport } = await import('./trabalhos-offline.js');
    try {
      await removePendingSubmissionsForReport(report);
    } catch (err) {
      console.warn('[ManuSilva] removeServicoReport — fila offline:', err);
    }

    const { canSyncToServer } = await import('./trabalhos-offline.js');
    if (canSyncToServer() && isUuid(report.id)) {
      try {
        await deleteRelatorioById(report.id);
      } catch (err) {
        console.warn('[ManuSilva] removeServicoReport — servidor:', err);
        removeReportFromCache(report.id);
      }
    } else {
      removeReportFromCache(report.id);
    }

    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Relatório removido.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] removeServicoReport:', err);
    showToast(err?.message || 'Não foi possível remover o relatório.', 'error', 9000);
    return false;
  }
}
