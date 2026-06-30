/**
 * Layout PDF — Reparação de Carregador.
 */

import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import { pdfAutoTableFont, pdfSetFont, pdfSplitText, pdfSafeText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_HEADER_CLIENT_W,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_PAGE_W as PAGE_W,
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  PDF_CLIENT_BOX_FILL,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import {
  LABEL_MARCA_MODELO,
  LABEL_NUMERO_SERIE,
  LABEL_ETIQUETA,
  LABEL_DATA_RECECAO,
  LABEL_HORAS,
  labelWithValue,
} from './field-labels.js';
import { isMaterialTableField, normalizeMaterialRows } from './material-table-field.js';
import {
  pdfDisplayValue,
  formatFolhaInterventionDate,
  resolvePdfCellToken,
} from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
  pdfContentBottomY,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { FOLHA_INSTITUTIONAL_FOOTER_H_MM } from './pdf-institutional-footer.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { drawLogoPlaceholder } from './pdf-header-blocks.js';

const CARREGADOR_SECTION_GAP_MM = 3.5;
const CARREGADOR_FONT_PT = 9;
const CARREGADOR_HEAD_FONT_PT = 10;
const CARREGADOR_CLOSING_PROFILE = {
  sigTop: 3,
  sigImg: 13,
  polaroidMm: 40,
  polaroidBottom: 3,
};
const CARREGADOR_RADIUS_MM = 1.6;

export function drawCarregadorTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, CARREGADOR_SECTION_GAP_MM);
}

