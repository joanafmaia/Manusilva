/**
 * Cabeçalho PDF — logo, caixa cliente e número de ordem.
 */

import { COMPANY } from './mock_data.js';
import { pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_SLATE_LINE as SLATE_LINE,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_BOX_RADIUS_MM,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_HEADER_CLIENT_W,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_CLIENT_BOX_FILL,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
} from './pdf-design-system.js';

export function formatOrdemDisplay(numeroOrdem) {
  const padded = String(numeroOrdem).padStart(2, '0');
  return `Ordem No: OP-2026-${padded}`;
}

export function drawCompactClientBox(doc, topY, clientMeta, numeroOrdem = null) {
  const blockW = PDF_HEADER_CLIENT_W;
  const blockX = PAGE_W - MARGIN - blockW;
  const blockPad = 2.5;
  const textW = blockW - blockPad * 2;

  const nameLines = pdfSplitText(doc, pdfSafeText(clientMeta.nome), textW);
  const addrLines = pdfSplitText(doc, pdfSafeText(clientMeta.addressLine), textW);
  const addrSubLines = clientMeta.addressSubline
    ? pdfSplitText(doc, pdfSafeText(clientMeta.addressSubline), textW)
    : [];

  let blockContentH = 5;
  if (numeroOrdem != null) blockContentH += 4;
  blockContentH += nameLines.length * 3.6 + 1;
  blockContentH += addrLines.length * 3;
  blockContentH += addrSubLines.length * 3;
  const blockH = blockContentH + blockPad * 2;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(
    blockX,
    topY,
    blockW,
    blockH,
    PDF_CONTENT_BOX_RADIUS_MM,
    PDF_CONTENT_BOX_RADIUS_MM,
    'FD',
  );

  let lineY = topY + blockPad + 3;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('CLIENTE', blockX + blockPad, lineY);
  lineY += 4;

  if (numeroOrdem != null) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(formatOrdemDisplay(numeroOrdem), blockX + blockPad, lineY);
    lineY += 3.8;
  }

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(nameLines, blockX + blockPad, lineY);
  lineY += nameLines.length * 3.6 + 0.8;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(addrLines, blockX + blockPad, lineY);
  lineY += addrLines.length * 3 + (addrSubLines.length ? 0.4 : 0);
  if (addrSubLines.length) {
    doc.text(addrSubLines, blockX + blockPad, lineY);
  }

  return blockH;
}

export function drawLogoPlaceholder(doc, x, y, widthMm, heightMm = widthMm) {
  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x, y, widthMm, heightMm, 2, 2, 'FD');
  doc.setFillColor(...CORPORATE_BLUE);
  doc.roundedRect(x + 1.5, y + 1.5, widthMm - 3, heightMm - 3, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(Math.min(18, 8 + widthMm * 0.22));
  doc.text(COMPANY.logo || 'MS', x + widthMm / 2, y + heightMm / 2 + 1.5, { align: 'center' });
}
