/**
 * Rever relatório submetido (modal partilhado — RH / histórico cliente).
 */

import {
  getReport,
  getClient,
  getServiceType,
  getJob,
  escapeHtml,
  openModal,
  closeModal,
  showToast,
} from './app.js';
import { serviceIconHtml } from './ui-icons.js';
import {
  renderReviewFotosSection,
  renderReviewPdfSection,
  renderReviewClientEmailField,
  readReviewClientEmail,
  validateReviewClientEmail,
  buildReviewModalActions,
  bindReviewFotoClicks,
  bindReviewPdfButton,
} from './report-review-ui.js';
import {
  getEmpilhadoresMaquinasFromReport,
  isEmpilhadoresMultiMaquinaReport,
} from './views/relatorio-empilhadores-maquinas.js';
import { ensureJobsLoaded } from './trabalhos-db.js';
import { resolveReportTechnicianLabel } from './servicos-panel-utils.js';

/**
 * @param {string} reportId
 * @param {{ onApproved?: () => void, onRejected?: () => void, showWorkflowActions?: boolean }} [options]
 */
export async function openReportReviewModal(reportId, options = {}) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  const { renderReportValuesForReview } = await import('./form-engine.js');

  try {
    await ensureJobsLoaded(true);
  } catch (err) {
    console.warn('[Revisão] Trabalhos para fotos:', err);
  }

  const client = getClient(report.clientId);
  const service = getServiceType(report.serviceType);
  const data = report.data || {};
  const values = data.values || { ...data.textFields, ...data.dropdowns };
  const fieldsHTML = renderReportValuesForReview(service, values);
  const job = report.jobId ? getJob(report.jobId) : null;
  const technicianLabel = resolveReportTechnicianLabel(report, job);

  const statusLabel =
    report.status === 'approved'
      ? 'Aprovado'
      : report.status === 'pending_review'
        ? 'Aguarda aprovação (RH)'
        : report.status === 'draft'
          ? 'Rascunho'
          : report.status;

  const showWorkflow =
    options.showWorkflowActions !== false && report.status === 'pending_review';

  const contactField = renderReviewClientEmailField(client, { editable: showWorkflow });

  const content = `
    <div class="review-detail">
      <div class="review-header-info">
        <p><strong>Estado:</strong> ${escapeHtml(statusLabel)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</p>
        <p><strong>Técnico:</strong> ${escapeHtml(technicianLabel || '—')}</p>
        ${contactField}
      </div>
      <h4 class="review-section-title">Dados do Relatório</h4>${fieldsHTML}
      ${renderReviewFotosSection(job, report)}
      ${renderReviewPdfSection(job)}
      <h4 class="review-section-title">Assinaturas</h4>
      <p>Técnico: ${data.signatures?.technician ? 'Assinado' : 'Pendente'} · Cliente: ${data.signatures?.client ? 'Assinado' : 'Pendente'}</p>
    </div>
  `;

  const actions = buildReviewModalActions({ showWorkflow });

  const overlay = openModal(
    '',
    content,
    actions,
    {
      titleHtml: `${serviceIconHtml(service)} ${escapeHtml(service?.label || 'Relatório')} — Revisão`,
    },
  );

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);
  bindReviewFotoClicks(overlay);
  bindReviewPdfButton(overlay, { job, report });

  if (showWorkflow) {
    const { approveReport } = await import('./app.js');

    overlay.querySelector('#modal-approve')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#modal-approve');
      const emailErr = await validateReviewClientEmail(overlay);
      if (emailErr) {
        showToast(emailErr, 'error');
        return;
      }
      const extraEmailErr = await import('./report-review-ui.js').then(({ validateReviewExtraClientEmail }) =>
        validateReviewExtraClientEmail(overlay),
      );
      if (extraEmailErr) {
        showToast(extraEmailErr, 'error');
        return;
      }
      btn.disabled = true;
      const clientEmail = readReviewClientEmail(overlay);
      const extraClientEmail = await import('./report-review-ui.js').then(({ readReviewExtraClientEmail }) =>
        readReviewExtraClientEmail(overlay),
      );
      const ok = await approveReport(reportId, { clientEmail, extraClientEmail });
      btn.disabled = false;
      if (ok) {
        closeModal();
        options.onApproved?.();
      }
    });

    overlay.querySelector('#modal-reject')?.addEventListener('click', () => {
      closeModal();
      openRejectReportDialog(reportId, options.onRejected);
    });
  }
}

