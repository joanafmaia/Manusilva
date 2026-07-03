/**
 * Ecrã de assinaturas e conclusão da visita (serviço multi-relatório).
 */

import { closeModal, escapeHtml, formatDateLong, getClient, openModal, showToast } from './app.js';
import { getServico } from './servicos-db.js';
import {
  createSignatureBlock,
  initSignaturePads,
  padHasSignature,
  commitSignatureSnapshot,
  resolveReportSignatures,
} from './signatures.js';
import {
  describeServicoVisitSubmitSummary,
  getServicoVisitSubmitState,
  submitServicoVisit,
} from './servicos-submit-workflow.js';

function restoreSignaturePads(pads, stored = {}) {
  if (stored.technicianData && pads.technician) {
    pads.technician.loadFromDataURL(stored.technicianData);
  }
  if (stored.clientData && pads.client) {
    pads.client.loadFromDataURL(stored.clientData);
  }
}

/**
 * Modal de assinaturas + submissão da visita.
 * @param {string} servicoId
 */
export async function openServicoVisitSubmit(servicoId) {
  const state = getServicoVisitSubmitState(servicoId);
  if (!state.canSubmit) {
    showToast(state.reason || 'Não é possível concluir a visita.', 'error', 7000);
    return false;
  }

  const servico = getServico(servicoId);
  const client = getClient(servico?.clientId);
  const existingSigs = servico?.data?.signatures || {};
  const summary = describeServicoVisitSubmitSummary(servicoId);

  const content = `
    <p class="text-muted" style="margin-bottom:1rem">
      ${escapeHtml(client?.name || 'Cliente')} — ${escapeHtml(formatDateLong(servico?.date || ''))}
    </p>
    <p class="text-muted" style="margin-bottom:1rem;font-size:0.875rem">${escapeHtml(summary)}</p>
    <p style="margin-bottom:0.75rem;font-size:0.9375rem">
      As assinaturas aplicam-se a <strong>todos os relatórios</strong> desta visita.
    </p>
    <div class="signatures-grid tech-servico-signatures-grid">
      ${createSignatureBlock('Assinatura do Técnico', 'technician')}
      ${createSignatureBlock('Assinatura do Cliente', 'client')}
    </div>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="servico-visit-cancel">Cancelar</button>
    <button type="button" class="btn-primary" id="servico-visit-submit">Concluir visita</button>
  `;

  const overlay = openModal('Concluir visita', content, actions, { signatures: true });

  let pads = null;

  requestAnimationFrame(() => {
    pads = initSignaturePads(['technician', 'client']);
    restoreSignaturePads(pads, existingSigs);
    pads.technician?.resize?.();
    pads.client?.resize?.();
  });

  overlay.querySelector('#servico-visit-cancel')?.addEventListener('click', closeModal);

  overlay.querySelector('#servico-visit-submit')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#servico-visit-submit');
    if (!pads) {
      showToast('Aguarde o carregamento das assinaturas.', 'warning');
      return;
    }

    if (padHasSignature(pads.technician)) commitSignatureSnapshot(pads.technician);
    if (padHasSignature(pads.client)) commitSignatureSnapshot(pads.client);

    const signatures = resolveReportSignatures(pads, existingSigs);

    btn.disabled = true;
    btn.textContent = 'A enviar…';

    const ok = await submitServicoVisit(servicoId, signatures);
    if (ok) {
      closeModal();
    } else {
      btn.disabled = false;
      btn.textContent = 'Concluir visita';
    }
  });

  return true;
}
