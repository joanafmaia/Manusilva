/**
 * Layout PDF — Reparação Avarias Bateria (RAV).
 */

import { pdfAutoTableFont, pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  mergePdfTableDidParseCell,
  PDF_CLIENT_BOX_FILL,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_DANGER as DANGER,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_CONTENT_START_Y,
  PDF_PAGE_W as PAGE_W,
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { LABEL_HORAS } from './field-labels.js';
import { pdfDisplayValue, formatPdfNumeroVisitas } from './pdf-format-utils.js';
import { VISITAS_FIELD_ID } from './deslocacao-field.js';
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
import { drawFolhaIntervencaoOrcamentoBlock } from './pdf-folha-avarias.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import {
  getMaterialTablePdfLabel,
  isMaterialTableField,
  normalizeMaterialRows,
} from './material-table-field.js';

const RAV_SECTION_GAP_MM = 2.8;
const RAV_HEAD_FONT_PT = 10;
const RAV_TABLE_FONT_PT = 9.5;
const RAV_CELL_PADDING = { top: 1.06, right: 1.2, bottom: 1.06, left: 1.2 };
const RAV_DUAL_COL_GAP_MM = 5.3;
const RAV_CLOSING_PROFILE = {
  sigTop: 4,
  sigImg: 14,
  polaroidMm: 42,
  polaroidBottom: 3,
};

export function drawRavBateriaTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, RAV_SECTION_GAP_MM);
}

function ravTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: RAV_TABLE_FONT_PT,
      cellPadding: RAV_CELL_PADDING,
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
      fontSize: RAV_TABLE_FONT_PT,
      cellPadding: RAV_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: RAV_CELL_PADDING,
      fontSize: RAV_TABLE_FONT_PT,
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

async function drawRavSectionBar(doc, y, title, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
  return drawPdfSectionTitleBar(doc, y, title, {
    x,
    width,
    bandH: 5.5,
    gapAfter: 0.8,
    fontSize: RAV_HEAD_FONT_PT,
  });
}

function collectRavConsumableRows(service, values) {
  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  if (!materialField) return [];
  return normalizeMaterialRows(values[materialField.id]).filter(
    (row) => String(row.artigo || '').trim() || row.qtd,
  );
}

