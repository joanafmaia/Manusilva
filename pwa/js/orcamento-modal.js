/**
 * Modal dedicada à proposta MS.015 (separada da revisão do relatório).
 */

import { getClient, getJob, getReport, getTechnician } from './app.js';
import { renderOrcamentoEditor, bindOrcamentoEditor } from './orcamento-rh-editor.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { escapeHtml } from './html-utils.js';

function closeOrcamentoModal(overlay) {
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 200);
}

/**
 * @param {object} report
 * @param {{ onUpdated?: (report: object) => void }} [options]
 */
export function openOrcamentoModal(report, { onUpdated } = {}) {
  if (!report?.id) return;

  let currentReport = getReport(report.id) || report;
  const client = getClient(currentReport.clientId);
  const job = currentReport.jobId ? getJob(currentReport.jobId) : null;
  const tech = getTechnician(currentReport.technicianId);
  const meta = getReportOrcamentoMeta(currentReport);
  const numeroLabel = meta?.numeroFormatado;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay--stack modal-overlay--orcamento show';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Proposta comercial MS.015');

  const renderBody = () => {
    const body = overlay.querySelector('.modal-body');
    if (!body) return;
    body.innerHTML = `
      <p class="orcamento-modal-lead text-muted">
        Proposta comercial independente do relatório técnico. Use um e-mail diferente se a proposta for para compras ou gestão.
      </p>
      <div class="orcamento-modal-meta">
        <span><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</span>
        ${job?.numeroOrdem != null ? `<span><strong>OP:</strong> ${escapeHtml(String(job.numeroOrdem))}</span>` : ''}
        ${tech?.name ? `<span><strong>Técnico:</strong> ${escapeHtml(tech.name)}</span>` : ''}
      </div>
      ${renderOrcamentoEditor(currentReport, { client })}
    `;
    bindOrcamentoEditor(body, {
      report: currentReport,
      onUpdated: (updated) => {
        currentReport = updated;
        onUpdated?.(updated);
        const num = updated.data?.orcamento?.numeroFormatado;
        const titleNum = overlay.querySelector('.orcamento-modal-title-num');
        if (titleNum && num) titleNum.textContent = num;
      },
    });
  };

  overlay.innerHTML = `
    <div class="modal glass-card orcamento-modal">
      <div class="modal-header">
        <h3 class="orcamento-modal-title">
          Proposta MS.015
          ${numeroLabel ? `<span class="orcamento-modal-title-num">${escapeHtml(numeroLabel)}</span>` : ''}
        </h3>
        <button type="button" class="modal-close orcamento-modal-close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-actions orcamento-modal-footer">
        <button type="button" class="btn-secondary btn-touch" id="orcamento-modal-close">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  renderBody();

  const onClose = () => closeOrcamentoModal(overlay);
  overlay.querySelector('.orcamento-modal-close')?.addEventListener('click', onClose);
  overlay.querySelector('#orcamento-modal-close')?.addEventListener('click', onClose);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });
}
