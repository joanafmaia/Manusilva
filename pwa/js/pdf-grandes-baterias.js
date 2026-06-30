/**
 * Layout PDF — Manutenção Baterias (clientes Grandes).
 */

import { pdfAutoTableFont, pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  mergePdfTableDidParseCell,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { pdfDisplayValue } from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
  ensureSpace,
  pdfContentBottomY,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import {
  drawPdfDocumentTitleBar,
  drawPdfSectionTitleBar,
  drawPdfContentBox,
} from './pdf-layout-bars.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { isMaterialTableField, normalizeMaterialRows } from './material-table-field.js';
import { getColumnKeys } from './views/relatorio-grandes.js';

const GRANDES_SECTION_GAP_MM = 2.1;
const GRANDES_SECTION_BAR_H_MM = 5;
const GRANDES_SECTION_BAR_GAP_MM = 0.5;
const GRANDES_HEAD_FONT_PT = 10;
const GRANDES_BATTERY_FONT_PT = 8.5;
const GRANDES_TABLE_FONT_PT = 8.5;
/** ~2px vertical, ~4px horizontal */
const GRANDES_BATTERY_CELL_PADDING = { top: 0.53, right: 1.06, bottom: 0.53, left: 1.06 };
const GRANDES_BATTERY_MIN_CELL_HEIGHT = 3;
const GRANDES_BATTERY_LINE_HEIGHT = 1.1;
const GRANDES_DUAL_COL_GAP_MM = 4;
const GRANDES_CLOSING_PROFILE = {
  sigTop: 2,
  sigImg: 11,
  polaroidMm: 38,
  polaroidBottom: 2,
};
const GRANDES_BATTERY_PDF_HEADERS = [
  'Máquina',
  'Matríc.',
  'Tipo',
  'Tensão',
  'Dens.',
  'Nível El.',
  'Cofre',
  'C.C.?',
];
/** Índices de colunas curtas — sem quebra de palavra no PDF (Tensão, Dens., C.C.?) */
const GRANDES_BATTERY_NOWRAP_COLS = new Set([3, 4, 7]);
const GRANDES_BATTERY_COL_WIDTHS = [28, 22, 22, 14, 14, 46, 18, 16];

export function drawGrandesTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, GRANDES_SECTION_GAP_MM);
}

function grandesBatteryTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: GRANDES_BATTERY_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
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
      fontSize: GRANDES_BATTERY_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      fontSize: GRANDES_BATTERY_FONT_PT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
      if (GRANDES_BATTERY_NOWRAP_COLS.has(data.column.index)) {
        data.cell.styles.overflow = 'ellipsize';
        data.cell.styles.cellWidth = GRANDES_BATTERY_COL_WIDTHS[data.column.index];
      }
    },
  };
}

function grandesTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: GRANDES_TABLE_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
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
      fontSize: GRANDES_HEAD_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      fontSize: GRANDES_TABLE_FONT_PT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
    },
  };
}

async function drawGrandesSectionBar(doc, y, title, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
  return drawPdfSectionTitleBar(doc, y, title, {
    x,
    width,
    bandH: GRANDES_SECTION_BAR_H_MM,
    gapAfter: GRANDES_SECTION_BAR_GAP_MM,
    fontSize: GRANDES_HEAD_FONT_PT,
  });
}

function formatGrandesBatteryCellPdf(key, raw) {
  if (key === 'nivel_eletrolito') {
    const text = String(raw || '').trim();
    if (/reposi[cç][aã]o urgentemente/i.test(text)) return 'Reposição urgente';
  }
  return pdfDisplayValue(raw);
}

function buildGrandesBatteryPdfBody(rows) {
  const keys = getColumnKeys();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [['—', '—', '—', '—', '—', '—', '—', '—']];
  return list.map((row) =>
    keys.map((key) => formatGrandesBatteryCellPdf(key, row?.[key])),
  );
}

function buildGrandesBatteryColumnStyles() {
  const styles = {};
  GRANDES_BATTERY_COL_WIDTHS.forEach((w, i) => {
    styles[i] = {
      cellWidth: w,
      fontSize: GRANDES_BATTERY_FONT_PT,
      overflow: GRANDES_BATTERY_NOWRAP_COLS.has(i) ? 'ellipsize' : 'linebreak',
      halign: i === 3 || i === 4 ? 'center' : 'left',
    };
  });
  return styles;
}

