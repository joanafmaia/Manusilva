/**
 * Layout PDF — Manutenção Preventiva Bateria.
 */

import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import {
  pdfAutoTableFont,
  pdfSetFont,
  pdfSafeText,
} from './pdf-font.js';
import { loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
import {
  mergePdfTableDidParseCell,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_SECTION,
  PDF_FONT_TABLE,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_BG,
  PDF_SECTION_GAP_MM,
  PDF_SECTION_TITLE_BAR_H_MM,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_CELL_PADDING,
  PDF_TABLE_CELL_PADDING_HEAD,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT,
  PREVENTIVA_BATERIA_ANALYSIS_SPECS,
  resolvePdfStandardFieldValue,
} from './pdf-design-system.js';
import { LABEL_HORAS } from './field-labels.js';
import {
  columnKey,
  isMaterialTableField,
  MATERIAL_UTILIZADO_COLUMNS,
  normalizeMaterialRows,
} from './material-table-field.js';
import { VISITAS_FIELD_ID } from './deslocacao-field.js';
import {
  cleanPdfText,
  pdfDisplayValue,
  formatPdfConclusionDate,
  formatPdfJobDateOnly,
  formatPdfNumeroVisitas,
  formatPdfServiceDateOnly,
} from './pdf-format-utils.js';
import {
  getPdfAutoTableMargin,
  normalizeYAfterAutoTable,
  ensureBlockFitsSafeZone,
  pdfContentBottomY,
  touchPdfContentPage,
  buildPdfAutoTableDidDrawPage,
} from './pdf-page-layout.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import { drawCompactClientBox, drawLogoPlaceholder } from './pdf-header-blocks.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { FOLHA_INSTITUTIONAL_FOOTER_H_MM } from './pdf-institutional-footer.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';

const FOLHA_TABLE_HEAD_FILL = PDF_SECTION_BG;

export const FOLHA_CLOSING_PROFILE = {
  sigTop: 8,
  sigImg: 18,
  polaroidMm: 48,
  polaroidBottom: 4,
};

function buildFolhaAutoTableConfig(doc, y, overrides = {}) {
  const { didParseCell: userParse, ...rest } = overrides;
  return {
    startY: y,
    margin: getPdfAutoTableMargin(MARGIN, MARGIN),
    tableWidth: CONTENT_W,
    theme: 'plain',
    rowPageBreak: 'avoid',
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_TABLE,
      cellPadding: PDF_TABLE_CELL_PADDING,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      fillColor: PDF_TABLE_BODY_FILL,
      valign: 'middle',
      overflow: 'linebreak',
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT,
    },
    bodyStyles: { minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT },
    didParseCell: mergePdfTableDidParseCell(userParse),
    didDrawPage: buildPdfAutoTableDidDrawPage(doc),
    ...rest,
  };
}

function preventivaBateriaTableHeadStyles() {
  return {
    fillColor: FOLHA_TABLE_HEAD_FILL,
    textColor: TEXT_DARK,
    fontStyle: 'bold',
    fontSize: PDF_FONT_TABLE,
    lineColor: PDF_TABLE_LINE,
    lineWidth: PDF_TABLE_LINE_WIDTH,
    halign: 'center',
    valign: 'middle',
    cellPadding: PDF_TABLE_CELL_PADDING_HEAD,
  };
}

