/**
 * Barras de título e caixas de conteúdo — layout PDF partilhado.
 */

import { pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_GAP_MM,
  PDF_DOCUMENT_TITLE_BAR_H_MM,
  PDF_BAR_RADIUS_MM,
  PDF_FONT_SUBTITLE,
  PDF_FONT_SECTION,
  PDF_SECTION_TITLE_BAR_H_MM,
  PDF_SECTION_BG,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_BODY_FILL,
  PDF_CONTENT_BOX_RADIUS_MM,
  PDF_SECTION_BAND_HEIGHT_MM,
} from './pdf-design-system.js';
import { ensureSpace, touchPdfContentPage } from './pdf-page-layout.js';

export function drawPdfDocumentTitleBar(doc, y, title, gapAfter = PDF_SECTION_GAP_MM) {
  const barH = PDF_DOCUMENT_TITLE_BAR_H_MM;
  y = ensureSpace(doc, y, barH + gapAfter);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, PDF_BAR_RADIUS_MM, PDF_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  touchPdfContentPage(doc);
  return y + barH + gapAfter;
}

export function drawPdfSectionTitleBar(doc, y, title, options = {}) {
  const x = options.x ?? MARGIN;
  const width = options.width ?? CONTENT_W;
  const bandH = options.bandH ?? PDF_SECTION_TITLE_BAR_H_MM;
  const gapAfter = options.gapAfter ?? PDF_SECTION_GAP_MM;
  const fontSize = options.fontSize ?? PDF_FONT_SECTION;
  const align = options.align ?? 'left';

  if (!options.skipEnsure) {
    y = ensureSpace(doc, y, bandH + gapAfter);
  }

  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(x, y, width, bandH, PDF_BAR_RADIUS_MM, PDF_BAR_RADIUS_MM, 'FD');

  pdfSetFont(doc, 'bold');
  doc.setTextColor(...CORPORATE_BLUE);
  const text = String(title).toUpperCase();
  const maxW = width - 4;
  let fs = fontSize;
  doc.setFontSize(fs);

  if (options.multiline) {
    doc.text(pdfSplitText(doc, text, maxW), x + 2, y + bandH * 0.55);
  } else {
    while (fs > 6 && doc.getTextWidth(text) > maxW) {
      fs -= 0.4;
      doc.setFontSize(fs);
    }
    if (align === 'center') {
      doc.text(text, x + width / 2, y + bandH * 0.62, { align: 'center' });
    } else {
      doc.text(text, x + 2, y + bandH * 0.62);
    }
  }

  touchPdfContentPage(doc);
  return y + bandH + gapAfter;
}

export function drawPdfContentBox(doc, x, y, width, height, fill = PDF_TABLE_BODY_FILL) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(x, y, width, height, PDF_CONTENT_BOX_RADIUS_MM, PDF_CONTENT_BOX_RADIUS_MM, 'FD');
}

export function drawColumnSectionTitle(doc, x, y, width, title, options = {}) {
  return drawPdfSectionTitleBar(doc, y, title, {
    x,
    width,
    bandH: options.bandH ?? PDF_SECTION_BAND_HEIGHT_MM,
    gapAfter: options.gapAfter ?? 1.5,
    fontSize: options.fontSize ?? PDF_FONT_SECTION,
    align: 'left',
    multiline: !options.singleLine,
  });
}
