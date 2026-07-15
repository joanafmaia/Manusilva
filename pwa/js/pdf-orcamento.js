/**
 * PDF — Proposta Comercial MS.015
 * Folha 1: proposta + caixa de aprovação (cliente à esq., encerramento Manusilva à dir.)
 * Folha 2: Garantia de Reparação, Prazo de reparação e Condições Gerais (fixo)
 */

import { COMPANY } from './mock_data.js';
import { getJob } from './app.js';
import { buildOrcamentoFillData } from './orcamento-fill-data.js';
import { resolveOrcamentoTextoIntroForPdf } from './orcamento-cabecalho.js';
import {
  collectMaquinaPdfFieldRows,
  filterOrcamentoPdfGroupLinhas,
  formatOrcamentoMaquinaPdfTableLabel,
  formatOrcamentoMaquinaLabel,
  formatOrcamentoMaquinaMatricula,
  groupOrcamentoLinhasByEquipamento,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquina,
  resolveMaquinaFieldDefs,
  shouldGroupOrcamentoLinhasByEquipamento,
  countOrcamentoGroupedTableRows,
  filterOrcamentoTableLinhas,
} from './orcamento-maquinas.js';
import { normalizeEquipamentoCampos } from './orcamento-equipamento-campos.js';
import {
  computeLinhaTotal,
  formatEuro,
  getReportOrcamentoMeta,
  isPlaceholderOrcamentoNumero,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
  resolveOrcamentoNumeroFormatado,
} from './orcamento-linhas.js';
import {
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
import { stampOrcamentoCertificacaoSelosAllPages } from './pdf-orcamento-certificacao.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import MANUSILVA_LOGO from './logo_data.js';
import {
  MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO,
  MANUTENCAO_BATERIA_INTRO,
  MANUTENCAO_BATERIA_MO_OBS,
  MANUTENCAO_BATERIA_NOTA_PECAS,
  MANUTENCAO_BATERIA_TRABALHOS,
  MANUTENCAO_BATERIA_TRABALHOS_INTRO,
  buildManutencaoBateriaParagrafos,
  MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO,
  MANUTENCAO_MAQUINA_INTRO,
  MANUTENCAO_MAQUINA_PLANO_DETALHE,
  MANUTENCAO_MAQUINA_PLANO_TITULO,
  MANUTENCAO_MAQUINA_TRABALHOS,
  MANUTENCAO_MAQUINA_TRABALHOS_INTRO,
  formatLinhasValorManutencaoBateria,
  formatManutencaoMaquinaPrecoLinhas,
  buildManutencaoMaquinaPrecoEquipBlocks,
  buildManutencaoMaquinaPrecoTable,
  isManutencaoBateriaOrcamento,
  isManutencaoMaquinaOrcamento,
} from './orcamento-templates.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PAGE_W = PDF_PAGE_W;
const PAGE_BOTTOM = 287;
const MS015_DOC_REF = 'MS.015.0';
const MS015_DOC_REF_Y = 293.5;
/** Espaço reservado no fundo da folha 1 para a caixa de aprovação do cliente. */
const APPROVAL_BOX_H = 52;
const APPROVAL_TOP = PAGE_BOTTOM - APPROVAL_BOX_H - 6;
/** Zona fixa para taxa, prazo e totais — o total nunca fica cortado. */
const FOOTER_BLOCK_H = 40;
const FOOTER_TOP = APPROVAL_TOP - FOOTER_BLOCK_H;
/** Zona do corpo da proposta baterias — acima do bloco fixo de valores/pagamento. */
const BATERIA_FOOTER_ANCHOR_Y = FOOTER_TOP - FOOTER_BLOCK_H + 2;
const BATERIA_BODY_MAX_Y = BATERIA_FOOTER_ANCHOR_Y - 6;
/** Manutenção máquinas: rodapé mais alto (3 linhas de preço + prazo/pagamento). */
const MAQUINA_FOOTER_BLOCK_H = 42;
const MAQUINA_FOOTER_ANCHOR_Y = APPROVAL_TOP - MAQUINA_FOOTER_BLOCK_H - 6;
const MAQUINA_BODY_MAX_Y = MAQUINA_FOOTER_ANCHOR_Y - 4;
const MAQUINA_BULLET_LINE_STEP = 3.35;
const MAQUINA_BULLET_MIN_STEP = 3.1;
const MAQUINA_BULLET_COMPACT_FONT = 7.5;
const MAQUINA_FOOTER_GAP_ABOVE = 5;
const MAQUINA_PRECO_FIELD_GAP = 3;
const MAQUINA_PRECO_LINE_TAIL = 0.35;
const MAQUINA_PRECO_TABLE_ROW_H = 4.2;
const MAQUINA_PRECO_TABLE_ROW_H_COMPACT = 4;
const MAQUINA_PRECO_TABLE_HEADER_H = 4.8;
const MAQUINA_PRECO_TABLE_FONT = 8;
const MAQUINA_PRECO_TABLE_COL_MANUT = MARGIN + 108;
const MAQUINA_PRECO_TABLE_COL_DL50 = MARGIN + 148;
const MAQUINA_FOOTER_MONEY_X = MARGIN + CONTENT_W - 1;
const MAQUINA_FOOTER_LINE_MIN = 4.6;
const MAQUINA_FOOTER_LINE_MAX = 6.2;
const MAQUINA_FOOTER_SEPARATOR_GAP = 4;
const PROPOSTA_FOOTER_MAX_Y = APPROVAL_TOP - 6;
const CONTENT_MAX_Y = FOOTER_TOP - 6;

const ORC_TABLE_ROW_H = 6.5;
const ORC_TABLE_GAP_ABOVE_FOOTER = 3;
const ORC_TABLE_COL_X = [MARGIN, MARGIN + 98, MARGIN + 112, MARGIN + 148, MARGIN + CONTENT_W];
const ORC_EQUIP_FIELD_GAP = 5;

/** Perfis de densidade — orçamento genérico numa folha sem páginas extra. */
const ORC_GENERIC_DENSITY = {
  normal: {
    tableRowH: 6.5,
    tableFontSize: 8.5,
    tableCellPad: 4.2,
    equipLineStep: 5,
    equipTail: 3,
    separatorBefore: 3,
    separatorAfter: 7,
    sectionTail: 2,
    introStep: 5,
    introGap: 4,
    obsLineStep: 4.2,
    obsHeadGap: 4,
    obsTitleStep: 5,
  },
  compact: {
    equipLineStep: 4,
    equipTail: 2,
    separatorBefore: 2,
    separatorAfter: 4,
    sectionTail: 1,
    introStep: 4.2,
    introGap: 2,
    obsLineStep: 3.6,
    obsHeadGap: 2.5,
    obsTitleStep: 4,
  },
  tight: {
    equipLineStep: 3.5,
    equipTail: 1.5,
    separatorBefore: 1.5,
    separatorAfter: 3,
    sectionTail: 1,
    introStep: 3.8,
    introGap: 1.5,
    obsLineStep: 3.3,
    obsHeadGap: 2,
    obsTitleStep: 3.5,
  },
};

const ORC_GENERIC_BODY_MAX_Y = FOOTER_TOP - 2;

let legalTextCache = null;

function withNormalTableMetrics(density = {}) {
  const normal = ORC_GENERIC_DENSITY.normal;
  return {
    ...normal,
    ...density,
    tableRowH: normal.tableRowH,
    tableFontSize: normal.tableFontSize,
    tableCellPad: normal.tableCellPad,
  };
}

function getOrcamentoGenericDensityProfile(id = 'normal') {
  return withNormalTableMetrics(ORC_GENERIC_DENSITY[id] || ORC_GENERIC_DENSITY.normal);
}

function measureOrcamentoIntroHeight(doc, intro, startY, density = ORC_GENERIC_DENSITY.normal) {
  let y = startY;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  pdfSplitText(doc, intro, CONTENT_W).forEach(() => {
    y += density.introStep;
  });
  return y + density.introGap;
}

function estimateOrcamentoMachineGroupHeight(
  doc,
  equipRows,
  linhas,
  { includeSeparator = false, density = ORC_GENERIC_DENSITY.normal } = {},
) {
  let h = 0;
  if (equipRows.length) {
    h += measureHorizontalEquipFieldsHeight(doc, equipRows, 0, Number.POSITIVE_INFINITY, density) - 0;
  }
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  h += density.tableRowH * (1 + rows.length);
  if (includeSeparator) h += measureOrcamentoEquipamentoSeparator(0, density) - 0;
  return h;
}

export function estimateOrcamentoMachineGroupBlockHeight(
  linhas = [],
  equipFieldCount = 2,
  densityId = 'normal',
) {
  const density = getOrcamentoGenericDensityProfile(densityId);
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  const equipLines = Math.max(1, Math.ceil(equipFieldCount / 3));
  return equipLines * density.equipLineStep + density.equipTail + density.tableRowH * (1 + rows.length);
}

export function resolveOrcamentoGenericLayout(doc, fill, bodyStartY) {
  const intro = resolveOrcamentoTextoIntroForPdf(fill.maquinas, fill.texto_intro);
  const order = ['normal', 'compact', 'tight'];

  for (const densityId of order) {
    const density = getOrcamentoGenericDensityProfile(densityId);
    const introEndY = measureOrcamentoIntroHeight(doc, intro, bodyStartY, density);
    const sectionsEndY = measureOrcamentoMaquinaSectionsHeight(
      doc,
      fill,
      introEndY,
      ORC_GENERIC_BODY_MAX_Y,
      density,
    );
    const contentEndY = measureOrcamentoObservacoesHeight(
      doc,
      fill,
      sectionsEndY,
      ORC_GENERIC_BODY_MAX_Y,
      density,
    );
    if (contentEndY <= ORC_GENERIC_BODY_MAX_Y) {
      return { density, densityId, intro, introEndY, sectionsEndY, contentEndY };
    }
  }

  const density = getOrcamentoGenericDensityProfile('tight');
  const introEndY = measureOrcamentoIntroHeight(doc, intro, bodyStartY, density);
  const sectionsEndY = measureOrcamentoMaquinaSectionsHeight(
    doc,
    fill,
    introEndY,
    ORC_GENERIC_BODY_MAX_Y,
    density,
  );
  const contentEndY = measureOrcamentoObservacoesHeight(
    doc,
    fill,
    sectionsEndY,
    ORC_GENERIC_BODY_MAX_Y,
    density,
  );
  return { density, densityId: 'tight', intro, introEndY, sectionsEndY, contentEndY };
}

function canDrawTableLine(y, step = 5) {
  return y + step <= FOOTER_TOP - 1;
}

function orcamentoTableDataRows(linhas, maquinas = []) {
  return filterOrcamentoTableLinhas(linhas, maquinas);
}

export function computeOrcamentoTableLayout(
  linhas,
  maquinas = [],
  { contentEndY = null, equipamentoCampos = null } = {},
) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  const rowCount = countOrcamentoGroupedTableRows(linhas, maquinas, campos);
  const blockH = rowCount * ORC_TABLE_ROW_H + 6;
  const anchoredStartY = FOOTER_TOP - blockH - ORC_TABLE_GAP_ABOVE_FOOTER;
  const flowStartY =
    contentEndY != null && Number.isFinite(contentEndY)
      ? contentEndY + ORC_TABLE_GAP_ABOVE_FOOTER
      : null;
  const startY =
    flowStartY != null ? Math.max(flowStartY, anchoredStartY) : anchoredStartY;
  return {
    startY,
    anchoredStartY,
    blockH,
    dataRows: orcamentoTableDataRows(linhas, maquinas),
    grouped: shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos),
    groups: groupOrcamentoLinhasByEquipamento(linhas, maquinas, campos),
    multi: false,
  };
}

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
  const subtitulo = String(fill.proposta_subtitulo || 'ORÇAMENTOS').trim() || 'ORÇAMENTOS';
  doc.text(subtitulo, rightCenterX, ty, { align: 'center' });
  ty += 11;

  const clienteLabel = pdfSafeText(fill.cliente_nome).toUpperCase();
  const acLabel = pdfSafeText(fill.cliente_ac).toUpperCase();
  doc.setFontSize(10);
  pdfSplitText(doc, `PARA: ${clienteLabel}`, rightColW).forEach((line) => {
    doc.text(line, rightColX, ty);
    ty += 5;
  });
  pdfSplitText(doc, `A/C. ${acLabel}`, rightColW).forEach((line) => {
    doc.text(line, rightColX, ty);
    ty += 5;
  });

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

