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
import { buildOrcamentoMetaDraft } from './orcamento-linhas.js';
import { ensureOrcamentoNumeroForReport } from './orcamento-numero-db.js';
import { uploadTrabalhoPdf } from './pdf-storage.js';
import { mergeReportInCache, updateRelatorio } from './relatorios-db.js';

function withOrcamentoMeta(report, meta) {
  return {
    ...report,
    data: {
      ...(report.data || {}),
      orcamento: meta,
    },
  };
}

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

  const numero = await ensureOrcamentoNumeroForReport(report);
  const orcamentoMeta = buildOrcamentoMetaDraft(report, numero);
  let workingReport = withOrcamentoMeta(report, {
    ...(report.data?.orcamento || {}),
    ...orcamentoMeta,
    numeroSequencial: numero.sequencial,
    ano: numero.ano,
    numeroFormatado: numero.numeroFormatado,
  });

  if (!report.data?.orcamento?.numeroSequencial) {
    const savedMeta = await updateRelatorio(report.id, {
      data: { orcamento: workingReport.data.orcamento },
    });
    if (savedMeta) {
      mergeReportInCache(savedMeta);
      workingReport = savedMeta;
    }
  }

  const job = workingReport.jobId ? getJob(workingReport.jobId) : null;

  const doc = await renderOrcamentoPDF(workingReport);
  const pdfBlob = doc.output('blob');
  const pdfFilename = buildOrcamentoPdfFilename(workingReport, job);
  const pdfUploaded = await uploadTrabalhoPdf(pdfBlob, pdfFilename);

  const docxBlob = await renderOrcamentoDOCX(workingReport, job);
  const docxFilename = buildOrcamentoDocxFilename(workingReport, job);
  const docxUploaded = await uploadTrabalhoPdf(docxBlob, docxFilename);

  const saved = await updateRelatorio(workingReport.id, {
    data: {
      urlPdfOrcamento: pdfUploaded.publicUrl,
      orcamentoPdfFilename: pdfFilename,
      urlDocxOrcamento: docxUploaded.publicUrl,
      orcamentoDocxFilename: docxFilename,
    },
  });

  if (saved) mergeReportInCache(saved);
  return saved || workingReport;
}

/**
 * Guarda metadados editados pelo RH e regenera Word + PDF.
 * @param {object} report
 * @param {object} orcamentoMeta
 */
export async function saveAndRegenerateOrcamento(report, orcamentoMeta) {
  if (!report?.id) return null;

  const savedMeta = await updateRelatorio(report.id, {
    data: { orcamento: orcamentoMeta },
  });
  const base = savedMeta || withOrcamentoMeta(report, orcamentoMeta);
  if (savedMeta) mergeReportInCache(savedMeta);
  return attachOrcamentoPdfToReport(base, { force: true });
}
