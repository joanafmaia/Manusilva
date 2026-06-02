/**
 * Manusilva PWA — Formulários dinâmicos (8 relatórios reais)
 */

import {
  getClient,
  getTechnician,
  getServiceType,
  getJob,
  submitReport,
  saveReportDraft,
  closeModal,
  escapeHtml,
  formatDateLong,
  showToast,
  getDB,
} from './app.js';
import {
  renderReportFields,
  collectReportValues,
  bindFormFieldInteractions,
  renderOfficialTemplateHeader,
  buildFormPrefill,
  mergeFormValues,
  isOfficialTemplate,
  renderHeaderClientCombobox,
} from './form-engine.js';
import {
  migrateLegacyBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  init as initGrandesBatteryTable,
} from './views/relatorio-grandes.js';
import { createSignatureBlock, initSignaturePads } from './signatures.js';
import { initReportFormAutosave } from './report-form-autosave.js';

let currentPhotos = [];
let signaturePads = {};
/** @type {{ flush: Function, destroy: Function, markDirty: Function } | null} */
let formAutosave = null;

export function openJobForm(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  const client = getClient(job.clientId);
  const tech = getTechnician(job.technicianId);
  const service = getServiceType(job.serviceType);
  const existingReport = getReportByJobId(jobId);

  currentPhotos = existingReport?.data?.photos ? [...existingReport.data.photos] : [];

  const overlay = document.createElement('div');
  overlay.id = 'form-overlay';
  overlay.className = 'form-overlay';
  overlay.innerHTML = buildFormHTML(job, client, tech, service, existingReport);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('show'));

  bindFormEvents(overlay, job, client, tech, service, existingReport);

  if (existingReport?.status === 'draft') {
    showToast('Rascunho anterior recuperado automaticamente.', 'info', 3500);
  }
}

