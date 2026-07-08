/**
 * PDF — Folha de Obra (oficina / armazém).
 */

import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import { getClient } from './entity-lookups.js';
import { formatFolhaResponsabilidadeLabel } from './folha-obra-orcamento.js';
import { formatFolhaObraOrdemLabel } from './folhas-obra-db.js';
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
  PDF_SECTION_BG,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
} from './pdf-design-system.js';
import { formatFolhaInterventionDate, pdfDisplayValue } from './pdf-format-utils.js';
import { drawCompactClientBox } from './pdf-header-blocks.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { drawFolhaDocumentFooters } from './pdf-institutional-footer.js';
import { loadJsPDF, loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
import { touchPdfContentPage } from './pdf-page-layout.js';

const SECTION_GAP = 3.2;
const TABLE_FONT = 8.5;
const HEAD_FONT = 9.5;
export const FOLHA_OBRA_DOC_REF = 'MS.056.1';
const FOLHA_OBRA_DOC_REF_Y = 293.5;

/** Referência FO-n + M.S/R.C no cabeçalho do PDF. */
export function formatFolhaObraPdfOrdemRef(folha) {
  const ordem = formatFolhaObraOrdemLabel(folha);
  if (ordem === '—' || ordem === 'Folha de obra') return ordem;
  return `${ordem} · ${formatFolhaResponsabilidadeLabel(folha?.responsabilidade)}`;
}

function drawFolhaObraDocumentRef(doc) {
  pdfSetFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(FOLHA_OBRA_DOC_REF, MARGIN, FOLHA_OBRA_DOC_REF_Y);
}

function stampFolhaObraDocumentRefAllPages(doc) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawFolhaObraDocumentRef(doc);
  }
}

function resolveClientMetaForPdf(clientId) {
  const client = getClient(clientId);
  const nome = client?.Nome || client?.name || client?.nome || '—';
  const morada = client?.Morada || client?.morada || client?.address || '';
  const localidade = [client?.CodigoPostal, client?.Localidade].filter(Boolean).join(' ');
  return {
    nome,
    addressLine: morada || '—',
    addressSubline: localidade || '',
  };
}

function tableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: TABLE_FONT,
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
      fontSize: HEAD_FONT,
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
      fontSize: TABLE_FONT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
    },
  };
}

async function drawSectionTable(doc, y, title, head, body, columnStyles) {
  y = await drawPdfSectionTitleBar(doc, y, title, {
    bandH: 6,
    gapAfter: 1.2,
    fontSize: HEAD_FONT,
  });
  const pack = tableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: head?.length ? [head] : undefined,
    body,
    columnStyles,
    gapAfter: SECTION_GAP,
    ...pack,
  });
}

function drawHeader(doc, folha, clientMeta) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;

  if (isLogoConfigured()) {
    try {
      doc.addImage(MANUSILVA_LOGO, getPdfLogoFormat(), MARGIN, topY, logoW, logoH);
    } catch {
      /* ignore */
    }
  }

  const clientBoxH = drawCompactClientBox(doc, topY, clientMeta, null);
  const headerH = Math.max(logoH, clientBoxH);

  let y = topY + headerH + 4;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(formatFolhaObraPdfOrdemRef(folha), MARGIN, y);
  y += 4;

  return drawPdfDocumentTitleBar(doc, y, 'FOLHA DE OBRA', SECTION_GAP);
}

export function buildFolhaObraPdfFilename(folha) {
  const ordem = formatFolhaObraOrdemLabel(folha).replace(/\s+/g, '-');
  const marca = String(folha?.marcaModelo || 'equipamento')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return `Manusilva-${ordem}-${marca}.pdf`;
}

/**
 * @param {object} folha — entidade folha de obra (cache ou rascunho)
 * @returns {Promise<{ blob: Blob, blobUrl: string, filename: string, pageCount: number }>}
 */
