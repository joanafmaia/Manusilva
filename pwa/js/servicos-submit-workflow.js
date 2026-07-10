/**
 * Conclusão da visita (serviço) — assinaturas partilhadas e submissão dos relatórios.
 */

import { showToast } from './toast-modal.js';
import { getServiceType } from './entity-lookups.js';
import { formatServicosError, getServico, updateServico } from './servicos-db.js';
import { getReportsForServico, getIncompleteServicoDraftReports, isServicoReportTechnicianComplete } from './servicos-panel-utils.js';
import { reportDraftStorageKey } from './report-local-storage.js';
import { SERVICE_IDS } from './service-constants.js';

/**
 * Estado da visita antes de concluir.
 * @param {string} servicoId
 */
export function getServicoVisitSubmitState(servicoId) {
  const reports = getReportsForServico(servicoId);
  const draftReports = reports.filter((r) => r.status === 'draft');
  const readyDraftReports = draftReports.filter(isServicoReportTechnicianComplete);
  const incompleteDraftReports = getIncompleteServicoDraftReports(servicoId);
  const pendingReports = reports.filter((r) => r.status === 'pending_review');
  const rejectedReports = reports.filter((r) => r.status === 'rejected');
  const approvedReports = reports.filter((r) => r.status === 'approved');

  let canSubmit = false;
  let reason = null;

  if (!reports.length) {
    reason = 'Adicione pelo menos um relatório antes de concluir a visita.';
  } else if (rejectedReports.length) {
    reason = 'Corrija os relatórios rejeitados antes de concluir a visita.';
  } else if (incompleteDraftReports.length) {
    reason = 'Conclua cada relatório em rascunho antes de terminar a visita.';
  } else if (readyDraftReports.length || pendingReports.length) {
    canSubmit = true;
  } else if (approvedReports.length === reports.length) {
    reason = 'Todos os relatórios desta visita já foram aprovados.';
  } else {
    reason = 'Não há relatórios prontos para submeter.';
  }

  return {
    canSubmit,
    reason,
    reports,
    draftReports,
    readyDraftReports,
    incompleteDraftReports,
    pendingReports,
    rejectedReports,
    approvedReports,
  };
}

/** Mostrar acção de assinar/concluir visita no painel do técnico. */
export function canShowServicoVisitConcludeAction(servicoId) {
  const state = getServicoVisitSubmitState(servicoId);
  if (!state.reports.length) {
    return { show: false, state, hint: 'Adicione pelo menos um relatório a esta visita.' };
  }
  if (state.approvedReports.length === state.reports.length) {
    return { show: false, state, hint: state.reason };
  }
  if (state.rejectedReports.length) {
    return {
      show: true,
      state,
      hint: 'Corrija os relatórios rejeitados antes de assinar a visita.',
    };
  }
  if (state.incompleteDraftReports.length) {
    const n = state.incompleteDraftReports.length;
    return {
      show: false,
      state,
      hint: `Falta concluir ${n} relatório${n === 1 ? '' : 's'} — abra os que estão a cinza e use «Concluir relatório» em cada um (ficam verdes).`,
    };
  }
  return {
    show: true,
    state,
    hint: servicoVisitAllowsOptionalSignatures(servicoId)
      ? 'Conclua a visita — assinaturas opcionais para recolha/entrega no cliente.'
      : 'Assine a visita — a assinatura aplica-se a todos os relatórios e envia-os ao RH.',
  };
}

/** Assinaturas opcionais quando todos os relatórios activos da visita são recolha/entrega. */
export function servicoVisitAllowsOptionalSignatures(servicoId) {
  const reports = getReportsForServico(servicoId).filter((r) => r.status !== 'approved');
  if (!reports.length) return false;
  return reports.every((r) => r.serviceType === SERVICE_IDS.MOVIMENTO_MATERIAL_CLIENTE);
}

export function collectServicoSubmitWarnings(signatures, { optionalSignatures = false } = {}) {
  if (optionalSignatures) return [];
  const warnings = [];
  if (!signatures?.technicianData) warnings.push('Sem assinatura do técnico.');
  if (!signatures?.clientData) warnings.push('Sem assinatura do cliente.');
  return warnings;
}

export function confirmServicoSubmitWarnings(warnings) {
  if (!warnings?.length) return true;
  const list = warnings.map((w) => `• ${w}`).join('\n');
  return window.confirm(
    `Antes de concluir a visita, verifique:\n\n${list}\n\nDeseja submeter mesmo assim?`,
  );
}

/**
 * Grava assinaturas partilhadas no serviço (Supabase).
 * @param {string} servicoId
 * @param {object} signatures
 */
