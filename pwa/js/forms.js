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
  mergeStandardLayoutValues,
  renderOrdemTechnicianLine,
  renderStandardMachineBlock,
  renderStandardClosingBlock,
} from './report-layout-standard.js';
import {
  migrateLegacyBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  init as initGrandesBatteryTable,
} from './views/relatorio-grandes.js';
import {
  createSignatureBlock,
  initSignaturePads,
  refreshSignaturePads,
  technicianSignatureReady,
  padHasSignature,
  commitSignatureSnapshot,
} from './signatures.js';
import { initReportFormAutosave } from './report-form-autosave.js';
import {
  applyAutoDeslocacaoToForm,
  bindDeslocacaoVisitasRecalc,
} from './deslocacao-distance.js';
import { VISITAS_FIELD_ID, VISIT_DATES_FIELD_ID } from './deslocacao-field.js';
import { ensureProductionCatalog } from './clients-catalog.js';
import { ensureJobsLoaded } from './trabalhos-db.js';
import {
  syncJobFotosAntesDepois,
  ensureFotoUrlsOnTrabalho,
  formatFotoStorageError,
  attachOfflineFotosToReportData,
  readFileAsDataUrl,
} from './foto-trabalho-storage.js';
import { compressImageFile } from './image-compress.js';
import { resolveReportForJob } from './report-local-storage.js';
import { canReachServer } from './app.js';

let signaturePads = {};
let signaturePadsReady = false;
/** @type {{ flush: Function, destroy: Function, markDirty: Function } | null} */
let formAutosave = null;

/** ID do trabalho em correção (relatório já submetido, ainda pendente de RH). */
let trabalhoIdEmEdicao = null;
/** ID do relatório Supabase em correção. */
let relatorioIdEmEdicao = null;

/** @type {{ file: File|null, previewUrl: string|null, remoteUrl: string|null, base64: string|null, cleared: boolean }} */
let fotoAntesState = { file: null, previewUrl: null, remoteUrl: null, base64: null, cleared: false };
/** @type {{ file: File|null, previewUrl: string|null, remoteUrl: string|null, base64: string|null, cleared: boolean }} */
let fotoDepoisState = { file: null, previewUrl: null, remoteUrl: null, base64: null, cleared: false };

