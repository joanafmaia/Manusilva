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
  resolveJobForForm,
  submitReport,
  saveReportDraft,
  closeModal,
  escapeHtml,
  formatDateLong,
  showToast,
  captureError,
  canReachServer,
  isOffline,
} from './app.js';
import {
  diagnoseJobFormOpen,
  formatJobOpenDiagnosticMessage,
  diagnosticNeedsSync,
} from './job-open-diagnostic.js';
import {
  buildEquipmentFormPrefill,
  renderEquipamentoPicker,
  bindEquipamentoPicker,
  attachEquipamentoDatalists,
} from './cliente-equipamentos.js';
import { collectSubmitWarnings, confirmSubmitWarnings } from './form-submit-checks.js';
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
  renderDeslocacaoIntroBlock,
  analyzeReportFormTabs,
} from './form-engine.js';
import {
  migrateLegacyBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  init as initGrandesBatteryTable,
} from './views/relatorio-grandes.js';
import {
  createSignatureBlock,
  initSignaturePads,
  refreshSignaturePads,
  resolveReportSignatures,
  padHasSignature,
  commitSignatureSnapshot,
} from './signatures.js';
import { initReportFormAutosave } from './report-form-autosave.js';
import { VISITAS_FIELD_ID, VISIT_DATES_FIELD_ID } from './deslocacao-field.js';
import { ensureProductionCatalog } from './clients-catalog.js';
import { ensureJobsLoaded } from './trabalhos-db.js';
import {
  syncJobFotosAntesDepois,
  ensureFotoUrlsOnTrabalho,
  attachOfflineFotosToReportData,
  readFileAsDataUrl,
} from './foto-trabalho-storage.js';
import { compressImageFile } from './image-compress.js';
import { resolveReportForJob } from './report-local-storage.js';
import {
  applyServerConflictChoice,
  resolveReportOpenConflict,
} from './tech-data-conflict.js';
import { triggerTechDataSync } from './tech-sync.js';

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
  const base64 =
    state.base64 || (String(state.remoteUrl || '').startsWith('data:') ? state.remoteUrl : null);
  const http =
    state.remoteUrl && /^https?:\/\//i.test(String(state.remoteUrl)) ? state.remoteUrl : null;
  return {
    url: http || base64 || null,
    base64,
  };
}

/**
 * @param {string} jobId
 * @param {{ editPending?: boolean, viewOnly?: boolean }} [options]
 */