export async function saveServicoVisitSignatures(servicoId, signatures) {
  const servico = getServico(servicoId);
  if (!servico) throw new Error('Serviço não encontrado.');

  const dados = {
    ...(servico.data || {}),
    signatures: signatures || {},
  };

  const hasPending =
    getReportsForServico(servicoId).some((r) => r.status === 'draft') ||
    getReportsForServico(servicoId).some((r) => r.status === 'pending_review');

  return updateServico(servicoId, {
    dados,
    submetido_em: new Date().toISOString(),
    estado: hasPending ? 'pending_review' : 'in_progress',
  });
}

/** Grava assinaturas da visita em todos os relatórios (para PDFs e revisão RH). */
export async function propagateServicoSignaturesToReports(servicoId, signatures) {
  const { updateRelatorio } = await import('./relatorios-db.js');
  const reports = getReportsForServico(servicoId).filter(
    (r) => r.id && r.status !== 'rejected',
  );

  for (const report of reports) {
    try {
      await updateRelatorio(report.id, {
        data: { signatures: { ...(signatures || {}) } },
      });
    } catch (err) {
      console.warn('[ManuSilva] Propagar assinaturas ao relatório', report.id, err);
    }
  }
}

/**
 * Conclui a visita: assinaturas no serviço + submissão dos relatórios em rascunho já concluídos pelo técnico.
 * @param {string} servicoId
 * @param {object} signatures — payload de resolveReportSignatures
 */
export async function submitServicoVisit(servicoId, signatures) {
  const state = getServicoVisitSubmitState(servicoId);
  if (!state.canSubmit) {
    showToast(state.reason || 'Não é possível concluir a visita.', 'error', 7000);
    return false;
  }

  if (state.incompleteDraftReports.length) {
    showToast('Conclua todos os relatórios em rascunho antes de assinar a visita.', 'error', 7000);
    return false;
  }

  const optionalSignatures = servicoVisitAllowsOptionalSignatures(servicoId);
  const warnings = collectServicoSubmitWarnings(signatures, { optionalSignatures });
  if (!confirmServicoSubmitWarnings(warnings)) return false;

  try {
    await saveServicoVisitSignatures(servicoId, signatures);

    await propagateServicoSignaturesToReports(servicoId, signatures);

    const { submitReport } = await import('./report-workflow.js');
    const { removeLocalReportDraft } = await import('./report-local-storage.js');

    let submitted = 0;

    for (const report of state.readyDraftReports) {
      const withSignatures = {
        ...report,
        servicoId: report.servicoId || servicoId,
        data: {
          ...(report.data || {}),
          signatures: { ...(signatures || {}) },
        },
      };
      const result = await submitReport(withSignatures, {
        isCorrection: false,
        skipDuplicateToast: true,
        silent: true,
        fromServicoVisitSubmit: true,
      });
      if (result && !result.queued) {
        submitted += 1;
        await removeLocalReportDraft(reportDraftStorageKey(withSignatures)).catch(() => {});
      } else if (result?.queued) {
        submitted += 1;
      }
    }

    window.dispatchEvent(new CustomEvent('db-updated'));
    window.dispatchEvent(new CustomEvent('jobs-updated'));

    if (state.readyDraftReports.length) {
      if (!submitted) {
        showToast(
          'Assinaturas guardadas. Os relatórios serão sincronizados quando houver rede.',
          'warning',
          7000,
        );
      }
    }

    return true;
  } catch (err) {
    console.error('[ManuSilva] submitServicoVisit:', err);
    showToast(formatServicosError(err), 'error', 9000);
    return false;
  }
}

/** Resumo legível dos relatórios que serão submetidos. */
export function describeServicoVisitSubmitSummary(servicoId) {
  const state = getServicoVisitSubmitState(servicoId);
  if (!state.reports.length) return 'Sem relatórios nesta visita.';

  const lines = state.reports.map((r) => {
    const label = getServiceType(r.serviceType)?.label || r.serviceType || 'Relatório';
    let status = 'rascunho';
    if (r.status === 'pending_review') status = 'à espera do RH';
    else if (r.status === 'approved') status = 'aprovado';
    else if (r.status === 'rejected') status = 'rejeitado';
    else if (isServicoReportTechnicianComplete(r)) status = 'concluído — aguarda visita';
    return `${label} (${status})`;
  });

  if (state.readyDraftReports.length) {
    return `Serão enviados ${state.readyDraftReports.length} relatório(s): ${lines.join(', ')}.`;
  }
  return `Relatórios: ${lines.join(', ')}.`;
}