function openRejectReportDialog(reportId, onRejected) {
  const content = `
    <div class="form-group">
      <label class="form-label" for="reject-note">Motivo da rejeição</label>
      <textarea class="form-input" id="reject-note" rows="4" placeholder="Indique o que o técnico deve corrigir…"></textarea>
    </div>
  `;
  const actions = `
    <button type="button" class="btn-secondary" id="cancel-reject">Cancelar</button>
    <button type="button" class="btn-danger" id="confirm-reject">Rejeitar relatório</button>
  `;
  const overlay = openModal('Rejeitar relatório', content, actions);
  overlay.querySelector('#cancel-reject')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-reject')?.addEventListener('click', async () => {
    const note = overlay.querySelector('#reject-note')?.value?.trim();
    if (!note) {
      showToast('Indique o motivo da rejeição.', 'error');
      return;
    }
    const { rejectReport } = await import('./app.js');
    const btn = overlay.querySelector('#confirm-reject');
    btn.disabled = true;
    const ok = await rejectReport(reportId, note);
    btn.disabled = false;
    if (ok) {
      closeModal();
      onRejected?.();
    }
  });
}

/**
 * Descarrega o PDF do relatório (sem modal de revisão).
 */
export async function downloadReportPDF(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  await ensureJobsLoaded();
  const job = report.jobId ? getJob(report.jobId) : null;
  const service = getServiceType(report.serviceType);
  const { PDF_DOCUMENT_TITLES } = await import('./mock_data.js');
  const { buildReportPdfFilename } = await import('./pdf-storage.js');
  const { downloadPdfBlob, downloadEmpilhadoresPdfs } = await import('./pdf-preview.js');

  const filename = buildReportPdfFilename(job, report, {
    serviceTitle: PDF_DOCUMENT_TITLES[report.serviceType] || service?.label,
  });

  if (isEmpilhadoresMultiMaquinaReport(report)) {
    const { showPdfPreviewLoading } = await import('./pdf-preview.js');
    const count = getEmpilhadoresMaquinasFromReport(report).length;
    showPdfPreviewLoading(true, `A gerar ${count} PDFs…`);
    try {
      await downloadEmpilhadoresPdfs({
        ...report,
        submittedAt: report.submittedAt || new Date().toISOString(),
      });
      showToast('PDFs descarregados (ZIP).', 'success');
    } catch (err) {
      console.error('[PDF]', err);
      showToast(err?.message || 'Não foi possível gerar os PDFs.', 'error');
    } finally {
      const { showPdfPreviewLoading: hide } = await import('./pdf-preview.js');
      hide(false);
    }
    return;
  }

  if (job?.urlPdf) {
    const { showPdfPreviewLoading } = await import('./pdf-preview.js');
    showPdfPreviewLoading(true, 'A preparar PDF…');
    try {
      const res = await fetch(job.urlPdf);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      downloadPdfBlob(blob, filename);
      showToast('PDF descarregado.', 'success');
      return;
    } catch (err) {
      console.warn('[PDF] Falha ao obter PDF do Storage, a gerar de novo:', err);
    } finally {
      const { showPdfPreviewLoading: hide } = await import('./pdf-preview.js');
      hide(false);
    }
  }

  const { showPdfPreviewLoading } = await import('./pdf-preview.js');
  showPdfPreviewLoading(true, 'A gerar PDF…');

  try {
    const { importPdfReport } = await import('./pdf-loader.js');
    const { renderInterventionPDF } = await importPdfReport();
    const doc = await renderInterventionPDF({
      ...report,
      submittedAt: report.submittedAt || new Date().toISOString(),
    });
    doc.save(filename);
    showToast('PDF descarregado.', 'success');
  } catch (err) {
    console.error('[PDF]', err);
    showToast(err?.message || 'Não foi possível gerar o PDF.', 'error');
  } finally {
    const { showPdfPreviewLoading: hide } = await import('./pdf-preview.js');
    hide(false);
  }
}
