/**
 * Preenche o template Word MS.015 e devolve um Blob .docx
 */

import { buildOrcamentoFillData, escapeXmlText } from './orcamento-fill-data.js';
import { buildOrcamentoWordTableXml } from './orcamento-table-xml.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
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
    if (key === 'linhas') return;
    const safe = escapeXmlText(value);
    xml = xml.split(`{${key}}`).join(safe);
  });

  const tableXml = buildOrcamentoWordTableXml(data.linhas || []);
  if (xml.includes('[[TABELA_ORCAMENTO]]')) {
    xml = xml.replace(
      /<w:p\b[^>]*>[\s\S]*?\[\[TABELA_ORCAMENTO\]\][\s\S]*?<\/w:p>/,
      tableXml,
    );
  }

  zip.file('word/document.xml', xml);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function buildOrcamentoDocxFilename(report, job = null) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.numeroSequencial && meta?.ano) {
    return `MS015_Orcamento_${meta.numeroSequencial}-0_${meta.ano}.docx`;
  }
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const op = resolvedJob?.numeroOrdem;
  if (op != null && Number.isFinite(Number(op))) {
    return `MS015_Orcamento_OP${op}.docx`;
  }
  const stamp = String(report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  return `MS015_Orcamento_${stamp}.docx`;
}
