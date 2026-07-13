/**
 * E-mail único ao cliente quando todos os relatórios da visita estão aprovados.
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { getServico } from './servicos-db.js';
import {
  getServicoActiveReports,
  isServicoVisitFullyApproved,
  resolveServicoIdForReport,
} from './servicos-panel-utils.js';

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

/**
 * Envia um e-mail com todos os PDFs dos relatórios aprovados da visita.
 * @param {string} servicoId
 * @param {{ clientEmail?: string }} [options]
 */
export async function sendServicoVisitClientEmail(servicoId, options = {}) {
  if (!servicoId) return false;

  const reports = getServicoActiveReports(servicoId).filter((r) => r.status === 'approved');
  if (!reports.length) return false;

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
