/**
 * Layout PDF — Manutenção Baterias (clientes Grandes).
 */

import { pdfAutoTableFont, pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  buildReportCompactTableStylePack,
  mergePdfTableDidParseCell,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_SECTION,
  PDF_FONT_TABLE,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_SECTION_TITLE_BAR_H_MM,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { pdfDisplayValue } from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
  ensurePdfDualColumnFits,
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
import { getColumnKeys, resolveGrandesConsumivelMaquina } from './views/relatorio-grandes.js';
import { LABEL_HORAS, labelWithValue } from './field-labels.js';
import {
  pdfEstadoGridDidParseCell,
  resolvePdfEstadoTextColor,
} from './pdf-estado-colors.js';

/** Gap/densidade próprios — caber tabela de baterias sem mudar lógica de campos */
const GRANDES_SECTION_GAP_MM = 2.1;
const GRANDES_SECTION_BAR_GAP_MM = 0.5;
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
  'C.C.',
];
/** Índices de colunas curtas — sem quebra no PDF (Tensão, Dens.) */
const GRANDES_BATTERY_NOWRAP_COLS = new Set([3, 4]);
const GRANDES_BATTERY_COL_WIDTHS = [26, 20, 20, 13, 13, 39, 17, 32];
/** Larguras das colunas no PDF (soma = CONTENT_W) — exportado para testes de regressão. */
export const GRANDES_BATTERY_PDF_COL_WIDTHS = GRANDES_BATTERY_COL_WIDTHS;
export const GRANDES_BATTERY_PDF_NOWRAP_COLS = GRANDES_BATTERY_NOWRAP_COLS;

export function drawGrandesTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, GRANDES_SECTION_GAP_MM);
}

function grandesBatteryTableStylePack(doc) {
  return buildReportCompactTableStylePack(doc, pdfAutoTableFont, {
    fontSize: PDF_FONT_TABLE,
    cellPadding: GRANDES_BATTERY_CELL_PADDING,
    minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
    lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
  });
}

function grandesTableStylePack(doc) {
  return buildReportCompactTableStylePack(doc, pdfAutoTableFont, {
    fontSize: PDF_FONT_TABLE,
    headFontSize: PDF_FONT_SECTION,
    cellPadding: GRANDES_BATTERY_CELL_PADDING,
    minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  });
}

async function drawGrandesSectionBar(doc, y, title, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
  return drawPdfSectionTitleBar(doc, y, title, {
    x,
    width,
    bandH: PDF_SECTION_TITLE_BAR_H_MM,
    gapAfter: GRANDES_SECTION_BAR_GAP_MM,
    fontSize: PDF_FONT_SECTION,
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
      fontSize: PDF_FONT_TABLE,
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
    didParseCell: mergePdfTableDidParseCell(),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawGrandesConsumablesTableAt(doc, startY, rows, x, width) {
  const resolvedRows = rows.map((row) => ({
    ...row,
    ...resolveGrandesConsumivelMaquina(row),
  }));
  const hasMatricula = resolvedRows.some((row) => String(row.matricula || '').trim());
  const normalized = rows.length
    ? hasMatricula
      ? resolvedRows.map((row) => [
          pdfDisplayValue(row.matricula),
          pdfDisplayValue(row.artigo),
          pdfDisplayValue(row.qtd),
        ])
      : rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
    : hasMatricula
      ? [['—', '—', '—']]
      : [['—', '—']];

  const qtdW = Math.max(12, width * 0.14);
  const matW = hasMatricula ? Math.max(22, width * 0.26) : 0;
  const artW = width - qtdW - matW;

  let y = await drawGrandesSectionBar(doc, startY, 'Consumíveis Utilizados', { x, width });
  const pack = grandesTableStylePack(doc);
  const columnStyles = hasMatricula
    ? {
        0: { cellWidth: matW, halign: 'left', fontSize: PDF_FONT_TABLE, overflow: 'linebreak' },
        1: { cellWidth: artW, halign: 'left', fontSize: PDF_FONT_TABLE, overflow: 'linebreak' },
        2: { cellWidth: qtdW, halign: 'center', fontSize: PDF_FONT_TABLE },
      }
    : {
        0: { cellWidth: artW, halign: 'left', fontSize: PDF_FONT_TABLE },
        1: { cellWidth: qtdW, halign: 'center', fontSize: PDF_FONT_TABLE },
      };
  const endY = await drawPdfGridTable(doc, y, {
    head: [hasMatricula ? ['Matrícula', 'Artigo / Desc.', 'Qtd.'] : ['Artigo / Desc.', 'Qtd.']],
    body: normalized,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles,
    gapAfter: 0,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
  return endY;
}

async function drawGrandesObservationsBoxAt(doc, startY, value, x, width) {
  const text = pdfDisplayValue(value);
  const textWidth = width - 5;
  const allLines = text === '—' ? [] : pdfSplitText(doc, text, textWidth);
  const lineStep = (PDF_FONT_TABLE / 72) * 25.4 * GRANDES_BATTERY_LINE_HEIGHT;

  let y = await drawGrandesSectionBar(doc, startY, 'Observações', { x, width });

  if (!allLines.length) {
    const boxH = 7;
    y = ensureSpace(doc, y, boxH + 2);
    const boxY = y;
    drawPdfContentBox(doc, x, boxY, width, boxH);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_TABLE);
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
    doc.setFontSize(PDF_FONT_TABLE);
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

  const rowCount = Math.max(consumableRows.length, 1);
  const dualH = PDF_SECTION_TITLE_BAR_H_MM + 8 + rowCount * 5 + 10;
  const startY = ensurePdfDualColumnFits(doc, y, dualH);

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
    body: [[labelWithValue(LABEL_HORAS, horas), `Estado Geral: ${estado}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: PDF_FONT_TABLE },
      1: { cellWidth: colW, halign: 'left', fontSize: PDF_FONT_TABLE },
    },
    gapAfter: GRANDES_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pdfEstadoGridDidParseCell),
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
  const rows = normalizeMaterialRows(values?.[materialField.id]);
  return rows.filter((row) => String(row.artigo || '').trim() || row.qtd);
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
