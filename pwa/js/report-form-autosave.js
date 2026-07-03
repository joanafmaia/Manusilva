/**
 * Auto-save modular — formulários de relatório técnico (IndexedDB, sem rede)
 */

import { saveLocalReportDraft } from './report-local-storage.js';
import { mergeReportInCache } from './relatorios-db.js';

const DEBOUNCE_MS = 800;
const PHOTO_WAIT_POLL_MS = 50;
const SAVED_INDICATOR_MS = 12000;

function formatAutosaveTime(date = new Date()) {
  return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Estados em que o formulário pode ser auto-gravado */
export function canAutosaveReport(existingReport, job) {
  if (job?.status === 'completed' || job?.status === 'rejected') return false;
  if (existingReport?.status === 'approved' || existingReport?.status === 'rejected') return false;
  return true;
}

/**
 * Inicia auto-save no overlay do relatório.
 * @param {object} ctx
 * @param {HTMLElement} ctx.overlay
 * @param {object} ctx.job
 * @param {object|null} ctx.existingReport
 * @param {() => object} ctx.buildReport — devolve payload completo do relatório
 */
export function initReportFormAutosave({ overlay, job, existingReport, buildReport }) {
  const noop = () => {};
  const noopAsync = () => Promise.resolve();

  if (!canAutosaveReport(existingReport, job)) {
    return {
      flush: noopAsync,
      destroy: noop,
      markDirty: noop,
      beginPhotoProcessing: noop,
      endPhotoProcessingAndSave: noop,
    };
  }

  const reportId = existingReport?.id || `rep-draft-${job.id}`;
  let debounceTimer = null;
  let destroyed = false;
  let saveQueue = Promise.resolve();
  let photoProcessingCount = 0;
  let savedHideTimer = null;

  const statusEl = overlay.querySelector('#form-autosave-status');

  const clearSavedHideTimer = () => {
    if (savedHideTimer) {
      clearTimeout(savedHideTimer);
      savedHideTimer = null;
    }
  };

  const setStatus = (state, customMessage = '') => {
    if (!statusEl || destroyed) return;
    clearSavedHideTimer();
    statusEl.dataset.state = state;
    statusEl.classList.remove('form-autosave-status--pulse');

    if (state === 'idle') {
      statusEl.textContent = '';
      statusEl.hidden = true;
      return;
    }

    statusEl.hidden = false;

    if (state === 'pending') {
      const offlineHint = isBrowserOffline() ? ' (sem rede — guarda no tablet)' : '';
      statusEl.textContent =
        customMessage ||
        (photoProcessingCount > 0
          ? `A processar foto…${offlineHint}`
          : `A gravar rascunho…${offlineHint}`);
      return;
    }

    if (state === 'saved') {
      const offlineHint = isBrowserOffline() ? ' · só no tablet' : '';
      statusEl.textContent =
        customMessage || `✓ Gravado às ${formatAutosaveTime()}${offlineHint}`;
      statusEl.classList.add('form-autosave-status--pulse');
      savedHideTimer = setTimeout(() => {
        if (!destroyed && statusEl.dataset.state === 'saved') {
          statusEl.textContent = `Última gravação: ${formatAutosaveTime()}`;
          statusEl.hidden = false;
        }
      }, SAVED_INDICATOR_MS);
      return;
    }

    if (state === 'error') {
      statusEl.textContent =
        customMessage || 'Erro ao gravar — tente «Gravar Rascunho»';
    }
  };

  const waitForPhotoProcessing = async () => {
    while (photoProcessingCount > 0 && !destroyed) {
      await new Promise((resolve) => setTimeout(resolve, PHOTO_WAIT_POLL_MS));
    }
  };

  const persistToIndexedDB = async () => {
    if (destroyed) return;

    await waitForPhotoProcessing();
    if (destroyed) return;

    setStatus('pending');

    let report;
    try {
      report = buildReport();
    } catch (err) {
      console.error('[Auto-save] buildReport:', err);
      throw new Error('Não foi possível ler os dados do formulário.');
    }

    if (!report?.jobId) {
      throw new Error('Rascunho sem identificador do trabalho.');
    }

    report.id = reportId;
    if (report.status !== 'pending_review') {
      report.status = 'draft';
    }

    await saveLocalReportDraft(report);
    mergeReportInCache(report);
    setStatus('saved');
  };

  const enqueuePersist = () => {
    saveQueue = saveQueue
      .then(() => persistToIndexedDB())
      .catch((err) => {
        console.error('[Auto-save] IndexedDB:', err);
        setStatus('error', err?.message ? String(err.message).slice(0, 80) : '');
      });
    return saveQueue;
  };

  const scheduleSave = (immediate = false) => {
    if (destroyed) return;
    if (photoProcessingCount > 0) {
      setStatus('pending', 'A processar foto…');
      return;
    }
    setStatus('pending');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => {
        void enqueuePersist();
      },
      immediate ? 0 : DEBOUNCE_MS,
    );
  };

  const shouldIgnoreActivityTarget = (target) => {
    if (!(target instanceof HTMLElement)) return true;
    if (target.matches('input[type="file"], .foto-antes-depois-input')) return true;
    if (target.closest('.foto-antes-depois-card, .foto-antes-depois-input')) return true;
    if (target.closest('button, [type="button"], .modal-overlay, .pdf-preview-overlay')) {
      return true;
    }
    if (target.closest('#btn-preview-pdf, #btn-submit-report, #btn-save-draft')) {
      return true;
    }
    return false;
  };

  const onActivity = (e) => {
    if (destroyed) return;
    const t = e.target;
    if (shouldIgnoreActivityTarget(t)) return;

    if (
      t instanceof HTMLElement &&
      t.closest(
        '.dynamic-table-add, .grandes-battery-add, .btn-row-remove, .grandes-battery-remove',
      )
    ) {
      scheduleSave();
      return;
    }

    scheduleSave();
  };

  const onBeforeUnload = () => {
    clearTimeout(debounceTimer);
    void enqueuePersist();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(debounceTimer);
      void enqueuePersist();
    }
  };

  overlay.addEventListener('input', onActivity, true);
  overlay.addEventListener('change', onActivity, true);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    markDirty: () => scheduleSave(),

    beginPhotoProcessing: () => {
      photoProcessingCount += 1;
      clearTimeout(debounceTimer);
      setStatus('pending', 'A processar foto…');
    },

    endPhotoProcessingAndSave: () => {
      photoProcessingCount = Math.max(0, photoProcessingCount - 1);
      if (destroyed) return;
      scheduleSave(true);
    },

    flush: () => {
      clearTimeout(debounceTimer);
      return enqueuePersist();
    },

    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(debounceTimer);
      clearSavedHideTimer();
      overlay.removeEventListener('input', onActivity, true);
      overlay.removeEventListener('change', onActivity, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      setStatus('idle');
    },
  };
}
