/**
 * E-mail único ao cliente quando todos os relatórios da visita estão aprovados.
 */

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

/**
 * Envia um e-mail com todos os PDFs dos relatórios aprovados da visita.
 * @param {string} servicoId
 * @param {{ clientEmail?: string }} [options]
 */
export async function sendServicoVisitClientEmail(servicoId, options = {}) {
  if (!servicoId) return false;

  const reports = getServicoActiveReports(servicoId).filter((r) => r.status === 'approved');
  if (!reports.length) return false;

  const { sendSelectedReportsEmail } = await import('./report-email-actions.js');
  const ok = await sendSelectedReportsEmail(
    reports.map((r) => r.id),
    options,
  );

  if (ok) {
    const { updateServico } = await import('./servicos-db.js');
    await updateServico(servicoId, {
      email_cliente_enviado_em: new Date().toISOString(),
      estado: 'approved',
    });
  }

  return ok;
}
