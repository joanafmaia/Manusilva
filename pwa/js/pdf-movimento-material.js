/**
 * Layout PDF — Recolha / Entrega no Cliente.
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
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
} from './pdf-design-system.js';
import { LABEL_N_INTERNO, labelWithValue } from './field-labels.js';
import { formatFolhaInterventionDate, pdfDisplayValue } from './pdf-format-utils.js';
import {
  ensureBlockFitsSafeZone,
  ensureSpace,
  pdfContentBottomY,
  touchPdfContentPage,
} from './pdf-page-layout.js';
import { drawPdfSectionTitleBar, drawPdfContentBox } from './pdf-layout-bars.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';

const SECTION_GAP_MM = 3.2;
const FONT_PT = 9;
const HEAD_FONT_PT = 10.5;
const CLOSING_PROFILE = {
  sigTop: 3,
  sigImg: 13,
  polaroidMm: 40,
  polaroidBottom: 2,
};

function movimentoTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: FONT_PT,
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
      fontSize: FONT_PT,
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
      fontSize: FONT_PT,
      textColor: TEXT_DARK,
    },
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
    }),
  };
}

async function drawSectionBar(doc, y, title) {
  return drawPdfSectionTitleBar(doc, y, title, {
    bandH: 6,
    gapAfter: 1.2,
    fontSize: HEAD_FONT_PT,
  });
}

export async function drawMovimentoMaterialBody(doc, y, values) {
  const movimentoColW = CONTENT_W / 2;
  y = await drawSectionBar(doc, y, 'Movimento');
  y = await drawPdfGridTable(doc, y, {
    body: [
      [
        labelWithValue('Tipo de movimento', pdfDisplayValue(values.tipo_movimento)),
        labelWithValue('Data', formatFolhaInterventionDate(values.data_movimento)),
      ],
    ],
    columnStyles: {
      0: { cellWidth: movimentoColW, halign: 'left', fontSize: FONT_PT },
      1: { cellWidth: movimentoColW, halign: 'left', fontSize: FONT_PT },
    },
    gapAfter: SECTION_GAP_MM,
    ...movimentoTableStylePack(doc),
  });

  y = await drawSectionBar(doc, y, 'Equipamento');
  y = await drawPdfGridTable(doc, y, {
    body: [[labelWithValue(LABEL_N_INTERNO, pdfDisplayValue(values.n_interno))]],
    columnStyles: {
      0: { cellWidth: CONTENT_W, halign: 'left', fontSize: FONT_PT },
    },
    gapAfter: SECTION_GAP_MM,
    ...movimentoTableStylePack(doc),
  });

  return y;
}

async function drawObservationsBox(doc, y, value) {
  const text = pdfDisplayValue(value);
  const lines = pdfSplitText(doc, text, CONTENT_W - 6);
  const boxH = Math.max(14, lines.length * 3.8 + 6);

  y = ensureSpace(doc, y, 8);
  y = await drawSectionBar(doc, y, 'Observações');
  y = ensureSpace(doc, y, boxH);

  const boxY = y;
  drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, boxH);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 3, boxY + 4.5);

  touchPdfContentPage(doc);
  return boxY + boxH + SECTION_GAP_MM;
}

export async function drawMovimentoMaterialClosingSection(doc, y, opts) {
  const profile = CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  y = await drawObservationsBox(doc, y, opts.observacoes);

  if (hasFotos) {
    const bottomGap = profile.polaroidBottom;
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
