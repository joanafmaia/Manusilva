/**
 * PDF — Proposta Comercial MS.015
 * Folha 1: proposta + encerramento Manusilva + caixa de aprovação do cliente
 * Folha 2: Garantia de Reparação, Prazo de reparação e Condições Gerais (fixo)
 */

import { COMPANY } from './mock_data.js';
import { getJob } from './app.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import MANUSILVA_LOGO from './logo_data.js';
import { buildOrcamentoFillData } from './orcamento-fill-data.js';
import {
  computeLinhaTotal,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';
import { ensurePdfFonts, pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';
import {
  PDF_BAR_RADIUS_MM,
  PDF_COLOR_CORPORATE_BLUE,
  PDF_COLOR_SLATE_LINE,
  PDF_COLOR_TEXT_DARK,
  PDF_COLOR_TEXT_MUTED,
  PDF_COLOR_WHITE,
  PDF_CONTENT_W,
  PDF_DOCUMENT_TITLE_BAR_H_MM,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_FONT_SUBTITLE,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN,
  PDF_PAGE_W,
  PDF_SECTION_BG,
  PDF_SECTION_GAP_MM,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
} from './pdf-design-system.js';
import { loadJsPDF } from './pdf-report.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PAGE_BOTTOM = 287;
/** Espaço reservado no fundo da folha 1 para a caixa de aprovação do cliente. */
const APPROVAL_BOX_H = 50;
const APPROVAL_TOP = PAGE_BOTTOM - APPROVAL_BOX_H - 6;
const CLOSING_TOP = APPROVAL_TOP - 24;
const BODY_MAX_Y = CLOSING_TOP - 8;

let legalTextCache = null;

async function loadLegalText() {
  if (legalTextCache) return legalTextCache;
  try {
    const res = await fetch('assets/orcamento-ms015-legal.txt', { cache: 'force-cache' });
    if (res.ok) {
      legalTextCache = await res.text();
      return legalTextCache;
    }
  } catch {
    /* fallback */
  }
  legalTextCache = '';
  return legalTextCache;
}

/** Impede sobreposição do corpo com encerramento e caixa de aprovação. */
function canDrawBodyLine(y, step = 5) {
  return y + step <= BODY_MAX_Y;
}

function advanceBodyY(y, step = 5) {
  return canDrawBodyLine(y, step) ? y + step : y;
}

function drawLogoPlaceholder(doc, x, y, widthMm, heightMm = widthMm) {
  doc.setDrawColor(...PDF_COLOR_SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x, y, widthMm, heightMm, 2, 2, 'FD');
  doc.setFillColor(...PDF_COLOR_CORPORATE_BLUE);
  doc.roundedRect(x + 1.5, y + 1.5, widthMm - 3, heightMm - 3, 1.5, 1.5, 'F');
  doc.setTextColor(...PDF_COLOR_WHITE);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(Math.min(18, 8 + widthMm * 0.22));
  doc.text(COMPANY.logo || 'MS', x + widthMm / 2, y + heightMm / 2 + 1.5, { align: 'center' });
}

/** Cabeçalho institucional — logo e dados da empresa (como nos relatórios). */
function drawOrcamentoHeader(doc, fill) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;
  const rightX = MARGIN + logoW + 6;
  const rightW = PDF_PAGE_W - MARGIN - rightX;

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

  let infoY = topY + 3.5;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  pdfSplitText(doc, COMPANY.name, rightW).forEach((line) => {
    doc.text(line, rightX, infoY);
    infoY += 3.8;
  });
  pdfSetFont(doc, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  if (COMPANY.address) {
    pdfSplitText(doc, COMPANY.address, rightW).forEach((line) => {
      doc.text(line, rightX, infoY);
      infoY += 3.4;
    });
  }
  const contactLines = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean);
  contactLines.forEach((line) => {
    doc.text(line, rightX, infoY);
    infoY += 3.4;
  });

  let y = Math.max(topY + logoH, infoY) + PDF_SECTION_GAP_MM;

  const barH = PDF_DOCUMENT_TITLE_BAR_H_MM;
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, PDF_BAR_RADIUS_MM, PDF_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...PDF_COLOR_CORPORATE_BLUE);
  doc.text('PROPOSTA COMERCIAL', MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  y += barH + 3;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text(`Orçamento nº ${pdfSafeText(fill.orcamento_numero)}`, MARGIN, y);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(pdfSafeText(fill.data_extenso), MARGIN + CONTENT_W, y, { align: 'right' });
  y += 6;

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  return y + PDF_SECTION_GAP_MM + 2;
}

function drawOrcamentoTable(doc, linhas, startY) {
  const rows = normalizeOrcamentoLinhas(linhas).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  const dataRows = rows.length ? rows : [{ descricao: '—', qtd: '1', precoUnit: '', total: '' }];

  const colX = [MARGIN, MARGIN + 98, MARGIN + 112, MARGIN + 148, MARGIN + CONTENT_W];
  const rowH = 6.5;
  let y = startY;

  const drawRow = (cells, { bold = false, fill = false } = {}) => {
    if (!canDrawBodyLine(y, rowH + 2)) return y;
    if (fill) {
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y - 4.2, CONTENT_W, rowH, 'F');
    }
    pdfSetFont(doc, bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    doc.text(pdfSafeText(cells[0]), colX[0] + 1, y);
    doc.text(pdfSafeText(cells[1]), colX[2] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[2]), colX[3] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[3]), colX[4] - 1, y, { align: 'right' });
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5);
    return y + rowH;
  };

  y = drawRow(['Descrição / Artigo', 'Qtd.', 'Preço Unit.', 'Total'], { bold: true, fill: true });
  dataRows.forEach((row) => {
    const total =
      row.total ||
      (computeLinhaTotal(row) > 0 ? formatEuro(computeLinhaTotal(row)) : '');
    y = drawRow([
      row.descricao || '—',
      row.qtd || '1',
      row.precoUnit ? formatEuro(row.precoUnit) : '',
      total,
    ]);
  });
  return y + 4;
}