function getReportByJobId(jobId) {
  const db = getDB();
  return db.reports.find((r) => r.jobId === jobId);
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

function buildFormHTML(job, client, tech, service, existingReport) {
  const saved = getFormValues(existingReport);
  const formContext = {
    tech,
    client,
    job,
    selectedClientId: saved.cliente_id || client.NIF || client.id,
  };
  const prefill = buildFormPrefill(service, job, null, formContext);
  const values = mergeFormValues(saved, prefill);
  if (service?.id === 'manutencao_baterias_grandes') {
    values[GRANDES_BATTERY_FIELD_ID] = migrateLegacyBatteryRows(values);
  }
  const official = isOfficialTemplate(service);
  const officialHeader = renderOfficialTemplateHeader(service);
  const clientPickerHtml = official
    ? renderHeaderClientCombobox({
        value: values.cliente || client.Nome || client.name,
        selectedId: values.cliente_id || client.NIF || client.id,
      })
    : '';
  const fieldsHTML = service ? renderReportFields(service, values, formContext) : '';

  const photosHTML = currentPhotos.map((p) => `
    <div class="photo-thumb" data-photo-id="${p.id}">
      <div class="photo-placeholder">${p.label.charAt(0)}</div>
      <span class="photo-label">${escapeHtml(p.label)}</span>
      <button type="button" class="photo-remove" data-remove-photo="${p.id}">&times;</button>
    </div>
  `).join('');

  const rejectionBanner = job.status === 'rejected' && job.rejectionNote ? `
    <div class="rejection-banner">
      <div class="rejection-icon">⚠</div>
      <div>
        <strong>Relatório Rejeitado pelo RH</strong>
        <p>${escapeHtml(job.rejectionNote)}</p>
      </div>
    </div>
  ` : '';

  return `
    <div class="form-panel glass-card">
      <div class="form-panel-header">
        <button type="button" class="btn-ghost" id="close-form">&larr; Voltar</button>
        <h2>${service?.icon || '📋'} ${escapeHtml(official ? `${service.code}` : service?.label || 'Relatório')}</h2>
      </div>

      <div class="form-panel-body">
        ${rejectionBanner}

        ${officialHeader}

        <div class="form-fixed-header glass-card-inner ${official ? 'form-fixed-header--compact' : ''}">
          <div class="header-grid">
            <div class="header-field"><span class="hf-label">Data do Serviço</span><span class="hf-value">${formatDateLong(job.date)}</span></div>
            <div class="header-field"><span class="hf-label">Técnico</span><span class="hf-value">${escapeHtml(tech.name)}</span></div>
            ${official ? '' : `<div class="header-field header-field-full"><span class="hf-label">Cliente</span><span class="hf-value">${escapeHtml(client.name)}</span></div>`}
            ${official ? clientPickerHtml : ''}
          </div>
        </div>

        <section class="form-section report-fields-section">
          ${official ? '' : '<h3 class="section-title">Dados do Relatório</h3>'}
          <div class="report-fields">${fieldsHTML}</div>
        </section>

        <section class="form-section">
          <h3 class="section-title">Evidências Fotográficas</h3>
          <div class="photo-grid" id="photo-grid">${photosHTML}</div>
          <button type="button" class="btn-outline" id="btn-photo">
            <span class="btn-icon">📷</span> Anexar Foto
          </button>
        </section>

        <section class="form-section">
          <h3 class="section-title">Assinaturas Digitais</h3>
          <div class="signatures-grid">
            ${createSignatureBlock('Assinatura do Técnico', 'technician')}
            ${createSignatureBlock('Assinatura do Cliente', 'client')}
          </div>
        </section>
      </div>

      <div class="form-panel-footer form-panel-footer--stacked">
        <button type="button" class="btn-preview" id="btn-preview-pdf">
          <span class="btn-preview-icon" aria-hidden="true">👁️</span>
          Pré-visualizar Relatório
        </button>
        <div class="form-panel-footer-row">
          <button type="button" class="btn-secondary" id="btn-save-draft">Guardar Rascunho</button>
          <button type="button" class="btn-primary" id="btn-submit-report">Submeter Relatório</button>
        </div>
      </div>
    </div>
  `;
}

function buildReportFromForm(overlay, job, existingReport, signaturePads, reportId) {
  const values = collectReportValues(overlay);
  return {
    id: reportId || existingReport?.id || `rep-draft-${job.id}`,
    jobId: job.id,
    technicianId: job.technicianId,
    clientId: job.clientId,
    forkliftSerial: job.forkliftSerial,
    serviceType: job.serviceType,
    status: existingReport?.status || 'draft',
    submittedAt: existingReport?.submittedAt || new Date().toISOString(),
    data: {
      values,
      signatures: {
        technician: signaturePads.technician?.hasSignature || false,
        client: signaturePads.client?.hasSignature || false,
        technicianData: signaturePads.technician?.toDataURL?.() || null,
        clientData: signaturePads.client?.toDataURL?.() || null,
      },
      photos: [...currentPhotos],
    },
    rejectionNote: null,
  };
}

function restoreSignaturesFromReport(existingReport) {
  const sig = existingReport?.data?.signatures;
  if (!sig) return;
  signaturePads.technician?.loadFromDataURL(sig.technicianData);
  signaturePads.client?.loadFromDataURL(sig.clientData);
}

function bindFormEvents(overlay, job, client, tech, service, existingReport) {
  const draftReportId = existingReport?.id || `rep-draft-${job.id}`;

  overlay.querySelector('#close-form').addEventListener('click', () => {
    formAutosave?.flush();
    closeForm(overlay);
  });

  bindFormFieldInteractions(overlay).catch((err) => {
    console.error('[Form] Interações dos campos:', err);
    showToast('Alguns controlos do formulário podem não responder. Recarregue a página.', 'error');
  });

  overlay.querySelector('#btn-photo').addEventListener('click', () => {
    simulatePhotoCapture(overlay);
  });

  overlay.addEventListener('click', (e) => {
    const removeId = e.target.closest('[data-remove-photo]')?.dataset.removePhoto;
    if (removeId) {
      currentPhotos = currentPhotos.filter((p) => p.id !== removeId);
      e.target.closest('.photo-thumb')?.remove();
      formAutosave?.markDirty();
    }
  });

  signaturePads = initSignaturePads(['technician', 'client'], () => {
    formAutosave?.markDirty();
  });
  restoreSignaturesFromReport(existingReport);

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

  overlay.querySelector('#btn-save-draft').addEventListener('click', () => {
    formAutosave?.flush();
    const report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
    saveReportDraft(report);
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

  overlay.querySelector('#btn-submit-report').addEventListener('click', () => {
    if (!signaturePads.technician?.hasSignature) {
      showToast('A assinatura do técnico é obrigatória.', 'error');
      return;
    }

    formAutosave?.destroy();
    formAutosave = null;

    const report = buildReportFromForm(overlay, job, existingReport, signaturePads, draftReportId);
    report.id = existingReport?.status === 'draft' ? draftReportId : `rep-${Date.now()}`;

    submitReport(report);
    closeForm(overlay);
    window.dispatchEvent(new CustomEvent('jobs-updated'));
  });
}

function simulatePhotoCapture(overlay) {
  const labels = [
    'Peça danificada', 'Estado da bateria', 'Placa do carregador',
    'Display de erros', 'Componente reparado', 'Vista geral',
  ];
  const label = labels[currentPhotos.length % labels.length];
  const photo = { id: `ph-${Date.now()}`, label };
  currentPhotos.push(photo);

  const grid = overlay.querySelector('#photo-grid');
  const thumb = document.createElement('div');
  thumb.className = 'photo-thumb';
  thumb.dataset.photoId = photo.id;
  thumb.innerHTML = `
    <div class="photo-placeholder">${label.charAt(0)}</div>
    <span class="photo-label">${escapeHtml(label)}</span>
    <button type="button" class="photo-remove" data-remove-photo="${photo.id}">&times;</button>
  `;
  grid.appendChild(thumb);
  formAutosave?.markDirty();
  showToast('Foto capturada (simulada).', 'success');
}

function closeForm(overlay) {
  formAutosave?.destroy();
  formAutosave = null;
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 300);
}
