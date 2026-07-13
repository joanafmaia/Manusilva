/**
 * Layout PDF — Folha de Intervenção de Avarias.
 */

import { pdfAutoTableFont, pdfSetFont, pdfSplitText } from './pdf-font.js';
import {
  mergePdfTableDidParseCell,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { pdfEstadoValueDidParseCell } from './pdf-estado-colors.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_HORAS,
  LABEL_HORAS_GASTAS,
  labelWithValue,
} from './field-labels.js';
import {
  columnKey,
  isMaterialTableField,
  MATERIAL_UTILIZADO_COLUMNS,
  normalizeMaterialRows,
} from './material-table-field.js';
import {
  pdfDisplayValue,
  formatFolhaInterventionDate,
  formatPdfNumeroVisitas,
} from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
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
import { FOLHA_INSTITUTIONAL_FOOTER_H_MM } from './pdf-institutional-footer.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';

const FOLHA_AVARIAS_SECTION_GAP_MM = 2.8;
const FOLHA_AVARIAS_HEAD_FONT_PT = 10;
const FOLHA_AVARIAS_TABLE_FONT_PT = 9.5;
const FOLHA_AVARIAS_CELL_PADDING = { top: 1.06, right: 1.2, bottom: 1.06, left: 1.2 };

const FOLHA_AVARIAS_CLOSING_PROFILE = {
  sigTop: 5,
  sigImg: 15,
  polaroidMm: 46,
  polaroidBottom: 4,
};

export function drawFolhaAvariasTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, FOLHA_AVARIAS_SECTION_GAP_MM);
}

function folhaAvariasTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: FOLHA_AVARIAS_TABLE_FONT_PT,
      cellPadding: FOLHA_AVARIAS_CELL_PADDING,
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
      fontSize: FOLHA_AVARIAS_TABLE_FONT_PT,
      cellPadding: FOLHA_AVARIAS_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: FOLHA_AVARIAS_CELL_PADDING,
      fontSize: FOLHA_AVARIAS_TABLE_FONT_PT,
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

async function drawFolhaAvariasSectionBar(doc, y, title) {
  return drawPdfSectionTitleBar(doc, y, title, {
    bandH: 5.5,
    gapAfter: 0.8,
    fontSize: FOLHA_AVARIAS_HEAD_FONT_PT,
  });
}

