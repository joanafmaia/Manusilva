/**
 * Bloco de assinaturas técnico/cliente no fecho do relatório.
 */

import { pdfSetFont } from './pdf-font.js';
import { pdfAddImageContained } from './pdf-image-fit.js';
import {
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_FONT_CAPTION,
  PDF_FOOTER_BLOCK_TOP,
  PDF_PAGE_CONTENT_START_Y,
} from './pdf-design-system.js';
import {
  ensureBlockFitsSafeZone,
  pdfContentBottomY,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import { SIGNATURE_LABEL_GAP_MM } from './pdf-closing-estimates.js';

export const SIGNATURES_TOP_MARGIN_MM = 14;
export const SIGNATURE_LINE_GAP_MM = 14;
export const SIGNATURE_IMG_H_MM = 22;
export const SIGNATURES_BLOCK_HEIGHT_MM =
  SIGNATURES_TOP_MARGIN_MM + SIGNATURE_IMG_H_MM + SIGNATURE_LABEL_GAP_MM + 10;

export async function drawSignaturesFooter(doc, y, signatures, opts = {}) {
  const topMargin = opts.topMargin ?? SIGNATURES_TOP_MARGIN_MM;
  const imgHeight = opts.imgHeight ?? SIGNATURE_IMG_H_MM;
  const blockHeight = topMargin + imgHeight + SIGNATURE_LABEL_GAP_MM + 10;
  const footerLimit = opts.reserveInstitutionalFooter
    ? PDF_FOOTER_BLOCK_TOP - 2
    : pdfContentBottomY();

  if (!opts.skipEnsure) {
    y = ensureBlockFitsSafeZone(doc, y, blockHeight);
  }
  if (y + blockHeight > footerLimit) {
    doc.addPage();
    touchPdfContentPage(doc);
    y = PDF_PAGE_CONTENT_START_Y;
  }
  y += topMargin;

  const lineW = (CONTENT_W - SIGNATURE_LINE_GAP_MM) / 2;
  const boxes = [
    { label: 'Assinatura do Técnico', data: signatures.technicianData },
    { label: 'Assinatura do Cliente', data: signatures.clientData },
  ];

  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    const x = MARGIN + i * (lineW + SIGNATURE_LINE_GAP_MM);
    const lineY = y + imgHeight + 2;
    const sigPad = 2;

    if (box.data) {
      try {
        await pdfAddImageContained(doc, box.data, x, y, lineW, imgHeight, { padding: sigPad });
      } catch {
        /* área reservada sem imagem */
      }
    }

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(x, lineY, x + lineW, lineY);

    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(box.label, x + lineW / 2, lineY + SIGNATURE_LABEL_GAP_MM, { align: 'center' });
  }

  touchPdfContentPage(doc);
  return y + blockHeight;
}
