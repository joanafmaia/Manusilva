/**
 * Selos de certificação no PDF da proposta comercial — canto inferior direito.
 */

import { getPdfLogoFormat } from './brand-ui.js';
import { getDataUrlImageDimensions } from './pdf-image-fit.js';
import { blobToDataUrlForPdf } from './pdf-image-loader.js';
import { PDF_PAGE_H, PDF_PAGE_W } from './pdf-design-system.js';

export const ORCAMENTO_CERTIFICACAO_SELOS_SRC = 'assets/certificacao/selos-certificacao.png';

/** Altura máxima dos selos no rodapé (faixa horizontal). */
const SELO_MAX_HEIGHT_MM = 13;
const SELO_MARGIN_RIGHT_MM = 10;
const SELO_MARGIN_BOTTOM_MM = 3.5;

let certificacaoSelosCache = null;

export async function loadOrcamentoCertificacaoSelosImage() {
  if (certificacaoSelosCache) return certificacaoSelosCache;
  try {
    const res = await fetch(ORCAMENTO_CERTIFICACAO_SELOS_SRC, { mode: 'cors' });
    if (!res.ok) return null;
    const dataUrl = await blobToDataUrlForPdf(await res.blob());
    if (!dataUrl) return null;
    certificacaoSelosCache = dataUrl;
    return dataUrl;
  } catch (err) {
    console.warn('[PDF] Selos de certificação indisponíveis:', err);
    return null;
  }
}

function resolveSeloLayout(dataUrl, dims) {
  const scale = SELO_MAX_HEIGHT_MM / Math.max(dims.height, 1);
  const h = SELO_MAX_HEIGHT_MM;
  const w = dims.width * scale;
  const x = PDF_PAGE_W - SELO_MARGIN_RIGHT_MM - w;
  const y = PDF_PAGE_H - SELO_MARGIN_BOTTOM_MM - h;
  const format = getPdfLogoFormat(dataUrl);
  return { x, y, w, h, format };
}

/**
 * Desenha os selos de certificação no canto inferior direito de todas as páginas.
 * @param {import('jspdf').jsPDF} doc
 */
export async function stampOrcamentoCertificacaoSelosAllPages(doc) {
  const dataUrl = await loadOrcamentoCertificacaoSelosImage();
  if (!dataUrl) return;

  const dims = await getDataUrlImageDimensions(dataUrl);
  if (!dims) return;

  const layout = resolveSeloLayout(dataUrl, dims);
  const total = doc.getNumberOfPages();

  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.addImage(dataUrl, layout.format, layout.x, layout.y, layout.w, layout.h, undefined, 'FAST');
  }
}
