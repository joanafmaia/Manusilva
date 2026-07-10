/**
 * PDF — Resumo anual de faturação (auditoria RH).
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

export function buildFaturacaoAuditPdfFilename(year) {
  const key = String(year || 'all').trim() === 'all' ? 'todos' : String(year).trim();
  return `Manusilva-Faturacao-${key}.pdf`;
}

export function buildFaturacaoAuditKpiRows(summary) {
  const { metrics } = summary;
  return [
    ['Faturas registadas', String(metrics.invoiceCount)],
    ['Total faturado', formatEurPdf(metrics.totalFaturado)],
    ['Total recebido', formatEurPdf(metrics.totalRecebido)],
    ['Total em dívida', formatEurPdf(metrics.totalDivida)],
    ['Faturas pagas', String(metrics.countPago)],
    ['Faturas pendentes', String(metrics.countPendente)],
  ];
}

export function buildFaturacaoAuditTypeRows(summary) {
  return summary.byType.map((row) => [
    row.tipo,
    String(row.count),
    formatEurPdf(row.valor),
    formatEurPdf(row.recebido),
  ]);
}

export function buildFaturacaoAuditMonthlyRows(summary) {
  return summary.monthly.map((row) => [
    row.month,
    formatEurPdf(row.faturado),
    formatEurPdf(row.recebido),
    formatEurPdf(row.divida),
  ]);
}

export function buildFaturacaoAuditDetailRows(rows = []) {
  return [...rows]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((row) => [
      String(row.date || '').slice(0, 10) || '—',
      pdfSafeText(row.tipo || '—'),
      pdfSafeText(row.cliente || '—'),
      pdfSafeText(row.numeroFatura || '—'),
      formatEurPdf(row.valor),
      pdfSafeText(row.estadoLabel || row.estado || '—'),
      String(row.dataRecebimento || '').slice(0, 10) || '—',
      pdfSafeText(row.faturadoPor || row.aprovadoPor || '—'),
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

function drawAuditHeader(doc, yearLabel, generatedAt) {
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

  const title =
    yearLabel === 'Todos os anos'
      ? 'RESUMO DE FATURAÇÃO'
      : `RESUMO DE FATURAÇÃO — ${yearLabel}`;

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
 * @param {{ summary: object, rows: object[], year?: string }} payload
 */
export async function generateFaturacaoAuditPdfBlob(payload) {
  const summary = payload?.summary;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const year = payload?.year ?? summary?.year ?? 'all';

  if (!summary?.metrics?.invoiceCount) {
    throw new Error('Não há faturas para exportar neste período.');
  }

  await loadJsPdfAutoTable();
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);
  doc.__manusilvaLastContentPage = 1;

  const yearLabel = String(year) === 'all' ? 'Todos os anos' : String(year);
  const generatedAt = formatGeneratedAtLabel();
  let y = drawAuditHeader(doc, yearLabel, generatedAt);

  y = await drawKeyValueSection(doc, y, 'Indicadores', buildFaturacaoAuditKpiRows(summary));

  const typeCol = CONTENT_W / 4;
  y = await drawDataSection(
    doc,
    y,
    'Por tipo de documento',
    ['Tipo', 'Qtd.', 'Faturado', 'Recebido'],
    buildFaturacaoAuditTypeRows(summary),
    {
      0: { cellWidth: typeCol * 1.1 },
      1: { cellWidth: typeCol * 0.5, halign: 'center' },
      2: { cellWidth: typeCol * 1.2, halign: 'right' },
      3: { cellWidth: typeCol * 1.2, halign: 'right' },
    },
  );

  const monthCol = CONTENT_W / 4;
  y = await drawDataSection(
    doc,
    y,
    'Evolução mensal',
    ['Mês', 'Faturado', 'Recebido', 'Em dívida'],
    buildFaturacaoAuditMonthlyRows(summary),
    {
      0: { cellWidth: monthCol * 0.7 },
      1: { cellWidth: monthCol * 1.1, halign: 'right' },
      2: { cellWidth: monthCol * 1.1, halign: 'right' },
      3: { cellWidth: monthCol * 1.1, halign: 'right' },
    },
  );

  const detailCols = {
    0: { cellWidth: 19 },
    1: { cellWidth: 16 },
    2: { cellWidth: 34 },
    3: { cellWidth: 20 },
    4: { cellWidth: 19, halign: 'right' },
    5: { cellWidth: 16 },
    6: { cellWidth: 19 },
    7: { cellWidth: 21 },
  };
  await drawDataSection(
    doc,
    y,
    'Registo detalhado',
    ['Data', 'Tipo', 'Cliente', 'Nº Fatura', 'Valor', 'Estado', 'Recebido em', 'Responsável'],
    buildFaturacaoAuditDetailRows(rows),
    detailCols,
  );

  touchPdfContentPage(doc);
  trimTrailingBlankPages(doc);
  drawPageFooter(doc, 'faturacao-audit');

  return {
    blob: doc.output('blob'),
    filename: buildFaturacaoAuditPdfFilename(year),
    pageCount: doc.getNumberOfPages(),
  };
}
