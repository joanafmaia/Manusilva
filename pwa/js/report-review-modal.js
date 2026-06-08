/**
 * Rever relatório submetido (modal partilhado — RH / histórico cliente).
 */

import {
  getReport,
  getClient,
  getTechnician,
  getServiceType,
  getJob,
  escapeHtml,
  openModal,
  closeModal,
  showToast,
} from './app.js';
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
import { ensureJobsLoaded } from './trabalhos-db.js';

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
  const tech = getTechnician(report.technicianId);
  const service = getServiceType(report.serviceType);
  const data = report.data || {};
  const values = data.values || { ...data.textFields, ...data.dropdowns };
  const fieldsHTML = renderReportValuesForReview(service, values);
  const job = report.jobId ? getJob(report.jobId) : null;

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
        <p><strong>Técnico:</strong> ${escapeHtml(tech?.name || '—')}</p>
        ${contactField}
      </div>
      <h4 class="review-section-title">Dados do Relatório</h4>${fieldsHTML}
      ${renderReviewFotosSection(job, report)}
      ${renderReviewPdfSection(job)}
      <h4 class="review-section-title">Assinaturas</h4>
      <p>Técnico: ${data.signatures?.technician ? '✓ Assinado' : '✗ Pendente'} · Cliente: ${data.signatures?.client ? '✓ Assinado' : '✗ Pendente'}</p>
    </div>
  `;

  const actions = buildReviewModalActions({ showWorkflow });

  const overlay = openModal(
    `${service?.icon || '📋'} ${escapeHtml(service?.label || 'Relatório')} — Revisão`,
    content,
    actions,
  );

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);
  bindReviewFotoClicks(overlay);
  bindReviewPdfButton(overlay, { job, report });

  if (showWorkflow) {
    const { approveReport, rejectReport } = await import('./app.js');

    overlay.querySelector('#modal-approve')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#modal-approve');
      const emailErr = await validateReviewClientEmail(overlay);
      if (emailErr) {
        showToast(emailErr, 'error');
        return;
      }
      btn.disabled = true;
      const clientEmail = readReviewClientEmail(overlay);
      const ok = await approveReport(reportId, { clientEmail });
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

  const { getJob } = await import('./app.js');
  const job = report.jobId ? getJob(report.jobId) : null;
  if (job?.urlPdf) {
    window.open(job.urlPdf, '_blank');
    showToast('A abrir PDF…', 'info');
    return;
  }

  const { showPdfPreviewLoading } = await import('./pdf-preview.js');
  showPdfPreviewLoading(true, 'A gerar PDF…');

  try {
    const { importPdfReport } = await import('./pdf-loader.js');
    const { generateInterventionPDF } = await importPdfReport();
    await generateInterventionPDF({
      ...report,
      submittedAt: report.submittedAt || new Date().toISOString(),
    });
    showToast('PDF descarregado.', 'success');
  } catch (err) {
    console.error('[PDF]', err);
    showToast(err?.message || 'Não foi possível gerar o PDF.', 'error');
  } finally {
    const { showPdfPreviewLoading: hide } = await import('./pdf-preview.js');
    hide(false);
  }
}
