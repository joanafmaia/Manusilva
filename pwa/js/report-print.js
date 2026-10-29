/**
 * Impressão do PDF oficial após aprovação RH.
 */

import { getReport, getJob } from './entity-lookups.js';
import { resolveApprovedReportPdfSources } from './report-email-pdf.js';

/**
 * @param {string} blobUrl
 * @returns {Promise<void>}
 */
function printBlobUrl(blobUrl) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Imprimir PDF');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve();
    };

    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            window.open(blobUrl, '_blank', 'noopener,noreferrer');
            finish();
            return;
          }
          const onAfter = () => {
            win.removeEventListener('afterprint', onAfter);
            finish();
          };
          win.addEventListener('afterprint', onAfter);
          win.focus();
          win.print();
          // Alguns viewers PDF não disparam afterprint
          window.setTimeout(finish, 120000);
        } catch {
          window.open(blobUrl, '_blank', 'noopener,noreferrer');
          finish();
        }
      }, 300);
    };

    iframe.onerror = () => {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      finish();
    };

    iframe.src = blobUrl;
  });
}

/**
 * Descarrega o PDF (público) e abre o diálogo de impressão.
 * @param {string} url
 */
export async function printPdfPublicUrl(url) {
  const href = String(url || '').trim();
  if (!href) return;

  const res = await fetch(href);
  if (!res.ok) {
    throw new Error(`Não foi possível obter o PDF (${res.status}).`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    await printBlobUrl(blobUrl);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

/**
 * Imprime os PDFs oficiais de um relatório já aprovado.
 * @param {string} reportId
 * @returns {Promise<boolean>}
 */
export async function printApprovedReportPdfs(reportId) {
  const report = getReport(reportId);
  if (!report) return false;

  const job = report.jobId ? getJob(report.jobId) : null;
  const sources = resolveApprovedReportPdfSources(report, job);
  if (!sources.length) {
    try {
      const { showToast } = await import('./toast-modal.js');
      showToast('Relatório aprovado, mas o PDF ainda não está disponível para imprimir.', 'warning', 7000);
    } catch {
      /* toast indisponível */
    }
    return false;
  }

  for (const src of sources) {
    try {
      await printPdfPublicUrl(src.publicUrl);
    } catch (err) {
      console.error('[Print] PDF aprovado:', err);
      if (src.publicUrl) {
        window.open(src.publicUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }
  return true;
}
