/**
 * Gera e anexa a folha de pedido de orçamento ao relatório (Storage + dados JSON).
 */

import { getJob } from './app.js';
import {
  getReportOrcamentoDocxUrl,
  getReportOrcamentoPdfUrl,
  reportHasPedidoOrcamento,
} from './pedido-orcamento.js';
import { buildOrcamentoDocxFilename, renderOrcamentoDOCX } from './orcamento-docx.js';
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
  if (
    !options.force &&
    getReportOrcamentoPdfUrl(report) &&
    getReportOrcamentoDocxUrl(report)
  ) {
    return report;
  }

  const job = report.jobId ? getJob(report.jobId) : null;

  const doc = await renderOrcamentoPDF(report);
  const pdfBlob = doc.output('blob');
  const pdfFilename = buildOrcamentoPdfFilename(report, job);
  const pdfUploaded = await uploadTrabalhoPdf(pdfBlob, pdfFilename);

  const docxBlob = await renderOrcamentoDOCX(report, job);
  const docxFilename = buildOrcamentoDocxFilename(report, job);
  const docxUploaded = await uploadTrabalhoPdf(docxBlob, docxFilename);

  const saved = await updateRelatorio(report.id, {
    data: {
      urlPdfOrcamento: pdfUploaded.publicUrl,
      orcamentoPdfFilename: pdfFilename,
      urlDocxOrcamento: docxUploaded.publicUrl,
      orcamentoDocxFilename: docxFilename,
    },
  });

  if (saved) mergeReportInCache(saved);
  return saved || report;
}