function drawCompanyClosing(doc) {
  const y = CLOSING_TOP;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('De V. Exas.', MARGIN, y);
  doc.text('Atentamente', MARGIN, y + 5.5);
  pdfSetFont(doc, 'bold');
  doc.text('MANUSILVA,LDA', MARGIN, y + 11);
}

/** Caixa no fundo da folha 1 para impressão, assinatura e carimbo do cliente. */
function drawClientApprovalBox(doc) {
  const boxY = APPROVAL_TOP;
  const boxX = MARGIN;
  const boxW = CONTENT_W;
  const pad = 4;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.45);
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, APPROVAL_BOX_H, 'FD');

  let ty = boxY + 7;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('Aprovação', boxX + pad, ty);

  ty += 8;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(9);
  pdfSplitText(
    doc,
    'Declaro que aceito o presente orçamento e valores apresentados',
    boxW - pad * 2,
  ).forEach((line) => {
    doc.text(line, boxX + pad, ty);
    ty += 4.5;
  });

  ty = boxY + APPROVAL_BOX_H - 8;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text('Assinatura e carimbo do cliente', boxX + pad, ty);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  return boxY + APPROVAL_BOX_H;
}

function normalizeLegalParagraphs(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n');
  text = text.replace(/\s+([IVX]+)\s*[-–]\s*/g, '\n\n$1 – ');
  text = text.replace(/([a-záéíóúãõç])([A-ZÁÉÍÓÚ])/g, '$1 $2');
  text = text.replace(/([.;])([a-e]\))/g, '$1\n$2');
  text = text.replace(/([a-e]\))\s*/g, '$1 ');
  return text
    .split(/\n+/)
    .map((para) => para.trim())
    .filter(Boolean);
}

