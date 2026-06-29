/**
 * Rodapés institucionais — padrão geral e folha preventiva.
 */

import { COMPANY } from './mock_data.js';
import { pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_FONT_CAPTION,
  PDF_FOOTER_BLOCK_TOP,
  PDF_FOOTER_TEXT_RGB,
  PDF_PAGE_NUMBER_Y,
  PDF_TABLE_LINE,
} from './pdf-design-system.js';

const PDF_FOOTER_FONT_SIZE = PDF_FONT_CAPTION;
const FOLHA_INSTITUTIONAL_FOOTER_RGB = PDF_FOOTER_TEXT_RGB;
const FOLHA_INSTITUTIONAL_FOOTER_FONT = PDF_FONT_CAPTION;

/** Altura reservada no fecho da folha preventiva (rodapé institucional). */
export const FOLHA_INSTITUTIONAL_FOOTER_H_MM = 20;

export function buildInstitutionalFooterLines() {
  const contact = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join(' · ');
  return [
    COMPANY.name,
    COMPANY.nif ? `NIF ${COMPANY.nif}` : null,
    COMPANY.address,
    contact,
  ].filter(Boolean);
}

export function buildFolhaInstitutionalFooterLines() {
  const contact = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join(' | ');
  return [COMPANY.name, COMPANY.address, contact].filter(Boolean);
}

export function drawInstitutionalPageFooter(doc, pageNumber, totalPages) {
  doc.setPage(pageNumber);

  const footerTop = PDF_FOOTER_BLOCK_TOP;
  const footerLines = buildInstitutionalFooterLines();
  const pageNumY = PDF_PAGE_NUMBER_Y;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${pageNumber} / ${totalPages}`, PAGE_W / 2, pageNumY, { align: 'center' });

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FOOTER_FONT_SIZE);
  doc.setTextColor(...PDF_FOOTER_TEXT_RGB);

  let textY = footerTop + 4;
  footerLines.forEach((line) => {
    const wrapped = pdfSplitText(doc, line, CONTENT_W);
    wrapped.forEach((part) => {
      doc.text(part, PAGE_W / 2, textY, { align: 'center' });
      textY += 3.4;
    });
  });
}

export function drawFolhaInstitutionalPageFooter(doc, pageNumber, totalPages) {
  doc.setPage(pageNumber);

  const footerTop = PDF_FOOTER_BLOCK_TOP;
  const footerLines = buildFolhaInstitutionalFooterLines();

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${pageNumber} / ${totalPages}`, PAGE_W / 2, PDF_PAGE_NUMBER_Y, { align: 'center' });

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(FOLHA_INSTITUTIONAL_FOOTER_FONT);
  doc.setTextColor(...FOLHA_INSTITUTIONAL_FOOTER_RGB);

  let textY = footerTop + 4;
  footerLines.forEach((line) => {
    pdfSplitText(doc, line, CONTENT_W).forEach((part) => {
      doc.text(part, PAGE_W / 2, textY, { align: 'center' });
      textY += 3.5;
    });
  });
}

export function drawFolhaDocumentFooters(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    drawFolhaInstitutionalPageFooter(doc, i, total);
  }
}

export function drawPageFooter(doc, _reportId) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    drawInstitutionalPageFooter(doc, i, total);
  }
}
