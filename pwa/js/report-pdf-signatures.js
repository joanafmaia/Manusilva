/**
 * Assinaturas partilhadas do serviço → PDFs de todos os relatórios da visita.
 */

import { getServico } from './servicos-db.js';

function hasSignatureImages(signatures) {
  return Boolean(signatures?.technicianData || signatures?.clientData);
}

/**
 * Resolve assinaturas para renderização PDF.
 * Prioridade: servico.dados.signatures → relatório.data.signatures
 * @param {object | null | undefined} report
 */
export function resolvePdfSignaturesForReport(report) {
  const reportSigs = report?.data?.signatures || {};

  const servicoId = report?.servicoId || null;
  if (!servicoId) {
    return reportSigs;
  }

  const servico = getServico(servicoId);
  const servicoSigs = servico?.data?.signatures || {};

  if (!hasSignatureImages(servicoSigs)) {
    return reportSigs;
  }

  return {
    ...reportSigs,
    ...servicoSigs,
    technician: Boolean(servicoSigs.technicianData || reportSigs.technicianData),
    client: Boolean(servicoSigs.clientData || reportSigs.clientData),
    technicianData: servicoSigs.technicianData || reportSigs.technicianData || null,
    clientData: servicoSigs.clientData || reportSigs.clientData || null,
  };
}

/** Clona relatório com assinaturas do serviço aplicadas (pré-visualização / e-mail). */
export function withServicoSignaturesForPdf(report) {
  if (!report) return report;
  return {
    ...report,
    data: {
      ...(report.data || {}),
      signatures: resolvePdfSignaturesForReport(report),
    },
  };
}
