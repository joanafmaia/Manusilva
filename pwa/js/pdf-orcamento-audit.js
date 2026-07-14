/**
 * PDF — Resumo anual de propostas comerciais MS.015.
 */

import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import { COMPANY } from './mock_data.js';
import { ensurePdfFonts, pdfAutoTableFont, pdfSetFont, pdfSafeText } from './pdf-font.js';
import {
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_GAP_MM,
} from './pdf-design-system.js';
import { drawLogoPlaceholder } from './pdf-header-blocks.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { drawPageFooter } from './pdf-institutional-footer.js';
import { loadJsPDF, loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
import { touchPdfContentPage, trimTrailingBlankPages } from './pdf-page-layout.js';

const SECTION_GAP = PDF_SECTION_GAP_MM + 0.5;
const TABLE_FONT = 8;

function formatEurPdf(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2).replace('.', ',')} €`;
}

export function buildOrcamentoAuditPdfFilename(year, tipoFilter = 'all') {
  const yearKey = String(year || 'all').trim() === 'all' ? 'todos' : String(year).trim();
  const tipoKey =
    !tipoFilter || tipoFilter === 'all'
      ? 'todos-tipos'
      : String(tipoFilter).replace(/_/g, '-');
  return `Manusilva-Propostas-${yearKey}-${tipoKey}.pdf`;
}

export function buildOrcamentoAuditKpiRows(summary) {
  const { metrics } = summary;
  return [
    ['Propostas no período', String(metrics.proposalCount)],
    ['Enviadas ao cliente', String(metrics.enviadas)],
    ['Aceites', String(metrics.aceites)],
    ['Valor total (com IVA)', formatEurPdf(metrics.totalValor)],
  ];
}

export function buildOrcamentoAuditTipoRows(summary) {
  return summary.byTipo.map((row) => [
    pdfSafeText(row.tipo),
    String(row.count),
    formatEurPdf(row.valor),
  ]);
}

export function buildOrcamentoAuditDetailRows(rows = []) {
  return rows.map((row) => [
    String(row.date || '').slice(0, 10) || '—',
    pdfSafeText(row.tipoLabel || '—'),
    pdfSafeText(row.cliente || '—'),
    pdfSafeText(row.numeroOrcamento || '—'),
    pdfSafeText(row.op || '—'),
    formatEurPdf(row.total),
    pdfSafeText(row.estado || '—'),
    String(row.enviadoEm || '').slice(0, 10) || '—',
  ]);
}

function formatGeneratedAtLabel(date = new Date()) {
  try {
    return date.toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function drawAuditHeader(doc, title, generatedAt) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;

  if (isLogoConfigured()) {
    try {
      doc.addImage(MANUSILVA_LOGO, getPdfLogoFormat(), MARGIN, topY, logoW, logoH);
    } catch {
      drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
    }
  } else {
    drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
  }

  const metaX = MARGIN + logoW + 6;
  let y = topY + 5;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(COMPANY.name, metaX, y);
  y += 4.5;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(COMPANY.tagline || 'Manutenção industrial', metaX, y);
  y += 4;
  doc.text(`Documento gerado em ${generatedAt}`, metaX, y);

  const headerH = Math.max(logoH, y - topY);
  y = topY + headerH + 4;

  return drawPdfDocumentTitleBar(doc, y, title, SECTION_GAP);
}

async function drawKeyValueSection(doc, y, title, bodyRows) {
  y = await drawPdfSectionTitleBar(doc, y, title, { bandH: 6, gapAfter: 1.2 });
  return drawPdfGridTable(doc, y, {
    body: bodyRows,
    columnStyles: {
      0: { cellWidth: CONTENT_W * 0.42, fontStyle: 'bold' },
      1: { cellWidth: CONTENT_W * 0.58 },
    },
    styles: { fontSize: TABLE_FONT },
  });
}

async function drawDataSection(doc, y, title, head, body, columnStyles) {
  y = await drawPdfSectionTitleBar(doc, y, title, { bandH: 6, gapAfter: 1.2 });
  return drawPdfGridTable(doc, y, {
    head: [head],
    body,
    columnStyles,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: TABLE_FONT,
      overflow: 'linebreak',
    },
    gapAfter: SECTION_GAP,
  });
}

/**
 * @param {{ summary: object, rows: object[], year?: string, tipoFilter?: string }} payload
 */
export async function generateOrcamentoAuditPdfBlob(payload) {
  const summary = payload?.summary;
  const rows = Array.isArray(payload?.rows) ? payload.rows : summary?.rows || [];
  const year = payload?.year ?? summary?.year ?? 'all';
  const tipoFilter = payload?.tipoFilter ?? summary?.tipoFilter ?? 'all';

  if (!summary?.metrics?.proposalCount) {
    throw new Error('Não há propostas para exportar neste período.');
  }

  await loadJsPdfAutoTable();
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);
  doc.__manusilvaLastContentPage = 1;

  const titleParts = ['RESUMO DE PROPOSTAS COMERCIAIS'];
  if (summary.yearLabel && summary.yearLabel !== 'Todos os anos') {
    titleParts.push(summary.yearLabel);
  }
  if (summary.tipoLabel && summary.tipoLabel !== 'Todos os tipos') {
    titleParts.push(summary.tipoLabel);
  }

  const generatedAt = formatGeneratedAtLabel();
  let y = drawAuditHeader(doc, titleParts.join(' — '), generatedAt);

  y = await drawKeyValueSection(doc, y, 'Indicadores', buildOrcamentoAuditKpiRows(summary));

  if (summary.byTipo?.length) {
    const typeCol = CONTENT_W / 3;
    y = await drawDataSection(
      doc,
      y,
      'Por tipo de proposta',
      ['Tipo', 'Qtd.', 'Valor total'],
      buildOrcamentoAuditTipoRows(summary),
      {
        0: { cellWidth: typeCol * 1.4 },
        1: { cellWidth: typeCol * 0.5, halign: 'center' },
        2: { cellWidth: typeCol * 1.1, halign: 'right' },
      },
    );
  }

  const detailCols = {
    0: { cellWidth: 18 },
    1: { cellWidth: 28 },
    2: { cellWidth: 32 },
    3: { cellWidth: 16 },
    4: { cellWidth: 14 },
    5: { cellWidth: 18, halign: 'right' },
    6: { cellWidth: 18 },
    7: { cellWidth: 18 },
  };
  await drawDataSection(
    doc,
    y,
    'Registo detalhado',
    ['Data', 'Tipo', 'Cliente', 'Nº orç.', 'OP', 'Total', 'Estado', 'Enviada'],
    buildOrcamentoAuditDetailRows(rows),
    detailCols,
  );

  touchPdfContentPage(doc);
  trimTrailingBlankPages(doc);
  drawPageFooter(doc, 'orcamento-audit');

  return {
    blob: doc.output('blob'),
    filename: buildOrcamentoAuditPdfFilename(year, tipoFilter),
    pageCount: doc.getNumberOfPages(),
  };
}
