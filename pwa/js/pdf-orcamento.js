/**
 * PDF — Proposta Comercial MS.015 (espelho do modelo Word para pré-visualização RH).
 */

import { COMPANY } from './mock_data.js';
import { getJob } from './app.js';
import { buildOrcamentoFillData } from './orcamento-fill-data.js';
import {
  computeLinhaTotal,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';
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
  PDF_MARGIN,
  PDF_PAGE_W,
  PDF_SECTION_GAP_MM,
} from './pdf-design-system.js';
import { loadJsPDF } from './pdf-report.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PAGE_BOTTOM = 287;

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

function ensurePage(doc, y, need = 12) {
  if (y + need <= PAGE_BOTTOM) return y;
  doc.addPage();
  return MARGIN;
}

function drawLine(doc, y, bold = false) {
  pdfSetFont(doc, bold ? 'bold' : 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  return y + 5;
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
    y = ensurePage(doc, y, rowH + 2);
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

  let y = MARGIN + 8;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('PARA:', MARGIN, y);
  y += 6;
  doc.text(pdfSafeText(fill.cliente_nome), MARGIN + 12, y);
  y += 6;
  doc.text(`A/C. ${pdfSafeText(fill.cliente_ac)}`, MARGIN, y);
  y += 14;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.text(`Orçamento nº ${pdfSafeText(fill.orcamento_numero)}`, MARGIN, y);
  y += 7;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.text(pdfSafeText(fill.data_extenso), MARGIN, y);
  y += 12;

  const intro = `Vimos por este meio enviar o orçamento para ${fill.intro_servico}`;
  pdfSplitText(doc, intro, CONTENT_W).forEach((line) => {
    y = ensurePage(doc, y);
    doc.text(line, MARGIN, y);
    y += 5;
  });
  y += 4;

  y = ensurePage(doc, y, 28);
  pdfSetFont(doc, 'bold');
  doc.text(`Máquina – ${pdfSafeText(fill.maquina)}`, MARGIN, y);
  y += 6;
  pdfSetFont(doc, 'normal');
  doc.text(`Matrícula: ${pdfSafeText(fill.matricula)}`, MARGIN, y);
  y += 6;
  pdfSetFont(doc, 'bold');
  doc.text('Na reparação precisa:', MARGIN, y);
  y += 6;
  pdfSetFont(doc, 'normal');
  pdfSplitText(doc, pdfSafeText(fill.reparacao_necessaria), CONTENT_W).forEach((line) => {
    y = ensurePage(doc, y);
    doc.text(line, MARGIN, y);
    y += 4.8;
  });
  y += 8;

  y = drawOrcamentoTable(doc, fill.linhas, y);

  const terms = [
    `Taxa de Saída – ${fill.taxa_saida === '—' ? '_______' : fill.taxa_saida} €`,
    `Prazo de Entrega: ${fill.prazo_entrega === '—' ? '_______________' : fill.prazo_entrega}`,
    'Forma de Pagamento: Pronto Pagamento',
    'Validade do orçamento – 10 Dias',
    `Subtotal (s/ IVA): ${fill.subtotal} €`,
    `IVA (23%): ${fill.iva} €`,
    `Total: ${fill.total_geral} €`,
    'A estes valores acresce o valor do Iva.',
  ];
  terms.forEach((line) => {
    y = ensurePage(doc, y);
    doc.text(line, MARGIN, y);
    y += 5.5;
  });
  y += 6;

  y = ensurePage(doc, y, 40);
  pdfSetFont(doc, 'bold');
  doc.text('Aprovação', MARGIN, y);
  y += 6;
  pdfSetFont(doc, 'normal');
  doc.text('Declaro que aceito o presente orçamento e valores apresentados', MARGIN, y);
  y += 16;
  doc.text('(Assinatura e Carimbo)', MARGIN, y);
  y += 16;
  doc.text('De V. Exas.', MARGIN, y);
  y += 6;
  doc.text('Atentamente', MARGIN, y);
  y += 6;
  pdfSetFont(doc, 'bold');
  doc.text('MANUSILVA,LDA', MARGIN, y);
  y += 14;

  if (legalText) {
    y = ensurePage(doc, y, 20);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    legalText.split(/\n+/).forEach((para) => {
      const text = para.trim();
      if (!text) {
        y += 2;
        return;
      }
      pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
        y = ensurePage(doc, y);
        doc.text(line, MARGIN, y);
        y += 3.8;
      });
      y += 1.5;
    });
  }

  pdfSetFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(COMPANY.address || '', MARGIN, 287);

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