export async function generateFolhaObraPDFBlob(folha) {
  if (!folha?.clientId) {
    throw new Error('Selecione o cliente antes de gerar o PDF.');
  }

  await loadJsPdfAutoTable();
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);
  doc.__manusilvaLastContentPage = 1;

  const clientMeta = resolveClientMetaForPdf(folha.clientId);
  let y = drawHeader(doc, folha, clientMeta);

  const equipCol = CONTENT_W / 3;
  y = await drawSectionTable(
    doc,
    y,
    'Equipamento recebido',
    ['Tipo', 'Marca / Modelo', 'N.º Série'],
    [[pdfDisplayValue(folha.tipo), pdfDisplayValue(folha.marcaModelo), pdfDisplayValue(folha.numeroSerie)]],
    {
      0: { cellWidth: equipCol },
      1: { cellWidth: equipCol },
      2: { cellWidth: equipCol },
    },
  );

  y = await drawPdfGridTable(doc, y, {
    body: [
      [
        `ETQ: ${pdfDisplayValue(folha.etq)}`,
        `Data de entrada: ${formatFolhaInterventionDate(folha.dataRececao)}`,
        `Estado: ${pdfDisplayValue(folha.estado)}`,
      ],
    ],
    columnStyles: {
      0: { cellWidth: equipCol },
      1: { cellWidth: equipCol },
      2: { cellWidth: equipCol },
    },
    gapAfter: SECTION_GAP,
    ...tableStylePack(doc),
  });

  const diagnostico = pdfDisplayValue(folha.diagnosticoTecnico);
  if (diagnostico && diagnostico !== '—') {
    y = await drawPdfSectionTitleBar(doc, y, 'Diagnóstico técnico', {
      bandH: 6,
      gapAfter: 1.2,
      fontSize: HEAD_FONT,
    });
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    const diagLines = doc.splitTextToSize(pdfSafeText(diagnostico), CONTENT_W - 4);
    doc.text(diagLines, MARGIN + 2, y + 4);
    touchPdfContentPage(doc);
    y += diagLines.length * 4 + SECTION_GAP;
  }

  const intervencoes = Array.isArray(folha.intervencoes) ? folha.intervencoes : [];
  const interBody =
    intervencoes.length > 0
      ? intervencoes.map((row) => [
          formatFolhaInterventionDate(row.data_intervencao),
          pdfDisplayValue(row.material_servico),
          pdfDisplayValue(row.quantidade),
          pdfDisplayValue(row.horas),
          pdfDisplayValue(row.realizado_por),
        ])
      : [['—', '—', '—', '—', '—']];

  const iw = CONTENT_W / 5;
  y = await drawSectionTable(
    doc,
    y,
    'Intervenções',
    ['Data', 'Material / Serviço', 'Qtd.', 'Horas', 'Realizado por'],
    interBody,
    {
      0: { cellWidth: iw * 0.9 },
      1: { cellWidth: iw * 1.6 },
      2: { cellWidth: iw * 0.7 },
      3: { cellWidth: iw * 0.7 },
      4: { cellWidth: iw * 1.1 },
    },
  );

  const half = CONTENT_W / 2;
  y = await drawSectionTable(
    doc,
    y,
    'Conclusão',
    null,
    [
      [
        `Máquina concluída a: ${formatFolhaInterventionDate(folha.maquinaConcluidaEm)}`,
        `Responsável: ${pdfDisplayValue(folha.responsavel)}`,
      ],
    ],
    {
      0: { cellWidth: half },
      1: { cellWidth: half },
    },
  );

  const obs = pdfDisplayValue(folha.observacoes);
  if (obs && obs !== '—') {
    y = await drawPdfSectionTitleBar(doc, y, 'Observações', {
      bandH: 6,
      gapAfter: 1.2,
      fontSize: HEAD_FONT,
    });
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    const lines = doc.splitTextToSize(pdfSafeText(obs), CONTENT_W - 4);
    doc.text(lines, MARGIN + 2, y + 4);
    touchPdfContentPage(doc);
    y += lines.length * 4 + SECTION_GAP;
  }

  drawFolhaDocumentFooters(doc);
  stampFolhaObraDocumentRefAllPages(doc);

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const filename = buildFolhaObraPdfFilename(folha);
  return { blob, blobUrl, filename, pageCount: doc.getNumberOfPages() };
}
