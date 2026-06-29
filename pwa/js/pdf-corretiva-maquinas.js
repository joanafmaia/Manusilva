/**
 * Layout PDF — Manutenção Corretiva Máquinas.
 */

import { pdfAutoTableFont, pdfSetFont, pdfSplitText, pdfSafeText } from './pdf-font.js';
import {
  getBlockPdfTitle,
  mergePdfTableDidParseCell,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_DANGER as DANGER,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_MACHINE_SECTION,
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_CELL_PADDING_COMPACT,
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

const CORRETIVA_SECTION_GAP_MM = 3.5;
const CORRETIVA_FONT_PT = 9;
const CORRETIVA_HEAD_FONT_PT = 10.5;
const CORRETIVA_CLOSING_PROFILE = {
  sigTop: 3,
  sigImg: 13,
  polaroidMm: 40,
  polaroidBottom: 2,
};

function normalizeVerifyItem(item) {
  if (typeof item === 'string') {
    return {
      id: item
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w]+/g, '_')
        .replace(/^_|_$/g, ''),
      label: item,
    };
  }
  return { id: item.id, label: item.label };
}

export function drawCorretivaTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, CORRETIVA_SECTION_GAP_MM);
}

function corretivaTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: CORRETIVA_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
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
      fontSize: CORRETIVA_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      fontSize: CORRETIVA_FONT_PT,
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

async function drawCorretivaSectionBar(doc, y, title) {
  return drawPdfSectionTitleBar(doc, y, title, {
    bandH: 6,
    gapAfter: 1.2,
    fontSize: CORRETIVA_HEAD_FONT_PT,
  });
}

async function drawCorretivaMachineBlock(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marca = pdfDisplayValue(values.marca);
  const modelo = pdfDisplayValue(values.modelo);
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const colW = CONTENT_W / 3;

  y = await drawCorretivaSectionBar(doc, y, PDF_MACHINE_SECTION);
  const pack = corretivaTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Marca: ${marca}`, `Modelo: ${modelo}`, `N.º Série: ${serie}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      2: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawCorretivaVerificationTable(doc, y, field, states) {
  const items = field?.items || [];
  const body = items.map((item) => {
    const spec = normalizeVerifyItem(item);
    const state = states?.[spec.id] || 'OK';
    return [pdfSafeText(spec.label), state];
  });
  if (!body.length) return y;

  y = await drawCorretivaSectionBar(doc, y, getBlockPdfTitle(field) || 'Verificações Efetuadas');

  const pointW = CONTENT_W * 0.72;
  const stateW = CONTENT_W - pointW;
  const pack = corretivaTableStylePack(doc);

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: CORRETIVA_FONT_PT },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: CORRETIVA_FONT_PT,
        fontStyle: 'bold',
      },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell((data) => {
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
      if (data.section === 'body' && data.column.index === 1) {
        const state = String(data.cell.raw || '');
        data.cell.styles.textColor = state === 'OK' ? SUCCESS : DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    }),
  });
}

async function drawCorretivaObservationsBox(doc, y, value) {
  const text = pdfDisplayValue(value);
  const lines = pdfSplitText(doc, text, CONTENT_W - 6);
  const boxH = Math.max(14, lines.length * 3.8 + 6);

  y = ensureSpace(doc, y, 8);
  y = await drawCorretivaSectionBar(doc, y, 'Observações');
  y = ensureSpace(doc, y, boxH);

  const boxY = y;
  drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, boxH);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(CORRETIVA_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 3, boxY + 4.5);

  touchPdfContentPage(doc);
  return boxY + boxH + CORRETIVA_SECTION_GAP_MM;
}

async function drawCorretivaResumoRow(doc, y, values) {
  const horas = pdfDisplayValue(
    resolvePdfStandardFieldValue(values, { id: 'horas', aliases: ['horas_gastas'] }),
  );
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));
  const colW = CONTENT_W / 2;

  y = await drawCorretivaSectionBar(doc, y, 'Resumo da Intervenção');
  const pack = corretivaTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Horas: ${horas}`, `Estado da Máquina: ${estado}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
  });
}

export async function drawCorretivaMaquinasBody(doc, y, service, values, pdfContext = null) {
  y = await drawCorretivaMachineBlock(doc, y, values, pdfContext);

  const verField = (service?.fields || []).find((f) => f.id === 'lista_de_verificacoes');
  if (verField) {
    y = await drawCorretivaVerificationTable(doc, y, verField, values.lista_de_verificacoes || {});
  }

  if (values.observacoes != null && String(values.observacoes).trim()) {
    y = await drawCorretivaObservationsBox(doc, y, values.observacoes);
  } else {
    y = await drawCorretivaObservationsBox(doc, y, '—');
  }

  return y;
}

export async function drawCorretivaMaquinasClosingSection(doc, y, opts) {
  const profile = CORRETIVA_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  y = await drawCorretivaResumoRow(doc, y, opts.closingValues || {});

  if (hasFotos) {
    const bottomGap = 2;
    let available = pdfContentBottomY() - y;
    let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
    let tailH = estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);

    if (y + tailH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, tailH);
      available = pdfContentBottomY() - y;
      maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
      tailH = estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);
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
