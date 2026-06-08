/**
 * Manusilva PWA — Formulários dinâmicos (8 relatórios reais)
 */

import { getSession } from './session.js';
import {
  getClient,
  getTechnician,
  getPrimaryTechnicianForJob,
  getServiceType,
  getJob,
  getReportForJob,
  submitReport,
  saveReportDraft,
  closeModal,
  escapeHtml,
  formatDateLong,
  showToast,
} from './app.js';
import {
  renderReportFields,
  renderReportFormTabsNav,
  bindReportFormTabs,
  collectReportValues,
  bindFormFieldInteractions,
  renderJobClientHeader,
  getServiceFormTitle,
  buildFormPrefill,
  mergeFormValues,
  isOfficialTemplate,
} from './form-engine.js';
import {
  migrateLegacyBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  init as initGrandesBatteryTable,
} from './views/relatorio-grandes.js';
import { createSignatureBlock, initSignaturePads, refreshSignaturePads } from './signatures.js';
import { initReportFormAutosave } from './report-form-autosave.js';
import {
  syncJobFotosAntesDepois,
  ensureFotoUrlsOnTrabalho,
  formatFotoStorageError,
} from './foto-trabalho-storage.js';

let signaturePads = {};
/** @type {{ flush: Function, destroy: Function, markDirty: Function } | null} */
let formAutosave = null;

/** ID do trabalho em correção (relatório já submetido, ainda pendente de RH). */
let trabalhoIdEmEdicao = null;
/** ID do relatório Supabase em correção. */
let relatorioIdEmEdicao = null;

/** @type {{ file: File|null, previewUrl: string|null, remoteUrl: string|null, cleared: boolean }} */
let fotoAntesState = { file: null, previewUrl: null, remoteUrl: null, cleared: false };
/** @type {{ file: File|null, previewUrl: string|null, remoteUrl: string|null, cleared: boolean }} */
let fotoDepoisState = { file: null, previewUrl: null, remoteUrl: null, cleared: false };

function resetFotoState(job, existingReport) {
  const data = existingReport?.data || {};
  fotoAntesState = {
    file: null,
    previewUrl: null,
    remoteUrl: job?.fotoAntes || data.fotoAntesUrl || null,
    cleared: false,
  };
  fotoDepoisState = {
    file: null,
    previewUrl: null,
    remoteUrl: job?.fotoDepois || data.fotoDepoisUrl || null,
    cleared: false,
  };
}

function clearEdicaoState() {
  trabalhoIdEmEdicao = null;
  relatorioIdEmEdicao = null;
}

function isEdicaoPendenteAtiva(jobId) {
  return Boolean(trabalhoIdEmEdicao && jobId && trabalhoIdEmEdicao === jobId);
}

function fotoDisplayUrl(state) {
  if (state.cleared) return null;
  return state.previewUrl || state.remoteUrl || null;
}

/**
 * @param {string} jobId
 * @param {{ editPending?: boolean }} [options]
 */
export function openJobForm(jobId, options = {}) {
  const job = getJob(jobId);
  if (!job) return;

  const client = getClient(job.clientId);
  const session = getSession();
  const tech =
    getTechnician(session?.technicianId) || getPrimaryTechnicianForJob(job);
  const service = getServiceType(job.serviceType);
  const existingReport = getReportForJob(jobId);

  if (existingReport?.status === 'approved') {
    showToast('Este relatório já foi aprovado pelo RH e não pode ser editado.', 'warning', 5000);
    return;
  }

  const editPending =
    options.editPending === true ||
    (options.editPending !== false && existingReport?.status === 'pending_review');

  clearEdicaoState();
  if (editPending && existingReport?.status === 'pending_review') {
    trabalhoIdEmEdicao = jobId;
    relatorioIdEmEdicao = existingReport.id || null;
  }

  resetFotoState(job, existingReport);

  const overlay = document.createElement('div');
  overlay.id = 'form-overlay';
  overlay.className = 'form-overlay';
  overlay.innerHTML = buildFormHTML(job, client, tech, service, existingReport);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('show'));

  bindFormEvents(overlay, job, client, tech, service, existingReport);

  if (trabalhoIdEmEdicao) {
    showToast('Pode editar o relatório enquanto aguarda aprovação do RH.', 'info', 4000);
  } else if (existingReport?.status === 'draft') {
    showToast('Rascunho anterior recuperado automaticamente.', 'info', 3500);
  }
}

