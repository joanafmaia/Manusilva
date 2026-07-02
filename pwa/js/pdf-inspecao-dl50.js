/**
 * Layout PDF — Inspeção DL 50/2005.
 */

import { columnKey } from './material-table-field.js';
import { splitDl50MatrixCategories } from './inspecao-dl50-categories.js';
import { pdfAutoTableFont, pdfSafeText, pdfSplitText } from './pdf-font.js';
import {
  getBlockPdfTitle,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_CONTENT_START_Y,
  PDF_PAGE_W as PAGE_W,
  PDF_SECTION_BG,
  PDF_SECTION_BAND_HEIGHT_MM,
  PDF_SECTION_GAP_MM,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_HORAS,
  LABEL_ANO_FABRICO,
  formatAnoFabricoDisplay,
} from './field-labels.js';
import { pdfDisplayValue } from './pdf-format-utils.js';
import {
  ensureSpace,
  pdfContentBottomY,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import { drawPdfSectionTitleBar, drawColumnSectionTitle } from './pdf-layout-bars.js';
import { drawPdfGridTable } from './pdf-grid-table.js';

export const INSPECAO_DL50_SERVICE_ID = 'inspecao_dl50_2005';

export const DL50_SERVICE_META_BOTTOM_MM = 4;

/** Informações da Máquina — PDF DL50 */
export const INSPECAO_DL50_MACHINE_PDF_SPECS = [
  { id: 'marca', label: LABEL_MARCA },
  { id: 'modelo', label: LABEL_MODELO },
  { id: 'tipo', label: LABEL_TIPO },
  {
    id: 'numero_de_serie',
    label: LABEL_NUMERO_SERIE,
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'n_interno', label: LABEL_N_INTERNO, aliases: ['num_interno', 'numero_interno'] },
  { id: 'horas', label: LABEL_HORAS, aliases: ['horas_gastas', 'numero_horas'] },
  { id: 'data_fabrico', label: LABEL_ANO_FABRICO, aliases: ['data_de_fabrico', 'data_fabricacao'] },
];

/** gap ~20px entre colunas da matriz DL50 */
const DL50_DUAL_MATRIX_GAP_MM = 5.3;
const DL50_MATRIX_CAT_BAND_MM = 7;
const DL50_MATRIX_FONT_PT = 9;
const DL50_MATRIX_CAT_FONT_PT = 10;
/** Mínimo de linhas visíveis com o título antes de saltar de página */
const DL50_MIN_ORPHAN_ROWS = 4;
/** Espaço reservado no fim da checklist para declaração + assinaturas */
const DL50_CLOSING_RESERVE_MM = 46;
/** Categorias com muitos pontos — tabela partida em 2 colunas */
const DL50_SPLIT_TABLE_MIN_ITEMS = 9;

function pdfGridCell(label, value) {
  return `${label}: ${pdfDisplayValue(value)}`;
}

function drawDivider(doc, y) {
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + PDF_SECTION_GAP_MM;
}

function drawSectionTitle(doc, y, title, options = {}) {
  return drawPdfSectionTitleBar(doc, y, title, {
    skipEnsure: options.skipEnsure,
    bandH: PDF_SECTION_BAND_HEIGHT_MM,
    gapAfter: PDF_SECTION_GAP_MM,
  });
}

function matrixPdfRgb(opt) {
  if (opt === 'B') return SUCCESS;
  if (opt === 'N') return [245, 158, 11];
  if (opt === 'D') return [251, 113, 133];
  return TEXT_MUTED;
}

function matrixDisplayState(opt) {
  if (!opt) return '—';
  return opt === 'N.A.' ? 'NA' : opt;
}

/** DL50 — lista todos os pontos; itens sem resposta mostram «—». */
function buildDl50CategoryTable(doc, cat, catData) {
  const body = [];
  const rowOpts = [];

  (cat.items || []).forEach((item) => {
    const opt = catData[columnKey(item)];
    body.push([pdfSafeText(item), matrixDisplayState(opt)]);
    rowOpts.push(opt || null);
  });

  return { body, rowOpts };
}

function estimateDl50CategoryBlockHeight(doc, body, colWidth) {
  const pointColWidth = colWidth * 0.72;
  const titleH = DL50_MATRIX_CAT_BAND_MM + 1;
  let tableH = PDF_TABLE_MIN_CELL_HEIGHT_COMPACT + 1;
  body.forEach((row) => {
    const lines = pdfSplitText(doc, row[0], pointColWidth - 4);
    tableH += Math.max(PDF_TABLE_MIN_CELL_HEIGHT_COMPACT, lines.length * 3 + 2);
  });
  return titleH + tableH + 1.5;
}

function estimateDl50CategoryOrphanHeight(doc, body, colWidth) {
  const sample = body.slice(0, DL50_MIN_ORPHAN_ROWS);
  return estimateDl50CategoryBlockHeight(doc, sample, colWidth);
}

function ensureDl50CategoryOrphanSpace(doc, y, body, colWidth, maxBottomY = null) {
  const limit = maxBottomY ?? pdfContentBottomY();
  const orphanH = estimateDl50CategoryOrphanHeight(doc, body, colWidth);
  if (orphanH > 0 && y + orphanH > limit) {
    doc.addPage();
    touchPdfContentPage(doc);
    return PDF_PAGE_CONTENT_START_Y;
  }
  return y;
}

function ensureDl50DualRowOrphanSpace(doc, y, leftBody, rightBody, colW) {
  let orphanH = 0;
  if (leftBody.length) {
    orphanH = Math.max(orphanH, estimateDl50CategoryOrphanHeight(doc, leftBody, colW));
  }
  if (rightBody.length) {
    orphanH = Math.max(orphanH, estimateDl50CategoryOrphanHeight(doc, rightBody, colW));
  }
  if (orphanH > 0 && y + orphanH > pdfContentBottomY()) {
    doc.addPage();
    touchPdfContentPage(doc);
    return PDF_PAGE_CONTENT_START_Y;
  }
  return y;
}

async function drawDl50CategoryGridTable(doc, x, y, width, body, rowOpts) {
  const pointW = width * 0.72;
  const stateW = width - pointW;
  const cellPadding = PDF_TABLE_CELL_PADDING_COMPACT;

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: DL50_MATRIX_FONT_PT,
      cellPadding,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: DL50_MATRIX_FONT_PT,
      cellPadding,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
      overflow: 'linebreak',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding,
    },
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: DL50_MATRIX_FONT_PT },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: DL50_MATRIX_FONT_PT,
        fontStyle: 'bold',
      },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const opt = rowOpts[data.row.index];
        data.cell.styles.textColor = matrixPdfRgb(opt);
        data.cell.styles.fontStyle = 'bold';
      }
    },
    gapAfter: 1.5,
  });
}

