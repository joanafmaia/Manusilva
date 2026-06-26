/**
 * Preenche o template Word MS.015 e devolve um Blob .docx
 */

import { buildOrcamentoFillData, escapeXmlText } from './orcamento-fill-data.js';
import { formatOpPdfFilenameSuffix } from './pdf-storage.js';
import { getJob } from './app.js';

const TEMPLATE_URL = 'assets/templates/MS.015-orcamento-template.docx';

function loadJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return Promise.resolve(window.JSZip);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jszip]');
    if (existing) {
      if (window.JSZip) resolve(window.JSZip);
      else existing.addEventListener('load', () => resolve(window.JSZip));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/vendor/jszip.min.js';
    script.dataset.jszip = '1';
    script.defer = true;
    script.onload = () => {
      if (window.JSZip) resolve(window.JSZip);
      else reject(new Error('JSZip não disponível.'));
    };
    script.onerror = () => reject(new Error('Falha ao carregar JSZip.'));
    document.head.appendChild(script);
  });
}

/**
 * @param {object} report
 * @param {object|null} [job]
 * @returns {Promise<Blob>}
 */
export async function renderOrcamentoDOCX(report, job = null) {
  const JSZip = await loadJSZip();
  const response = await fetch(TEMPLATE_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Modelo MS.015 de orçamento não encontrado na PWA.');
  }

  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('document.xml em falta no modelo MS.015.');

  let xml = await xmlFile.async('string');
  const data = buildOrcamentoFillData(report, job);

  Object.entries(data).forEach(([key, value]) => {
    const safe = escapeXmlText(value);
    xml = xml.split(`{${key}}`).join(safe);
  });

  zip.file('word/document.xml', xml);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function buildOrcamentoDocxFilename(report, job = null) {
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const op = formatOpPdfFilenameSuffix(resolvedJob?.numeroOrdem);
  if (op) return `Proposta_Comercial_${op}.docx`;
  const stamp = String(report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  return `Proposta_Comercial_${stamp}.docx`;
}