async function drawGrandesBatteryTable(doc, y, rows) {
  const body = buildGrandesBatteryPdfBody(rows);
  y = ensureSpace(doc, y, 16);
  y = await drawGrandesSectionBar(doc, y, 'Identificação Bateria');

  const pack = grandesBatteryTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: [GRANDES_BATTERY_PDF_HEADERS],
    body,
    columnStyles: buildGrandesBatteryColumnStyles(),
    gapAfter: GRANDES_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawGrandesConsumablesTableAt(doc, startY, rows, x, width) {
  const normalized = rows.length
    ? rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
    : [['—', '—']];
  const artW = width * 0.72;
  const qtdW = width - artW;

  let y = await drawGrandesSectionBar(doc, startY, 'Consumíveis Utilizados', { x, width });
  const pack = grandesTableStylePack(doc);
  const endY = await drawPdfGridTable(doc, y, {
    head: [['Artigo / Desc.', 'Qtd.']],
    body: normalized,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: artW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
      1: { cellWidth: qtdW, halign: 'center', fontSize: GRANDES_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
  return endY;
}

async function drawGrandesObservationsBoxAt(doc, startY, value, x, width) {
  const text = pdfDisplayValue(value);
  const textWidth = width - 5;
  const allLines = text === '—' ? [] : pdfSplitText(doc, text, textWidth);
  const lineStep = (GRANDES_TABLE_FONT_PT / 72) * 25.4 * GRANDES_BATTERY_LINE_HEIGHT;

  let y = await drawGrandesSectionBar(doc, startY, 'Observações', { x, width });

  if (!allLines.length) {
    const boxH = 7;
    y = ensureSpace(doc, y, boxH + 2);
    const boxY = y;
    drawPdfContentBox(doc, x, boxY, width, boxH);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(GRANDES_TABLE_FONT_PT);
    doc.setTextColor(...TEXT_DARK);
    doc.text('—', x + 2.5, boxY + 3.2);
    touchPdfContentPage(doc);
    return boxY + boxH;
  }

  let lineIdx = 0;
  while (lineIdx < allLines.length) {
    const remaining = pdfContentBottomY() - y;
    const maxLines = Math.max(1, Math.floor((remaining - 2.5) / lineStep));
    const chunk = allLines.slice(lineIdx, lineIdx + maxLines);
    const boxH = Math.max(7, chunk.length * lineStep + 2.5);
    y = ensureSpace(doc, y, boxH + 2);
    const boxY = y;
    drawPdfContentBox(doc, x, boxY, width, boxH);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(GRANDES_TABLE_FONT_PT);
    doc.setTextColor(...TEXT_DARK);
    doc.text(chunk, x + 2.5, boxY + 3.2, { lineHeightFactor: GRANDES_BATTERY_LINE_HEIGHT });
    touchPdfContentPage(doc);
    y = boxY + boxH;
    lineIdx += chunk.length;
  }

  return y;
}

async function drawGrandesConsumablesObsDualBlock(doc, y, consumableRows, obsText) {
  const gapMm = GRANDES_DUAL_COL_GAP_MM;
  const colW = (CONTENT_W - gapMm) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gapMm;
  const startY = y;

  const leftEndY = await drawGrandesConsumablesTableAt(doc, startY, consumableRows, leftX, colW);
  const rightEndY = await drawGrandesObservationsBoxAt(doc, startY, obsText || '—', rightX, colW);

  return Math.max(leftEndY, rightEndY) + GRANDES_SECTION_GAP_MM;
}

async function drawGrandesResumoRow(doc, y, values) {
  const horas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas' }));
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));
  const colW = CONTENT_W / 2;

  y = await drawGrandesSectionBar(doc, y, 'Resumo da Intervenção');
  const pack = grandesTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Horas: ${horas}`, `Estado Geral: ${estado}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
    },
    gapAfter: GRANDES_SECTION_GAP_MM,
    ...pack,
  });
}

export async function drawGrandesBateriasBody(doc, y, service, values) {
  const batteryField = (service?.fields || []).find((f) => f.id === 'identificacao_baterias');
  const batteryRows = batteryField ? values[batteryField.id] : values.identificacao_baterias;
  return drawGrandesBatteryTable(doc, y, batteryRows);
}

function collectGrandesConsumableRows(service, values) {
  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  if (!materialField) return [];
  return normalizeMaterialRows(values[materialField.id]).filter(
    (row) => String(row.artigo || '').trim() || row.qtd,
  );
}

export async function drawGrandesBateriasClosingSection(doc, y, opts) {
  const values = opts.closingValues || {};
  const service = opts.service;
  const profile = GRANDES_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const obsText = values.observacoes != null ? String(values.observacoes).trim() : '';
  const consumableRows = collectGrandesConsumableRows(service, values);

  y = await drawGrandesConsumablesObsDualBlock(doc, y, consumableRows, obsText);
  y = await drawGrandesResumoRow(doc, y, values);

  if (hasFotos) {
    const bottomGap = 2;
    let available = pdfContentBottomY() - y;
    let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
    let tailH =
      estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);

    if (y + tailH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, tailH);
      available = pdfContentBottomY() - y;
      maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
      tailH =
        estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);
      if (y + tailH > pdfContentBottomY()) {
        y = ensureBlockFitsSafeZone(doc, y, tailH);
      }
    }

    y = await drawInterventionFotografiasSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      { skipEnsure: true, bottomGap, maxImgH },
    );
  } else {
    y = ensureBlockFitsSafeZone(doc, y, estimateSignaturesHeight(profile));
  }

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
  });
}