async function drawDl50SplitMatrixCategoryTable(doc, x, startY, width, categoryName, body, rowOpts) {
  const gap = DL50_DUAL_MATRIX_GAP_MM;
  const halfW = (width - gap) / 2;
  const mid = Math.ceil(body.length / 2);
  const leftBody = body.slice(0, mid);
  const leftOpts = rowOpts.slice(0, mid);
  const rightBody = body.slice(mid);
  const rightOpts = rowOpts.slice(mid);

  const titleY = drawColumnSectionTitle(doc, x, startY, width, categoryName, {
    bandH: DL50_MATRIX_CAT_BAND_MM,
    fontSize: DL50_MATRIX_CAT_FONT_PT,
    gapAfter: 1,
    singleLine: true,
  });
  const leftEnd = await drawDl50CategoryGridTable(doc, x, titleY, halfW, leftBody, leftOpts);
  const rightEnd = await drawDl50CategoryGridTable(
    doc,
    x + halfW + gap,
    titleY,
    halfW,
    rightBody,
    rightOpts,
  );
  return Math.max(leftEnd, rightEnd) + 1.5;
}

async function drawDl50MatrixCategoryTable(doc, x, startY, width, cat, catData, options = {}) {
  const { body, rowOpts } = buildDl50CategoryTable(doc, cat, catData);
  if (!body.length) return startY;

  const maxBottomY = options.maxBottomY ?? null;
  let y = options.skipOrphanCheck
    ? startY
    : ensureDl50CategoryOrphanSpace(doc, startY, body, width, maxBottomY);

  if (options.splitDualTable && body.length >= DL50_SPLIT_TABLE_MIN_ITEMS) {
    return drawDl50SplitMatrixCategoryTable(doc, x, y, width, cat.name, body, rowOpts);
  }

  y = drawColumnSectionTitle(doc, x, y, width, cat.name, {
    bandH: DL50_MATRIX_CAT_BAND_MM,
    fontSize: DL50_MATRIX_CAT_FONT_PT,
    gapAfter: 1,
    singleLine: true,
  });

  return drawDl50CategoryGridTable(doc, x, y, width, body, rowOpts);
}

