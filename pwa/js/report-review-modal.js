/**
 * Rever relatório submetido (modal partilhado — RH / histórico cliente).
 */

import {
  getReport,
  getClient,
  getTechnician,
  getServiceType,
  escapeHtml,
  openModal,
  closeModal,
  showToast,
} from './app.js';

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
  const { previewReportPDF } = await import('./pdf-preview.js');

  const client = getClient(report.clientId);
  const tech = getTechnician(report.technicianId);
  const service = getServiceType(report.serviceType);
  const data = report.data || {};
  const values = data.values || { ...data.textFields, ...data.dropdowns };
  const fieldsHTML = renderReportValuesForReview(service, values);

  const photosHTML = (data.photos || []).length
    ? (data.photos || [])
        .map(
          (p) => `
    <div class="photo-thumb review-photo">
      <div class="photo-placeholder">${escapeHtml(String(p.label || '?').charAt(0))}</div>
      <span class="photo-label">${escapeHtml(p.label)}</span>
    </div>
  `,
        )
        .join('')
    : '<p class="text-muted">Sem fotos anexadas.</p>';

  const statusLabel =
    report.status === 'approved'
      ? 'Aprovado'
      : report.status === 'pending_review'
        ? 'Aguarda aprovação (RH)'
        : report.status === 'draft'
          ? 'Rascunho'
          : report.status;

  const content = `
    <div class="review-detail">
      <div class="review-header-info">
        <p><strong>Estado:</strong> ${escapeHtml(statusLabel)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</p>
        <p><strong>Técnico:</strong> ${escapeHtml(tech?.name || '—')}</p>
        <p><strong>Contacto:</strong> ${escapeHtml(client?.email || client?.['E-mail'] || '—')}</p>
      </div>
      <h4>Dados do Relatório</h4>${fieldsHTML}
      <h4>Fotos</h4><div class="photo-grid">${photosHTML}</div>
      <h4>Assinaturas</h4>
      <p>Técnico: ${data.signatures?.technician ? '✓ Assinado' : '✗ Pendente'} · Cliente: ${data.signatures?.client ? '✓ Assinado' : '✗ Pendente'}</p>
    </div>
  `;

  const showWorkflow =
    options.showWorkflowActions !== false && report.status === 'pending_review';

  const actions = `
    <button type="button" class="btn-outline" id="modal-pdf-preview">Ver PDF</button>
    ${showWorkflow ? '<button type="button" class="btn-danger" id="modal-reject">Rejeitar</button>' : ''}
    ${showWorkflow ? '<button type="button" class="btn-success" id="modal-approve">Aprovar</button>' : ''}
    <button type="button" class="btn-secondary" id="modal-close-review">Fechar</button>
  `;

  const overlay = openModal(
    `${service?.icon || '📋'} ${escapeHtml(service?.label || 'Relatório')} — Revisão`,
    content,
    actions,
  );

  overlay.querySelector('#modal-close-review')?.addEventListener('click', closeModal);

  overlay.querySelector('#modal-pdf-preview')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#modal-pdf-preview');
    btn.disabled = true;
    try {
      await previewReportPDF(report);
    } finally {
      btn.disabled = false;
    }
  });

  if (showWorkflow) {
    const { approveReport, rejectReport } = await import('./app.js');

    overlay.querySelector('#modal-approve')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#modal-approve');
      btn.disabled = true;
      const ok = await approveReport(reportId);
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

  const { showPdfPreviewLoading } = await import('./pdf-preview.js');
  showPdfPreviewLoading(true, 'A gerar PDF…');

  try {
    const { generateInterventionPDF } = await import('./pdf-report.js');
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
