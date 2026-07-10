/**
 * Layout PDF — Manutenção Preventiva Bateria.
 * Alinhado esteticamente com Reparação Avarias Bateria (RAV).
 */

import { pdfAutoTableFont } from './pdf-font.js';
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
  PREVENTIVA_BATERIA_ANALYSIS_SPECS,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { LABEL_HORAS } from './field-labels.js';
import {
  getMaterialTablePdfLabel,
  isMaterialTableField,
  normalizeMaterialRows,
} from './material-table-field.js';
import { VISITAS_FIELD_ID } from './deslocacao-field.js';
import {
  cleanPdfText,
  pdfDisplayValue,
  formatPdfNumeroVisitas,
} from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
  pdfContentBottomY,
} from './pdf-page-layout.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { drawRavEstadoFinalBlock } from './pdf-rav-bateria.js';

const PREVENTIVA_SECTION_GAP_MM = 2.8;
const PREVENTIVA_HEAD_FONT_PT = 10;
const PREVENTIVA_TABLE_FONT_PT = 9.5;
const PREVENTIVA_CELL_PADDING = { top: 1.06, right: 1.2, bottom: 1.06, left: 1.2 };
const PREVENTIVA_DUAL_COL_GAP_MM = 5.3;
const PREVENTIVA_CLOSING_PROFILE = {
  sigTop: 4,
  sigImg: 14,
  polaroidMm: 42,
  polaroidBottom: 3,
};

export const FOLHA_CLOSING_PROFILE = PREVENTIVA_CLOSING_PROFILE;

function preventivaTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PREVENTIVA_TABLE_FONT_PT,
      cellPadding: PREVENTIVA_CELL_PADDING,
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
      fontSize: PREVENTIVA_TABLE_FONT_PT,
      cellPadding: PREVENTIVA_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: PREVENTIVA_CELL_PADDING,
      fontSize: PREVENTIVA_TABLE_FONT_PT,
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

async function drawPreventivaSectionBar(doc, y, title, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
  return drawPdfSectionTitleBar(doc, y, title, {
    x,
    width,
    bandH: 5.5,
    gapAfter: 0.8,
    fontSize: PREVENTIVA_HEAD_FONT_PT,
  });
}

/** @deprecated Mantido para testes — usar cabeçalho padrão em pdf-report.js */
export function drawPreventivaBateriaMirrorHeader() {
  throw new Error('drawPreventivaBateriaMirrorHeader foi substituído pelo cabeçalho padrão do PDF.');
}

export function drawFolhaTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, PREVENTIVA_SECTION_GAP_MM);
}

function resolvePreventivaBateriaAnalysisValue(spec, values) {
  if (spec.id === 'qtd_parafusos_danificados' && !/danificad/i.test(String(values.parafusos || ''))) {
    return '—';
  }

  if (spec.multi || spec.id === 'estado_cofre') {
    const raw = values[spec.id];
    if (Array.isArray(raw)) {
      const joined = raw.map((item) => cleanPdfText(item)).filter(Boolean).join(', ');
      return joined || '—';
    }
    return pdfDisplayValue(raw);
  }

  const raw = values[spec.id];
  if (raw == null || String(raw).trim() === '') return '—';
  if (spec.unit) return `${pdfDisplayValue(raw)} ${spec.unit}`;
  return pdfDisplayValue(raw);
}

function buildPreventivaBateriaAnalysisRows(values) {
  return PREVENTIVA_BATERIA_ANALYSIS_SPECS.map((spec) => [
    `${spec.label}:`,
    resolvePreventivaBateriaAnalysisValue(spec, values),
  ]);
}

async function drawPreventivaBateriaAnalysisTable(doc, y, values) {
  const body = buildPreventivaBateriaAnalysisRows(values);
  const labelColW = CONTENT_W * 0.46;
  const pack = preventivaTableStylePack(doc);

  y = await drawPreventivaSectionBar(doc, y, 'Análise da Bateria');
  return drawPdfGridTable(doc, y, {
    body,
    marginLeft: MARGIN,
    marginRight: MARGIN,
    tableWidth: CONTENT_W,
    columnStyles: {
      0: { cellWidth: labelColW, halign: 'left', fontSize: PREVENTIVA_TABLE_FONT_PT },
      1: { cellWidth: CONTENT_W - labelColW, halign: 'left', fontSize: PREVENTIVA_TABLE_FONT_PT },
    },
    gapAfter: PREVENTIVA_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawPreventivaConsumablesTableAt(doc, startY, rows, x, width) {
  const body = rows.length
    ? rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
    : [['—', '—']];
  const artW = width * 0.68;
  const qtdW = width - artW;
  const pack = preventivaTableStylePack(doc);

  let y = await drawPreventivaSectionBar(doc, startY, getMaterialTablePdfLabel(), { x, width });
  return drawPdfGridTable(doc, y, {
    head: [['Material', 'Qtd.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: artW, halign: 'left', fontSize: PREVENTIVA_TABLE_FONT_PT },
      1: { cellWidth: qtdW, halign: 'center', fontSize: PREVENTIVA_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

export async function drawPreventivaBateriaIntervencaoTable(doc, startY, values, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
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
  const pack = preventivaTableStylePack(doc);

  let y = await drawPreventivaSectionBar(doc, startY, 'Número de Visitas e Tempo', { x, width });
  return drawPdfGridTable(doc, y, {
    head: [['N.º de visitas', LABEL_HORAS]],
    body: [[visitas, horas]],
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: colW, halign: 'center', fontSize: PREVENTIVA_TABLE_FONT_PT },
      1: { cellWidth: colW, halign: 'center', fontSize: PREVENTIVA_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    bodyStyles: { ...pack.bodyStyles, halign: 'center' },
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawPreventivaConsumablesVisitasDualBlock(doc, y, service, values) {
  const gapMm = PREVENTIVA_DUAL_COL_GAP_MM;
  const colW = (CONTENT_W - gapMm) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gapMm;
  const startY = y;

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];

  const leftEndY = await drawPreventivaConsumablesTableAt(doc, startY, rows, leftX, colW);
  const rightEndY = await drawPreventivaBateriaIntervencaoTable(doc, startY, values, {
    x: rightX,
    width: colW,
  });

  return Math.max(leftEndY, rightEndY) + PREVENTIVA_SECTION_GAP_MM;
}

export async function drawPreventivaBateriaBody(doc, y, values, service) {
  y = await drawPreventivaBateriaAnalysisTable(doc, y, values);
  return drawPreventivaConsumablesVisitasDualBlock(doc, y, service, values);
}

/** @deprecated Usar drawRavEstadoFinalBlock — mantido para compatibilidade interna */
export async function drawEstadoFinalClosedBlock(doc, y, values, options = {}) {
  void options;
  return drawRavEstadoFinalBlock(doc, y, values);
}

export async function drawPreventivaBateriaClosingSection(doc, y, opts) {
  const profile = PREVENTIVA_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  y = await drawRavEstadoFinalBlock(doc, y, opts.values || {});

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