async function drawRavConsumablesTableAt(doc, startY, rows, x, width) {
  const body = rows.length
    ? rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
    : [['—', '—']];
  const artW = width * 0.68;
  const qtdW = width - artW;

  let y = await drawRavSectionBar(doc, startY, getMaterialTablePdfLabel(), { x, width });
  const pack = ravTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: [['Material', 'Qtd.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: artW, halign: 'left', fontSize: RAV_TABLE_FONT_PT },
      1: { cellWidth: qtdW, halign: 'center', fontSize: RAV_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawRavVisitasTempoTableAt(doc, startY, values, x, width) {
  const visitas =
    pdfDisplayValue(
      resolvePdfStandardFieldValue(values, {
        id: VISITAS_FIELD_ID,
        aliases: ['visitas', 'numero_visitas'],
      }),
    ) || formatPdfNumeroVisitas(values);
  const horas =
    pdfDisplayValue(
      resolvePdfStandardFieldValue(values, { id: 'horas', aliases: ['horas_gastas'] }),
    ) || '—';
  const colW = width / 2;

  let y = await drawRavSectionBar(doc, startY, 'Número de Visitas e Tempo', { x, width });
  const pack = ravTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: [['N.º de visitas', LABEL_HORAS]],
    body: [[visitas, horas]],
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: colW, halign: 'center', fontSize: RAV_TABLE_FONT_PT },
      1: { cellWidth: colW, halign: 'center', fontSize: RAV_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    bodyStyles: { ...pack.bodyStyles, halign: 'center' },
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawRavConsumablesVisitasDualBlock(doc, y, service, values) {
  const gapMm = RAV_DUAL_COL_GAP_MM;
  const colW = (CONTENT_W - gapMm) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gapMm;
  const startY = y;
  const consumableRows = collectRavConsumableRows(service, values);

  const leftEndY = await drawRavConsumablesTableAt(doc, startY, consumableRows, leftX, colW);
  const rightEndY = await drawRavVisitasTempoTableAt(doc, startY, values, rightX, colW);

  return Math.max(leftEndY, rightEndY) + RAV_SECTION_GAP_MM;
}

function ravEstadoFinalColor(estadoText) {
  const text = String(estadoText || '');
  if (/reparação concluída|reparacao concluida/i.test(text)) return SUCCESS;
  if (/inoperacional/i.test(text)) return DANGER;
  if (/elementos novos|necessita/i.test(text)) return [245, 158, 11];
  return TEXT_DARK;
}

async function drawRavEstadoFinalBlock(doc, y, values) {
  const observacao = pdfDisplayValue(values.observacao);
  const estado = pdfDisplayValue(values.estado_final);
  const textW = CONTENT_W - 8;
  const lines = pdfSplitText(doc, observacao, textW);
  const lineStep = (RAV_TABLE_FONT_PT / 72) * 25.4 * 1.15;
  const estadoBandH = 7 + RAV_SECTION_GAP_MM;
  const obsLabelH = 3.8;
  const obsTextTop = 7.2;

  y = await drawRavSectionBar(doc, y, 'Estado Final');

  pdfSetFont(doc, 'normal');
  doc.setFontSize(RAV_TABLE_FONT_PT);

  let lineIdx = 0;
  while (lineIdx < lines.length) {
    const remaining = pdfContentBottomY() - y - estadoBandH;
    const maxLines = Math.max(1, Math.floor((remaining - obsTextTop - 2) / lineStep));
    const chunk = lines.slice(lineIdx, lineIdx + maxLines);
    const obsBoxH = Math.max(11, chunk.length * lineStep + obsTextTop + 2);

    if (remaining < 14 && lineIdx < lines.length) {
      doc.addPage();
      touchPdfContentPage(doc);
      y = PDF_PAGE_CONTENT_START_Y;
      continue;
    }

    const boxY = y;
    drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, obsBoxH, PDF_CLIENT_BOX_FILL);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Observação:', MARGIN + 2.5, boxY + obsLabelH);
    doc.setTextColor(...TEXT_DARK);
    doc.text(chunk, MARGIN + 2.5, boxY + obsTextTop, { lineHeightFactor: 1.15 });

    y = boxY + obsBoxH + 2;
    lineIdx += chunk.length;
  }

  if (!lines.length) {
    const boxY = y;
    const obsBoxH = 11;
    drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, obsBoxH, PDF_CLIENT_BOX_FILL);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Observação:', MARGIN + 2.5, boxY + obsLabelH);
    doc.setTextColor(...TEXT_DARK);
    doc.text('—', MARGIN + 2.5, boxY + obsTextTop);
    y = boxY + obsBoxH + 2;
  }

  y = ensureSpace(doc, y, estadoBandH);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(RAV_TABLE_FONT_PT);
  doc.setTextColor(...ravEstadoFinalColor(estado));
  doc.text(`Estado: ${estado}`, MARGIN + 2, y + 3.5);
  touchPdfContentPage(doc);
  return y + estadoBandH;
}

export async function drawRavBateriaBody(doc, y, service, values) {
  return drawRavConsumablesVisitasDualBlock(doc, y, service, values);
}

export async function drawRavBateriaClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = RAV_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const pedidoSim = String(values.pedido_orcamento || '').toLowerCase() === 'sim';

  y = await drawFolhaIntervencaoOrcamentoBlock(doc, y, values);
  y = await drawRavEstadoFinalBlock(doc, y, values);

  if (hasFotos) {
    const bottomGap = 2;
    let available = pdfContentBottomY() - y;
    let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
    let tailH =
      estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);

    if (y + tailH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, tailH + (pedidoSim ? 8 : 0));
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
