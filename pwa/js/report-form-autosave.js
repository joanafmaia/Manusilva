/**
 * Auto-save modular — formulários de relatório técnico (localStorage, sem rede)
 */

import { saveLocalReportDraft } from './report-local-storage.js';
import { mergeReportInCache } from './relatorios-db.js';

const DEBOUNCE_MS = 80;

/** Estados em que o formulário pode ser auto-gravado */
export function canAutosaveReport(existingReport, job) {
  if (job?.status === 'completed') return false;
  if (existingReport?.status === 'approved') return false;
  return true;
}

/**
 * Inicia auto-save no overlay do relatório.
 * @param {object} ctx
 * @param {HTMLElement} ctx.overlay
 * @param {object} ctx.job
 * @param {object|null} ctx.existingReport
 * @param {() => object} ctx.buildReport — devolve payload completo do relatório
 * @returns {{ flush: () => void, destroy: () => void, markDirty: () => void }}
 */
export function initReportFormAutosave({ overlay, job, existingReport, buildReport }) {
  const noop = () => {};
  if (!canAutosaveReport(existingReport, job)) {
    return { flush: noop, destroy: noop, markDirty: noop };
  }

  const reportId = existingReport?.id || `rep-draft-${job.id}`;
  let debounceTimer = null;
  let destroyed = false;
  const statusEl = overlay.querySelector('#form-autosave-status');

  const setStatus = (state) => {
    if (!statusEl || destroyed) return;
    statusEl.dataset.state = state;
    if (state === 'idle') {
      statusEl.textContent = '';
      statusEl.hidden = true;
      return;
    }
    statusEl.hidden = false;
    if (state === 'pending') statusEl.textContent = '🔄 A gravar alterações…';
    else if (state === 'saved') statusEl.textContent = '✓ Guardado no tablet';
    else if (state === 'error') statusEl.textContent = 'Erro ao guardar — tente «Guardar Rascunho»';
  };

  const persist = () => {
    if (destroyed) return;
    try {
      const report = buildReport();
      report.id = reportId;
      if (report.status !== 'pending_review') {
        report.status = 'draft';
      }
      saveLocalReportDraft(report);
      mergeReportInCache(report);
      setStatus('saved');
    } catch (err) {
      console.error('[Auto-save] Erro ao guardar rascunho:', err);
      setStatus('error');
    }
  };

  const scheduleSave = () => {
    if (destroyed) return;
    setStatus('pending');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(persist, DEBOUNCE_MS);
  };

  const onActivity = (e) => {
    if (destroyed) return;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (
      t.closest(
        '.dynamic-table-add, .grandes-battery-add, .btn-row-remove, .grandes-battery-remove',
      )
    ) {
      scheduleSave();
      return;
    }
    if (t.closest('button, [type="button"], .modal-overlay, .pdf-preview-overlay')) return;
    if (t.closest('#btn-preview-pdf, #btn-submit-report')) return;
    scheduleSave();
  };

  const onBeforeUnload = () => {
    clearTimeout(debounceTimer);
    persist();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(debounceTimer);
      persist();
    }
  };

  overlay.addEventListener('input', onActivity, true);
  overlay.addEventListener('change', onActivity, true);
  overlay.addEventListener('click', onActivity, true);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    markDirty: scheduleSave,
    flush: () => {
      clearTimeout(debounceTimer);
      persist();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(debounceTimer);
      overlay.removeEventListener('input', onActivity, true);
      overlay.removeEventListener('change', onActivity, true);
      overlay.removeEventListener('click', onActivity, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      setStatus('idle');
    },
  };
}
