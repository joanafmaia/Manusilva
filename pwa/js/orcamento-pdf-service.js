/**
 * Gera e anexa a folha de pedido de orçamento ao relatório (Storage + dados JSON).
 */

import { getJob } from './app.js';
import {
  getReportOrcamentoPdfUrl,
  reportHasPedidoOrcamento,
} from './pedido-orcamento.js';
import { buildOrcamentoPdfFilename, renderOrcamentoPDF } from './pdf-orcamento.js';
import { uploadTrabalhoPdf } from './pdf-storage.js';
import { mergeReportInCache, updateRelatorio } from './relatorios-db.js';

/**
 * @param {object} report
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function attachOrcamentoPdfToReport(report, options = {}) {
  if (!report?.id || !reportHasPedidoOrcamento(report)) return report;
  if (!options.force && getReportOrcamentoPdfUrl(report)) return report;

  const job = report.jobId ? getJob(report.jobId) : null;
  const doc = await renderOrcamentoPDF(report);
  const blob = doc.output('blob');
  const filename = buildOrcamentoPdfFilename(report, job);
  const uploaded = await uploadTrabalhoPdf(blob, filename);

  const saved = await updateRelatorio(report.id, {
    data: {
      urlPdfOrcamento: uploaded.publicUrl,
      orcamentoPdfFilename: filename,
    },
  });

  if (saved) mergeReportInCache(saved);
  return saved || report;
}
