/**
 * Modal de revisão RH — layout 2 colunas (apenas painel admin / Revisão de Relatórios)
 */

import { escapeHtml, formatDateLong } from './app.js';
import { formatOrdemLabel, renderReviewFotosSection } from './report-review-ui.js';

/**
 * Corpo da modal de revisão RH — grelha 2 colunas (info | fotos + ações).
 */
export function buildRhReviewModalContent({
  job,
  report,
  client,
  tech,
  fieldsHTML,
  showWorkflow = true,
}) {
  const data = report?.data || {};
  const submittedDate = report?.submittedAt
    ? String(report.submittedAt).split('T')[0]
    : job?.date || '';
  const dateLabel = submittedDate ? formatDateLong(submittedDate) : '—';
  const contact = client?.email || client?.['E-mail'] || '—';

  const workflowHtml = showWorkflow
    ? `
        <button type="button" class="btn-danger btn-touch review-action-btn" id="modal-reject">Rejeitar</button>
        <button type="button" class="btn-success btn-touch review-action-btn" id="modal-approve">Aprovar</button>
      `
    : `<button type="button" class="btn-secondary btn-touch review-action-btn" id="modal-close-review">Fechar</button>`;

  return `
    <div class="review-detail review-detail--grid">
      <div class="review-col review-col--info">
        <header class="review-meta-card">
          <div class="review-ordem-block">
            <span class="review-ordem-kicker">Ordem Nº</span>
            <span class="review-ordem-num">${escapeHtml(formatOrdemLabel(job))}</span>
          </div>
          <p class="review-meta-row"><strong>Cliente:</strong> ${escapeHtml(client?.name || client?.Nome || '—')}</p>
          <p class="review-meta-row"><strong>Técnico:</strong> ${escapeHtml(tech?.name || '—')}</p>
          <p class="review-meta-row"><strong>Contacto:</strong> ${escapeHtml(contact)}</p>
          <p class="review-meta-row"><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>
          ${report?.forkliftSerial ? `<p class="review-meta-row"><strong>Máquina:</strong> ${escapeHtml(report.forkliftSerial)}</p>` : ''}
        </header>

        <section class="review-block">
          <h4 class="review-section-title">Dados do Relatório</h4>
          <div class="review-fields-wrap">${fieldsHTML}</div>
        </section>

        <section class="review-block review-block--compact">
          <h4 class="review-section-title">Assinaturas</h4>
          <p class="review-signatures">
            Técnico: ${data.signatures?.technician ? '✓ Assinado' : '✗ Pendente'}
            · Cliente: ${data.signatures?.client ? '✓ Assinado' : '✗ Pendente'}
          </p>
        </section>

        <section class="review-section review-section--pdf">
          <p class="review-pdf-status review-pdf-status--pending">Use «Pré-visualizar PDF» para ver o relatório com os dados atuais. O PDF oficial é gerado na aprovação.</p>
        </section>

        <div class="review-col-footer">
          <button type="button" class="btn-primary btn-touch review-btn-pdf" id="modal-pdf-preview">Pré-visualizar PDF</button>
        </div>
      </div>

      <div class="review-col review-col--media">
        ${renderReviewFotosSection(job, report)}
        <div class="review-workflow-actions">
          ${workflowHtml}
        </div>
      </div>
    </div>
  `;
}