/** Grelha 2 colunas — informações da máquina (após título da secção) */
export async function drawDl50MachineGrid(doc, y, values, pdfContext = null) {
  const cells = INSPECAO_DL50_MACHINE_PDF_SPECS.map((spec) => {
    let fallback = null;
    if (spec.id === 'numero_de_serie') {
      fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
    }
    const raw = resolvePdfStandardFieldValue(values, spec, fallback);
    const value =
      spec.id === 'data_fabrico'
        ? formatAnoFabricoDisplay(raw) || pdfDisplayValue(raw)
        : pdfDisplayValue(raw);
    return pdfGridCell(spec.label, value);
  });
  const body = [];
  for (let i = 0; i < cells.length; i += 2) {
    body.push([cells[i] || '', cells[i + 1] || '']);
  }
  if (!body.length) return y;
  y = ensureSpace(doc, y, 10);
  const colW = CONTENT_W / 2;
  return drawPdfGridTable(doc, y, {
    body,
    columnStyles: {
      0: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_BODY },
      1: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_BODY },
    },
  });
}

export async function drawDl50DualMatrixInspectionBlock(doc, y, field, matrixValue) {
  const categories = field.categories || [];
  const [leftCats, rightCats] = splitDl50MatrixCategories(categories);
  const gap = DL50_DUAL_MATRIX_GAP_MM;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  y = drawSectionTitle(doc, y, getBlockPdfTitle(field) || 'Pontos de Inspeção');
  y = drawDivider(doc, y - 4);

  const rowCount = Math.max(leftCats.length, rightCats.length);
  for (let i = 0; i < rowCount; i++) {
    const leftCat = leftCats[i];
    const rightCat = rightCats[i];
    const isSoloLastRow = Boolean(leftCat && !rightCat);

    if (isSoloLastRow) {
      const catData = matrixValue[columnKey(leftCat.name)] || {};
      const { body } = buildDl50CategoryTable(doc, leftCat, catData);
      y = await drawDl50MatrixCategoryTable(doc, MARGIN, y, CONTENT_W, leftCat, catData, {
        splitDualTable: body.length >= DL50_SPLIT_TABLE_MIN_ITEMS,
        maxBottomY: pdfContentBottomY() - DL50_CLOSING_RESERVE_MM,
      });
      continue;
    }

    const leftData = leftCat ? matrixValue[columnKey(leftCat.name)] || {} : {};
    const rightData = rightCat ? matrixValue[columnKey(rightCat.name)] || {} : {};
    const leftBody = leftCat ? buildDl50CategoryTable(doc, leftCat, leftData).body : [];
    const rightBody = rightCat ? buildDl50CategoryTable(doc, rightCat, rightData).body : [];

    const rowStartY = ensureDl50DualRowOrphanSpace(doc, y, leftBody, rightBody, colW);
    let leftEnd = rowStartY;
    let rightEnd = rowStartY;

    if (leftCat) {
      leftEnd = await drawDl50MatrixCategoryTable(
        doc,
        leftX,
        rowStartY,
        colW,
        leftCat,
        leftData,
        { skipOrphanCheck: true },
      );
    }
    if (rightCat) {
      rightEnd = await drawDl50MatrixCategoryTable(
        doc,
        rightX,
        rowStartY,
        colW,
        rightCat,
        rightData,
        { skipOrphanCheck: true },
      );
    }

    y = Math.max(leftEnd, rightEnd) + 1.2;
  }

  return y + PDF_SECTION_GAP_MM;
}
