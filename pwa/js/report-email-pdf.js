/**
 * PDFs para e-mail de relatórios aprovados (geração, upload, payload).
 */

import { PDF_DOCUMENT_TITLES } from './mock_data.js';
import {
  uploadTrabalhoPdf,
  buildReportPdfFilename,
} from './pdf-storage.js';
import { arrayBufferToBase64 } from './base64-utils.js';

/**
 * @param {Array<{ blob?: Blob, filename: string, publicUrl?: string, machineLabel?: string, base64?: string }>} pdfEntries
 */
export function buildReportEmailPdfPayload(pdfEntries = []) {
  const pdfUrls = pdfEntries
    .filter((entry) => entry?.publicUrl)
    .map((entry) => ({
      url: entry.publicUrl,
      filename: entry.filename || '',
      label: entry.machineLabel || entry.filename || '',
    }));

  const payload = {
    pdfUrl: pdfUrls[0]?.url || null,
    pdfUrls,
  };

  if (pdfEntries.length > 1) return payload;

  const MAX_BASE64_LEN = 3_000_000;
  const entry = pdfEntries[0];
  const base64 = entry?.base64 || '';
  if (base64 && base64.length > 0 && base64.length <= MAX_BASE64_LEN) {
    payload.pdfFilename = entry.filename;
    payload.pdfBase64 = base64;
  }

  return payload;
}

export async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

/**
 * @param {object} report
 * @param {object} job
 * @param {{ label?: string }} [service]
 */
export async function generateAndUploadApprovedReportPdfs(report, job, service) {
  const { importPdfReport } = await import('./pdf-loader.js');
  const pdfReport = await importPdfReport();
  const EMPILHADORES_SERVICE = 'manutencao_preventiva_empilhadores';
  const serviceTitle = PDF_DOCUMENT_TITLES[report.serviceType] || service?.label;

  if (report.serviceType === EMPILHADORES_SERVICE) {
    const pdfs = await pdfReport.generateEmpilhadoresPdfBlobs(report);
    const uploaded = [];
    for (const item of pdfs) {
      const stored = await uploadTrabalhoPdf(item.blob, item.filename);
      uploaded.push({
        blob: item.blob,
        filename: item.filename,
        publicUrl: stored.publicUrl,
        machineLabel: item.machineLabel,
      });
    }
    return uploaded;
  }

  const doc = await pdfReport.renderInterventionPDF(report);
  const filename = buildReportPdfFilename(job, report, { serviceTitle });
  const blob = doc.output('blob');
  const stored = await uploadTrabalhoPdf(blob, filename);
  return [{ blob, filename, publicUrl: stored.publicUrl }];
}

export function resolveApprovedReportPdfSources(report, job) {
  const urls = Array.isArray(report?.data?.urlPdfs) ? report.data.urlPdfs.filter(Boolean) : [];
  const names = Array.isArray(report?.data?.pdfFilenames) ? report.data.pdfFilenames : [];
  if (urls.length) {
    return urls.map((url, index) => ({
      publicUrl: url,
      filename: names[index] || report.pdfFilename || `relatorio_${index + 1}.pdf`,
      machineLabel: names[index] || `Relatório ${index + 1}`,
    }));
  }
  if (job?.urlPdf) {
    return [
      {
        publicUrl: job.urlPdf,
        filename: report.pdfFilename || 'relatorio.pdf',
      },
    ];
  }
  return [];
}
