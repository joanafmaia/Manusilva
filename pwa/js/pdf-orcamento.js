/**
 * PDF — Folha de Pedido de Orçamento (anexo RH quando pedido_orcamento = Sim).
 */

import { COMPANY } from './mock_data.js';
import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import { getClient, getTechnician, getJob, getServiceType } from './app.js';
import { formatOpPdfFilenameSuffix } from './pdf-storage.js';
import { ensurePdfFonts, pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE,
  PDF_COLOR_TEXT_DARK,
  PDF_COLOR_TEXT_MUTED,
  PDF_CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_FONT_SUBTITLE,
  PDF_BAR_RADIUS_MM,
  PDF_DOCUMENT_TITLE_BAR_H_MM,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN,
  PDF_PAGE_W,
  PDF_SECTION_GAP_MM,
  PDF_TABLE_LINE_WIDTH,
} from './pdf-design-system.js';
import { loadJsPDF } from './pdf-report.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PDF_SECTION_BG = [237, 242, 247];
const PDF_TABLE_LINE = [203, 213, 225];

function drawOrcamentoTitleBar(doc, y, title) {
  const barH = PDF_DOCUMENT_TITLE_BAR_H_MM;
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, PDF_BAR_RADIUS_MM, PDF_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...PDF_COLOR_CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  return y + barH + PDF_SECTION_GAP_MM;
}

function formatPtDate(raw) {
  const text = String(raw || '').trim();
  if (!text) return '—';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return text;
}

function resolveClientMeta(report) {
  const client = getClient(report?.clientId);
  const values = report?.data?.values || {};
  const nome =
    pdfSafeText(values.nome_empresa || values.cliente || client?.name || client?.Nome) || '—';
  const nif = pdfSafeText(client?.NIF || client?.nif || values.nif) || '—';
  const morada = pdfSafeText(client?.address || client?.Morada || values.morada) || '—';
  const localidade = pdfSafeText(client?.localidade || values.localidade) || '';
  return { nome, nif, morada, localidade };
}

function drawLogo(doc, x, y) {
  const w = PDF_LOGO_WIDTH_MM;
  const h = PDF_LOGO_HEIGHT_MM;
  if (isLogoConfigured()) {
    try {
      doc.addImage(MANUSILVA_LOGO, getPdfLogoFormat(), x, y, w, h, undefined, 'FAST');
      return y + h;
    } catch {
      /* placeholder */
    }
  }
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_CORPORATE_BLUE);
  doc.text('ManuSilva', x, y + 8);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text('Manutenção Industrial', x, y + 13);
  return y + h;
}

function drawClientBox(doc, y, clientMeta, numeroOrdem) {
  const boxX = MARGIN + PDF_LOGO_WIDTH_MM + 8;
  const boxW = PDF_PAGE_W - MARGIN - boxX;
  const op =
    numeroOrdem != null && Number.isFinite(Number(numeroOrdem))
      ? `OP-2026-${String(numeroOrdem).padStart(2, '0')}`
      : null;
  const lines = [
    `Cliente: ${clientMeta.nome}`,
    `NIF: ${clientMeta.nif}`,
    clientMeta.morada,
    clientMeta.localidade,
    op ? `Ordem Nº: ${op}` : null,
  ].filter(Boolean);

  let cursorY = y + 4;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  lines.forEach((line) => {
    const wrapped = pdfSplitText(doc, pdfSafeText(line), boxW - 4);
    wrapped.forEach((row) => {
      doc.text(row, boxX, cursorY);
      cursorY += 4.2;
    });
  });
  return Math.max(y + PDF_LOGO_HEIGHT_MM, cursorY + 2);
}

function drawMetaRow(doc, y, pairs) {
  const colW = CONTENT_W / 2;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  let rowY = y;
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i];
    const right = pairs[i + 1];
    if (left) {
      pdfSetFont(doc, 'bold');
      doc.text(`${left.label}:`, MARGIN, rowY);
      pdfSetFont(doc, 'normal');
      doc.text(pdfSafeText(left.value) || '—', MARGIN + 28, rowY);
    }
    if (right) {
      pdfSetFont(doc, 'bold');
      doc.text(`${right.label}:`, MARGIN + colW, rowY);
      pdfSetFont(doc, 'normal');
      doc.text(pdfSafeText(right.value) || '—', MARGIN + colW + 28, rowY);
    }
    rowY += 5.5;
  }
  return rowY + PDF_SECTION_GAP_MM;
}