export async function openJobForm(jobId, options = {}) {
  const viewOnly = options.viewOnly === true;
  if (!jobId) {
    showToast('Trabalho inválido.', 'error');
    return;
  }

  try {
    try {
      await ensureJobsLoaded();
      await ensureProductionCatalog();
    } catch (err) {
      console.warn('[Form] Pré-carga Supabase antes do relatório:', err);
    }

    const diagnostic = diagnoseJobFormOpen(jobId);
    const job = diagnostic.job || resolveJobForForm(jobId);
    if (!job || !diagnostic.ok) {
      const message = formatJobOpenDiagnosticMessage(diagnostic);
      if (diagnosticNeedsSync(diagnostic)) {
        const retry = window.confirm(
          `${message}\n\nDeseja sincronizar os dados agora e tentar outra vez?`,
        );
        if (retry) {
          try {
            await triggerTechDataSync();
            return openJobForm(jobId, options);
          } catch (syncErr) {
            captureError(syncErr, { action: 'openJobForm.sync', jobId });
            showToast('Sincronização falhou. Verifique a ligação à internet.', 'error', 7000);
            return;
          }
        }
      }
      showToast(message, 'error', 7000);
      return;
    }

    let client = getClient(job.clientId);
    if (!client && job.clientId) {
      try {
        await ensureProductionCatalog();
      } catch (err) {
        console.warn('[Form] Recarregar catálogo de clientes:', err);
      }
      client = getClient(job.clientId);
    }
    if (!client) {
      client = {
        id: job.clientId || '',
        name: 'Cliente',
        Nome: 'Cliente',
      };
    }

    const service = getServiceType(job.serviceType);
    if (!service) {
      showToast('Tipo de relatório não reconhecido neste dispositivo.', 'error', 7000);
      return;
    }

    const session = getSession();
    const tech =
      getTechnician(session?.technicianId) || getPrimaryTechnicianForJob(job);
    const serverReport = getReportForJob(jobId);
    const editPendingOpt =
      options.editPending === true ||
      (options.editPending !== false && serverReport?.status === 'pending_review');

    const conflictChoice = await resolveReportOpenConflict(jobId, serverReport, {
      editPending: editPendingOpt,
      viewOnly,
    });
    if (conflictChoice === 'cancel') return;

    let existingReport;
    if (conflictChoice === 'server') {
      await applyServerConflictChoice(jobId);
      existingReport = serverReport || null;
    } else if (conflictChoice === 'local') {
      const { getLocalReportDraft } = await import('./report-local-storage.js');
      const local = await getLocalReportDraft(jobId);
      existingReport = local
        ? { ...serverReport, ...local, status: local.status || serverReport?.status || 'draft' }
        : serverReport || null;
    } else {
      existingReport = await resolveReportForJob(jobId, serverReport, {
        editPending: editPendingOpt,
      });
    }

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

    let equipamentos = [];
    if (!viewOnly && job.clientId) {
      try {
        const { fetchClienteEquipamentos } = await import('./cliente-equipamentos-db.js');
        equipamentos = await fetchClienteEquipamentos(job.clientId);
      } catch (err) {
        console.warn('[Form] Equipamentos do cliente:', err);
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'form-overlay';
    overlay.className = 'form-overlay form-overlay--tech';
    overlay.innerHTML = buildFormHTML(job, client, tech, service, existingReport, {
      viewOnly,
      equipamentos,
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => overlay.classList.add('show'));
    if (viewOnly) overlay.classList.add('form-overlay--readonly');

    bindFormEvents(overlay, job, client, tech, service, existingReport, { viewOnly });

    await bindFormFieldInteractions(overlay);

    if (!viewOnly && equipamentos.length) {
      bindEquipamentoPicker(overlay, equipamentos, service);
      attachEquipamentoDatalists(overlay, equipamentos);
    }

    if (trabalhoIdEmEdicao) {
      showToast('Pode editar o relatório enquanto aguarda aprovação do RH.', 'info', 4000);
    } else if (existingReport?.status === 'draft' || existingReport?._localSavedAt) {
      showToast('Rascunho recuperado automaticamente da memória do tablet.', 'info', 4000);
    }
  } catch (err) {
    captureError(err, { action: 'openJobForm', jobId });
    showToast('Não foi possível abrir este relatório.', 'error', 7000);
    document.getElementById('form-overlay')?.remove();
    document.body.style.overflow = '';
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

function renderInterventionFotografiasPreviewHtml(antesState, depoisState) {
  const antesUrl = fotoDisplayUrl(antesState);
  const depoisUrl = fotoDisplayUrl(depoisState);
  if (!antesUrl && !depoisUrl) return '';

  const renderSlot = (url, label) => {
    if (!url) {
      return '<div class="intervention-foto-slot intervention-foto-slot--empty" aria-hidden="true"></div>';
    }
    return `
    <figure class="intervention-foto-card">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" class="intervention-foto-img" loading="lazy">
      <figcaption class="intervention-foto-caption">${escapeHtml(label)}</figcaption>
    </figure>`;
  };

  return `
    <div class="intervention-fotografias-bar">
      <span class="intervention-fotografias-bar-title">Fotografias da Intervenção</span>
    </div>
    <div class="intervention-fotografias-grid">
      ${renderSlot(antesUrl, 'Foto Antes')}
      ${renderSlot(depoisUrl, 'Foto Depois')}
    </div>`;
}

function refreshInterventionFotografiasPreview(overlay) {
  const section = overlay.querySelector('.intervention-fotografias-section');
  if (!section) return;
  const preview = renderInterventionFotografiasPreviewHtml(fotoAntesState, fotoDepoisState);
  if (!preview) {
    section.hidden = true;
    section.innerHTML = '';
    return;
  }
  section.hidden = false;
  section.innerHTML = preview;
}

function buildFormHTML(job, client, tech, service, existingReport, options = {}) {
  const viewOnly = options.viewOnly === true;
  const saved = getFormValues(existingReport);
  const formContext = {
    tech,
    client,
    job,
    service,
    selectedClientId: saved.cliente_id || client?.NIF || client?.id || job?.clientId || '',
    lockClient: true,
  };
  const prefill = buildFormPrefill(service, job, null, formContext);
  let values = mergeFormValues(saved, prefill, service);
  if (service?.id === 'manutencao_baterias_grandes') {
    values[GRANDES_BATTERY_FIELD_ID] = migrateLegacyBatteryRows(values);
  }
  const equipamentos = options.equipamentos || [];
  const equipmentPrefill = buildEquipmentFormPrefill(service, job, equipamentos, values);
  values = mergeFormValues(values, equipmentPrefill, service);
  const equipamentoPickerHtml =
    options.viewOnly === true ? '' : renderEquipamentoPicker(equipamentos, service);
  const official = isOfficialTemplate(service);
  const clientHeader = renderJobClientHeader(client);
  const lockedClientFields = renderLockedClientHiddenFields(client, values);
  const formTitle = getServiceFormTitle(service);
  const tabsNav = service ? renderReportFormTabsNav(service) : '';
  const fieldsGeral = service ? renderReportFields(service, values, formContext, { tab: 'geral' }) : '';
  const fieldsFinalizacao = service ? renderReportFields(service, values, formContext, { tab: 'finalizacao' }) : '';
  const deslocacaoIntroHtml = official ? renderDeslocacaoIntroBlock(values, formContext) : '';

  const rejectionNote = job.rejectionNote || existingReport?.rejectionNote || '';
  const isRejected =
    job.status === 'rejected' ||
    existingReport?.status === 'rejected';

  const rejectionBanner = isRejected && rejectionNote ? `
    <div class="rejection-banner rejection-banner--prominent">
      <div class="rejection-icon">⚠</div>
      <div>
        <strong>Relatório rejeitado pelo RH — corrija e volte a submeter</strong>
        <p class="rejection-banner-note">${escapeHtml(rejectionNote)}</p>
      </div>
    </div>
  ` : isRejected ? `
    <div class="rejection-banner rejection-banner--prominent">
      <div class="rejection-icon">⚠</div>
      <div>
        <strong>Relatório rejeitado pelo RH</strong>
        <p class="rejection-banner-note">Corrija os dados e volte a submeter. Contacte o escritório se precisar de detalhe.</p>
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
      <h3 class="section-title">Assinaturas Digitais <span class="text-muted section-title-hint">(opcional)</span></h3>
      <p class="text-muted foto-antes-depois-hint">Pode concluir o relatório com ou sem assinaturas do técnico e do cliente.</p>
      <div class="signatures-grid">
        ${createSignatureBlock('Assinatura do Técnico', 'technician')}
        ${createSignatureBlock('Assinatura do Cliente', 'client')}
      </div>
    </section>
  `;

  const isDl50Form = service?.id === 'inspecao_dl50_2005';
  const isCarregadorForm = service?.id === 'reparacao_carregador';
  const isCorretivaForm = service?.id === 'manutencao_corretiva_maquinas';
  const isGrandesForm = service?.id === 'manutencao_baterias_grandes';
  const isRavBateriaForm = service?.id === 'reparacao_avarias_bateria';
  const isFolhaAvariasForm = service?.id === 'folha_intervencao_avarias';
  const interventionFotosPreviewHtml = isFolhaAvariasForm
    ? renderInterventionFotografiasPreviewHtml(fotoAntesState, fotoDepoisState)
    : '';
  const finalizacaoPanelBody = `
              <section class="form-section report-fields-section">
                <div class="report-fields">${fieldsFinalizacao}</div>
              </section>
              ${isFolhaAvariasForm ? `<div class="intervention-fotografias-section"${interventionFotosPreviewHtml ? '' : ' hidden'}>${interventionFotosPreviewHtml}</div>` : ''}
              ${fotoSection}`;
  const finalizacaoShellClass = isDl50Form
    ? 'dl50-closing-shell'
    : isCarregadorForm
      ? 'carregador-closing-shell'
      : isCorretivaForm
        ? 'corretiva-closing-shell'
        : isGrandesForm
          ? 'grandes-closing-shell'
          : isRavBateriaForm
            ? 'rav-closing-shell'
            : isFolhaAvariasForm
              ? 'folha-closing-shell'
              : '';

  return `
    <div class="form-workspace form-workspace--report${isCarregadorForm ? ' form-workspace--carregador' : ''}${isCorretivaForm ? ' form-workspace--corretiva' : ''}${isGrandesForm ? ' form-workspace--grandes' : ''}${isRavBateriaForm ? ' form-workspace--rav-bateria' : ''}${isFolhaAvariasForm ? ' form-workspace--folha-avarias' : ''}">
      <div class="form-panel form-panel--premium glass-card">
        <div class="form-panel-header form-panel-header--minimal">
          <button type="button" class="btn-ghost" id="close-form">&larr; Voltar</button>
          <div class="form-tech-status-bar">
            <div class="form-offline-chip" id="form-offline-chip" hidden>Offline — alterações guardadas neste tablet</div>
            <div class="form-progress" id="form-progress-wrap">
              <span class="form-progress__label" id="form-progress-label">Dados · 1/3</span>
              <div class="form-progress__track" aria-hidden="true"><div class="form-progress__fill" id="form-progress-fill"></div></div>
            </div>
          </div>
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
                <h2 class="form-report-title">${service?.icon || '📋'} ${escapeHtml(formTitle)}</h2>
                <div class="form-fixed-header glass-card-inner ${official ? 'form-fixed-header--compact' : ''}">
                  ${official ? '<p class="form-intro-block-label">Dados da Intervenção</p>' : ''}
                  <div class="header-grid ${official ? 'header-grid--intervention' : ''}">
                    <div class="header-field"><span class="hf-label">Data do Serviço</span><span class="hf-value">${formatDateLong(job.date)}</span></div>
                    <div class="header-field"><span class="hf-label">Técnico</span><span class="hf-value">${escapeHtml(tech.name)}</span></div>
                    ${deslocacaoIntroHtml ? `<div class="form-intro-deslocacao">${deslocacaoIntroHtml}</div>` : ''}
                  </div>
                </div>
              </div>
              <section class="form-section report-fields-section">
                ${official ? '' : '<h3 class="section-title">Dados do Relatório</h3>'}
                ${equipamentoPickerHtml}
                <div class="report-fields">${fieldsGeral}</div>
              </section>
            </div>

            <div class="report-tab-panel" data-report-panel="checklist" id="report-panel-checklist" role="tabpanel" aria-labelledby="report-tab-checklist" hidden>
              <section class="form-section report-fields-section report-fields-section--checklist">
                <div class="report-fields" data-lazy-checklist="true"></div>
              </section>
            </div>

            <div class="report-tab-panel" data-report-panel="finalizacao" id="report-panel-finalizacao" role="tabpanel" aria-labelledby="report-tab-finalizacao" hidden>
              ${finalizacaoShellClass ? `<div class="${finalizacaoShellClass}">${finalizacaoPanelBody}</div>` : finalizacaoPanelBody}
            </div>
          </div>
        </div>

        <div class="form-panel-footer form-panel-footer--stacked form-panel-footer--sticky">
          <button type="button" class="btn-preview" id="btn-preview-pdf">
            <span class="btn-preview-icon" aria-hidden="true">👁️</span>
            Pré-visualizar Relatório
          </button>
          ${viewOnly ? `
          <div class="form-panel-footer-row">
            <button type="button" class="btn-primary btn-touch" id="btn-view-pdf-full">Ver PDF do relatório</button>
          </div>` : `
          <p class="form-footer-hint text-muted">Guardar e sair mantém o relatório <strong>em aberto</strong>. Concluir envia-o para aprovação do RH.</p>
          <div class="form-panel-footer-row">
            <button type="button" class="btn-secondary btn-touch" id="btn-save-draft">Guardar e sair</button>
            <button type="button" class="btn-primary btn-touch" id="btn-submit-report">Concluir Relatório</button>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

function resolveFormSignatures(existingReport) {
  return resolveReportSignatures(signaturePads, existingReport?.data?.signatures || {});
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

function updateFormProgress(overlay, service, activeTabId) {
  const tabs = analyzeReportFormTabs(service);
  const order = ['geral', 'checklist', 'finalizacao'].filter((id) => tabs[id]);
  const idx = Math.max(0, order.indexOf(activeTabId));
  const total = order.length || 1;
  const labels = { geral: 'Dados', checklist: 'Checklist', finalizacao: 'Finalização' };
  const label = overlay.querySelector('#form-progress-label');
  const fill = overlay.querySelector('#form-progress-fill');
  if (label) {
    label.textContent = `${labels[activeTabId] || 'Secção'} · ${idx + 1}/${total}`;
  }
  if (fill) fill.style.width = `${((idx + 1) / total) * 100}%`;
}

function updateFormOfflineChip(overlay) {
  const chip = overlay.querySelector('#form-offline-chip');
  if (!chip) return;
  chip.hidden = canReachServer() && !isOffline();
}

function bindFormOfflineStatus(overlay) {
  updateFormOfflineChip(overlay);
  const refresh = () => updateFormOfflineChip(overlay);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  overlay.__offlineCleanup = () => {
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
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
  refreshInterventionFotografiasPreview(overlay);
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
        showToast(`Foto ${which === 'antes' ? 'Antes' : 'Depois'} guardada ✓`, 'success', 2500);
      } catch (err) {
        console.error('[Form] Foto compressão:', err);
        try {
          const fallback = await readFileAsDataUrl(file);
          state.file = file;
          state.base64 = fallback;
          state.previewUrl = URL.createObjectURL(file);
          updateFotoPreview(overlay, which);
          showToast(`Foto ${which === 'antes' ? 'Antes' : 'Depois'} guardada ✓`, 'success', 2500);
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

async function persistOptionalJobFotos(jobId, overlay = null) {
  const hasFotoWork =
    fotoAntesState.file ||
    fotoDepoisState.file ||
    fotoAntesState.cleared ||
    fotoDepoisState.cleared;
  if (!hasFotoWork) {
    return {
      fotoAntes: fotoAntesState.cleared ? null : fotoAntesState.remoteUrl || null,
      fotoDepois: fotoDepoisState.cleared ? null : fotoDepoisState.remoteUrl || null,
    };
  }
  try {
    const result = await persistJobFotos(jobId);
    if (overlay) {
      updateFotoPreview(overlay, 'antes');
      updateFotoPreview(overlay, 'depois');
    }
    return result;
  } catch (err) {
    console.error('[Form] Upload fotos (opcional):', err);
    showToast(
      'Não foi possível guardar as fotos — pode concluir o relatório na mesma.',
      'warning',
      7000,
    );
    return {
      fotoAntes: fotoAntesState.remoteUrl || null,
      fotoDepois: fotoDepoisState.remoteUrl || null,
    };
  }
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

function onReportTabActivated(tabId, overlay) {
  if (tabId === 'checklist' && overlay) {
    const lazyContext = overlay.__lazyFormState;
    const panel = overlay.querySelector('[data-lazy-checklist="true"]');
    if (panel && lazyContext && !panel.dataset.lazyLoaded) {
      panel.dataset.lazyLoaded = 'true';
      panel.innerHTML = renderReportFields(
        lazyContext.service,
        lazyContext.values,
        lazyContext.formContext,
        { tab: 'checklist' },
      );
      void bindFormFieldInteractions(overlay);
    }
  }
  if (tabId === 'finalizacao') ensureSignaturePadsInitialized();
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

  const savedValues = getFormValues(existingReport);
  const formContext = {
    tech,
    client,
    job,
    service,
    selectedClientId: savedValues.cliente_id || client?.NIF || client?.id || job?.clientId || '',
    lockClient: true,
  };
  overlay.__lazyFormState = {
    service,
    values: mergeFormValues(savedValues, buildFormPrefill(service, job, null, formContext), service),
    formContext,
  };

  bindReportFormTabs(overlay, {
    onTabActivate: (tabId) => {
      onReportTabActivated(tabId, overlay);
      updateFormProgress(overlay, service, tabId);
    },
  });

  updateFormProgress(overlay, service, 'geral');
  bindFormOfflineStatus(overlay);

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

      const fotoResult = await persistOptionalJobFotos(job.id, overlay);
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

  const openPdfPreview = async (btn) => {
    if (btn) btn.disabled = true;
    let previewModule;
    try {
      const report =
        viewOnly && existingReport
          ? existingReport
          : buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      previewModule = await import('./pdf-preview.js');
      await previewModule.previewReportPDF(report);
    } catch (err) {
      console.error(err);
      showToast('Não foi possível gerar o PDF.', 'error', 6000);
    } finally {
      previewModule?.showPdfPreviewLoading?.(false);
      if (btn) btn.disabled = false;
    }
  };

  overlay.querySelector('#btn-preview-pdf')?.addEventListener('click', () => {
    void openPdfPreview(overlay.querySelector('#btn-preview-pdf'));
  });
  overlay.querySelector('#btn-view-pdf-full')?.addEventListener('click', () => {
    void openPdfPreview(overlay.querySelector('#btn-view-pdf-full'));
  });

  if (!viewOnly) overlay.querySelector('#btn-submit-report')?.addEventListener('click', async () => {
    ensureSignaturePadsInitialized();
    if (padHasSignature(signaturePads?.technician)) {
      commitSignatureSnapshot(signaturePads.technician);
    }
    if (padHasSignature(signaturePads?.client)) {
      commitSignatureSnapshot(signaturePads.client);
    }

    await formAutosave?.flush?.();

    const submitBtn = overlay.querySelector('#btn-submit-report');
    if (submitBtn) submitBtn.disabled = true;

    try {
      let report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
      if (relatorioIdEmEdicao) report.id = relatorioIdEmEdicao;
      else if (existingReport?.id) report.id = existingReport.id;

      const warnings = collectSubmitWarnings({
        report,
        service,
        signaturePads,
        hasFotoAntes: Boolean(fotoDisplayUrl(fotoAntesState)),
        hasFotoDepois: Boolean(fotoDisplayUrl(fotoDepoisState)),
      });
      if (!confirmSubmitWarnings(warnings)) {
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      formAutosave?.destroy();
      formAutosave = null;

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

      const fotoResult = await persistOptionalJobFotos(job.id, overlay);
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
  overlay?.__offlineCleanup?.();
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