function getFormValues(existingReport) {
  const data = existingReport?.data || {};
  return data.values || legacyToValues(data);
}

/** Compatibilidade com relatórios antigos em localStorage */
function legacyToValues(data) {
  const values = {};
  Object.assign(values, data.textFields || {});
  Object.assign(values, data.dropdowns || {});
  Object.entries(data.checklists || {}).forEach(([id, v]) => {
    values[id] = v === true ? 'Sim' : v === false ? 'Não' : v;
  });
  return values;
}

function renderLockedClientHiddenFields(client, values) {
  const nome = values.cliente || client?.Nome || client?.name || '';
  const id = values.cliente_id || client?.NIF || client?.id || '';
  return `
    <input type="hidden" data-field-id="cliente" data-field-kind="text" value="${escapeHtml(nome)}">
    <input type="hidden" data-field-id="cliente_id" data-field-kind="text" value="${escapeHtml(id)}">
  `;
}

function renderFotoPreviewHtml(url, label) {
  if (!url) {
    return `<div class="foto-antes-depois-placeholder" aria-hidden="true"><span>📷</span><span>${escapeHtml(label)}</span></div>`;
  }
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" class="foto-antes-depois-img" loading="lazy">`;
}

function buildFormHTML(job, client, tech, service, existingReport) {
  const saved = getFormValues(existingReport);
  const formContext = {
    tech,
    client,
    job,
    selectedClientId: saved.cliente_id || client.NIF || client.id,
    lockClient: true,
  };
  const prefill = buildFormPrefill(service, job, null, formContext);
  const values = mergeFormValues(saved, prefill);
  if (service?.id === 'manutencao_baterias_grandes') {
    values[GRANDES_BATTERY_FIELD_ID] = migrateLegacyBatteryRows(values);
  }
  const official = isOfficialTemplate(service);
  const clientHeader = renderJobClientHeader(client);
  const lockedClientFields = renderLockedClientHiddenFields(client, values);
  const formTitle = getServiceFormTitle(service);
  const tabsNav = service ? renderReportFormTabsNav(service) : '';
  const fieldsGeral = service ? renderReportFields(service, values, formContext, { tab: 'geral' }) : '';
  const fieldsChecklist = service ? renderReportFields(service, values, formContext, { tab: 'checklist' }) : '';
  const fieldsFinalizacao = service ? renderReportFields(service, values, formContext, { tab: 'finalizacao' }) : '';

  const rejectionBanner = job.status === 'rejected' && job.rejectionNote ? `
    <div class="rejection-banner">
      <div class="rejection-icon">⚠</div>
      <div>
        <strong>Relatório Rejeitado pelo RH</strong>
        <p>${escapeHtml(job.rejectionNote)}</p>
      </div>
    </div>
  ` : '';

  const editPendingBanner = trabalhoIdEmEdicao ? `
    <div class="edit-pending-banner">
      <span class="edit-pending-banner-icon" aria-hidden="true">✏️</span>
      <div>
        <strong>Edição de relatório pendente</strong>
        <p>As alterações substituem a submissão anterior. As fotos existentes mantêm-se se não tirar novas.</p>
      </div>
    </div>
  ` : '';

  const antesUrl = fotoDisplayUrl(fotoAntesState);
  const depoisUrl = fotoDisplayUrl(fotoDepoisState);

  const fotoSection = `
    <section class="form-section form-section--final form-section-card">
      <h3 class="section-title">Fotos do Trabalho <span class="text-muted section-title-hint">(opcional)</span></h3>
      <p class="text-muted foto-antes-depois-hint">Pode anexar só Antes, só Depois, as duas ou nenhuma.</p>
      <div class="foto-antes-depois-grid">
        <div class="foto-antes-depois-card">
          <span class="foto-antes-depois-label">Foto Antes</span>
          <div class="foto-antes-depois-preview" id="foto-antes-preview">${renderFotoPreviewHtml(antesUrl, 'Antes')}</div>
          <input type="file" id="foto-antes-input" class="foto-antes-depois-input" accept="image/*" capture="environment" hidden>
          <label for="foto-antes-input" class="btn-foto">📷 Tirar Foto</label>
          <button type="button" class="btn-ghost btn-sm foto-antes-depois-clear" data-clear-foto="antes" ${antesUrl ? '' : 'hidden'}>Remover</button>
        </div>
        <div class="foto-antes-depois-card">
          <span class="foto-antes-depois-label">Foto Depois</span>
          <div class="foto-antes-depois-preview" id="foto-depois-preview">${renderFotoPreviewHtml(depoisUrl, 'Depois')}</div>
          <input type="file" id="foto-depois-input" class="foto-antes-depois-input" accept="image/*" capture="environment" hidden>
          <label for="foto-depois-input" class="btn-foto">📷 Tirar Foto</label>
          <button type="button" class="btn-ghost btn-sm foto-antes-depois-clear" data-clear-foto="depois" ${depoisUrl ? '' : 'hidden'}>Remover</button>
        </div>
      </div>
    </section>
    <section class="form-section form-section--final form-section-card">
      <h3 class="section-title">Assinaturas Digitais</h3>
      <div class="signatures-grid">
        ${createSignatureBlock('Assinatura do Técnico', 'technician')}
        ${createSignatureBlock('Assinatura do Cliente', 'client')}
      </div>
    </section>
  `;

  return `
    <div class="form-workspace form-workspace--report">
      <div class="form-panel form-panel--premium glass-card">
        <div class="form-panel-header form-panel-header--minimal">
          <button type="button" class="btn-ghost" id="close-form">&larr; Voltar</button>
        </div>

        ${tabsNav}

        <div class="form-panel-body">
          ${rejectionBanner}
          ${editPendingBanner}

          <div class="report-tab-panels">
            <div class="report-tab-panel is-active" data-report-panel="geral" id="report-panel-geral" role="tabpanel" aria-labelledby="report-tab-geral">
              <div class="form-section-card form-section-card--intro">
                ${clientHeader}
                ${lockedClientFields}
                <h2 class="form-report-title">${service?.icon || '📋'} ${escapeHtml(formTitle)}</h2>
                <div class="form-fixed-header glass-card-inner ${official ? 'form-fixed-header--compact' : ''}">
                  <div class="header-grid">
                    <div class="header-field"><span class="hf-label">Data do Serviço</span><span class="hf-value">${formatDateLong(job.date)}</span></div>
                    <div class="header-field"><span class="hf-label">Técnico</span><span class="hf-value">${escapeHtml(tech.name)}</span></div>
                  </div>
                </div>
              </div>
              <section class="form-section report-fields-section">
                ${official ? '' : '<h3 class="section-title">Dados do Relatório</h3>'}
                <div class="report-fields">${fieldsGeral}</div>
              </section>
            </div>

            <div class="report-tab-panel" data-report-panel="checklist" id="report-panel-checklist" role="tabpanel" aria-labelledby="report-tab-checklist" hidden>
              <section class="form-section report-fields-section report-fields-section--checklist">
                <div class="report-fields">${fieldsChecklist}</div>
              </section>
            </div>

            <div class="report-tab-panel" data-report-panel="finalizacao" id="report-panel-finalizacao" role="tabpanel" aria-labelledby="report-tab-finalizacao" hidden>
              <section class="form-section report-fields-section">
                <div class="report-fields">${fieldsFinalizacao}</div>
              </section>
              ${fotoSection}
            </div>
          </div>
        </div>

        <div class="form-panel-footer form-panel-footer--stacked">
          <button type="button" class="btn-preview" id="btn-preview-pdf">
            <span class="btn-preview-icon" aria-hidden="true">👁️</span>
            Pré-visualizar Relatório
          </button>
          <div class="form-panel-footer-row">
            ${trabalhoIdEmEdicao ? '' : '<button type="button" class="btn-secondary btn-touch" id="btn-save-draft">Gravar Rascunho</button>'}
            <button type="button" class="btn-primary btn-touch" id="btn-submit-report">${trabalhoIdEmEdicao ? 'Guardar alterações' : 'Submeter Relatório'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildReportFromForm(overlay, job, existingReport, signaturePads, reportId) {
  const values = collectReportValues(overlay);
  const editingPending = isEdicaoPendenteAtiva(job.id);
  return {
    id: relatorioIdEmEdicao || reportId || existingReport?.id || null,
    jobId: job.id,
    technicianId:
      getSession()?.technicianId ||
      getPrimaryTechnicianForJob(job)?.id ||
      job.technicianId,
    clientId: job.clientId,
    forkliftSerial: job.forkliftSerial,
    serviceType: job.serviceType,
    status: editingPending ? 'pending_review' : existingReport?.status || 'draft',
    submittedAt: existingReport?.submittedAt || new Date().toISOString(),
    data: {
      values,
      signatures: {
        technician: signaturePads.technician?.hasSignature || false,
        client: signaturePads.client?.hasSignature || false,
        technicianData: signaturePads.technician?.toDataURL?.() || null,
        clientData: signaturePads.client?.toDataURL?.() || null,
      },
      fotoAntesUrl: fotoDisplayUrl(fotoAntesState),
      fotoDepoisUrl: fotoDisplayUrl(fotoDepoisState),
    },
    rejectionNote: null,
  };
}

function updateFotoPreview(overlay, which) {
  const state = which === 'antes' ? fotoAntesState : fotoDepoisState;
  const preview = overlay.querySelector(`#foto-${which}-preview`);
  const clearBtn = overlay.querySelector(`[data-clear-foto="${which}"]`);
  const url = fotoDisplayUrl(state);
  if (preview) {
    preview.innerHTML = renderFotoPreviewHtml(url, which === 'antes' ? 'Antes' : 'Depois');
  }
  if (clearBtn) clearBtn.hidden = !url;
}

