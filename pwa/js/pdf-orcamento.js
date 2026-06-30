/**
 * PDF — Proposta Comercial MS.015
 * Folha 1: proposta + caixa de aprovação (cliente à esq., encerramento Manusilva à dir.)
 * Folha 2: Garantia de Reparação, Prazo de reparação e Condições Gerais (fixo)
 */

import { COMPANY } from './mock_data.js';
import { getJob } from './app.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import MANUSILVA_LOGO from './logo_data.js';
import { buildOrcamentoFillData } from './orcamento-fill-data.js';
import {
  formatOrcamentoMaquinaPdfTableLabel,
  formatOrcamentoMaquinaCompactLine,
  formatOrcamentoMaquinaLabel,
  formatOrcamentoMaquinaMatricula,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquina,
} from './orcamento-maquinas.js';
import {
  computeLinhaTotal,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_MAQUINA,
  LABEL_MATRICULA,
} from './field-labels.js';
import { ensurePdfFonts, pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';
import {
  PDF_COLOR_CORPORATE_BLUE,
  PDF_COLOR_SLATE_LINE,
  PDF_COLOR_TEXT_DARK,
  PDF_COLOR_TEXT_MUTED,
  PDF_COLOR_WHITE,
  PDF_CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN,
  PDF_PAGE_W,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
} from './pdf-design-system.js';
import { loadJsPDF } from './pdf-report.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PAGE_W = PDF_PAGE_W;
const PAGE_BOTTOM = 287;
/** Espaço reservado no fundo da folha 1 para a caixa de aprovação do cliente. */
const APPROVAL_BOX_H = 52;
const APPROVAL_TOP = PAGE_BOTTOM - APPROVAL_BOX_H - 6;
/** Zona fixa para taxa, prazo e totais — o total nunca fica cortado. */
const FOOTER_BLOCK_H = 40;
const FOOTER_TOP = APPROVAL_TOP - FOOTER_BLOCK_H;
const CONTENT_MAX_Y = FOOTER_TOP - 6;

let legalTextCache = null;

function canDrawContentLine(y, step = 5) {
  return y + step <= CONTENT_MAX_Y;
}

function advanceContentY(y, step = 5) {
  return canDrawContentLine(y, step) ? y + step : y;
}

/** @deprecated usar canDrawContentLine para o corpo da folha 1 */
function canDrawBodyLine(y, step = 5) {
  return canDrawContentLine(y, step);
}

function advanceBodyY(y, step = 5) {
  return advanceContentY(y, step);
}

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

/** Cabeçalho estilo carta MS.015 — logo à esquerda, título e destinatário à direita. */
function drawOrcamentoLetterhead(doc, fill) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM + 6;
  const logoH = PDF_LOGO_HEIGHT_MM + 4;
  const rightColX = MARGIN + CONTENT_W * 0.38;
  const rightColW = PAGE_W - MARGIN - rightColX;
  const rightCenterX = rightColX + rightColW / 2;

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

  let ty = topY + 8;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('PROPOSTA COMERCIAL', rightCenterX, ty, { align: 'center' });
  ty += 6;
  doc.text('ORÇAMENTOS', rightCenterX, ty, { align: 'center' });
  ty += 11;

  const clienteLabel = pdfSafeText(fill.cliente_nome).toUpperCase();
  const acLabel = pdfSafeText(fill.cliente_ac).toUpperCase();
  doc.setFontSize(10);
  doc.text(`PARA: ${clienteLabel}`, rightColX, ty);
  ty += 5.5;
  doc.text(`A/C. ${acLabel}`, rightColX, ty);

  const headerBottom = Math.max(topY + logoH, ty + 2) + 6;
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, headerBottom, MARGIN + CONTENT_W, headerBottom);

  let y = headerBottom + 9;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text(`Orçamento nº ${pdfSafeText(fill.orcamento_numero)}`, MARGIN, y);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(pdfSafeText(fill.data_extenso), MARGIN + CONTENT_W, y, { align: 'right' });
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  return y + 9;
}

