/**
 * Secção universal de fotografias Antes/Depois nos relatórios PDF.
 */

import { pdfSetFont } from './pdf-font.js';
import { pdfAddImageContained } from './pdf-image-fit.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_INTERVENTION_FOTO_TITLE,
  PDF_INTERVENTION_FOTO_LABEL_ANTES,
  PDF_INTERVENTION_FOTO_LABEL_DEPOIS,
  PDF_INTERVENTION_FOTO_HEAD_FONT_PT,
  PDF_INTERVENTION_FOTO_CAPTION_PT,
  PDF_INTERVENTION_FOTO_BAR_H_MM,
  PDF_INTERVENTION_FOTO_BAR_RADIUS_MM,
  PDF_INTERVENTION_FOTO_IMG_RADIUS_MM,
  PDF_INTERVENTION_FOTO_GRID_GAP_MM,
  PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM,
  PDF_INTERVENTION_FOTO_MAX_H_MM,
  PDF_INTERVENTION_FOTO_CAPTION_H_MM,
  PDF_INTERVENTION_FOTO_SLOT_FILL,
  PDF_INTERVENTION_FOTO_IMG_PADDING_MM,
  PDF_SECTION_BG,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
} from './pdf-design-system.js';
import {
  ensureKeepTogetherBlock,
  pdfMaxContentHeight,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import { loadImageForPdf } from './pdf-image-loader.js';

export async function drawInterventionFotografiasSection(
  doc,
  y,
  fotoAntesUrl,
  fotoDepoisUrl,
  opts = {},
) {
  if (!fotoAntesUrl && !fotoDepoisUrl) return y;

  const antes = fotoAntesUrl ? await loadImageForPdf(fotoAntesUrl) : null;
  const depois = fotoDepoisUrl ? await loadImageForPdf(fotoDepoisUrl) : null;
  if (!antes && !depois) return y;

  const gap = PDF_INTERVENTION_FOTO_GRID_GAP_MM;
  const colW = (CONTENT_W - gap) / 2;
  const imgH = opts.maxImgH ?? PDF_INTERVENTION_FOTO_MAX_H_MM;
  const barH = PDF_INTERVENTION_FOTO_BAR_H_MM;
  const gridMarginTop = PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM;
  const captionH = PDF_INTERVENTION_FOTO_CAPTION_H_MM;
  const bottomGap = opts.bottomGap ?? 4;
  const blockH = barH + gridMarginTop + imgH + captionH + bottomGap;
  const imgPad = PDF_INTERVENTION_FOTO_IMG_PADDING_MM;

  if (!opts.skipEnsure) {
    y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));
  }

  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(
    MARGIN,
    y,
    CONTENT_W,
    barH,
    PDF_INTERVENTION_FOTO_BAR_RADIUS_MM,
    PDF_INTERVENTION_FOTO_BAR_RADIUS_MM,
    'FD',
  );
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_INTERVENTION_FOTO_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(String(PDF_INTERVENTION_FOTO_TITLE).toUpperCase(), MARGIN + 2, y + barH * 0.62);
  touchPdfContentPage(doc);

  const gridY = y + barH + gridMarginTop;
  const slots = [
    { img: antes, label: PDF_INTERVENTION_FOTO_LABEL_ANTES, col: 0 },
    { img: depois, label: PDF_INTERVENTION_FOTO_LABEL_DEPOIS, col: 1 },
  ];

  for (const slot of slots) {
    const x = MARGIN + slot.col * (colW + gap);
    doc.setDrawColor(...PDF_TABLE_LINE);
    doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
    doc.setFillColor(...PDF_INTERVENTION_FOTO_SLOT_FILL);
    doc.roundedRect(
      x,
      gridY,
      colW,
      imgH,
      PDF_INTERVENTION_FOTO_IMG_RADIUS_MM,
      PDF_INTERVENTION_FOTO_IMG_RADIUS_MM,
      'FD',
    );

    if (slot.img) {
      try {
        await pdfAddImageContained(doc, slot.img, x, gridY, colW, imgH, { padding: imgPad });
      } catch {
        pdfSetFont(doc, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text('IMG', x + colW / 2, gridY + imgH / 2, { align: 'center' });
      }
    } else {
      pdfSetFont(doc, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('Sem foto', x + colW / 2, gridY + imgH / 2 - 1, { align: 'center' });
    }

    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_INTERVENTION_FOTO_CAPTION_PT);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(slot.label, x + colW / 2, gridY + imgH + 3.8, { align: 'center' });
  }

  touchPdfContentPage(doc);
  return gridY + imgH + captionH + bottomGap;
}