/** Referência do documento — canto inferior esquerdo de cada página. */
function drawMs015DocumentRef(doc) {
  pdfSetFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(MS015_DOC_REF, MARGIN, MS015_DOC_REF_Y);
}

function stampMs015DocumentRefAllPages(doc) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawMs015DocumentRef(doc);
  }
}

function fitTableCellText(doc, text, maxWidthMm) {
  const safe = pdfSafeText(text);
  if (!safe || maxWidthMm <= 0) return safe;
  if (doc.getTextWidth(safe) <= maxWidthMm) return safe;
  let trimmed = safe;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}…`) > maxWidthMm) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length < safe.length ? `${trimmed}…` : trimmed;
}

function drawOrcamentoTable(doc, linhas, startY, { maquinas = [], equipamentoCampos = null, layout = null } = {}) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  const table =
    layout ||
    computeOrcamentoTableLayout(linhas, maquinas, { equipamentoCampos: campos });
  const grouped = table.grouped;
  const groups = table.groups || groupOrcamentoLinhasByEquipamento(linhas, maquinas, campos);
  const y0 = table.startY ?? startY;

  const colX = [MARGIN, MARGIN + 98, MARGIN + 112, MARGIN + 148, MARGIN + CONTENT_W];
  let y = y0;

  const drawRow = (cells, { bold = false, fill = false } = {}) => {
    if (!canDrawTableLine(y, ORC_TABLE_ROW_H + 2)) return y;
    if (fill) {
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y - 4.2, CONTENT_W, ORC_TABLE_ROW_H, 'F');
    }
    pdfSetFont(doc, bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    doc.text(fitTableCellText(doc, cells[0], colX[1] - colX[0] - 3), colX[0] + 1, y);
    doc.text(pdfSafeText(cells[1]), colX[2] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[2]), colX[3] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[3]), colX[4] - 1, y, { align: 'right' });
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5);
    return y + ORC_TABLE_ROW_H;
  };

  const drawMachineHeader = (label) => {
    if (!canDrawTableLine(y, ORC_TABLE_ROW_H + 2)) return y;
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y - 4.2, CONTENT_W, ORC_TABLE_ROW_H, 'F');
    pdfSetFont(doc, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    doc.text(fitTableCellText(doc, label, CONTENT_W - 4), MARGIN + 1, y);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5);
    return y + ORC_TABLE_ROW_H;
  };

  if (grouped) {
    groups.forEach((group, groupIndex) => {
      y = drawMachineHeader(group.label);
      y = drawRow(['Na reparação precisa', 'Qtd.', 'Preço Unit.', 'Total'], {
        bold: true,
        fill: true,
      });
      group.linhas.forEach((row) => {
        const total =
          row.total ||
          (computeLinhaTotal(row) > 0 ? formatEuro(computeLinhaTotal(row)) : '');
        y = drawRow(
          [
            row.descricao || '—',
            row.qtd || '1',
            row.precoUnit ? formatOrcamentoPdfMoneyCell(formatEuro(row.precoUnit)) : '',
            formatOrcamentoPdfMoneyCell(total),
          ],
          {},
        );
      });
      if (groupIndex < groups.length - 1) y += 1.5;
    });
    return y + 4;
  }

  y = drawRow(['Na reparação precisa', 'Qtd.', 'Preço Unit.', 'Total'], { bold: true, fill: true });
  (table.dataRows || orcamentoTableDataRows(linhas, maquinas)).forEach((row) => {
    const total =
      row.total ||
      (computeLinhaTotal(row) > 0 ? formatEuro(computeLinhaTotal(row)) : '');
    y = drawRow([
      row.descricao || '—',
      row.qtd || '1',
      row.precoUnit ? formatOrcamentoPdfMoneyCell(formatEuro(row.precoUnit)) : '',
      formatOrcamentoPdfMoneyCell(total),
    ]);
  });
  return y + 4;
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

export function normalizeLegalParagraphs(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n');
  text = text.replace(/\s+([IVX]+)\s*[-–]\s*/g, '\n\n$1 – ');
  text = text.replace(/(Cliente)(O cliente)/gi, '$1\n$2');
  text = text.replace(/(orçamento\.)(Ao recusar)/gi, '$1\n$2');
  text = text.replace(/([.;:])\s*([a-e]\))/gi, '$1\n$2');
  text = text.replace(/([a-e]\))\s*/gi, '$1 ');
  text = text.replace(/([a-záéíóúãõç])([A-ZÁÉÍÓÚ])/g, '$1 $2');
  text = text.replace(/\.\s+\./g, '.');
  text = text.replace(/;\s*/g, ';\n');
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
}

export function resolveOrcamentoEquipamentoPdfBlocks(fill = {}) {
  const fallbackCampos = normalizeEquipamentoCampos(fill.equipamento_campos);
  const allMaquinas = Array.isArray(fill.maquinas) ? fill.maquinas : [];
  const blocks = allMaquinas.map((row, index) => {
      const machine = normalizeOrcamentoMaquina(row, fallbackCampos);
      const campos = resolveMaquinaFieldDefs(machine, fallbackCampos);
      return {
        index,
        machine,
        campos,
        rows: collectMaquinaPdfFieldRows(machine, fallbackCampos),
      };
    });

  if (blocks.length) return { blocks };

  const machine = normalizeOrcamentoMaquina(
    {
      marca: fill.marca,
      modelo: fill.modelo,
      tipo: fill.tipo,
      numeroSerie: fill.numero_serie,
      numeroInterno: fill.numero_interno,
      maquina: fill.maquina,
    },
    fallbackCampos,
  );

  return {
    blocks: [
      {
        index: 0,
        machine,
        campos: resolveMaquinaFieldDefs(machine, fallbackCampos),
        rows: collectMaquinaPdfFieldRows(machine, fallbackCampos),
      },
    ],
  };
}

function drawOrcamentoEquipamentoSeparator(doc, y, density = ORC_GENERIC_DENSITY.normal) {
  y += density.separatorBefore;
  const lineY = y + 1;
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.65);
  doc.line(MARGIN, lineY, MARGIN + CONTENT_W, lineY);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  return lineY + density.separatorAfter;
}

function measureOrcamentoEquipamentoSeparator(y, density = ORC_GENERIC_DENSITY.normal) {
  return y + density.separatorBefore + 1 + density.separatorAfter;
}

/** Valor monetário na tabela do PDF — sempre com símbolo €. */
export function formatOrcamentoPdfMoneyCell(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '—') return '';
  const amount = pdfSafeText(text.replace(/\s*€\s*$/i, '').trim());
  if (!amount) return '';
  return `${amount} €`;
}

/** Prazo de entrega — acrescenta unidade quando só há número. */
export function formatPrazoEntregaForPdf(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '—') return '—';
  if (/dias?(\s+úteis)?/i.test(text)) return text;
  if (/^\d+$/.test(text)) return `${text} dias úteis`;
  return text;
}

function createOrcamentoTableRowDrawer(
  doc,
  startY,
  { maxEndY = FOOTER_TOP - 1, density = ORC_GENERIC_DENSITY.normal, clip = true } = {},
) {
  let y = startY;
  const colX = ORC_TABLE_COL_X;
  const rowH = density.tableRowH ?? ORC_TABLE_ROW_H;
  const fontSize = density.tableFontSize ?? 8.5;
  const cellPad = density.tableCellPad ?? 4.2;

  const drawRow = (cells, { bold = false, fill = false } = {}) => {
    if (clip && y + rowH + 2 > maxEndY) return y;
    if (fill) {
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y - cellPad, CONTENT_W, rowH, 'F');
    }
    pdfSetFont(doc, bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
    doc.text(fitTableCellText(doc, cells[0], colX[1] - colX[0] - 3), colX[0] + 1, y);
    doc.text(pdfSafeText(cells[1]), colX[2] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[2]), colX[3] - 2, y, { align: 'right' });
    doc.text(pdfSafeText(cells[3]), colX[4] - 1, y, { align: 'right' });
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5);
    y += rowH;
    return y;
  };

  return { drawRow };
}

function buildHorizontalEquipLines(doc, equipRows, maxWidth = CONTENT_W, fieldGap = ORC_EQUIP_FIELD_GAP) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  equipRows.forEach(([label, value]) => {
    const safeLabel = pdfSafeText(String(label || '').trim() || '—');
    const safeValue = pdfSafeText(String(value || '').trim() || '—');
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_BODY);
    const prefix = `${safeLabel}: `;
    const prefixW = doc.getTextWidth(prefix);
    pdfSetFont(doc, 'normal');
    const valueW = doc.getTextWidth(safeValue);
    const segmentW = prefixW + valueW;
    const gap = currentLine.length ? fieldGap : 0;

    if (currentLine.length && currentWidth + gap + segmentW > maxWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }
    if (currentLine.length) currentWidth += fieldGap;
    currentLine.push({ label: safeLabel, value: safeValue, prefixW, valueW });
    currentWidth += segmentW;
  });

  if (currentLine.length) lines.push(currentLine);
  return lines;
}

function measureHorizontalEquipFieldsHeight(
  doc,
  equipRows,
  startY,
  maxEndY = CONTENT_MAX_Y,
  density = ORC_GENERIC_DENSITY.normal,
) {
  if (!equipRows.length) return startY;
  let y = startY;
  const lineCount = buildHorizontalEquipLines(doc, equipRows).length;
  for (let i = 0; i < lineCount; i += 1) {
    if (y + density.equipLineStep > maxEndY) break;
    y += density.equipLineStep;
  }
  return y + density.equipTail;
}

function drawHorizontalEquipFields(
  doc,
  equipRows,
  startY,
  maxEndY = CONTENT_MAX_Y,
  density = ORC_GENERIC_DENSITY.normal,
  options = {},
) {
  if (!equipRows.length) return startY;
  const xStart = Number.isFinite(options.x) ? options.x : MARGIN;
  const maxWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : CONTENT_W;
  const fieldGap = Number.isFinite(options.fieldGap) ? options.fieldGap : ORC_EQUIP_FIELD_GAP;
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const lineStep = options.lineStep ?? density.equipLineStep;
  const tail = options.tail ?? density.equipTail;
  let y = startY;
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  buildHorizontalEquipLines(doc, equipRows, maxWidth, fieldGap).forEach((segments) => {
    if (y + lineStep > maxEndY) return;
    let x = xStart;
    segments.forEach((segment, index) => {
      if (index > 0) x += fieldGap;
      pdfSetFont(doc, 'bold');
      const prefix = `${segment.label}: `;
      doc.text(prefix, x, y);
      x += segment.prefixW;
      pdfSetFont(doc, 'normal');
      doc.text(segment.value, x, y);
      x += segment.valueW;
    });
    y += lineStep;
  });

  return y + tail;
}

function countMaquinaPrecoBlockLines(doc, block, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  return Math.max(1, buildHorizontalEquipLines(doc, block, maxWidth, MAQUINA_PRECO_FIELD_GAP).length);
}

function estimateMaquinaPrecoBlocksHeight(
  doc,
  blocks,
  { lineStep, twoColumn, fontSize, compactFooter },
) {
  const tail = compactFooter ? 32 : 40;
  if (!blocks.length) return 16 + tail;

  if (twoColumn) {
    const colGap = 4;
    const colW = (CONTENT_W - colGap) / 2;
    const half = Math.ceil(blocks.length / 2);
    let total = 0;
    for (let row = 0; row < half; row += 1) {
      const leftLines = countMaquinaPrecoBlockLines(doc, blocks[row], colW, fontSize);
      const rightBlock = blocks[row + half];
      const rightLines = rightBlock
        ? countMaquinaPrecoBlockLines(doc, rightBlock, colW, fontSize)
        : 0;
      total += Math.max(leftLines, rightLines) * (lineStep + MAQUINA_PRECO_LINE_TAIL);
    }
    return total + 16 + tail;
  }

  let total = 0;
  blocks.forEach((block) => {
    total += countMaquinaPrecoBlockLines(doc, block, CONTENT_W, fontSize) * (lineStep + MAQUINA_PRECO_LINE_TAIL);
  });
  return total + 16 + tail;
}

function estimateMaquinaPrecoTableHeight(rowCount, compactFooter, rowH = MAQUINA_PRECO_TABLE_ROW_H) {
  const table = {
    rows: Array.from({ length: rowCount }, () => ({})),
    deslocacao: '—',
  };
  const lineCount = countManutencaoMaquinaFooterLines(table);
  const lineStep = Math.max(
    compactFooter ? MAQUINA_PRECO_TABLE_ROW_H_COMPACT : rowH,
    MAQUINA_FOOTER_LINE_MIN,
  );
  return MAQUINA_FOOTER_SEPARATOR_GAP + lineCount * lineStep;
}

function manutencaoFooterRowTextY(rowTop, lineStep, fontSize) {
  return rowTop + Math.min(lineStep - 1, fontSize * 0.85 + 1.2);
}

function formatOrcamentoPdfCurrency(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return '—';
  return raw.includes('€') ? raw : `${raw} €`;
}

function countManutencaoMaquinaFooterLines(table = {}) {
  const rowCount = table?.rows?.length ?? 0;
  let lines = 1 + rowCount;
  if (table?.deslocacao != null) lines += 1;
  lines += 3;
  lines += 3;
  return lines;
}

function resolveManutencaoMaquinaFooterFontSize(lineStep) {
  if (lineStep >= 5.4) return PDF_FONT_BODY;
  if (lineStep >= 5) return 8.5;
  if (lineStep >= 4.8) return MAQUINA_PRECO_TABLE_FONT;
  return MAQUINA_BULLET_COMPACT_FONT;
}

function drawOrcamentoInlineLabelValue(doc, label, value, x, y) {
  pdfSetFont(doc, 'bold');
  doc.text(label, x, y);
  const prefixW = doc.getTextWidth(label);
  pdfSetFont(doc, 'normal');
  doc.text(pdfSafeText(value), x + prefixW, y);
}

function drawOrcamentoMoneyRow(doc, label, value, y, options = {}) {
  const moneyX = options.moneyX ?? MAQUINA_FOOTER_MONEY_X;
  const bold = Boolean(options.bold);
  pdfSetFont(doc, bold ? 'bold' : 'normal');
  doc.text(label, MARGIN, y);
  pdfSetFont(doc, bold ? 'bold' : 'normal');
  doc.text(pdfSafeText(value), moneyX, y, { align: 'right' });
}

function measureManutencaoMaquinaFooterContentHeight(table, typography = {}) {
  const lineCount = typography.lineCount ?? countManutencaoMaquinaFooterLines(table);
  const separatorGap = typography.separatorGap ?? MAQUINA_FOOTER_SEPARATOR_GAP;
  const lineStep = typography.lineStep ?? MAQUINA_FOOTER_LINE_MIN;
  return separatorGap + lineCount * lineStep;
}

/** Distribui o espaço do rodapé com passo de linha uniforme. */
export function resolveManutencaoMaquinaFooterTypography(availableHeight, table = {}) {
  const lineCount = countManutencaoMaquinaFooterLines(table);
  const separatorGap = MAQUINA_FOOTER_SEPARATOR_GAP;
  const usable = Math.max(20, availableHeight - separatorGap);
  const lineStep = Math.min(
    MAQUINA_FOOTER_LINE_MAX,
    Math.max(MAQUINA_FOOTER_LINE_MIN, usable / lineCount),
  );

  return {
    lineStep,
    fontSize: resolveManutencaoMaquinaFooterFontSize(lineStep),
    separatorGap,
    lineCount,
  };
}

function drawManutencaoMaquinaPrecoTable(doc, table, startY, maxY, options = {}) {
  const fontSize = options.fontSize ?? MAQUINA_PRECO_TABLE_FONT;
  const lineStep = options.lineStep ?? options.rowH ?? MAQUINA_PRECO_TABLE_ROW_H;
  const maquinaColW = MAQUINA_PRECO_TABLE_COL_MANUT - MARGIN - 2;
  let rowTop = startY;

  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.setFillColor(241, 245, 249);
  doc.rect(MARGIN, rowTop - 0.4, CONTENT_W, lineStep, 'F');

  pdfSetFont(doc, 'bold');
  const headerY = manutencaoFooterRowTextY(rowTop, lineStep, fontSize);
  doc.text('Máquina', MARGIN + 1, headerY);
  doc.text('Manutenção Geral', MAQUINA_PRECO_TABLE_COL_MANUT, headerY, { align: 'right' });
  doc.text('DL50', MAQUINA_FOOTER_MONEY_X, headerY, { align: 'right' });
  rowTop += lineStep;

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, rowTop, MARGIN + CONTENT_W, rowTop);

  pdfSetFont(doc, 'normal');
  (table.rows || []).forEach((row) => {
    if (rowTop + lineStep > maxY) return;
    const textY = manutencaoFooterRowTextY(rowTop, lineStep, fontSize);
    const maquinaText = fitTableCellText(doc, row.maquina, maquinaColW);
    doc.text(maquinaText, MARGIN + 1, textY);
    doc.text(pdfSafeText(row.manutencao), MAQUINA_PRECO_TABLE_COL_MANUT, textY, { align: 'right' });
    doc.text(pdfSafeText(row.dl50), MAQUINA_FOOTER_MONEY_X, textY, { align: 'right' });
    rowTop += lineStep;
    doc.line(MARGIN, rowTop, MARGIN + CONTENT_W, rowTop);
  });

  if (table.deslocacao != null && rowTop + lineStep <= maxY) {
    const textY = manutencaoFooterRowTextY(rowTop, lineStep, fontSize);
    drawOrcamentoMoneyRow(doc, 'Deslocação:', table.deslocacao, textY);
    rowTop += lineStep;
  }

  pdfSetFont(doc, 'normal');
  return rowTop;
}

function drawManutencaoMaquinaPrecoEquipBlocks(doc, blocks, startY, maxY, options = {}) {
  const twoColumn = Boolean(options.twoColumn);
  const lineStep = options.lineStep ?? 3.5;
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const fieldGap = MAQUINA_PRECO_FIELD_GAP;
  let y = startY;

  if (twoColumn) {
    const colGap = 4;
    const colW = (CONTENT_W - colGap) / 2;
    const half = Math.ceil(blocks.length / 2);
    for (let row = 0; row < half; row += 1) {
      if (y > maxY) break;
      const leftBlock = blocks[row];
      const rightBlock = blocks[row + half];
      const leftEnd = drawHorizontalEquipFields(doc, leftBlock, y, maxY, ORC_GENERIC_DENSITY.normal, {
        x: MARGIN,
        maxWidth: colW,
        fieldGap,
        fontSize,
        lineStep,
        tail: 0,
      });
      const rightEnd = rightBlock
        ? drawHorizontalEquipFields(doc, rightBlock, y, maxY, ORC_GENERIC_DENSITY.normal, {
            x: MARGIN + colW + colGap,
            maxWidth: colW,
            fieldGap,
            fontSize,
            lineStep,
            tail: 0,
          })
        : y;
      y = Math.max(leftEnd, rightEnd) + MAQUINA_PRECO_LINE_TAIL;
    }
    return y;
  }

  blocks.forEach((block) => {
    y = drawHorizontalEquipFields(doc, block, y, maxY, ORC_GENERIC_DENSITY.normal, {
      fieldGap,
      fontSize,
      lineStep,
      tail: MAQUINA_PRECO_LINE_TAIL,
    });
  });
  return y;
}

function measureOrcamentoMachineTableHeight(doc, linhas, startY, density = ORC_GENERIC_DENSITY.normal) {
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  return startY + density.tableRowH * (1 + rows.length);
}

function drawOrcamentoMachineTableSection(doc, linhas, startY, density = ORC_GENERIC_DENSITY.normal) {
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  const { drawRow } = createOrcamentoTableRowDrawer(doc, startY, {
    maxEndY: ORC_GENERIC_BODY_MAX_Y,
    density,
    clip: false,
  });
  let y = drawRow(['Na reparação precisa', 'Qtd.', 'Preço Unit.', 'Total'], {
    bold: true,
    fill: true,
  });
  rows.forEach((row) => {
    const total =
      row.total || (computeLinhaTotal(row) > 0 ? formatEuro(computeLinhaTotal(row)) : '');
    y = drawRow(
      [
        row.descricao || '—',
        row.qtd || '1',
        row.precoUnit ? formatOrcamentoPdfMoneyCell(formatEuro(row.precoUnit)) : '',
        formatOrcamentoPdfMoneyCell(total),
      ],
      {},
    );
  });
  return y;
}

function resolveMaquinaEquipRows(block, fill) {
  if (block?.rows?.length) return block.rows;
  if (!block) return [];
  const rows = collectMaquinaPdfFieldRows(block.machine, fill.equipamento_campos);
  if (rows.length) return rows;
  return [
    [LABEL_MAQUINA, formatOrcamentoMaquinaLabel(block.machine, block.index, block.campos)],
    [LABEL_MATRICULA, formatOrcamentoMaquinaMatricula(block.machine, block.campos)],
  ];
}

function measureOrcamentoMaquinaSectionsHeight(
  doc,
  fill,
  startY,
  maxEndY = CONTENT_MAX_Y,
  density = ORC_GENERIC_DENSITY.normal,
) {
  const campos = normalizeEquipamentoCampos(fill.equipamento_campos);
  const groups = groupOrcamentoLinhasByEquipamento(fill.linhas, fill.maquinas, campos);
  const { blocks } = resolveOrcamentoEquipamentoPdfBlocks(fill);
  let y = startY;

  groups.forEach((group, groupIndex) => {
    const block = blocks.find((row) => row.index === group.equipamentoIndex) || blocks[groupIndex];
    const equipRows = resolveMaquinaEquipRows(block, fill);
    if (equipRows.length) {
      y = measureHorizontalEquipFieldsHeight(doc, equipRows, y, maxEndY, density);
    }
    y = measureOrcamentoMachineTableHeight(doc, group.linhas, y, density);
    if (groupIndex < groups.length - 1) {
      y = measureOrcamentoEquipamentoSeparator(y, density);
    }
  });

  return y + density.sectionTail;
}

function drawOrcamentoMaquinaSections(
  doc,
  fill,
  startY,
  maxEndY = CONTENT_MAX_Y,
  density = ORC_GENERIC_DENSITY.normal,
) {
  const campos = normalizeEquipamentoCampos(fill.equipamento_campos);
  const groups = groupOrcamentoLinhasByEquipamento(fill.linhas, fill.maquinas, campos);
  const { blocks } = resolveOrcamentoEquipamentoPdfBlocks(fill);
  let y = startY;

  groups.forEach((group, groupIndex) => {
    const block = blocks.find((row) => row.index === group.equipamentoIndex) || blocks[groupIndex];
    const equipRows = resolveMaquinaEquipRows(block, fill);
    if (equipRows.length) {
      y = drawHorizontalEquipFields(doc, equipRows, y, maxEndY, density);
    }
    y = drawOrcamentoMachineTableSection(doc, group.linhas, y, density);
    if (groupIndex < groups.length - 1) {
      y = drawOrcamentoEquipamentoSeparator(doc, y, density);
    }
  });

  return y + density.sectionTail;
}

function measureOrcamentoObservacoesHeight(
  doc,
  fill,
  startY,
  maxEndY = CONTENT_MAX_Y,
  density = ORC_GENERIC_DENSITY.normal,
) {
  const text = String(fill.observacoes_cliente || '').trim();
  if (!text || text === '—') return startY;
  let y = startY + density.obsHeadGap;
  if (y + density.obsTitleStep > maxEndY) return startY;
  y += density.obsTitleStep;
  pdfSetFont(doc, 'normal');
  pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
    if (y + density.obsLineStep > maxEndY) return;
    y += density.obsLineStep;
  });
  return y + 2;
}

export function planOrcamentoGenericPageLayout(doc, fill, bodyStartY) {
  const layout = resolveOrcamentoGenericLayout(doc, fill, bodyStartY);
  const tableLayout = computeOrcamentoTableLayout(fill.linhas, fill.maquinas, {
    contentEndY: layout.contentEndY,
    equipamentoCampos: fill.equipamento_campos,
  });

  return {
    ...layout,
    tableLayout,
  };
}

function drawTemplateMaquinaIdentBlocks(doc, fill, startY, options = {}) {
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const compact = Boolean(options.compact);
  const ultraCompact = Boolean(options.ultraCompact);
  const canLine = (y, step = 5) => y + step <= maxEndY;
  const advanceY = (y, step = 5) => (canLine(y, step) ? y + step : y);
  let y = startY;

  const nomes = collectTemplateMaquinaNomes(fill);
  if (!nomes.length) return advanceY(y, ultraCompact ? 2 : 4);

  if (compact) {
    if (!canLine(y)) return y;
    pdfSetFont(doc, 'bold');
    doc.setFontSize(ultraCompact ? MAQUINA_BULLET_COMPACT_FONT : PDF_FONT_BODY);
    doc.text('Máquinas:', MARGIN, y);
    y = advanceY(y, ultraCompact ? 3.5 : 4.2);
    pdfSetFont(doc, 'normal');
    const numbered = nomes.map((nome, index) => `${index + 1}. ${nome}`);
    const rowStep = ultraCompact ? 3.4 : 4;
    const columns = nomes.length >= 5 ? 2 : 1;
    if (columns === 1) {
      numbered.forEach((line) => {
        if (!canLine(y, rowStep)) return;
        doc.text(pdfSafeText(line), MARGIN, y);
        y = advanceY(y, rowStep);
      });
    } else {
      const half = Math.ceil(numbered.length / 2);
      const colGap = 4;
      const colW = (CONTENT_W - colGap) / 2;
      for (let row = 0; row < half; row += 1) {
        if (!canLine(y, rowStep)) break;
        doc.text(pdfSafeText(numbered[row]), MARGIN, y, { maxWidth: colW });
        if (numbered[row + half]) {
          doc.text(pdfSafeText(numbered[row + half]), MARGIN + colW + colGap, y, { maxWidth: colW });
        }
        y = advanceY(y, rowStep);
      }
    }
    doc.setFontSize(PDF_FONT_BODY);
    return advanceY(y, ultraCompact ? 2 : 3);
  }

  nomes.forEach((nome, index) => {
    if (!canLine(y)) return;
    pdfSetFont(doc, 'bold');
    const prefix = nomes.length > 1 ? `Máquina ${index + 1}: ` : 'Máquina: ';
    doc.text(prefix, MARGIN, y);
    const prefixW = doc.getTextWidth(prefix);
    pdfSetFont(doc, 'normal');
    pdfSplitText(doc, pdfSafeText(nome), Math.max(12, CONTENT_W - prefixW)).forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        y = advanceY(y, 5.5);
        if (!canLine(y)) return;
      }
      doc.text(line, MARGIN + (lineIndex === 0 ? prefixW : 0), y);
    });
    y = advanceY(y, 5.5);
  });

  return advanceY(y, 4);
}

function drawOrcamentoObservacoesCliente(doc, fill, startY, options = {}) {
  const text = String(fill.observacoes_cliente || '').trim();
  if (!text || text === '—') return startY;
  const density = options.density || ORC_GENERIC_DENSITY.normal;
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const lineStep = options.lineStep ?? density.obsLineStep;
  let y = startY + density.obsHeadGap;
  if (y + density.obsTitleStep > maxEndY) return startY;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('Observações:', MARGIN, y);
  y += density.obsTitleStep;

  pdfSetFont(doc, 'normal');
  pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
    if (y + lineStep > maxEndY) return;
    doc.text(line, MARGIN, y);
    y += lineStep;
  });
  return y + 2;
}

function drawOrcamentoIvaTotals(doc, fill, startY, maxY = Infinity, options = {}) {
  let y = startY;
  const lineStep = options.lineStep ?? 5;
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const alignMoney = Boolean(options.alignMoney);
  const rows = [
    { label: 'Subtotal (s/ IVA):', value: formatOrcamentoPdfCurrency(fill.subtotal), bold: false },
    { label: 'IVA (23%):', value: formatOrcamentoPdfCurrency(fill.iva), bold: false },
    { label: 'Total:', value: formatOrcamentoPdfCurrency(fill.total_geral), bold: true },
  ];

  doc.setFontSize(fontSize);
  rows.forEach(({ label, value, bold }) => {
    if (y > maxY) return;
    const textY = alignMoney
      ? manutencaoFooterRowTextY(y, lineStep, fontSize)
      : y;
    if (alignMoney) {
      drawOrcamentoMoneyRow(doc, label, value, textY, { bold });
    } else {
      pdfSetFont(doc, bold ? 'bold' : 'normal');
      doc.text(`${label} ${value}`, MARGIN, textY);
    }
    y += lineStep;
  });
  pdfSetFont(doc, 'normal');
  return y;
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

  const drawTaxasSaida = () => {
    const taxas = Array.isArray(fill.taxas_saida) ? fill.taxas_saida.filter(Boolean) : [];
    if (!taxas.length) {
      drawLabelValue('Taxa de Saída – ', '—');
      return;
    }
    taxas.forEach((value, index) => {
      const label = taxas.length === 1 ? 'Taxa de Saída – ' : `Taxa de Saída ${index + 1} – `;
      drawLabelValue(label, `${value} €`);
    });
  };

  drawTaxasSaida();
  drawLabelValue('Prazo de Entrega: ', formatPrazoEntregaForPdf(fill.prazo_entrega));
  drawLabelValue('Forma de Pagamento: ', fill.forma_pagamento);
  drawLabelValue('Validade do orçamento – ', fill.validade_orcamento);

  drawOrcamentoIvaTotals(doc, fill, y);
}

function drawOrcamentoBodyParagraphs(doc, paragraphs, startY, options = {}) {
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const lineStep = options.lineStep ?? 4.8;
  let y = startY;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  paragraphs.forEach((paragraph) => {
    const text = String(paragraph || '').trim();
    if (!text) return;
    pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
      if (y + lineStep > maxEndY) return;
      doc.text(line, MARGIN, y);
      y += lineStep;
    });
    y += 2;
  });

  return y;
}

/** Lista em várias colunas — cada coluna desce de forma independente (bullets não partilham linha). */
function drawOrcamentoBulletColumns(doc, items, startY, options = {}) {
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const lineStep = options.lineStep ?? 4.5;
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const colCount = Math.max(2, Number(options.columns) || 2);
  const colGap = colCount >= 3 ? 4 : 6;
  const colW = (CONTENT_W - colGap * (colCount - 1)) / colCount;
  const bulletIndent = colCount >= 3 ? 3.5 : 4;
  const textW = Math.max(10, colW - bulletIndent - 1);
  const itemGap = 0.3;
  const perCol = Math.ceil(items.length / colCount);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  const columnEndYs = Array.from({ length: colCount }, (_, colIndex) => {
    const x = MARGIN + colIndex * (colW + colGap);
    const colItems = items.slice(colIndex * perCol, (colIndex + 1) * perCol);
    let y = startY;

    colItems.forEach((item) => {
      const text = String(item || '').trim();
      if (!text) return;
      const lines = pdfSplitText(doc, pdfSafeText(text), textW);
      const blockH = lines.length * lineStep;
      if (y + blockH > maxEndY) return;
      lines.forEach((line, lineIndex) => {
        const lineY = y + lineIndex * lineStep;
        if (lineIndex === 0) doc.text('•', x + 1, lineY);
        doc.text(line, x + bulletIndent, lineY);
      });
      y += blockH + itemGap;
    });

    return y;
  });

  return Math.max(startY, ...columnEndYs);
}

function drawOrcamentoBulletList(doc, items, startY, options = {}) {
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const lineStep = options.lineStep ?? 4.5;
  const twoColumn = Boolean(options.twoColumn);
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const bulletIndent = 5;
  const textWidth = CONTENT_W - bulletIndent;
  let y = startY;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  if (twoColumn) {
    const columns = Number(options.columns) || 2;
    return drawOrcamentoBulletColumns(doc, items, startY, {
      maxEndY,
      lineStep,
      fontSize,
      columns,
    });
  }

  items.forEach((item) => {
    const text = String(item || '').trim();
    if (!text) return;
    const lines = pdfSplitText(doc, text, textWidth);
    const blockHeight = lines.length * lineStep + 0.45;
    if (y + blockHeight > maxEndY) return;
    lines.forEach((line, lineIndex) => {
      const lineY = y + lineIndex * lineStep;
      if (lineIndex === 0) doc.text('•', MARGIN + 1, lineY);
      doc.text(line, MARGIN + bulletIndent, lineY);
    });
    y += blockHeight;
  });

  return y;
}

function templateMetaFromFill(fill = {}) {
  return {
    maquinas: fill.maquinas || [],
    equipamentoCampos: fill.equipamento_campos,
    periodicidadeManutencao: fill.periodicidade_manutencao,
    valorManutencaoVisita: fill.valor_manutencao_visita,
    valorManutencaoGeral: fill.valor_manutencao_geral,
    incluirInspecaoDl50: fill.incluir_inspecao_dl50,
    valorInspecaoDl50: fill.valor_inspecao_dl50,
    valorDeslocacao: fill.valor_deslocacao,
    maquinaManutencaoNome: fill.maquina_manutencao_nome,
  };
}

function collectTemplateMaquinaNomes(fill = {}) {
  const nomes = (fill.maquinas || [])
    .map((row) => String(row.maquinaManutencaoNome || row.marca || '').trim())
    .filter(Boolean);
  if (!nomes.length) {
    const legacy = String(fill.maquina_manutencao_nome || fill.maquina || '').trim();
    if (legacy && legacy !== '—') nomes.push(legacy);
  }
  return nomes;
}

/** Altura estimada do corpo antes da lista de trabalhos (mm). Máquinas vão para o rodapé. */
export function estimateMaquinaBodyBeforeBullets(_machineCount = 1, _compactMachines = false) {
  return 14 + 2 + 10 + 6 + 10;
}

function estimateBlockLineCountHeuristic(block, widthFactor = 1) {
  const chars = block.reduce(
    (n, [label, value]) => n + String(label || '').length + String(value || '').length + 3,
    0,
  );
  const adjusted = chars / widthFactor;
  if (adjusted <= 50) return 1;
  if (adjusted <= 85) return 2;
  return 2;
}

function estimateMaquinaPrecoBlocksHeightHeuristic(blocks, lineStep, twoColumn, compactFooter) {
  const tail = compactFooter ? 32 : 40;
  if (!blocks.length) return 16 + tail;

  if (twoColumn) {
    const half = Math.ceil(blocks.length / 2);
    const colFactor = 0.52;
    let total = 0;
    for (let row = 0; row < half; row += 1) {
      const left = estimateBlockLineCountHeuristic(blocks[row], colFactor);
      const right = blocks[row + half]
        ? estimateBlockLineCountHeuristic(blocks[row + half], colFactor)
        : 0;
      total += Math.max(left, right) * (lineStep + MAQUINA_PRECO_LINE_TAIL);
    }
    return total + 16 + tail;
  }

  let total = 0;
  blocks.forEach((block) => {
    total += estimateBlockLineCountHeuristic(block) * (lineStep + MAQUINA_PRECO_LINE_TAIL);
  });
  return total + 16 + tail;
}

function estimateMaquinaFooterHeight(precoLineCount, priceLineStep, twoColumnPrices, compact = false) {
  const priceRows = twoColumnPrices ? Math.ceil(precoLineCount / 2) : precoLineCount;
  const tail = compact ? 32 : 40;
  return priceRows * (priceLineStep + 0.45) + 16 + tail;
}

export function resolveManutencaoMaquinaPdfFooterLayout(fill = {}) {
  const meta = templateMetaFromFill(fill);
  const precoTable = buildManutencaoMaquinaPrecoTable(meta, meta);
  const machineCount = Math.max(collectTemplateMaquinaNomes(fill).length, 1);
  const rowCount = precoTable.rows.length;
  const compactFooter = rowCount >= 6;
  const priceRowH = machineCount >= 7 ? MAQUINA_PRECO_TABLE_ROW_H_COMPACT : MAQUINA_PRECO_TABLE_ROW_H;
  const priceFontSize = machineCount >= 7 ? MAQUINA_BULLET_COMPACT_FONT : MAQUINA_PRECO_TABLE_FONT;
  const footerHeight = estimateMaquinaPrecoTableHeight(rowCount, compactFooter, priceRowH);

  return {
    machineCount,
    compactMachines: machineCount >= 3,
    ultraCompactPreBullet: machineCount >= 4,
    compactFooter,
    precoTable,
    precoBlocks: buildManutencaoMaquinaPrecoEquipBlocks(meta, meta),
    precoLinhas: formatManutencaoMaquinaPrecoLinhas(meta, meta),
    twoColumnPrices: false,
    priceLineStep: priceRowH,
    priceFontSize,
    footerHeight,
    footerMaxY: PROPOSTA_FOOTER_MAX_Y,
  };
}

/** Calcula lista de trabalhos com base na posição Y real (evita sobreposição). */
export function resolveManutencaoMaquinaBulletsLayout(bulletStartY, footerLayout) {
  const machineCount = footerLayout.machineCount ?? 1;
  const bulletCount = MANUTENCAO_MAQUINA_TRABALHOS.length;
  const threeColumnBullets = machineCount >= 6;
  const twoColumnBullets = !threeColumnBullets && (machineCount >= 3 || bulletCount > 10);
  const bulletColumns = threeColumnBullets ? 3 : twoColumnBullets ? 2 : 1;
  const perColumn = bulletColumns > 1 ? Math.ceil(bulletCount / bulletColumns) : bulletCount;
  const logicalRows = bulletColumns > 1 ? perColumn + 1 : bulletCount;

  let priceLineStep = footerLayout.priceLineStep;
  let footerHeight = footerLayout.footerHeight;
  const twoColumnPrices = footerLayout.twoColumnPrices;
  const precoLineCount =
    footerLayout.precoTable?.rows?.length ?? footerLayout.precoBlocks?.length ?? footerLayout.precoLinhas?.length ?? 0;
  const compactFooter = footerLayout.compactFooter;

  let fontSize = PDF_FONT_BODY;
  let bulletLineStep = MAQUINA_BULLET_LINE_STEP;
  let maxEndY = PROPOSTA_FOOTER_MAX_Y - footerHeight - MAQUINA_FOOTER_GAP_ABOVE;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    maxEndY = PROPOSTA_FOOTER_MAX_Y - footerHeight - MAQUINA_FOOTER_GAP_ABOVE;
    const bulletSpace = Math.max(0, maxEndY - bulletStartY);
    bulletLineStep =
      logicalRows > 0 ? bulletSpace / logicalRows - 0.45 : MAQUINA_BULLET_LINE_STEP;

    if (bulletLineStep < MAQUINA_BULLET_MIN_STEP) {
      fontSize = MAQUINA_BULLET_COMPACT_FONT;
      bulletLineStep =
        logicalRows > 0
          ? Math.max(MAQUINA_BULLET_MIN_STEP, bulletSpace / logicalRows - 0.4)
          : MAQUINA_BULLET_MIN_STEP;
    } else {
      fontSize = PDF_FONT_BODY;
    }

    if (bulletLineStep >= MAQUINA_BULLET_MIN_STEP || priceLineStep <= 2.75) break;
    priceLineStep = Math.max(2.75, priceLineStep - 0.12);
    footerHeight = estimateMaquinaFooterHeight(
      precoLineCount,
      priceLineStep,
      twoColumnPrices,
      compactFooter,
    );
  }

  return {
    twoColumnBullets: bulletColumns > 1,
    bulletColumns,
    bulletLineStep: Math.min(MAQUINA_BULLET_LINE_STEP, bulletLineStep),
    bulletFontSize: fontSize,
    bulletsMaxY: maxEndY,
    gapBeforeFooter: MAQUINA_FOOTER_GAP_ABOVE,
    priceLineStep,
    footerHeight,
  };
}

/** @deprecated usar resolveManutencaoMaquinaPdfFooterLayout + resolveManutencaoMaquinaBulletsLayout */
export function resolveManutencaoMaquinaPdfLayout(fill = {}, letterheadEndY = 83) {
  const footer = resolveManutencaoMaquinaPdfFooterLayout(fill);
  const beforeBullets = estimateMaquinaBodyBeforeBullets(
    footer.machineCount,
    footer.compactMachines,
  );
  const bulletStartY = letterheadEndY + beforeBullets;
  const bullets = resolveManutencaoMaquinaBulletsLayout(
    bulletStartY,
    footer,
  );

  return {
    bulletStartY,
    bodyMaxY: bulletStartY - 1,
    footerStartY: bulletStartY + bullets.twoColumnBullets
      ? Math.ceil(MANUTENCAO_MAQUINA_TRABALHOS.length / 2) * (bullets.bulletLineStep + 0.45) + 2
      : MANUTENCAO_MAQUINA_TRABALHOS.length * (bullets.bulletLineStep + 0.45) + 2,
    ...footer,
    ...bullets,
  };
}

function drawManutencaoMaquinaPrecoLines(doc, precoLinhas, startY, maxY, options = {}) {
  const twoColumn = Boolean(options.twoColumn);
  const lineStep = options.lineStep ?? 5;
  const colGap = 4;
  const colW = twoColumn ? (CONTENT_W - colGap) / 2 : CONTENT_W;
  let y = startY;

  pdfSetFont(doc, 'bold');
  if (twoColumn) {
    const half = Math.ceil(precoLinhas.length / 2);
    for (let row = 0; row < half; row += 1) {
      if (y > maxY) break;
      const left = precoLinhas[row];
      const right = precoLinhas[row + half];
      doc.text(pdfSafeText(left), MARGIN, y, { maxWidth: colW });
      if (right) {
        doc.text(pdfSafeText(right), MARGIN + colW + colGap, y, { maxWidth: colW });
      }
      y += lineStep;
    }
    return y + 1;
  }

  precoLinhas.forEach((line) => {
    pdfSplitText(doc, line, CONTENT_W).forEach((textLine) => {
      if (y > maxY) return;
      doc.text(textLine, MARGIN, y);
      y += lineStep;
    });
    y += 1;
  });
  return y;
}

function drawManutencaoBateriaFooter(doc, fill) {
  let y = BATERIA_FOOTER_ANCHOR_Y;
  const footerMaxY = PROPOSTA_FOOTER_MAX_Y;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  const meta = templateMetaFromFill(fill);
  const valorLinhas = formatLinhasValorManutencaoBateria(meta, meta);

  pdfSetFont(doc, 'bold');
  valorLinhas.forEach((valorLine) => {
    pdfSplitText(doc, valorLine, CONTENT_W).forEach((line) => {
      if (y > footerMaxY) return;
      doc.text(line, MARGIN, y);
      y += 5;
    });
    y += 1;
  });

  y = drawOrcamentoIvaTotals(doc, fill, y + 1, footerMaxY);
  y += 1;

  pdfSetFont(doc, 'normal');
  const blocks = [
    MANUTENCAO_BATERIA_MO_OBS,
    `Forma de Pagamento: ${pdfSafeText(fill.forma_pagamento)}`,
    `Validade do orçamento – ${pdfSafeText(fill.validade_orcamento)}`,
    MANUTENCAO_BATERIA_NOTA_PECAS,
  ];

  blocks.forEach((text) => {
    pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
      if (y > footerMaxY) return;
      doc.text(line, MARGIN, y);
      y += 4.8;
    });
    y += 1.5;
  });

  return y;
}

function drawManutencaoMaquinaFooter(doc, fill, layout = {}) {
  const footerMinY = layout.footerStartY ?? MAQUINA_FOOTER_ANCHOR_Y;
  const footerMaxY = layout.footerMaxY ?? PROPOSTA_FOOTER_MAX_Y;
  const gapAbove = layout.gapBeforeFooter ?? MAQUINA_FOOTER_GAP_ABOVE;
  const availableHeight = Math.max(20, footerMaxY - footerMinY);

  const precoTable =
    layout.precoTable ||
    buildManutencaoMaquinaPrecoTable(templateMetaFromFill(fill), templateMetaFromFill(fill));

  const typography =
    layout.footerTypography ||
    resolveManutencaoMaquinaFooterTypography(availableHeight, precoTable);

  let y = footerMinY + typography.separatorGap;

  if (gapAbove >= 3 && y - gapAbove > MARGIN) {
    doc.setDrawColor(...PDF_TABLE_LINE);
    doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
    const lineY = y - typography.separatorGap + 1.5;
    doc.line(MARGIN, lineY, MARGIN + CONTENT_W, lineY);
  }

  pdfSetFont(doc, 'normal');
  doc.setFontSize(typography.fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  y = drawManutencaoMaquinaPrecoTable(doc, precoTable, y, footerMaxY, {
    fontSize: typography.fontSize,
    lineStep: typography.lineStep,
  });

  y = drawOrcamentoIvaTotals(doc, fill, y, footerMaxY, {
    lineStep: typography.lineStep,
    fontSize: typography.fontSize,
    alignMoney: true,
  });

  doc.setFontSize(typography.fontSize);
  const blocks = [
    { label: 'Prazo de Entrega: ', value: formatPrazoEntregaForPdf(fill.prazo_entrega) },
    { label: 'Forma de Pagamento: ', value: fill.forma_pagamento },
    { label: 'Validade do orçamento – ', value: fill.validade_orcamento },
  ];

  blocks.forEach(({ label, value }) => {
    if (y + typography.lineStep > footerMaxY) return;
    const textY = manutencaoFooterRowTextY(y, typography.lineStep, typography.fontSize);
    drawOrcamentoInlineLabelValue(doc, label, value, MARGIN, textY);
    y += typography.lineStep;
  });

  return y;
}

async function renderManutencaoMaquinaOrcamentoPDF(doc, report, job) {
  const fill = buildOrcamentoFillData(report, job);
  const legalText = await loadLegalText();
  const footerLayout = resolveManutencaoMaquinaPdfFooterLayout(fill);
  const preBulletMaxY =
    PROPOSTA_FOOTER_MAX_Y - footerLayout.footerHeight - MAQUINA_FOOTER_GAP_ABOVE - 22;
  const sectionStep = footerLayout.ultraCompactPreBullet ? 3.8 : 5;
  const introLineStep = footerLayout.ultraCompactPreBullet ? 3.8 : 4.8;
  const bodyFontSize = footerLayout.ultraCompactPreBullet ? MAQUINA_BULLET_COMPACT_FONT : PDF_FONT_BODY;

  let y = drawOrcamentoLetterhead(doc, fill);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(bodyFontSize);
  y = drawOrcamentoBodyParagraphs(doc, [fill.texto_intro || MANUTENCAO_MAQUINA_INTRO], y, {
    maxEndY: preBulletMaxY,
    lineStep: introLineStep,
  });
  y += footerLayout.ultraCompactPreBullet ? 1 : 2;

  pdfSetFont(doc, 'bold');
  if (canDrawContentLine(y, sectionStep) && y + sectionStep <= preBulletMaxY) {
    doc.text(MANUTENCAO_MAQUINA_PLANO_TITULO, MARGIN, y);
    y = advanceContentY(y, sectionStep);
  }
  pdfSetFont(doc, 'normal');
  if (canDrawContentLine(y, sectionStep) && y + sectionStep <= preBulletMaxY) {
    doc.text(`– ${MANUTENCAO_MAQUINA_PLANO_DETALHE}`, MARGIN, y);
    y = advanceContentY(y, sectionStep);
  }

  pdfSetFont(doc, 'bold');
  if (canDrawContentLine(y, sectionStep) && y + sectionStep <= preBulletMaxY) {
    doc.text(MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO, MARGIN, y);
    y = advanceContentY(y, sectionStep);
  }

  pdfSetFont(doc, 'normal');
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_MAQUINA_TRABALHOS_INTRO], y, {
    lineStep: footerLayout.ultraCompactPreBullet ? 3.8 : 4.2,
    maxEndY: preBulletMaxY,
  });

  const bulletsLayout = resolveManutencaoMaquinaBulletsLayout(y, footerLayout);
  y = drawOrcamentoBulletList(doc, MANUTENCAO_MAQUINA_TRABALHOS, y, {
    lineStep: bulletsLayout.bulletLineStep,
    twoColumn: bulletsLayout.twoColumnBullets,
    columns: bulletsLayout.bulletColumns,
    fontSize: bulletsLayout.bulletFontSize,
    maxEndY: bulletsLayout.bulletsMaxY,
  });

  drawManutencaoMaquinaFooter(doc, fill, {
    ...footerLayout,
    ...bulletsLayout,
    footerStartY: y + bulletsLayout.gapBeforeFooter,
  });

  doc.setPage(1);
  drawClientApprovalBox(doc);

  if (legalText) {
    drawLegalPage(doc, legalText);
  }

  stampMs015DocumentRefAllPages(doc);
  await stampOrcamentoCertificacaoSelosAllPages(doc);

  return doc;
}

async function renderManutencaoBateriaOrcamentoPDF(doc, report, job) {
  const fill = buildOrcamentoFillData(report, job);
  const legalText = await loadLegalText();
  const meta = templateMetaFromFill(fill);
  const paragrafos = buildManutencaoBateriaParagrafos(meta, meta);

  let y = drawOrcamentoLetterhead(doc, fill);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_BATERIA_INTRO], y, { maxEndY: BATERIA_BODY_MAX_Y });
  y += 2;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  if (canDrawContentLine(y, 6) && y + 6 <= BATERIA_BODY_MAX_Y) {
    doc.text(MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO, MARGIN, y);
    y = advanceContentY(y, 6);
  }

  pdfSetFont(doc, 'normal');
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_BATERIA_TRABALHOS_INTRO], y, {
    lineStep: 4.5,
    maxEndY: BATERIA_BODY_MAX_Y,
  });
  y = drawOrcamentoBulletList(doc, MANUTENCAO_BATERIA_TRABALHOS, y, {
    maxEndY: BATERIA_BODY_MAX_Y,
  });
  y += 2;
  y = drawOrcamentoBodyParagraphs(doc, paragrafos, y, {
    lineStep: 4.5,
    maxEndY: BATERIA_BODY_MAX_Y,
  });

  drawManutencaoBateriaFooter(doc, fill);

  doc.setPage(1);
  drawClientApprovalBox(doc);

  if (legalText) {
    drawLegalPage(doc, legalText);
  }

  stampMs015DocumentRefAllPages(doc);
  await stampOrcamentoCertificacaoSelosAllPages(doc);

  return doc;
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

  if (isManutencaoBateriaOrcamento(report)) {
    return renderManutencaoBateriaOrcamentoPDF(doc, report, job);
  }

  if (isManutencaoMaquinaOrcamento(report)) {
    return renderManutencaoMaquinaOrcamentoPDF(doc, report, job);
  }

  const fill = buildOrcamentoFillData(report, job);
  const legalText = await loadLegalText();

  let y = drawOrcamentoLetterhead(doc, fill);
  const layout = resolveOrcamentoGenericLayout(doc, fill, y);
  const { density } = layout;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  pdfSplitText(doc, layout.intro, CONTENT_W).forEach((line) => {
    doc.text(line, MARGIN, y);
    y += density.introStep;
  });
  y += density.introGap;

  y = drawOrcamentoMaquinaSections(doc, fill, y, ORC_GENERIC_BODY_MAX_Y, density);

  drawOrcamentoObservacoesCliente(doc, fill, y, {
    maxEndY: ORC_GENERIC_BODY_MAX_Y,
    density,
  });

  drawOrcamentoFooter(doc, fill);

  doc.setPage(1);
  drawClientApprovalBox(doc);

  if (legalText) {
    drawLegalPage(doc, legalText);
  }

  stampMs015DocumentRefAllPages(doc);
  await stampOrcamentoCertificacaoSelosAllPages(doc);

  return doc;
}

function sanitizeOrcamentoPdfFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

/** Nome do ficheiro para o cliente (sem referência interna MS.015). */
export function buildOrcamentoPdfFilename(report, job = null) {
  const meta = getReportOrcamentoMeta(report);
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const op = resolvedJob?.numeroOrdem;

  const numero = resolveOrcamentoNumeroFormatado(meta, {
    year: meta?.ano,
    numeroOrdem: op,
  });
  if (!isPlaceholderOrcamentoNumero(numero)) {
    return `Manusilva_Proposta_${sanitizeOrcamentoPdfFilenamePart(numero)}.pdf`;
  }

  if (meta?.numeroSequencial && meta?.ano) {
    return `Manusilva_Proposta_${meta.numeroSequencial}.0-${meta.ano}.pdf`;
  }

  if (op != null && Number.isFinite(Number(op))) {
    return `Manusilva_Proposta_OP-2026-${String(op).padStart(2, '0')}.pdf`;
  }

  const stamp = String(report?.id || Date.now())
    .replace(/-/g, '')
    .slice(0, 12);
  return `Manusilva_Proposta_${stamp}.pdf`;
}
