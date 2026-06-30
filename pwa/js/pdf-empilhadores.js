/**
 * Layout PDF — Manutenção Preventiva Empilhadores.
 */

import { EMPILHADORES_MATERIAL_SECTION } from './mock_data.js';
import { pdfAutoTableFont, pdfSafeText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_DANGER as DANGER,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_FONT_TABLE,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_SCALAR_FIELD_TYPES,
  PDF_SECTION_BG,
  PDF_SECTION_BAND_HEIGHT_MM,
  PDF_SECTION_GAP_MM,
  PDF_TABLE_CELL_PADDING,
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
  pdfNormalizeHeading,
} from './pdf-design-system.js';
import { cleanPdfText, pdfDisplayValue } from './pdf-format-utils.js';
import { ensureSpace } from './pdf-page-layout.js';
import { drawPdfSectionTitleBar, drawColumnSectionTitle } from './pdf-layout-bars.js';
import { drawPdfGridTable } from './pdf-grid-table.js';

export const EMPILHADORES_SERVICE_ID = 'manutencao_preventiva_empilhadores';

/** Informações da Máquina — PDF empilhadores (inclui Horas) */
export const EMPILHADORES_MACHINE_PDF_SPECS = [
  { id: 'marca', label: 'Marca' },
  { id: 'modelo', label: 'Modelo' },
  {
    id: 'numero_de_serie',
    label: 'Nº Série',
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'horas', label: 'Horas', aliases: ['horas_gastas'] },
  { id: 'n_interno', label: 'Nº Interno', aliases: ['num_interno'] },
];

const EMPILHADORES_DUAL_VERIFY_GAP_MM = 5.3;
const EMPILHADORES_VERIFY_COL_BAND_MM = 7;
const EMPILHADORES_MATERIAL_FONT_PT = 9.5;
const EMPILHADORES_MATERIAL_COLS = 4;
/** Rótulos curtos no PDF — evita quebras de linha na grelha de material */
const EMPILHADORES_MATERIAL_PDF_LABELS = {
  litros_oleo_diferencial: 'Óleo Diferencial (L)',
  litros_oleo_torque: 'Óleo Torque (L)',
  litros_oleo_hidraulico: 'Óleo Hidráulico (L)',
  litros_oleo_travoes: 'Óleo Travões (L)',
  litros_oleo_motor: 'Óleo Motor (L)',
  qtd_filtro_oleo_motor: 'Filtro Óleo Motor',
  qtd_filtro_ar: 'Filtro Ar',
  qtd_filtro_combustivel: 'Filtro Combustível',
  qtd_kit_gaseificador: 'Kit Gaseificador',
  qtd_limpeza_lubrificante: 'Limpeza/Lubrificante',
};
const EMPILHADORES_MATERIAL_ROW_H_MM = 5.5;
/** ~15px de respiro acima da secção de material */
const EMPILHADORES_MATERIAL_SECTION_TOP_GAP_MM = 4;

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

function formatEmpilhadoresHorasPdf(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const n = Number(raw);
  if (!Number.isNaN(n)) return Number.isInteger(n) ? String(n) : String(n);
  return cleanPdfText(raw);
}

function pdfGridCellEmpilhadoresMachine(label, value, options = {}) {
  if (options.horas) {
    const horasText = formatEmpilhadoresHorasPdf(value);
    return horasText ? `${label}: ${horasText}` : `${label}:`;
  }
  return pdfGridCell(label, value);
}

function buildFourColumnGridBody(cells) {
  const body = [];
  for (let i = 0; i < cells.length; i += EMPILHADORES_MATERIAL_COLS) {
    const row = [];
    for (let col = 0; col < EMPILHADORES_MATERIAL_COLS; col += 1) {
      row.push(cells[i + col] || '');
    }
    body.push(row);
  }
  return body;
}

export function isEmpilhadoresMaterialSection(section) {
  const norm = pdfNormalizeHeading(section || '');
  return norm.includes('substituicao') && norm.includes('material');
}

