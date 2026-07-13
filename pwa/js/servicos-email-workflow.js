/**
 * E-mail único ao cliente quando todos os relatórios da visita estão aprovados.
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { ensureServicosLoadedSafe, getServico } from './servicos-db.js';
import {
  getApprovedReportsForServico,
  getServicoActiveReports,
  isServicoVisitFullyApproved,
  resolveServicoIdForReport,
} from './servicos-panel-utils.js';
import { showToast } from './toast-modal.js';

export { getServicoActiveReports, isServicoVisitFullyApproved };

/** Visita com mais do que um relatório → adia e-mail individual até todos aprovados. */
export function shouldDeferServicoVisitEmail(report) {
  const servicoId = resolveServicoIdForReport(report);
  if (!servicoId) return false;
  return getServicoActiveReports(servicoId).length > 1;
}

/** Id da visita para fluxo de e-mail agrupado. */
export function resolveServicoIdForVisitEmail(report) {
  return resolveServicoIdForReport(report);
}

export function wasServicoVisitEmailSent(servicoId) {
  const servico = getServico(servicoId);
  return Boolean(servico?.clientEmailSentAt);
}

/** Reserva o envio da visita na BD — só um processo consegue marcar `email_cliente_enviado_em`. */
export async function tryClaimServicoVisitEmailSend(servicoId) {
  if (!servicoId) return false;
  if (wasServicoVisitEmailSent(servicoId)) return false;

  const sentAt = new Date().toISOString();
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('servicos')
    .update({ email_cliente_enviado_em: sentAt, atualizado_em: sentAt })
    .eq('id', servicoId)
    .is('email_cliente_enviado_em', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[Email] Reserva envio visita:', error);
    return false;
  }
  if (!data?.id) return false;

  const { mergeServicoInCache, getServico: getCached } = await import('./servicos-db.js');
  const current = getCached(servicoId);
  if (current) {
    mergeServicoInCache({ ...current, clientEmailSentAt: sentAt });
  }
  return true;
}

async function releaseServicoVisitEmailClaim(servicoId) {
  if (!servicoId) return;
  const { updateServico } = await import('./servicos-db.js');
  try {
    await updateServico(servicoId, { email_cliente_enviado_em: null });
  } catch (err) {
    console.warn('[Email] Libertar reserva envio visita:', err);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/** Aguarda todos os relatórios da visita estarem aprovados e visíveis (evita corrida na aprovação paralela). */
async function waitForVisitReportsReady(servicoId, { maxAttempts = 6, delayMs = 350 } = {}) {
  if (!servicoId) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const reports = (await loadVisitReportsForEmail(servicoId)).filter((r) => r.status === 'approved');
    const active = getServicoActiveReports(servicoId);
    if (!active.length || !reports.length) {
      if (attempt < maxAttempts - 1) await sleep(delayMs);
      continue;
    }

    const activeIds = new Set(active.map((r) => String(r.id)));
    const approvedIds = new Set(reports.map((r) => String(r.id)));
    const allReady =
      active.length === reports.length && [...activeIds].every((id) => approvedIds.has(id));

    if (allReady) return reports;
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }

  return null;
}

async function loadVisitReportsForEmail(servicoId) {
  await ensureServicosLoadedSafe();
  const { ensureRelatoriosForServicos, ensureReportsLoaded } = await import('./relatorios-db.js');
  const { ensureJobsLoaded } = await import('./trabalhos-db.js');
  await ensureJobsLoaded(true);
  await ensureReportsLoaded(true);
  await ensureRelatoriosForServicos([servicoId]);
  return getApprovedReportsForServico(servicoId);
}

/**
 * Envia um e-mail com todos os PDFs dos relatórios aprovados da visita.
 * @param {string} servicoId
 * @param {{ clientEmail?: string, extraClientEmail?: string }} [options]
 */
export async function sendServicoVisitClientEmail(servicoId, options = {}) {
  if (!servicoId) return false;

  if (!isServicoVisitFullyApproved(servicoId)) return false;

  const reports = await waitForVisitReportsReady(servicoId);
  if (!reports?.length) return false;

  const claimed = await tryClaimServicoVisitEmailSend(servicoId);
  if (!claimed) return false;

  const { sendSelectedReportsEmail } = await import('./report-email-actions.js');
  let ok = false;
  try {
    ok = await sendSelectedReportsEmail(
      reports.map((r) => r.id),
      { ...options, skipVisitEmailClaim: true },
    );
  } catch (err) {
    console.error('[Email] Envio visita:', err);
    await releaseServicoVisitEmailClaim(servicoId);
    throw err;
  }

  if (!ok) {
    await releaseServicoVisitEmailClaim(servicoId);
    return false;
  }

  const { updateServico } = await import('./servicos-db.js');
  await updateServico(servicoId, { estado: 'approved' });
  return true;
}

/**
 * Reenvia o e-mail da visita com todos os relatórios aprovados (sem bloqueio de envio anterior).
 * @param {string} servicoId
 * @param {{ clientEmail?: string, extraClientEmail?: string }} [options]
 */
export async function resendServicoVisitClientEmail(servicoId, options = {}) {
  if (!servicoId) return false;

  const reports = await loadVisitReportsForEmail(servicoId);
  if (!reports.length) {
    showToast('Nenhum relatório aprovado nesta visita.', 'warning');
    return false;
  }

  const { sendSelectedReportsEmail } = await import('./report-email-actions.js');
  const ok = await sendSelectedReportsEmail(
    reports.map((r) => r.id),
    { ...options, skipRatingLink: true },
  );

  if (!ok) return false;

  const sentAt = new Date().toISOString();
  const { updateServico } = await import('./servicos-db.js');
  await updateServico(servicoId, {
    email_cliente_enviado_em: sentAt,
    estado: 'approved',
  });
  return true;
}