function drawLegalPage(doc, legalText) {
  doc.addPage();
  let y = MARGIN + 4;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  normalizeLegalParagraphs(legalText).forEach((para) => {
    const text = para.trim();
    if (!text) return;

    const isSectionTitle =
      /^CONDIÇÕES GERAIS/i.test(text) ||
      /^Garantia de Reparação/i.test(text) ||
      /^Prazo de reparação/i.test(text) ||
      /^[IVX]+ –/.test(text);

    if (isSectionTitle) {
      y += 2;
      pdfSetFont(doc, 'bold');
      doc.setFontSize(PDF_FONT_CAPTION + 0.5);
    }

    pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
      if (y > PAGE_BOTTOM - 10) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += 3.6;
    });

    if (isSectionTitle) {
      pdfSetFont(doc, 'normal');
      doc.setFontSize(PDF_FONT_CAPTION);
    }
    y += 1.2;
  });

  pdfSetFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(COMPANY.address || '', MARGIN, PAGE_BOTTOM);
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
  const fill = buildOrcamentoFillData(report, job);
  const legalText = await loadLegalText();

  let y = drawOrcamentoHeader(doc, fill);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('PARA:', MARGIN, y);
  y += 6;
  doc.text(pdfSafeText(fill.cliente_nome), MARGIN + 12, y);
  y += 6;
  doc.text(`A/C. ${pdfSafeText(fill.cliente_ac)}`, MARGIN, y);
  y += 12;

  const intro = `Vimos por este meio enviar o orçamento para ${fill.intro_servico}`;
  pdfSplitText(doc, intro, CONTENT_W).forEach((line) => {
    if (!canDrawBodyLine(y)) return;
    doc.text(line, MARGIN, y);
    y = advanceBodyY(y);
  });
  y = advanceBodyY(y, 4);

  if (canDrawBodyLine(y, 28)) {
    pdfSetFont(doc, 'bold');
    doc.text(`Máquina – ${pdfSafeText(fill.maquina)}`, MARGIN, y);
    y = advanceBodyY(y, 6);
    pdfSetFont(doc, 'normal');
    doc.text(`Matrícula: ${pdfSafeText(fill.matricula)}`, MARGIN, y);
    y = advanceBodyY(y, 6);
    pdfSetFont(doc, 'bold');
    doc.text('Na reparação precisa:', MARGIN, y);
    y = advanceBodyY(y, 6);
    pdfSetFont(doc, 'normal');
    pdfSplitText(doc, pdfSafeText(fill.reparacao_necessaria), CONTENT_W).forEach((line) => {
      if (!canDrawBodyLine(y)) return;
      doc.text(line, MARGIN, y);
      y = advanceBodyY(y, 4.5);
    });
    y = advanceBodyY(y, 6);
  }

  y = drawOrcamentoTable(doc, fill.linhas, y);

  const terms = [
    `Taxa de Saída – ${fill.taxa_saida === '—' ? '_______' : fill.taxa_saida} €`,
    `Prazo de Entrega: ${fill.prazo_entrega === '—' ? '_______________' : fill.prazo_entrega}`,
    `Forma de Pagamento: ${fill.forma_pagamento}`,
    `Validade do orçamento – ${fill.validade_orcamento}`,
    `Subtotal (s/ IVA): ${fill.subtotal} €`,
    `IVA (23%): ${fill.iva} €`,
    `Total: ${fill.total_geral} €`,
    'A estes valores acresce o valor do Iva.',
  ];
  terms.forEach((line) => {
    if (!canDrawBodyLine(y)) return;
    doc.text(line, MARGIN, y);
    y = advanceBodyY(y, 5);
  });

  doc.setPage(1);

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, CLOSING_TOP - 5, MARGIN + CONTENT_W, CLOSING_TOP - 5);

  drawCompanyClosing(doc);
  drawClientApprovalBox(doc);

  if (legalText) {
    drawLegalPage(doc, legalText);
  }

  return doc;
}

export function buildOrcamentoPdfFilename(report, job = null) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.numeroSequencial && meta?.ano) {
    return `MS015_Orcamento_${meta.numeroSequencial}-0_${meta.ano}.pdf`;
  }
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const op = resolvedJob?.numeroOrdem;
  if (op != null && Number.isFinite(Number(op))) {
    return `MS015_Orcamento_OP${op}.pdf`;
  }
  const stamp = String(report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  return `MS015_Orcamento_${stamp}.pdf`;
}
