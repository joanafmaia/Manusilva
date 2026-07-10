/**
 * Ecrã de assinaturas e conclusão da visita (serviço multi-relatório).
 */

import { closeModal, escapeHtml, formatDateLong, getClient, openModal, showToast } from './tech-app-core.js';
import { getServico } from './servicos-db.js';
import {
  createSignatureBlock,
  SignaturePad,
  padHasSignature,
  commitSignatureSnapshot,
  resolveReportSignatures,
  refreshSignaturePads,
  restoreSignaturePads,
  snapshotSignaturePads,
} from './signatures.js';
import {
  describeServicoVisitSubmitSummary,
  getServicoVisitSubmitState,
  servicoVisitAllowsOptionalSignatures,
  submitServicoVisit,
} from './servicos-submit-workflow.js';

const VISIT_SIG_DRAFT_PREFIX = 'manusilva_visit_sigs_';

function loadVisitSignatureDraft(servicoId) {
  try {
    const raw = sessionStorage.getItem(`${VISIT_SIG_DRAFT_PREFIX}${servicoId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveVisitSignatureDraft(servicoId, signatures) {
  const key = `${VISIT_SIG_DRAFT_PREFIX}${servicoId}`;
  try {
    if (signatures?.technicianData || signatures?.clientData) {
      sessionStorage.setItem(key, JSON.stringify(signatures));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* quota ou modo privado */
  }
}

function clearVisitSignatureDraft(servicoId) {
  try {
    sessionStorage.removeItem(`${VISIT_SIG_DRAFT_PREFIX}${servicoId}`);
  } catch {
    /* ignore */
  }
}

function initSignaturePadsInContainer(container, ids, onUpdate) {
  const pads = {};
  if (!container) return pads;
  ids.forEach((id) => {
    const canvas = container.querySelector(`#sig-${id}`);
    if (!canvas) return;
    pads[id] = new SignaturePad(canvas, {
      onChange: () => onUpdate?.(id, pads[id].hasSignature),
    });
    container.querySelector(`[data-clear-sig="${id}"]`)?.addEventListener('click', () => {
      pads[id].clear();
      onUpdate?.(id, false);
    });
  });
  return pads;
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
  const draftSigs = loadVisitSignatureDraft(servicoId) || {};
  const storedSigs = { ...(servico?.data?.signatures || {}), ...draftSigs };
  const summary = describeServicoVisitSubmitSummary(servicoId);
  const optionalSignatures = servicoVisitAllowsOptionalSignatures(servicoId);

  const signaturesHint = optionalSignatures
    ? `<p class="text-muted" style="margin-bottom:0.75rem;font-size:0.9375rem">
      Recolha/entrega no cliente — <strong>assinaturas opcionais</strong>. Pode assinar ou concluir sem assinaturas.
    </p>`
    : `<p style="margin-bottom:0.75rem;font-size:0.9375rem">
      As assinaturas aplicam-se a <strong>todos os relatórios</strong> desta visita. Só pode concluir quando nenhum estiver a cinza — todos verdes.
    </p>`;

  const content = `
    <p class="text-muted" style="margin-bottom:1rem">
      ${escapeHtml(client?.name || 'Cliente')} — ${escapeHtml(formatDateLong(servico?.date || ''))}
    </p>
    <p class="text-muted" style="margin-bottom:1rem;font-size:0.875rem">${escapeHtml(summary)}</p>
    ${signaturesHint}
    <div class="signatures-grid tech-servico-signatures-grid">
      ${createSignatureBlock(
        optionalSignatures ? 'Assinatura do Técnico (opcional)' : 'Assinatura do Técnico',
        'technician',
      )}
      ${createSignatureBlock(
        optionalSignatures ? 'Assinatura do Cliente (opcional)' : 'Assinatura do Cliente',
        'client',
      )}
    </div>
    <p class="signature-auto-save-hint" role="status">
      As assinaturas guardam-se automaticamente enquanto desenha — pode bloquear o ecrã ou voltar mais tarde. Use <strong>Concluir visita</strong> para enviar.
    </p>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="servico-visit-cancel">Cancelar</button>
    <button type="button" class="btn-primary" id="servico-visit-submit">Concluir visita</button>
  `;

  const overlay = openModal('Concluir visita', content, actions, { signatures: true });

  let pads = null;
  let draftSaveTimer = 0;

  const persistDraftSignatures = () => {
    if (!pads) return;
    snapshotSignaturePads(pads);
    const signatures = resolveReportSignatures(pads, storedSigs);
    Object.assign(storedSigs, signatures);
    saveVisitSignatureDraft(servicoId, signatures);
  };

  const scheduleDraftSave = () => {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(persistDraftSignatures, 250);
  };

  const onVisibility = () => {
    if (!pads) return;
    if (document.visibilityState === 'hidden') {
      clearTimeout(draftSaveTimer);
      persistDraftSignatures();
      return;
    }
    refreshSignaturePads(pads);
    restoreSignaturePads(pads, storedSigs);
  };

  document.addEventListener('visibilitychange', onVisibility);

  const mountPads = () => {
    pads = initSignaturePadsInContainer(overlay, ['technician', 'client'], scheduleDraftSave);
    restoreSignaturePads(pads, storedSigs);
    pads.technician?.resize?.();
    pads.client?.resize?.();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(mountPads);
  });

  overlay.querySelector('#servico-visit-cancel')?.addEventListener('click', () => {
    clearTimeout(draftSaveTimer);
    persistDraftSignatures();
    document.removeEventListener('visibilitychange', onVisibility);
    closeModal();
  });

  overlay.querySelector('#servico-visit-submit')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#servico-visit-submit');
    if (!pads) {
      showToast('Aguarde o carregamento das assinaturas.', 'warning');
      return;
    }

    if (padHasSignature(pads.technician)) commitSignatureSnapshot(pads.technician);
    if (padHasSignature(pads.client)) commitSignatureSnapshot(pads.client);

    const signatures = resolveReportSignatures(pads, storedSigs);

    btn.disabled = true;
    btn.textContent = 'A enviar…';

    const ok = await submitServicoVisit(servicoId, signatures);
    if (ok) {
      clearVisitSignatureDraft(servicoId);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(draftSaveTimer);
      closeModal();
    } else {
      btn.disabled = false;
      btn.textContent = 'Concluir visita';
    }
  });

  return true;
}