export function drawPreventivaBateriaMirrorHeader(
  doc,
  clientMeta,
  techName,
  report,
  job,
  values,
  numeroOrdem = null,
) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;
  const leftColW = CONTENT_W * 0.48;
  const conclusionDate = formatPdfConclusionDate(values);
  const jobDate = formatPdfJobDateOnly(job, report);
  const serviceDateFallback = formatPdfServiceDateOnly(report, job, values);

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

  const clientBoxH = drawCompactClientBox(doc, topY, clientMeta, numeroOrdem);

  let leftY = topY + logoH + 2;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Funcionário: ${pdfSafeText(techName)}`, MARGIN, leftY, { maxWidth: leftColW });
  leftY += 4;
  if (conclusionDate) {
    doc.text(`Data de Conclusão: ${pdfSafeText(conclusionDate)}`, MARGIN, leftY, {
      maxWidth: leftColW,
    });
    leftY += 4;
    if (jobDate && jobDate !== conclusionDate) {
      doc.text(`Data do Serviço: ${pdfSafeText(jobDate)}`, MARGIN, leftY, { maxWidth: leftColW });
      leftY += 4;
    }
  } else {
    doc.text(`Data de Conclusão: ${pdfSafeText(serviceDateFallback)}`, MARGIN, leftY, {
      maxWidth: leftColW,
    });
    leftY += 4;
  }

  touchPdfContentPage(doc);
  return Math.max(leftY, topY + clientBoxH) + PDF_SECTION_GAP_MM;
}

export function drawFolhaTitleBar(doc, y, title) {
  return drawPdfDocumentTitleBar(doc, y, title, PDF_SECTION_GAP_MM);
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

async function drawPreventivaBateriaClosedSectionTable(doc, y, options) {
  const { sectionTitle, columnHead, body, columnStyles, headStyles, bodyStyles } = options;

  if (sectionTitle) {
    y = drawPdfSectionTitleBar(doc, y, sectionTitle, {
      bandH: PDF_SECTION_TITLE_BAR_H_MM,
      gapAfter: 0.8,
      fontSize: PDF_FONT_SECTION,
      align: 'left',
    });
  }

  const head = [];
  if (columnHead?.length) {
    head.push(
      columnHead.map((label) => ({
        content: label,
        styles: preventivaBateriaTableHeadStyles(),
      })),
    );
  }

  await loadJsPdfAutoTable();
  doc.autoTable(
    buildFolhaAutoTableConfig(doc, y, {
      head: head.length ? head : undefined,
      body,
      headStyles: headStyles || preventivaBateriaTableHeadStyles(),
      bodyStyles: {
        font: pdfAutoTableFont(doc),
        fillColor: PDF_TABLE_BODY_FILL,
        textColor: TEXT_DARK,
        fontStyle: 'normal',
        fontSize: PDF_FONT_TABLE,
        lineColor: PDF_TABLE_LINE,
        lineWidth: PDF_TABLE_LINE_WIDTH,
        valign: 'middle',
        ...bodyStyles,
      },
      columnStyles,
    }),
  );
  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_SECTION_GAP_MM);
}

async function drawPreventivaBateriaAnalysisTable(doc, y, values) {
  const body = buildPreventivaBateriaAnalysisRows(values);
  const labelColW = CONTENT_W * 0.46;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'ANÁLISE DA BATERIA',
    body,
    columnStyles: {
      0: {
        cellWidth: labelColW,
        fontStyle: 'normal',
        textColor: TEXT_DARK,
        halign: 'left',
      },
      1: { cellWidth: CONTENT_W - labelColW, halign: 'left' },
    },
  });
}

async function drawPreventivaBateriaConsumiveisTable(doc, y, rows) {
  const columns = MATERIAL_UTILIZADO_COLUMNS;
  const colKeys = columns.map((c) => columnKey(c));
  const body =
    rows.length > 0
      ? rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])))
      : [['—', '—']];
  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'CONSUMÍVEIS',
    columnHead: ['Material', 'Quantidade'],
    body,
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

export async function drawPreventivaBateriaIntervencaoTable(doc, y, values) {
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

  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'NÚMERO DE VISITAS E TEMPO',
    columnHead: ['N.º de visitas', LABEL_HORAS],
    body: [[visitas, horas]],
    bodyStyles: { halign: 'center' },
    columnStyles: {
      0: { cellWidth: colW, halign: 'center' },
      1: { cellWidth: colW, halign: 'center' },
    },
  });
}

export async function drawEstadoFinalClosedBlock(doc, y, values, options = {}) {
  const observacaoLabel = options.observacaoLabel || 'Observações:';
  const body = [
    [observacaoLabel, pdfDisplayValue(values.observacao)],
    [`Estado:`, pdfDisplayValue(values.estado_final)],
  ];
  const labelColW = CONTENT_W * 0.22;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'ESTADO FINAL',
    body,
    columnStyles: {
      0: {
        cellWidth: labelColW,
        fontStyle: 'normal',
        textColor: TEXT_DARK,
        valign: 'top',
      },
      1: { cellWidth: CONTENT_W - labelColW, valign: 'top' },
    },
  });
}

async function drawPreventivaBateriaEstadoFinalBlock(doc, y, values) {
  return drawEstadoFinalClosedBlock(doc, y, values);
}

export async function drawPreventivaBateriaBody(doc, y, values, service) {
  y = await drawPreventivaBateriaAnalysisTable(doc, y, values);

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  y = await drawPreventivaBateriaConsumiveisTable(doc, y, rows);
  return drawPreventivaBateriaIntervencaoTable(doc, y, values);
}

export async function drawPreventivaBateriaClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = FOLHA_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  y = await drawPreventivaBateriaEstadoFinalBlock(doc, y, values);

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