function drawCarregadorMetaCell(doc, x, y, label, value, maxW) {
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${label}:`, x, y);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(CARREGADOR_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(pdfSafeText(value) || '—', x, y + 3.2, { maxWidth: maxW });
}

function drawCarregadorClientNameBlock(doc, topY, clientMeta) {
  const logoH = PDF_LOGO_HEIGHT_MM;
  const textW = PDF_HEADER_CLIENT_W;
  const name = pdfSafeText(clientMeta?.nome);
  if (!name) return 0;

  const nameLines = pdfSplitText(doc, name, textW);
  const blockY = topY + logoH + 2;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('CLIENTE', MARGIN, blockY);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(nameLines, MARGIN, blockY + 4.2);

  touchPdfContentPage(doc);
  return 2 + 4.2 + nameLines.length * 3.6;
}

function drawCarregadorIdentificacaoClienteBox(doc, topY, values, techName) {
  const blockW = PDF_HEADER_CLIENT_W;
  const blockX = PAGE_W - MARGIN - blockW;
  const blockPad = 2.5;
  const colW = (blockW - blockPad * 2 - 2) / 2;
  const dataRececao = formatFolhaInterventionDate(values.data_rececao);
  const etiqueta = pdfDisplayValue(values.etiqueta);
  const rowH = 7;
  const blockH = blockPad * 2 + 4 + rowH * 2;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(blockX, topY, blockW, blockH, CARREGADOR_RADIUS_MM, CARREGADOR_RADIUS_MM, 'FD');

  let lineY = topY + blockPad + 3;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(CARREGADOR_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('IDENTIFICAÇÃO CLIENTE', blockX + blockPad, lineY);
  lineY += 4.2;

  drawCarregadorMetaCell(doc, blockX + blockPad, lineY, LABEL_DATA_RECECAO, dataRececao, colW);
  drawCarregadorMetaCell(doc, blockX + blockPad + colW + 2, lineY, LABEL_ETIQUETA, etiqueta, colW);
  lineY += rowH;
  drawCarregadorMetaCell(
    doc,
    blockX + blockPad,
    lineY,
    'Funcionário',
    techName,
    blockW - blockPad * 2,
  );

  return blockH;
}

function carregadorTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: CARREGADOR_FONT_PT,
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
      fontSize: CARREGADOR_HEAD_FONT_PT,
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
      fontSize: CARREGADOR_FONT_PT,
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

async function drawCarregadorSectionBar(doc, y, title) {
  return drawPdfSectionTitleBar(doc, y, title, {
    bandH: 6,
    gapAfter: 1.2,
    fontSize: CARREGADOR_HEAD_FONT_PT,
  });
}

async function drawCarregadorDashboardTable(doc, y, sectionTitle, columnHead, body, columnStyles) {
  y = await drawCarregadorSectionBar(doc, y, sectionTitle);

  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: columnHead?.length ? [columnHead] : undefined,
    body,
    columnStyles,
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

export async function drawReparacaoCarregadorTopSection(doc, clientMeta, techName, report, job, values) {
  void report;
  void job;
  void values;
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;

  if (isLogoConfigured()) {
    try {
      doc.addImage(
        MANUSILVA_LOGO,
        getPdfLogoFormat(),
        MARGIN,
        topY,
        logoW,
        logoH,
        undefined,
        'FAST',
      );
    } catch {
      drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
    }
  } else {
    drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
  }

  const clientNameH = drawCarregadorClientNameBlock(doc, topY, clientMeta);
  const boxH = drawCarregadorIdentificacaoClienteBox(doc, topY, values, techName);
  touchPdfContentPage(doc);
  return Math.max(topY + logoH + clientNameH, topY + boxH) + CARREGADOR_SECTION_GAP_MM;
}

async function drawReparacaoCarregadorIdentificacaoTable(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marcaModelo = pdfDisplayValue(values.marca_modelo);
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const colW = CONTENT_W / 2;

  y = await drawCarregadorSectionBar(doc, y, 'IDENTIFICAÇÃO DO CARREGADOR');
  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[labelWithValue(LABEL_MARCA_MODELO, marcaModelo), labelWithValue(LABEL_NUMERO_SERIE, serie)]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
    },
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

function normalizeRegistoIntervencaoRows(rows, pdfContext = null) {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const dataIntervencao = formatFolhaInterventionDate(
        resolvePdfCellToken(row.data_intervencao, pdfContext),
      );
      const servico = pdfDisplayValue(
        resolvePdfCellToken(row.servico_efectuado_equipamento, pdfContext),
      );
      const horas = pdfDisplayValue(resolvePdfCellToken(row.horas, pdfContext));
      const tecnico = pdfDisplayValue(resolvePdfCellToken(row.tecnico, pdfContext));
      if ([dataIntervencao, servico, horas, tecnico].every((v) => v === '—')) return null;
      return [dataIntervencao, servico, horas, tecnico];
    })
    .filter(Boolean);
  return mapped.length > 0 ? mapped : [['—', '—', '—', '—']];
}

async function drawReparacaoCarregadorRegistoTable(doc, y, values, pdfContext = null) {
  const body = normalizeRegistoIntervencaoRows(values.registo_intervencao, pdfContext);
  const colW = CONTENT_W / 4;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'REGISTO DE INTERVENÇÃO',
    ['Data Intervenção', 'Serviço Efectuado/ Equipamento', LABEL_HORAS, 'Técnico'],
    body,
    {
      0: { cellWidth: colW * 0.85, halign: 'center' },
      1: { cellWidth: colW * 1.45, halign: 'left' },
      2: { cellWidth: colW * 0.55, halign: 'center' },
      3: { cellWidth: colW * 1.15, halign: 'left' },
    },
  );
}

function normalizeResultadoTesteRows(rows, values = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const amperagem = pdfDisplayValue(
        row.valor_da_amperagem_debitado ?? row.valor_amperagem_debitado,
      );
      const equipamento = pdfDisplayValue(row.equipamento);
      if (amperagem === '—' && equipamento === '—') return null;
      return [amperagem, equipamento];
    })
    .filter(Boolean);
  if (mapped.length > 0) return mapped;
  const legacy = pdfDisplayValue(values.valor_amperagem_debitado);
  if (legacy !== '—') return [[legacy, '—']];
  return [['—', '—']];
}

async function drawReparacaoCarregadorResultadoTesteBlock(doc, y, values) {
  const body = normalizeResultadoTesteRows(values.resultado_teste, values);
  const colW = CONTENT_W / 2;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'RESULTADO DO TESTE',
    ['Valor da amperagem debitado', 'Equipamento'],
    body,
    {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  );
}

async function drawReparacaoCarregadorConsumiveisTable(doc, y, rows) {
  const body =
    rows.length > 0
      ? rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
      : [['—', '—']];
  const colW = CONTENT_W / 2;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'CONSUMÍVEIS',
    ['Material Colocado', 'Quantidade'],
    body,
    {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  );
}

export async function drawReparacaoCarregadorBody(doc, y, values, service, pdfContext = null) {
  y = await drawReparacaoCarregadorIdentificacaoTable(doc, y, values, pdfContext);
  y = await drawReparacaoCarregadorRegistoTable(doc, y, values, pdfContext);
  y = await drawReparacaoCarregadorResultadoTesteBlock(doc, y, values);

  const materialField =
    (service?.fields || []).find((f) => f.id === 'consumiveis_material') ||
    (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  return drawReparacaoCarregadorConsumiveisTable(doc, y, rows);
}

async function drawReparacaoCarregadorFechoBlock(doc, y, values) {
  const concluido = formatFolhaInterventionDate(values.concluido_testado_em);
  const responsavel = pdfDisplayValue(values.responsavel);
  const colW = CONTENT_W / 2;

  y = await drawCarregadorSectionBar(doc, y, 'FECHO');
  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Concluído e Testado Em: ${concluido}`, `Responsável: ${responsavel}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
    },
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

export async function drawReparacaoCarregadorClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = CARREGADOR_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  y = await drawReparacaoCarregadorFechoBlock(doc, y, values);

  if (hasFotos) {
    const bottomGap = 2;
    let available = pdfContentBottomY() - y;
    let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
    let tailH =
      estimatePdfInterventionFotosOverhead(bottomGap) +
      maxImgH +
      estimateSignaturesHeight(profile) +
      FOLHA_INSTITUTIONAL_FOOTER_H_MM;

    if (y + tailH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, tailH);
      available = pdfContentBottomY() - y;
      maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
      tailH =
        estimatePdfInterventionFotosOverhead(bottomGap) +
        maxImgH +
        estimateSignaturesHeight(profile) +
        FOLHA_INSTITUTIONAL_FOOTER_H_MM;
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
    y = ensureBlockFitsSafeZone(
      doc,
      y,
      estimateSignaturesHeight(profile) + FOLHA_INSTITUTIONAL_FOOTER_H_MM,
    );
  }

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
    reserveInstitutionalFooter: true,
  });
}