export function isEmpilhadoresMaterialField(service, field) {
  return (
    service?.id === EMPILHADORES_SERVICE_ID &&
    Boolean(field) &&
    isEmpilhadoresMaterialSection(field.section)
  );
}

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

function buildVerificationTableBody(items, states) {
  return (items || []).map((item) => {
    const spec = normalizeVerifyItem(item);
    const state = states?.[spec.id] || 'OK';
    return [pdfSafeText(spec.label), state];
  });
}

async function drawVerificationTableColumn(doc, startY, x, width, title, items, states, options = {}) {
  const compact = Boolean(options.compact);
  let y = drawColumnSectionTitle(doc, x, startY, width, title, {
    bandH: compact ? EMPILHADORES_VERIFY_COL_BAND_MM : PDF_SECTION_BAND_HEIGHT_MM,
    fontSize: compact ? PDF_FONT_CAPTION : PDF_FONT_SECTION,
    gapAfter: compact ? 1 : 2,
  });
  const body = buildVerificationTableBody(items, states);
  if (!body.length) return y;

  const pointW = width * 0.68;
  const stateW = width - pointW;
  const cellPadding = compact ? PDF_TABLE_CELL_PADDING_COMPACT : PDF_TABLE_CELL_PADDING;
  const minCellHeight = compact ? PDF_TABLE_MIN_CELL_HEIGHT_COMPACT : PDF_TABLE_MIN_CELL_HEIGHT;

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_TABLE,
      cellPadding,
      minCellHeight,
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
      fontSize: PDF_FONT_TABLE,
      cellPadding,
      minCellHeight,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
      overflow: 'linebreak',
    },
    bodyStyles: { minCellHeight, cellPadding },
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: PDF_FONT_TABLE,
      },
    },
    didParseCell: (data) => {
      if (compact) {
        data.cell.styles.cellPadding = cellPadding;
        data.cell.styles.minCellHeight = minCellHeight;
      }
      if (data.section === 'body' && data.column.index === 1) {
        const state = String(data.cell.raw || '');
        data.cell.styles.textColor = state === 'OK' ? SUCCESS : DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    gapAfter: compact ? 1 : PDF_SECTION_GAP_MM,
  });
}

/** Verificações Externas + Internas — grid 2 colunas (1fr 1fr, gap 20px) */
export async function drawEmpilhadoresDualVerificationBlocks(doc, y, left, right) {
  const gap = EMPILHADORES_DUAL_VERIFY_GAP_MM;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  const rowEstimate = Math.max(left?.items?.length || 0, right?.items?.length || 0);
  y = ensureSpace(
    doc,
    y,
    EMPILHADORES_VERIFY_COL_BAND_MM + rowEstimate * 3.6 + 8,
  );

  const startY = y;
  const compactOpts = { compact: true };
  const leftEnd = await drawVerificationTableColumn(
    doc,
    startY,
    leftX,
    colW,
    left.title,
    left.items,
    left.states,
    compactOpts,
  );
  const rightEnd = right
    ? await drawVerificationTableColumn(
        doc,
        startY,
        rightX,
        colW,
        right.title,
        right.items,
        right.states,
        compactOpts,
      )
    : startY;

  return Math.max(leftEnd, rightEnd) + PDF_SECTION_GAP_MM;
}

function formatEmpilhadoresMaterialPdfLabel(field) {
  return EMPILHADORES_MATERIAL_PDF_LABELS[field.id] || field.label;
}

function isPdfScalarField(field) {
  return Boolean(field?.type && PDF_SCALAR_FIELD_TYPES.has(field.type));
}

function isPdfEmptyScalarValue(value) {
  return cleanPdfText(value) === '';
}