function drawOrcamentoTable(doc, linhas, startY, { maquinas = [] } = {}) {
  const multi = Array.isArray(maquinas) && maquinas.length > 1;
  const rows = normalizeOrcamentoLinhas(linhas, { machineCount: maquinas.length || 1 }).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  const dataRows = rows.length ? rows : [{ descricao: '—', qtd: '1', precoUnit: '', total: '' }];

  const colX = multi
    ? [MARGIN, MARGIN + 26, MARGIN + 94, MARGIN + 108, MARGIN + 144, MARGIN + CONTENT_W]
    : [MARGIN, MARGIN + 98, MARGIN + 112, MARGIN + 148, MARGIN + CONTENT_W];
  const rowH = 6.5;
  let y = startY;

  const drawRow = (cells, { bold = false, fill = false, multiRow = multi } = {}) => {
    if (!canDrawBodyLine(y, rowH + 2)) return y;
    if (fill) {
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y - 4.2, CONTENT_W, rowH, 'F');
    }
    pdfSetFont(doc, bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    if (multiRow) {
      doc.text(pdfSafeText(cells[0]), colX[0] + 1, y);
      doc.text(pdfSafeText(cells[1]), colX[1] + 1, y);
      doc.text(pdfSafeText(cells[2]), colX[3] - 2, y, { align: 'right' });
      doc.text(pdfSafeText(cells[3]), colX[4] - 2, y, { align: 'right' });
      doc.text(pdfSafeText(cells[4]), colX[5] - 1, y, { align: 'right' });
    } else {
      doc.text(pdfSafeText(cells[0]), colX[0] + 1, y);
      doc.text(pdfSafeText(cells[1]), colX[2] - 2, y, { align: 'right' });
      doc.text(pdfSafeText(cells[2]), colX[3] - 2, y, { align: 'right' });
      doc.text(pdfSafeText(cells[3]), colX[4] - 1, y, { align: 'right' });
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5);
    return y + rowH;
  };

  if (multi) {
    y = drawRow(['Equip.', 'Na reparação precisa', 'Qtd.', 'Preço Unit.', 'Total'], {
      bold: true,
      fill: true,
      multiRow: true,
    });
  } else {
    y = drawRow(['Na reparação precisa', 'Qtd.', 'Preço Unit.', 'Total'], { bold: true, fill: true });
  }

  dataRows.forEach((row) => {
    const total =
      row.total ||
      (computeLinhaTotal(row) > 0 ? formatEuro(computeLinhaTotal(row)) : '');
    if (multi) {
      const idx = normalizeEquipamentoIndex(row.equipamentoIndex, maquinas.length);
      y = drawRow(
        [
          formatOrcamentoMaquinaPdfTableLabel(idx),
          row.descricao || '—',
          row.qtd || '1',
          row.precoUnit ? formatEuro(row.precoUnit) : '',
          total,
        ],
        { multiRow: true },
      );
    } else {
      y = drawRow([
        row.descricao || '—',
        row.qtd || '1',
        row.precoUnit ? formatEuro(row.precoUnit) : '',
        total,
      ]);
    }
  });
  return y + 4;
}

function drawLabelValueLine(doc, y, label, value) {
  if (!canDrawBodyLine(y)) return y;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text(label, MARGIN, y);
  const labelW = doc.getTextWidth(label);
  pdfSetFont(doc, 'normal');
  doc.text(pdfSafeText(value), MARGIN + labelW, y);
  return advanceBodyY(y, 5);
}

/** Caixa no fundo da folha 1 — aprovação do cliente (esq.) e encerramento Manusilva (inf. dir.). */
function drawClientApprovalBox(doc) {
  const boxY = APPROVAL_TOP;
  const boxX = MARGIN;
  const boxW = CONTENT_W;
  const pad = 4;
  const rightX = boxX + boxW - pad;
  const leftColW = boxW * 0.58;

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
    leftColW - pad * 2,
  ).forEach((line) => {
    doc.text(line, boxX + pad, ty);
    ty += 4.5;
  });

  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text('Assinatura e carimbo do cliente', boxX + pad, boxY + APPROVAL_BOX_H - 8);

  const closingY = boxY + APPROVAL_BOX_H - 20;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('De V. Exas.', rightX, closingY, { align: 'right' });
  doc.text('Atentamente', rightX, closingY + 5.5, { align: 'right' });
  pdfSetFont(doc, 'bold');
  doc.text('MANUSILVA,LDA', rightX, closingY + 11, { align: 'right' });

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

