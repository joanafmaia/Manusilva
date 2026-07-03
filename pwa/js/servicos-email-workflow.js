/**
 * E-mail único ao cliente quando todos os relatórios da visita estão aprovados.
 */

import { getServico } from './servicos-db.js';
import { getReportsForServico } from './servicos-panel-utils.js';

/** Relatórios da visita que contam para conclusão (exclui rejeitados). */
export function getServicoActiveReports(servicoId) {
  if (!servicoId) return [];
  return getReportsForServico(servicoId).filter((r) => r.status !== 'rejected');
}

/** Visita com mais do que um relatório → e-mail agrupado no fim. */
export function shouldDeferServicoVisitEmail(report) {
  const servicoId = report?.servicoId;
  if (!servicoId) return false;
  return getServicoActiveReports(servicoId).length > 1;
}

/** Todos os relatórios ativos da visita estão aprovados. */
export function isServicoVisitFullyApproved(servicoId) {
  const reports = getServicoActiveReports(servicoId);
  if (!reports.length) return false;
  return reports.every((r) => r.status === 'approved');
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