function bindFotoInputs(overlay) {
  const bindOne = (which) => {
    const input = overlay.querySelector(`#foto-${which}-input`);
    const state = which === 'antes' ? fotoAntesState : fotoDepoisState;

    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Selecione um ficheiro de imagem.', 'error');
        input.value = '';
        return;
      }
      if (state.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state.file = file;
      state.previewUrl = URL.createObjectURL(file);
      state.cleared = false;
      updateFotoPreview(overlay, which);
      formAutosave?.markDirty();
    });
  };

  bindOne('antes');
  bindOne('depois');

  overlay.querySelectorAll('[data-clear-foto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.clearFoto;
      const state = which === 'antes' ? fotoAntesState : fotoDepoisState;
      if (state.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state.file = null;
      state.previewUrl = null;
      state.cleared = true;
      const input = overlay.querySelector(`#foto-${which}-input`);
      if (input) input.value = '';
      updateFotoPreview(overlay, which);
      formAutosave?.markDirty();
    });
  });
}

async function persistJobFotos(jobId) {
  const result = await syncJobFotosAntesDepois(jobId, {
    antesFile: fotoAntesState.file,
    depoisFile: fotoDepoisState.file,
    fotoAntesUrl: fotoAntesState.remoteUrl,
    fotoDepoisUrl: fotoDepoisState.remoteUrl,
    clearAntes: fotoAntesState.cleared,
    clearDepois: fotoDepoisState.cleared,
  });

  if (result.fotoAntes) {
    fotoAntesState.remoteUrl = result.fotoAntes;
    fotoAntesState.file = null;
    fotoAntesState.cleared = false;
  } else if (fotoAntesState.cleared) {
    fotoAntesState.remoteUrl = null;
  }

  if (result.fotoDepois) {
    fotoDepoisState.remoteUrl = result.fotoDepois;
    fotoDepoisState.file = null;
    fotoDepoisState.cleared = false;
  } else if (fotoDepoisState.cleared) {
    fotoDepoisState.remoteUrl = null;
  }

  return result;
}