function resetFotoState(job, existingReport) {
  const data = existingReport?.data || {};
  const antesStored =
    data.fotoAntesBase64 || data.fotoAntesUrl || job?.fotoAntes || null;
  const depoisStored =
    data.fotoDepoisBase64 || data.fotoDepoisUrl || job?.fotoDepois || null;
  const antesBase64 = data.fotoAntesBase64 || (String(antesStored || '').startsWith('data:') ? antesStored : null);
  const depoisBase64 = data.fotoDepoisBase64 || (String(depoisStored || '').startsWith('data:') ? depoisStored : null);
  fotoAntesState = {
    file: null,
    previewUrl: null,
    remoteUrl: antesBase64 || antesStored,
    base64: antesBase64,
    cleared: false,
  };
  fotoDepoisState = {
    file: null,
    previewUrl: null,
    remoteUrl: depoisBase64 || depoisStored,
    base64: depoisBase64,
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
  return state.previewUrl || state.base64 || state.remoteUrl || null;
}

function fotoPersistPayload(state) {
  if (state.cleared) {
    return { url: null, base64: null };
  }
  const base64 = state.base64 || (String(state.remoteUrl || '').startsWith('data:') ? state.remoteUrl : null);
  return {
    url: state.previewUrl || base64 || state.remoteUrl || null,
    base64,
  };
}

/**
 * @param {string} jobId
 * @param {{ editPending?: boolean, viewOnly?: boolean }} [options]
 */
export async function openJobForm(jobId, options = {}) {
  const viewOnly = options.viewOnly === true;
  try {
    await ensureJobsLoaded();
    await ensureProductionCatalog();
  } catch (err) {
    console.warn('[Form] Pré-carga Supabase antes do relatório:', err);
  }

  const job = getJob(jobId);
  if (!job) return;

  const client = getClient(job.clientId);
  const session = getSession();
  const tech =
    getTechnician(session?.technicianId) || getPrimaryTechnicianForJob(job);
  const service = getServiceType(job.serviceType);
  const serverReport = getReportForJob(jobId);
  const editPendingOpt =
    options.editPending === true ||
    (options.editPending !== false && serverReport?.status === 'pending_review');
  const existingReport = await resolveReportForJob(jobId, serverReport, {
    editPending: editPendingOpt,
  });

  if (existingReport?.status === 'approved' && !viewOnly) {
    showToast('Este relatório já foi aprovado pelo RH e não pode ser editado.', 'warning', 5000);
    return;
  }

  if (viewOnly) {
    if (existingReport?.status !== 'approved') {
      showToast('Este relatório ainda não está concluído.', 'warning', 4500);
      return;
    }
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
  overlay.innerHTML = buildFormHTML(job, client, tech, service, existingReport, { viewOnly });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('show'));
  if (viewOnly) overlay.classList.add('form-overlay--readonly');

  bindFormEvents(overlay, job, client, tech, service, existingReport, { viewOnly });

  await bindFormFieldInteractions(overlay);

  const savedValues = getFormValues(existingReport);
  await applyAutoDeslocacaoToForm(overlay, {
    job,
    service,
    savedValues,
    onValueSet: () => formAutosave?.markDirty?.(),
  });

  bindDeslocacaoVisitasRecalc(overlay, {
    onDirty: () => formAutosave?.markDirty?.(),
  });

  if (trabalhoIdEmEdicao) {
    showToast('Pode editar o relatório enquanto aguarda aprovação do RH.', 'info', 4000);
  } else if (existingReport?.status === 'draft' || existingReport?._localSavedAt) {
    showToast('Rascunho recuperado automaticamente da memória do tablet.', 'info', 4000);
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

function buildFormHTML(job, client, tech, service, existingReport, options = {}) {
  const viewOnly = options.viewOnly === true;
  const saved = getFormValues(existingReport);
  const formContext = {
    tech,
    client,
    job,
    selectedClientId: saved.cliente_id || client.NIF || client.id,
    lockClient: true,
  };
  const prefill = buildFormPrefill(service, job, null, formContext);
  const values = mergeStandardLayoutValues(mergeFormValues(saved, prefill, service), service);
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

  const readonlyBanner = viewOnly ? `
    <div class="form-readonly-banner" role="status">
      <span aria-hidden="true">👁️</span>
      <div>
        <strong>Modo visualização</strong>
        <p>Relatório concluído — apenas leitura. Use «Pré-visualizar Relatório» para ver o PDF.</p>
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
          <span id="form-autosave-status" class="form-autosave-status" hidden aria-live="polite"></span>
        </div>

        ${tabsNav}

        <div class="form-panel-body">
          ${rejectionBanner}
          ${editPendingBanner}
          ${readonlyBanner}

          <div class="report-tab-panels">
            <div class="report-tab-panel is-active" data-report-panel="geral" id="report-panel-geral" role="tabpanel" aria-labelledby="report-tab-geral">
              <div class="form-section-card form-section-card--intro">
                ${clientHeader}
                ${lockedClientFields}
                ${official ? renderOrdemTechnicianLine(job, tech) : ''}
                ${official ? renderStandardMachineBlock(values, formContext) : ''}
                <h2 class="form-report-title">${service?.icon || '📋'} ${escapeHtml(formTitle)}</h2>
                <div class="form-fixed-header glass-card-inner ${official ? 'form-fixed-header--compact' : ''}">
                  ${official ? '<p class="form-intro-block-label">Dados da Intervenção</p>' : ''}
                  <div class="header-grid ${official ? 'header-grid--intervention' : ''}">
                    <div class="header-field"><span class="hf-label">Data do Serviço</span><span class="hf-value">${formatDateLong(job.date)}</span></div>
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
              ${official ? renderStandardClosingBlock(values, formContext) : ''}
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
          ${viewOnly ? '' : `
          <p class="form-footer-hint text-muted">Gravar Rascunho mantém o relatório <strong>em aberto</strong> para novas visitas. Concluir envia-o para aprovação do RH.</p>
          <div class="form-panel-footer-row">
            <button type="button" class="btn-secondary btn-touch" id="btn-save-draft">Gravar Rascunho</button>
            <button type="button" class="btn-primary btn-touch" id="btn-submit-report">Concluir Relatório</button>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

function resolveFormSignatures(existingReport) {
  const stored = existingReport?.data?.signatures || {};
  const techData =
    signaturePads.technician?.toDataURL?.() ||
    stored.technicianData ||
    null;
  const clientData =
    signaturePads.client?.toDataURL?.() ||
    stored.clientData ||
    null;
  return {
    technician: padHasSignature(signaturePads.technician) || Boolean(stored.technicianData),
    client: padHasSignature(signaturePads.client) || Boolean(stored.clientData),
    technicianData: techData,
    clientData: clientData,
  };
}

function accumulateVisitDates(values, existingReport) {
  const today = new Date().toISOString().split('T')[0];
  let dates = [];

  const prev =
    values[VISIT_DATES_FIELD_ID] ??
    existingReport?.data?.values?.[VISIT_DATES_FIELD_ID] ??
    existingReport?.data?.[VISIT_DATES_FIELD_ID];

  if (Array.isArray(prev)) dates = [...prev];
  else if (typeof prev === 'string' && prev.trim()) {
    dates = prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }

  if (!dates.includes(today)) dates.push(today);

  const visitas = Number(values[VISITAS_FIELD_ID] ?? values.visitas ?? 1);
  if (Number.isFinite(visitas) && visitas >= 1 && dates.length > visitas) {
    dates = dates.slice(-visitas);
  }

  values[VISIT_DATES_FIELD_ID] = dates;
  return values;
}

function buildReportFromForm(overlay, job, existingReport, signaturePads, reportId) {
  const values = collectReportValues(overlay);
  accumulateVisitDates(values, existingReport);
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
      signatures: resolveFormSignatures(existingReport),
      ...(() => {
        const antes = fotoPersistPayload(fotoAntesState);
        const depois = fotoPersistPayload(fotoDepoisState);
        return {
          fotoAntesUrl: antes.url,
          fotoAntesBase64: antes.base64,
          fotoDepoisUrl: depois.url,
          fotoDepoisBase64: depois.base64,
        };
      })(),
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

    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Selecione um ficheiro de imagem.', 'error');
        input.value = '';
        return;
      }

      formAutosave?.beginPhotoProcessing?.();

      if (state.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state.cleared = false;

      try {
        const compressed = await compressImageFile(file, { filename: which });
        state.file = compressed.file;
        state.base64 = compressed.dataUrl;
        state.previewUrl = URL.createObjectURL(compressed.file);
        updateFotoPreview(overlay, which);
      } catch (err) {
        console.error('[Form] Foto compressão:', err);
        try {
          const fallback = await readFileAsDataUrl(file);
          state.file = file;
          state.base64 = fallback;
          state.previewUrl = URL.createObjectURL(file);
          updateFotoPreview(overlay, which);
        } catch (fallbackErr) {
          console.error('[Form] Foto base64:', fallbackErr);
          state.file = null;
          state.base64 = null;
          state.previewUrl = null;
          showToast('Não foi possível processar a imagem.', 'error');
        }
      } finally {
        formAutosave?.endPhotoProcessingAndSave?.();
      }
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
      state.base64 = null;
      state.cleared = true;
      const input = overlay.querySelector(`#foto-${which}-input`);
      if (input) input.value = '';
      updateFotoPreview(overlay, which);
      void formAutosave?.flush?.();
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

function ensureSignaturePadsInitialized() {
  if (signaturePadsReady && signaturePads.technician) return;
  signaturePads = initSignaturePads(['technician', 'client'], () => {
    formAutosave?.markDirty();
  });
  signaturePadsReady = true;
  refreshSignaturePads(signaturePads);
  restoreSignaturesFromReport(existingReportRef);
}

function onReportTabActivated(tabId) {
  if (tabId !== 'finalizacao') return;
  ensureSignaturePadsInitialized();
}

let existingReportRef = null;

function activateReportTab(overlay, tabId) {
  const btn = overlay.querySelector(`[data-report-tab="${tabId}"]`);
  btn?.click();
}

function applyFormReadOnly(overlay) {
  overlay.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach((el) => {
    el.disabled = true;
    if ('readOnly' in el) el.readOnly = true;
  });
  overlay.querySelectorAll('input[type="file"]').forEach((el) => {
    el.disabled = true;
  });
  overlay.querySelectorAll('.signature-canvas').forEach((canvas) => {
    canvas.style.pointerEvents = 'none';
  });
}

function bindFormEvents(overlay, job, client, tech, service, existingReport, options = {}) {
  const viewOnly = options.viewOnly === true;
  const draftReportId = existingReport?.id || null;
  existingReportRef = existingReport;
  signaturesRestoredFromReport = false;
  signaturePadsReady = false;
  signaturePads = {};

  overlay.querySelector('#close-form').addEventListener('click', async () => {
    try {
      await formAutosave?.flush?.();
    } catch (err) {
      console.warn('[Form] Auto-save ao fechar:', err);
    }
    closeForm(overlay);
  });

  bindReportFormTabs(overlay, { onTabActivate: onReportTabActivated });

  if (!viewOnly) {
    bindFotoInputs(overlay);
  }

  if (viewOnly) {
    applyFormReadOnly(overlay);
  } else {
    formAutosave = initReportFormAutosave({
    overlay,
    job,
    existingReport,
    buildReport: () => buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId),
    });
  }

  if (!viewOnly && service?.id === 'manutencao_baterias_grandes') {
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

  if (!viewOnly) overlay.querySelector('#btn-save-draft')?.addEventListener('click', async () => {
    await formAutosave?.flush?.();
    const draftBtn = overlay.querySelector('#btn-save-draft');
    if (draftBtn) draftBtn.disabled = true;
    try {
      let report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      report.status = 'draft';
      if (trabalhoIdEmEdicao) {
        clearEdicaoState();
      }

      if (!canReachServer()) {
        report.data = await attachOfflineFotosToReportData(report.data, {
          antesFile: fotoAntesState.file,
          depoisFile: fotoDepoisState.file,
          fotoAntesUrl: fotoDisplayUrl(fotoAntesState),
          fotoDepoisUrl: fotoDisplayUrl(fotoDepoisState),
          clearAntes: fotoAntesState.cleared,
          clearDepois: fotoDepoisState.cleared,
        });
        await saveReportDraft(report);
        formAutosave?.destroy();
        formAutosave = null;
        closeForm(overlay);
        window.dispatchEvent(new CustomEvent('jobs-updated'));
        window.dispatchEvent(new CustomEvent('db-updated'));
        return;
      }

      const fotoResult = await persistJobFotos(job.id);
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
      report.data.fotoAntesUrl = fotoResult.fotoAntes || report.data.fotoAntesUrl || null;
      report.data.fotoDepoisUrl = fotoResult.fotoDepois || report.data.fotoDepoisUrl || null;
      await ensureFotoUrlsOnTrabalho(job.id, report.data.fotoAntesUrl, report.data.fotoDepoisUrl);
      await saveReportDraft(report);
      formAutosave?.destroy();
      formAutosave = null;
      closeForm(overlay);
      window.dispatchEvent(new CustomEvent('jobs-updated'));
      window.dispatchEvent(new CustomEvent('db-updated'));
    } catch (err) {
      console.error('[Form] Gravar rascunho:', err);
      showToast(err?.message || 'Não foi possível guardar o rascunho.', 'error', 7000);
    } finally {
      if (draftBtn) draftBtn.disabled = false;
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

  if (!viewOnly) overlay.querySelector('#btn-submit-report')?.addEventListener('click', async () => {
    ensureSignaturePadsInitialized();
    const storedSigs = existingReport?.data?.signatures;
    if (!technicianSignatureReady(signaturePads, storedSigs)) {
      activateReportTab(overlay, 'finalizacao');
      refreshSignaturePads(signaturePads);
      showToast('A assinatura do técnico é obrigatória. Assine na aba Finalização.', 'error');
      overlay.querySelector('#sig-technician')?.focus?.();
      return;
    }
    commitSignatureSnapshot(signaturePads.technician);

    await formAutosave?.flush?.();
    formAutosave?.destroy();
    formAutosave = null;

    const submitBtn = overlay.querySelector('#btn-submit-report');
    if (submitBtn) submitBtn.disabled = true;

    try {
      let report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      if (relatorioIdEmEdicao) report.id = relatorioIdEmEdicao;
      else if (existingReport?.id) report.id = existingReport.id;

      const isCorrection = isEdicaoPendenteAtiva(job.id);
      const online = canReachServer();

      if (!online) {
        report.data = await attachOfflineFotosToReportData(report.data, {
          antesFile: fotoAntesState.file,
          depoisFile: fotoDepoisState.file,
          fotoAntesUrl: fotoDisplayUrl(fotoAntesState),
          fotoDepoisUrl: fotoDisplayUrl(fotoDepoisState),
          clearAntes: fotoAntesState.cleared,
          clearDepois: fotoDepoisState.cleared,
        });
        const result = await submitReport(report, { isCorrection });
        if (result?.queued) {
          clearEdicaoState();
          closeForm(overlay);
          window.dispatchEvent(new CustomEvent('jobs-updated'));
          window.dispatchEvent(new CustomEvent('db-updated'));
          window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
        }
        return;
      }

      const fotoResult = await persistJobFotos(job.id);
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
      report.data.fotoAntesUrl =
        fotoResult.fotoAntes || report.data.fotoAntesUrl || fotoAntesState.remoteUrl || null;
      report.data.fotoDepoisUrl =
        fotoResult.fotoDepois || report.data.fotoDepoisUrl || fotoDepoisState.remoteUrl || null;
      await ensureFotoUrlsOnTrabalho(job.id, report.data.fotoAntesUrl, report.data.fotoDepoisUrl);

      const result = await submitReport(report, { isCorrection });
      if (result && !result.queued) {
        clearEdicaoState();
        closeForm(overlay);
        window.dispatchEvent(new CustomEvent('jobs-updated'));
        window.dispatchEvent(new CustomEvent('db-updated'));
      } else if (result?.queued) {
        clearEdicaoState();
        closeForm(overlay);
        window.dispatchEvent(new CustomEvent('jobs-updated'));
        window.dispatchEvent(new CustomEvent('db-updated'));
        window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
      }
    } catch {
      /* toast já mostrado */
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function closeForm(overlay) {
  clearEdicaoState();
  existingReportRef = null;
  signaturesRestoredFromReport = false;
  signaturePadsReady = false;
  signaturePads = {};
  formAutosave?.destroy();
  formAutosave = null;
  if (fotoAntesState.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(fotoAntesState.previewUrl);
  if (fotoDepoisState.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(fotoDepoisState.previewUrl);
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 300);
}
