/**
 * Metadados de e-mail oficial — evita duplicar lógica em approve/resend/batch.
 */

import { getClientName } from './client-display.js';
import { resolvePdfNumeroOrdem } from './pdf-header-blocks.js';
import { SERVICE_IDS } from './service-constants.js';
import { resolveReportInterventionDatePt } from './report-intervention-date.js';

/**
 * @param {object} report
 * @param {{ multiReport?: boolean, multiPdf?: boolean }} [options]
 */
export function resolveReportEmailTipoRelatorio(report, options = {}) {
  if (options.multiReport || options.multiPdf) return 'visita';
  const serviceType = String(report?.serviceType || '');
  if (serviceType === SERVICE_IDS.INSPECAO_DL50_2005) return 'dl50-2005';
  if (serviceType === SERVICE_IDS.MANUTENCAO_BATERIAS_GRANDES) return 'baterias';
  return 'outro';
}

/**
 * @param {object} report
 * @param {{
 *   client?: object,
 *   job?: object,
 *   technicianName?: string,
 *   multiReport?: boolean,
 *   multiPdf?: boolean,
 * }} [options]
 */
export function buildReportEmailMeta(report, options = {}) {
  const values = report?.data?.values || {};
  const client = options.client || null;
  const job = options.job || null;

  return {
    tipoRelatorio: resolveReportEmailTipoRelatorio(report, options),
    reportId: report?.id,
    clienteNome: getClientName(client, values),
    nome_empresa: String(values.nome_empresa || '').trim(),
    tecnico: String(values.tecnico || options.technicianName || '').trim(),
    dataConclusao: resolveReportInterventionDatePt(report, job),
    serieFrota: String(values.numero_de_serie || report?.forkliftSerial || '').trim(),
    numeroOrdem: resolvePdfNumeroOrdem(report, job, values),
  };
}