let signaturesRestoredFromReport = false;

function restoreSignaturesFromReport(existingReport) {
  if (signaturesRestoredFromReport) return;
  const sig = existingReport?.data?.signatures;
  if (!sig?.technicianData && !sig?.clientData) return;
  refreshSignaturePads(signaturePads);
  signaturePads.technician?.loadFromDataURL(sig.technicianData);
  signaturePads.client?.loadFromDataURL(sig.clientData);
  signaturesRestoredFromReport = true;
}

function onReportTabActivated(tabId) {
  if (tabId !== 'finalizacao') return;
  refreshSignaturePads(signaturePads);
  restoreSignaturesFromReport(existingReportRef);
}

let existingReportRef = null;

function activateReportTab(overlay, tabId) {
  const btn = overlay.querySelector(`[data-report-tab="${tabId}"]`);
  btn?.click();
}

function bindFormEvents(overlay, job, client, tech, service, existingReport) {
  const draftReportId = existingReport?.id || null;
  existingReportRef = existingReport;
  signaturesRestoredFromReport = false;

  overlay.querySelector('#close-form').addEventListener('click', () => {
    formAutosave?.flush();
    closeForm(overlay);
  });

  bindFormFieldInteractions(overlay).catch((err) => {
    console.error('[Form] Interações dos campos:', err);
    showToast('Alguns controlos do formulário podem não responder. Recarregue a página.', 'error');
  });
  bindReportFormTabs(overlay, { onTabActivate: onReportTabActivated });

  bindFotoInputs(overlay);

  signaturePads = initSignaturePads(['technician', 'client'], () => {
    formAutosave?.markDirty();
  });

  formAutosave = initReportFormAutosave({
    overlay,
    job,
    existingReport,
    buildReport: () => buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId),
  });

  if (service?.id === 'manutencao_baterias_grandes') {
    initGrandesBatteryTable(overlay, {
      onRowChange: () => formAutosave?.markDirty(),
    });
  }

  const saveWithFotos = async () => {
    try {
      await persistJobFotos(job.id);
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
    } catch (err) {
      console.error('[Form] Upload fotos:', err);
      showToast(formatFotoStorageError(err), 'error', 9000);
      throw err;
    }
  };

  overlay.querySelector('#btn-save-draft')?.addEventListener('click', async () => {
    formAutosave?.flush();
    try {
      const fotoResult = await persistJobFotos(job.id);
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
      const report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      report.data.fotoAntesUrl = fotoResult.fotoAntes || report.data.fotoAntesUrl || null;
      report.data.fotoDepoisUrl = fotoResult.fotoDepois || report.data.fotoDepoisUrl || null;
      await ensureFotoUrlsOnTrabalho(job.id, report.data.fotoAntesUrl, report.data.fotoDepoisUrl);
      await saveReportDraft(report);
    } catch {
      /* toast já mostrado */
    }
  });

  overlay.querySelector('#btn-preview-pdf')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#btn-preview-pdf');
    btn.disabled = true;
    let previewModule;
    try {
      const report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      previewModule = await import('./pdf-preview.js');
      await previewModule.previewReportPDF(report);
    } catch (err) {
      console.error(err);
    } finally {
      previewModule?.showPdfPreviewLoading?.(false);
      btn.disabled = false;
    }
  });

  overlay.querySelector('#btn-submit-report').addEventListener('click', async () => {
    if (!signaturePads.technician?.hasSignature) {
      activateReportTab(overlay, 'finalizacao');
      refreshSignaturePads(signaturePads);
      showToast('A assinatura do técnico é obrigatória. Assine na aba Finalização.', 'error');
      overlay.querySelector('#sig-technician')?.focus?.();
      return;
    }

    formAutosave?.destroy();
    formAutosave = null;

    try {
      const fotoResult = await persistJobFotos(job.id);
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
      const report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      if (relatorioIdEmEdicao) report.id = relatorioIdEmEdicao;
      else if (existingReport?.id) report.id = existingReport.id;
      report.data.fotoAntesUrl =
        fotoResult.fotoAntes || report.data.fotoAntesUrl || fotoAntesState.remoteUrl || null;
      report.data.fotoDepoisUrl =
        fotoResult.fotoDepois || report.data.fotoDepoisUrl || fotoDepoisState.remoteUrl || null;
      await ensureFotoUrlsOnTrabalho(job.id, report.data.fotoAntesUrl, report.data.fotoDepoisUrl);

      const isCorrection = isEdicaoPendenteAtiva(job.id);
      await submitReport(report, { isCorrection });
      clearEdicaoState();
      closeForm(overlay);
      window.dispatchEvent(new CustomEvent('jobs-updated'));
      window.dispatchEvent(new CustomEvent('db-updated'));
    } catch {
      /* toast já mostrado */
    }
  });
}

function closeForm(overlay) {
  clearEdicaoState();
  existingReportRef = null;
  signaturesRestoredFromReport = false;
  formAutosave?.destroy();
  formAutosave = null;
  if (fotoAntesState.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(fotoAntesState.previewUrl);
  if (fotoDepoisState.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(fotoDepoisState.previewUrl);
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 300);
}
