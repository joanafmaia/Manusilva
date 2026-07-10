/**
 * PDF — Resumo anual de avaliações dos clientes (auditoria RH).
 */

import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import { COMPANY } from './mock_data.js';
import { ensurePdfFonts, pdfAutoTableFont, pdfSetFont, pdfSafeText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
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
const TABLE_FONT = 8.5;

export function buildAvaliacoesAuditPdfFilename(year) {
  const key = String(year || 'all').trim() === 'all' ? 'todos' : String(year).trim();
  return `Manusilva-Avaliacoes-Clientes-${key}.pdf`;
}

export function buildAvaliacoesAuditKpiRows(summary) {
  const { counts, satisfiedPercent, satisfactionIndex } = summary;
  return [
    ['Total de respostas', String(counts.total)],
    [
      'Clientes satisfeitos',
      counts.total
        ? `${counts.good} (${satisfiedPercent != null ? `${satisfiedPercent}%` : '—'})`
        : '0',
    ],
    ['Avaliação regular', String(counts.mid)],
    ['Clientes insatisfeitos', String(counts.bad)],
    [
      'Índice de satisfação',
      satisfactionIndex != null ? `${satisfactionIndex} / 100` : '—',
    ],
  ];
}

export function buildAvaliacoesAuditDistributionRows(summary) {
  const { distribution, counts } = summary;
  const total = counts.total || 0;
  return distribution.labels.map((label, index) => {
    const qty = distribution.values[index] || 0;
    const pct = total ? `${Math.round((qty / total) * 100)}%` : '—';
    return [label, String(qty), pct];
  });
}

export function buildAvaliacoesAuditMonthlyRows(summary) {
  const { monthly } = summary;
  return monthly.labels.map((month, index) => {
    const good = monthly.datasets[0]?.data[index] || 0;
    const mid = monthly.datasets[1]?.data[index] || 0;
    const bad = monthly.datasets[2]?.data[index] || 0;
    return [month, String(good), String(mid), String(bad), String(good + mid + bad)];
  });
}

export function buildAvaliacoesAuditDetailRows(rows = []) {
  return [...rows]
    .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))
    .map((row) => [
      String(row.criadoEm || '').slice(0, 10) || '—',
      pdfSafeText(row.clientName || '—'),
      pdfSafeText(row.visitSummary || '—'),
      pdfSafeText(row.label || '—'),
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
      ? 'RESUMO DE AVALIAÇÕES DOS CLIENTES'
      : `RESUMO DE AVALIAÇÕES DOS CLIENTES — ${yearLabel}`;

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
 * @returns {Promise<{ blob: Blob, filename: string, pageCount: number }>}
 */
export async function generateAvaliacoesAuditPdfBlob(payload) {
  const summary = payload?.summary;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const year = payload?.year ?? summary?.year ?? 'all';

  if (!summary?.counts?.total) {
    throw new Error('Não há avaliações para exportar neste período.');
  }

  await loadJsPdfAutoTable();
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);
  doc.__manusilvaLastContentPage = 1;

  const yearLabel = String(year) === 'all' ? 'Todos os anos' : String(year);
  const generatedAt = formatGeneratedAtLabel();
  let y = drawAuditHeader(doc, yearLabel, generatedAt);

  y = await drawKeyValueSection(doc, y, 'Indicadores', buildAvaliacoesAuditKpiRows(summary));

  const distCol = CONTENT_W / 3;
  y = await drawDataSection(
    doc,
    y,
    'Distribuição por tipo',
    ['Avaliação', 'Quantidade', '%'],
    buildAvaliacoesAuditDistributionRows(summary),
    {
      0: { cellWidth: distCol },
      1: { cellWidth: distCol * 0.55, halign: 'center' },
      2: { cellWidth: distCol * 0.45, halign: 'center' },
    },
  );

  const monthCol = CONTENT_W / 5;
  y = await drawDataSection(
    doc,
    y,
    'Evolução mensal',
    ['Mês', 'Satisfeito', 'Regular', 'Insatisfeito', 'Total'],
    buildAvaliacoesAuditMonthlyRows(summary),
    {
      0: { cellWidth: monthCol * 0.9 },
      1: { cellWidth: monthCol * 1.05, halign: 'center' },
      2: { cellWidth: monthCol * 1.05, halign: 'center' },
      3: { cellWidth: monthCol * 1.2, halign: 'center' },
      4: { cellWidth: monthCol * 0.8, halign: 'center' },
    },
  );

  const detailCol = {
    0: { cellWidth: 24 },
    1: { cellWidth: 44 },
    2: { cellWidth: CONTENT_W - 24 - 44 - 30 },
    3: { cellWidth: 30 },
  };
  await drawDataSection(
    doc,
    y,
    'Registo detalhado',
    ['Data resposta', 'Cliente', 'Visita', 'Avaliação'],
    buildAvaliacoesAuditDetailRows(rows),
    detailCol,
  );

  touchPdfContentPage(doc);
  trimTrailingBlankPages(doc);
  drawPageFooter(doc, 'avaliacoes-audit');

  const filename = buildAvaliacoesAuditPdfFilename(year);
  const blob = doc.output('blob');
  return {
    blob,
    filename,
    pageCount: doc.getNumberOfPages(),
  };
}