async function drawEmpilhadoresMaterialGrid(doc, y, fields, values, pdfContext, options = {}) {
  if (!fields.length) return y;
  const cells = fields.map((field) =>
    pdfGridCell(
      formatEmpilhadoresMaterialPdfLabel(field),
      cleanPdfText(values[field.id]),
    ),
  );
  const body = buildFourColumnGridBody(cells);
  if (!body.length) return y;

  const colW = CONTENT_W / EMPILHADORES_MATERIAL_COLS;
  const tableStyles = {
    font: pdfAutoTableFont(doc),
    fontSize: EMPILHADORES_MATERIAL_FONT_PT,
    cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
    minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
    lineColor: PDF_TABLE_LINE,
    lineWidth: PDF_TABLE_LINE_WIDTH,
    textColor: TEXT_DARK,
    valign: 'middle',
    overflow: 'linebreak',
  };
  const columnStyles = {
    0: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
    1: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
    2: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
    3: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
  };

  if (!options.skipLeadingEnsure) {
    y = ensureSpace(doc, y, 8 + body.length * EMPILHADORES_MATERIAL_ROW_H_MM);
  }

  for (let rowIdx = 0; rowIdx < body.length; rowIdx += 1) {
    y = ensureSpace(doc, y, EMPILHADORES_MATERIAL_ROW_H_MM + 1);
    y = await drawPdfGridTable(doc, y, {
      body: [body[rowIdx]],
      styles: tableStyles,
      columnStyles,
      gapAfter: rowIdx < body.length - 1 ? 0 : PDF_SECTION_GAP_MM,
      autoTableExtra: { rowPageBreak: 'avoid' },
    });
  }

  return y;
}

export function collectEmpilhadoresMaterialFields(service, values, pdfContext, skipIds = new Set()) {
  return (service?.fields || []).filter((field) => {
    if (skipIds.has(field.id)) return false;
    if (!isEmpilhadoresMaterialField(service, field)) return false;
    if (!isPdfScalarField(field)) return false;
    const value = cleanPdfText(values[field.id]);
    return !isPdfEmptyScalarValue(value);
  });
}

export function markEmpilhadoresMaterialFieldsRendered(service, scalarRenderedIds) {
  (service?.fields || []).forEach((field) => {
    if (isEmpilhadoresMaterialField(service, field)) {
      scalarRenderedIds.add(field.id);
    }
  });
}

/** Bloco completo — título + grelha de óleos/filtros (sempre após verificações) */
export async function drawEmpilhadoresMaterialSectionBlock(
  doc,
  y,
  service,
  values,
  pdfContext,
  fields = null,
  skipIds = new Set(),
) {
  const materialFields =
    fields ||
    collectEmpilhadoresMaterialFields(service, values, pdfContext, skipIds);
  if (!materialFields.length) return y;

  y += EMPILHADORES_MATERIAL_SECTION_TOP_GAP_MM;
  y = ensureSpace(doc, y, 12);

  y = drawSectionTitle(doc, y, EMPILHADORES_MATERIAL_SECTION, { skipEnsure: true });
  y = drawDivider(doc, y - 4);
  return drawEmpilhadoresMaterialGrid(doc, y, materialFields, values, pdfContext, {
    skipLeadingEnsure: true,
  });
}

/** Grelha 3 colunas — informações da máquina (após título da secção) */
export async function drawEmpilhadoresMachineGrid(doc, y, values, pdfContext = null) {
  const cells = EMPILHADORES_MACHINE_PDF_SPECS.map((spec) => {
    let fallback = null;
    if (spec.id === 'numero_de_serie') {
      fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
    }
    const raw = resolvePdfStandardFieldValue(values, spec, fallback);
    if (spec.id === 'horas') {
      return pdfGridCellEmpilhadoresMachine(spec.label, raw, { horas: true });
    }
    return pdfGridCell(spec.label, pdfDisplayValue(raw));
  });
  const body = [];
  for (let i = 0; i < cells.length; i += 3) {
    body.push([cells[i] || '', cells[i + 1] || '', cells[i + 2] || '']);
  }
  if (!body.length) return y;
  y = ensureSpace(doc, y, 10);
  const colW = CONTENT_W / 3;
  return drawPdfGridTable(doc, y, {
    body,
    columnStyles: {
      0: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      2: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
    },
  });
}