function drawOrcamentoEquipamentoBlocks(doc, fill, startY) {
  let y = startY;
  const maquinas = (fill.maquinas || []).filter(hasOrcamentoMaquinaData);
  const blocks = maquinas.length
    ? maquinas
    : [
        normalizeOrcamentoMaquina({
          marca: fill.marca,
          modelo: fill.modelo,
          tipo: fill.tipo,
          numeroSerie: fill.numero_serie,
          numeroInterno: fill.numero_interno,
          maquina: fill.maquina,
        }),
      ];

  blocks.forEach((row, index) => {
    const machine = normalizeOrcamentoMaquina(row);
    if (!hasOrcamentoMaquinaData(machine) && fill.maquina === '—') return;

    if (blocks.length > 1) {
      if (!canDrawContentLine(y, 8)) return;
      pdfSetFont(doc, 'bold');
      doc.setFontSize(PDF_FONT_BODY);
      doc.setTextColor(...PDF_COLOR_TEXT_DARK);
      const prefix = `Equipamento ${index + 1}: `;
      doc.text(prefix, MARGIN, y);
      const prefixW = doc.getTextWidth(prefix);
      pdfSetFont(doc, 'normal');
      pdfSplitText(doc, formatOrcamentoMaquinaCompactLine(machine, index), CONTENT_W - prefixW).forEach(
        (line, lineIndex) => {
          if (lineIndex === 0) {
            doc.text(pdfSafeText(line), MARGIN + prefixW, y);
          } else {
            y = advanceContentY(y, 5);
            if (!canDrawContentLine(y)) return;
            doc.text(pdfSafeText(line), MARGIN, y);
          }
        },
      );
      y = advanceContentY(y, 6);
      return;
    }

    const equipRows = [
      [LABEL_MARCA, machine.marca],
      [LABEL_MODELO, machine.modelo],
      [LABEL_TIPO, machine.tipo],
      [LABEL_NUMERO_SERIE, machine.numeroSerie],
      [LABEL_N_INTERNO, machine.numeroInterno],
    ].filter(([, value]) => String(value || '').trim());

    if (!equipRows.length) {
      const label = formatOrcamentoMaquinaLabel(machine, index);
      const matricula = formatOrcamentoMaquinaMatricula(machine);
      equipRows.push([LABEL_MAQUINA, label], [LABEL_MATRICULA, matricula]);
    }

    equipRows.forEach(([label, value]) => {
      if (!canDrawBodyLine(y)) return;
      pdfSetFont(doc, 'bold');
      const prefix = `${label}: `;
      doc.text(prefix, MARGIN, y);
      const prefixW = doc.getTextWidth(prefix);
      pdfSetFont(doc, 'normal');
      doc.text(pdfSafeText(value || '—'), MARGIN + prefixW, y);
      y = advanceBodyY(y, 5.5);
    });

    if (index < blocks.length - 1) y = advanceBodyY(y, 2);
  });

  return advanceBodyY(y, 4);
}

function drawOrcamentoObservacoesCliente(doc, fill, startY) {
  const text = String(fill.observacoes_cliente || '').trim();
  if (!text || text === '—') return startY;
  let y = startY;
  if (!canDrawBodyLine(y, 10)) return y;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('Observações:', MARGIN, y);
  y = advanceBodyY(y, 5);

  pdfSetFont(doc, 'normal');
  pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
    if (!canDrawBodyLine(y)) return;
    doc.text(line, MARGIN, y);
    y = advanceBodyY(y, 4.5);
  });
  return advanceBodyY(y, 3);
}

function drawOrcamentoFooter(doc, fill) {
  let y = FOOTER_TOP + 4;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  const drawLabelValue = (label, value) => {
    pdfSetFont(doc, 'bold');
    const prefix = label;
    doc.text(prefix, MARGIN, y);
    const prefixW = doc.getTextWidth(prefix);
    pdfSetFont(doc, 'normal');
    doc.text(pdfSafeText(value), MARGIN + prefixW, y);
    y += 5;
  };

  drawLabelValue('Taxa de Saída – ', `${fill.taxa_saida === '—' ? '_______' : fill.taxa_saida} €`);
  drawLabelValue(
    'Prazo de Entrega: ',
    fill.prazo_entrega === '—' ? '_______________' : fill.prazo_entrega,
  );
  drawLabelValue('Forma de Pagamento: ', fill.forma_pagamento);
  drawLabelValue('Validade do orçamento – ', fill.validade_orcamento);

  doc.text(`Subtotal (s/ IVA): ${fill.subtotal} €`, MARGIN, y);
  y += 5;
  doc.text(`IVA (23%): ${fill.iva} €`, MARGIN, y);
  y += 5;
  pdfSetFont(doc, 'bold');
  doc.text(`Total: ${fill.total_geral} €`, MARGIN, y);
  pdfSetFont(doc, 'normal');
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

  let y = drawOrcamentoLetterhead(doc, fill);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  const intro = `Vimos por este meio enviar o orçamento para ${fill.intro_servico}`;
  pdfSplitText(doc, intro, CONTENT_W).forEach((line) => {
    if (!canDrawBodyLine(y)) return;
    doc.text(line, MARGIN, y);
    y = advanceBodyY(y);
  });
  y = advanceBodyY(y, 4);

  if (canDrawBodyLine(y, 12)) {
    y = drawOrcamentoEquipamentoBlocks(doc, fill, y);
  }

  y = drawOrcamentoObservacoesCliente(doc, fill, y);

  y = drawOrcamentoTable(doc, fill.linhas, y, { maquinas: fill.maquinas });

  drawOrcamentoFooter(doc, fill);

  doc.setPage(1);
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
