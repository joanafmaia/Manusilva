/**
 * Grelha autoTable padrão Manusilva — cabeçalho #f1f5f9, linhas #e2e8f0.
 */

import { pdfAutoTableFont, pdfSetFont } from './pdf-font.js';
import { loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
import {
  buildPdfAutoTableStyles,
  mergePdfTableDidParseCell,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_TABLE,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_GAP_MM,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
} from './pdf-design-system.js';
import {
  ensureSpace,
  getPdfAutoTableMargin,
  normalizeYAfterAutoTable,
  touchPdfContentPage,
  buildPdfAutoTableDidDrawPage,
} from './pdf-page-layout.js';

/**
 * @param {import('jspdf').jsPDF} doc
 */
export async function drawPdfGridTable(doc, y, options = {}) {
  const {
    head,
    body,
    columnStyles,
    didParseCell,
    gapAfter = PDF_SECTION_GAP_MM,
    marginLeft = MARGIN,
    marginRight = MARGIN,
    tableWidth = CONTENT_W,
    styles: stylesOverride,
    headStyles: headStylesOverride,
    bodyStyles: bodyStylesOverride,
    autoTableExtra,
  } = options;
  if (!body?.length && !head?.length) return y;

  await loadJsPdfAutoTable();

  // Evita o bug do autoTable: se não cabe no fundo, saltar de página e
  // começar no topo — senão pode repetir o mesmo Y a meio da página nova.
  const minChunkMm =
    PDF_TABLE_MIN_CELL_HEIGHT_COMPACT * ((head?.length ? 1 : 0) + (body?.length ? 1 : 0)) + 2;
  if (minChunkMm > 0) {
    y = ensureSpace(doc, y, minChunkMm);
  }

  const baseStyles = buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont);
  const tableConfig = {
    startY: y,
    margin: getPdfAutoTableMargin(marginLeft, marginRight),
    tableWidth,
    ...baseStyles,
    styles: { ...baseStyles.styles, ...(stylesOverride || {}) },
    headStyles: { ...baseStyles.headStyles, ...(headStylesOverride || {}) },
    bodyStyles: { ...baseStyles.bodyStyles, ...(bodyStylesOverride || {}) },
    columnStyles: columnStyles || {
      0: { cellWidth: tableWidth / 2, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: { cellWidth: tableWidth / 2, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
    },
    ...(autoTableExtra || {}),
  };

  if (head?.length) tableConfig.head = head;
  if (body?.length) tableConfig.body = body;
  tableConfig.didParseCell = mergePdfTableDidParseCell(didParseCell);
  tableConfig.didDrawPage = buildPdfAutoTableDidDrawPage(doc);

  doc.autoTable(tableConfig);
  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, gapAfter);
}