async function drawFolhaAvariasDashboardTable(doc, y, sectionTitle, options = {}) {
  const { head, body, columnStyles, bodyStyles, gapAfter = FOLHA_AVARIAS_SECTION_GAP_MM, didParseCell } =
    options;
  y = await drawFolhaAvariasSectionBar(doc, y, sectionTitle);
  const pack = folhaAvariasTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: head?.length ? [head] : undefined,
    body,
    columnStyles,
    gapAfter,
    ...pack,
    bodyStyles: { ...pack.bodyStyles, ...(bodyStyles || {}) },
    didParseCell: mergePdfTableDidParseCell(didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawFolhaIntervencaoMaquinaTable(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marca = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'marca' }));
  const modelo = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'modelo' }));
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const nInterno = pdfDisplayValue(
    resolvePdfStandardFieldValue(values, { id: 'n_interno', aliases: ['num_interno'] }),
  );
  const horas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas' }));
  const colW = CONTENT_W / 2;

  return drawFolhaAvariasDashboardTable(doc, y, 'Informações da Máquina', {
    body: [
      [labelWithValue(LABEL_MARCA, marca), labelWithValue(LABEL_MODELO, modelo)],
      [labelWithValue(LABEL_NUMERO_SERIE, serie), labelWithValue(LABEL_N_INTERNO, nInterno)],
      [labelWithValue(LABEL_HORAS, horas), ''],
    ],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoTextSection(doc, y, sectionTitle, text) {
  const display = pdfDisplayValue(text) || '—';
  const lines = pdfSplitText(doc, display, CONTENT_W - 8);
  const boxH = Math.max(12, lines.length * 3.8 + 4);

  y = await drawFolhaAvariasSectionBar(doc, y, sectionTitle);
  const boxY = y;
  drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, boxH);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(FOLHA_AVARIAS_TABLE_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 2.5, boxY + 4.5, { lineHeightFactor: 1.15 });
  touchPdfContentPage(doc);
  return boxY + boxH + FOLHA_AVARIAS_SECTION_GAP_MM;
}

async function drawFolhaIntervencaoMaterialTable(doc, y, rows) {
  const columns = MATERIAL_UTILIZADO_COLUMNS;
  const colKeys = columns.map((c) => columnKey(c));
  const body =
    rows.length > 0
      ? rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])))
      : [['—', '—']];
  const colW = CONTENT_W / 2;

  return drawFolhaAvariasDashboardTable(doc, y, 'Material Utilizado', {
    head: ['Material', 'Quantidade'],
    body,
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoDatasTable(doc, y, values) {
  const visitas = pdfDisplayValue(formatPdfNumeroVisitas(values));
  const data1 = formatFolhaInterventionDate(
    resolvePdfStandardFieldValue(values, { id: 'data_1' }, values.data_1),
  );
  const data2 = formatFolhaInterventionDate(
    resolvePdfStandardFieldValue(values, { id: 'data_2' }, values.data_2),
  );
  const horasGastas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas_gastas' }));
  const colW = CONTENT_W / 4;

  return drawFolhaAvariasDashboardTable(doc, y, 'Datas de Intervenção', {
    head: ['N.º de visitas', 'Data 1', 'Data 2', LABEL_HORAS_GASTAS],
    body: [[visitas, data1, data2, horasGastas]],
    bodyStyles: { halign: 'center' },
    columnStyles: {
      0: { cellWidth: colW, halign: 'center' },
      1: { cellWidth: colW, halign: 'center' },
      2: { cellWidth: colW, halign: 'center' },
      3: { cellWidth: colW, halign: 'center' },
    },
  });
}

export async function drawFolhaIntervencaoOrcamentoBlock(doc, y, values) {
  const pedido = pdfDisplayValue(values.pedido_orcamento);
  const isSim = String(pedido).toLowerCase() === 'sim';
  const detalhe = pdfDisplayValue(values.detalhe_pedido_orcamento);
  const labelColW = CONTENT_W * 0.34;
  const body = [[`Pedido de Orçamento:`, pedido]];
  if (isSim) {
    body.push([`O que é necessário:`, detalhe]);
  }

  return drawFolhaAvariasDashboardTable(doc, y, 'Pedido de Orçamento', {
    body,
    columnStyles: {
      0: { cellWidth: labelColW, halign: 'left' },
      1: { cellWidth: CONTENT_W - labelColW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoEstadoBlock(doc, y, values) {
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));

  return drawFolhaAvariasDashboardTable(doc, y, 'Estado em que Ficou a Máquina', {
    body: [[estado]],
    columnStyles: {
      0: { cellWidth: CONTENT_W, halign: 'left', fontStyle: 'bold' },
    },
    didParseCell: mergePdfTableDidParseCell(pdfEstadoValueDidParseCell),
  });
}

export async function drawFolhaIntervencaoAvariasBody(doc, y, values, service, pdfContext = null) {
  y = await drawFolhaIntervencaoMaquinaTable(doc, y, values, pdfContext);
  y = await drawFolhaIntervencaoTextSection(doc, y, 'Deteção de Avaria', values.detecao_de_avaria);
  y = await drawFolhaIntervencaoTextSection(doc, y, 'Resolução da Avaria', values.resolucao_da_avaria);

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  y = await drawFolhaIntervencaoMaterialTable(doc, y, rows);
  return drawFolhaIntervencaoDatasTable(doc, y, values);
}

export async function drawFolhaIntervencaoAvariasClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = FOLHA_AVARIAS_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const bottomGap = profile.polaroidBottom ?? 2;
  const institutionalMm = FOLHA_INSTITUTIONAL_FOOTER_H_MM;
  const pedidoSim = String(values.pedido_orcamento || '').toLowerCase() === 'sim';

  let closingBodyH = pedidoSim ? 28 : 20;
  closingBodyH += 18;
  let tailH = closingBodyH + estimateSignaturesHeight(profile) + institutionalMm;
  if (hasFotos) {
    tailH += estimatePdfInterventionFotosOverhead(bottomGap) + 24;
  }
  y = ensureBlockFitsSafeZone(doc, y, tailH);

  y = await drawFolhaIntervencaoOrcamentoBlock(doc, y, values);
  y = await drawFolhaIntervencaoEstadoBlock(doc, y, values);

  if (hasFotos) {
    let available = pdfContentBottomY() - y;
    let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
    let fotoTailH =
      estimatePdfInterventionFotosOverhead(bottomGap) +
      maxImgH +
      estimateSignaturesHeight(profile) +
      institutionalMm;

    if (y + fotoTailH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, fotoTailH);
      available = pdfContentBottomY() - y;
      maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
      fotoTailH =
        estimatePdfInterventionFotosOverhead(bottomGap) +
        maxImgH +
        estimateSignaturesHeight(profile) +
        institutionalMm;
      if (y + fotoTailH > pdfContentBottomY()) {
        y = ensureBlockFitsSafeZone(doc, y, fotoTailH);
      }
    }

    y = await drawInterventionFotografiasSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      { skipEnsure: true, bottomGap, maxImgH },
    );
  }

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
    reserveInstitutionalFooter: true,
  });
}