function drawTextBox(doc, y, title, text) {
  const body = pdfSafeText(text) || '—';
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_CORPORATE_BLUE);
  doc.text(title, MARGIN, y);
  y += 5;

  const boxH = Math.max(22, pdfSplitText(doc, body, CONTENT_W - 8).length * 4.5 + 8);
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, 'FD');

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  const lines = pdfSplitText(doc, body, CONTENT_W - 8);
  let lineY = y + 6;
  lines.forEach((line) => {
    doc.text(line, MARGIN + 4, lineY);
    lineY += 4.5;
  });

  return y + boxH + PDF_SECTION_GAP_MM;
}

/**
 * @param {object} report
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function renderOrcamentoPDF(report) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);
  pdfSetFont(doc, 'normal');

  const job = report?.jobId ? getJob(report.jobId) : null;
  const tech = getTechnician(report?.technicianId);
  const service = getServiceType(report?.serviceType);
  const values = report?.data?.values || {};
  const clientMeta = resolveClientMeta(report);

  let y = MARGIN;
  const headerBottom = drawClientBox(doc, y, clientMeta, job?.numeroOrdem ?? null);
  drawLogo(doc, MARGIN, y);
  y = headerBottom + 2;

  y = drawOrcamentoTitleBar(doc, y, 'PEDIDO DE ORÇAMENTO');

  const dataRef =
    formatPtDate(values.data_de_conclusao) !== '—'
      ? formatPtDate(values.data_de_conclusao)
      : formatPtDate(report?.submittedAt);

  y = drawMetaRow(doc, y, [
    { label: 'Data', value: dataRef },
    { label: 'Técnico', value: tech?.name || values.tecnico },
    { label: 'Serviço', value: service?.label || report?.serviceType },
    { label: 'Pedido', value: 'Sim' },
  ]);

  const machineBits = [
    values.marca ? `Marca: ${values.marca}` : null,
    values.modelo ? `Modelo: ${values.modelo}` : null,
    values.numero_de_serie || report?.forkliftSerial
      ? `N.º Série: ${values.numero_de_serie || report?.forkliftSerial}`
      : null,
    values.n_interno ? `N.º Interno: ${values.n_interno}` : null,
  ].filter(Boolean);

  if (machineBits.length) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_SECTION);
    doc.setTextColor(...PDF_COLOR_CORPORATE_BLUE);
    doc.text('Equipamento', MARGIN, y);
    y += 5;
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    machineBits.forEach((bit) => {
      doc.text(pdfSafeText(bit), MARGIN, y);
      y += 5;
    });
    y += PDF_SECTION_GAP_MM;
  }

  y = drawTextBox(doc, y, 'O que é necessário', values.detalhe_pedido_orcamento);

  const obs = String(values.observacoes || '').trim();
  if (obs) {
    y = drawTextBox(doc, y, 'Observações do relatório', obs);
  }

  pdfSetFont(doc, 'italic');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  const note = pdfSplitText(
    doc,
    'Documento gerado automaticamente a partir do relatório técnico submetido. A administração (RH) deve preparar e enviar o orçamento ao cliente.',
    CONTENT_W,
  );
  let noteY = Math.min(y + 4, 275);
  note.forEach((line) => {
    doc.text(line, MARGIN, noteY);
    noteY += 4;
  });

  pdfSetFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(COMPANY.address || '', MARGIN, 287);

  return doc;
}

export function buildOrcamentoPdfFilename(report, job = null) {
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const op = formatOpPdfFilenameSuffix(resolvedJob?.numeroOrdem);
  if (op) return `Pedido_Orcamento_${op}.pdf`;
  const stamp = String(report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  return `Pedido_Orcamento_${stamp}.pdf`;
}
