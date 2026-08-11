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
  buildReportCompactTableStylePack,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_FONT_TABLE,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_SECTION_GAP_MM,
} from './pdf-design-system.js';
import { formatFolhaInterventionDate, pdfDisplayValue } from './pdf-format-utils.js';
import { drawCompactClientBox } from './pdf-header-blocks.js';
import { drawPdfDocumentTitleBar, drawPdfSectionTitleBar } from './pdf-layout-bars.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import { drawFolhaDocumentFooters } from './pdf-institutional-footer.js';
import { loadJsPDF, loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
import { touchPdfContentPage } from './pdf-page-layout.js';

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
  return buildReportCompactTableStylePack(doc, pdfAutoTableFont, {
    headFontSize: PDF_FONT_SECTION,
  });
}

async function drawSectionTable(doc, y, title, head, body, columnStyles) {
  y = await drawPdfSectionTitleBar(doc, y, title);
  const pack = tableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: head?.length ? [head] : undefined,
    body,
    columnStyles,
    gapAfter: PDF_SECTION_GAP_MM,
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

  return drawPdfDocumentTitleBar(doc, y, 'FOLHA DE OBRA', PDF_SECTION_GAP_MM);
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
    gapAfter: PDF_SECTION_GAP_MM,
    ...tableStylePack(doc),
  });

  const diagnostico = pdfDisplayValue(folha.diagnosticoTecnico);
  if (diagnostico && diagnostico !== '—') {
    y = await drawPdfSectionTitleBar(doc, y, 'Diagnóstico técnico');
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    const diagLines = doc.splitTextToSize(pdfSafeText(diagnostico), CONTENT_W - 4);
    doc.text(diagLines, MARGIN + 2, y + 4);
    touchPdfContentPage(doc);
    y += diagLines.length * 4 + PDF_SECTION_GAP_MM;
  }

  const intervencoes = Array.isArray(folha.intervencoes) ? folha.intervencoes : [];
  const interBody =
    intervencoes.length > 0
      ? intervencoes.map((row) => [
          formatFolhaInterventionDate(row.data_intervencao),
          pdfDisplayValue(row.material_servico),
          pdfDisplayValue(row.quantidade),
          pdfDisplayValue(row.horas),
        ])
      : [['—', '—', '—', '—']];

  const iw = CONTENT_W / 4;
  y = await drawSectionTable(
    doc,
    y,
    'Consumíveis',
    ['Data da Intervenção', 'Material/Serviço Colocado', 'Quantidade', 'Horas'],
    interBody,
    {
      0: { cellWidth: iw * 0.95 },
      1: { cellWidth: iw * 1.35 },
      2: { cellWidth: iw * 0.85 },
      3: { cellWidth: iw * 0.85 },
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
    y = await drawPdfSectionTitleBar(doc, y, 'Observações');
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    const lines = doc.splitTextToSize(pdfSafeText(obs), CONTENT_W - 4);
    doc.text(lines, MARGIN + 2, y + 4);
    touchPdfContentPage(doc);
    y += lines.length * 4 + PDF_SECTION_GAP_MM;
  }

  drawFolhaDocumentFooters(doc);
  stampFolhaObraDocumentRefAllPages(doc);

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const filename = buildFolhaObraPdfFilename(folha);
  return { blob, blobUrl, filename, pageCount: doc.getNumberOfPages() };
}
