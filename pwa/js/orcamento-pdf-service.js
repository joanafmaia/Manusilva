/**
 * Gera e anexa a folha de pedido de orçamento ao relatório (Storage + dados JSON).
 */

import { getJob } from './app.js';
import {
  getReportOrcamentoPdfUrl,
  reportHasPedidoOrcamento,
  reportIsRhOrcamento,
  withOrcamentoUrlCacheBust,
} from './pedido-orcamento.js';
import { buildOrcamentoPdfFilename, renderOrcamentoPDF } from './pdf-orcamento.js';
import { buildOrcamentoMetaDraft, getReportOrcamentoMeta, resolveOrcamentoNumeroFormatado } from './orcamento-linhas.js';
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

function resolveOrcamentoMetaForRender(report, numero, explicitMeta = null) {
  const applyNumero = (meta) => ({
    ...meta,
    numeroSequencial: meta.numeroSequencial ?? numero.sequencial,
    ano: meta.ano ?? numero.ano,
    numeroFormatado: resolveOrcamentoNumeroFormatado(
      {
        ...meta,
        numeroSequencial: meta.numeroSequencial ?? numero.sequencial,
        ano: meta.ano ?? numero.ano,
      },
      { year: meta.ano ?? numero.ano },
    ),
  });

  if (explicitMeta) {
    return applyNumero(explicitMeta);
  }

  const saved = report.data?.orcamento;
  if (saved?.atualizadoEm) {
    return applyNumero(saved);
  }

  return applyNumero({
    ...(saved || {}),
    ...buildOrcamentoMetaDraft(report, numero),
    numeroSequencial: numero.sequencial,
    ano: numero.ano,
  });
}

/**
 * @param {object} report
 * @param {{ force?: boolean, orcamentoMeta?: object }} [options]
 * @returns {Promise<object|null>}
 */
export async function attachOrcamentoPdfToReport(report, options = {}) {
  if (!report?.id || !reportIsRhOrcamento(report)) return report;

  const savedMeta = getReportOrcamentoMeta(report);
  if (!options.force && !options.orcamentoMeta) {
    if (getReportOrcamentoPdfUrl(report)) return report;
    if (savedMeta?.numeroSequencial && savedMeta?.ano) return report;
  }

  const numero = await ensureOrcamentoNumeroForReport(report);
  const orcamentoMeta = resolveOrcamentoMetaForRender(
    report,
    numero,
    options.orcamentoMeta || null,
  );
  const workingReport = withOrcamentoMeta(report, orcamentoMeta);

  const job = workingReport.jobId ? getJob(workingReport.jobId) : null;
  const version = Date.now();

  const doc = await renderOrcamentoPDF(workingReport);
  const pdfBlob = doc.output('blob');
  const pdfFilename = buildOrcamentoPdfFilename(workingReport, job);
  const pdfUploaded = await uploadTrabalhoPdf(pdfBlob, pdfFilename);
  const pdfUrl = withOrcamentoUrlCacheBust(pdfUploaded.publicUrl, version);

  const saved = await updateRelatorio(workingReport.id, {
    data: {
      orcamento: orcamentoMeta,
      urlPdfOrcamento: pdfUrl,
      orcamentoPdfFilename: pdfFilename,
    },
  });

  if (saved) mergeReportInCache(saved);
  return saved || {
    ...workingReport,
    data: {
      ...workingReport.data,
      urlPdfOrcamento: pdfUrl,
      orcamentoPdfFilename: pdfFilename,
    },
  };
}

/**
 * Guarda metadados editados pelo RH e regenera o PDF.
 * @param {object} report
 * @param {object} orcamentoMeta
 */
export async function saveAndRegenerateOrcamento(report, orcamentoMeta) {
  if (!report?.id) return null;
  return attachOrcamentoPdfToReport(report, {
    force: true,
    orcamentoMeta: {
      ...orcamentoMeta,
      atualizadoEm: orcamentoMeta.atualizadoEm || new Date().toISOString(),
    },
  });
}
