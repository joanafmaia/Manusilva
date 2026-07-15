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

function buildHorizontalEquipLines(doc, equipRows, maxWidth = CONTENT_W) {
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
    const gap = currentLine.length ? ORC_EQUIP_FIELD_GAP : 0;

    if (currentLine.length && currentWidth + gap + segmentW > maxWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }
    if (currentLine.length) currentWidth += ORC_EQUIP_FIELD_GAP;
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
) {
  if (!equipRows.length) return startY;
  let y = startY;
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  buildHorizontalEquipLines(doc, equipRows).forEach((segments) => {
    if (y + density.equipLineStep > maxEndY) return;
    let x = MARGIN;
    segments.forEach((segment, index) => {
      if (index > 0) x += ORC_EQUIP_FIELD_GAP;
      pdfSetFont(doc, 'bold');
      const prefix = `${segment.label}: `;
      doc.text(prefix, x, y);
      x += segment.prefixW;
      pdfSetFont(doc, 'normal');
      doc.text(segment.value, x, y);
      x += segment.valueW;
    });
    y += density.equipLineStep;
  });

  return y + density.equipTail;
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
  const canLine = (y, step = 5) => y + step <= maxEndY;
  const advanceY = (y, step = 5) => (canLine(y, step) ? y + step : y);
  let y = startY;

  const nomes = collectTemplateMaquinaNomes(fill);
  if (!nomes.length) return advanceY(y, 4);

  if (compact) {
    if (!canLine(y)) return y;
    pdfSetFont(doc, 'bold');
    doc.text('Máquinas:', MARGIN, y);
    y = advanceY(y, 4.2);
    pdfSetFont(doc, 'normal');
    const numbered = nomes.map((nome, index) => `${index + 1}. ${nome}`);
    const columns = nomes.length >= 6 ? 2 : 1;
    if (columns === 1) {
      numbered.forEach((line) => {
        if (!canLine(y, 4)) return;
        doc.text(pdfSafeText(line), MARGIN, y);
        y = advanceY(y, 4);
      });
    } else {
      const half = Math.ceil(numbered.length / 2);
      const colGap = 4;
      const colW = (CONTENT_W - colGap) / 2;
      for (let row = 0; row < half; row += 1) {
        if (!canLine(y, 4)) break;
        doc.text(pdfSafeText(numbered[row]), MARGIN, y, { maxWidth: colW });
        if (numbered[row + half]) {
          doc.text(pdfSafeText(numbered[row + half]), MARGIN + colW + colGap, y, { maxWidth: colW });
        }
        y = advanceY(y, 4);
      }
    }
    return advanceY(y, 3);
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

function drawOrcamentoIvaTotals(doc, fill, startY, maxY = Infinity) {
  let y = startY;
  const lines = [
    { text: `Subtotal (s/ IVA): ${fill.subtotal} €`, bold: false },
    { text: `IVA (23%): ${fill.iva} €`, bold: false },
    { text: `Total: ${fill.total_geral} €`, bold: true },
  ];
  lines.forEach(({ text, bold }) => {
    if (y > maxY) return;
    pdfSetFont(doc, bold ? 'bold' : 'normal');
    doc.text(text, MARGIN, y);
    y += 5;
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

function drawOrcamentoBulletList(doc, items, startY, options = {}) {
  const maxEndY = Number.isFinite(options.maxEndY) ? options.maxEndY : CONTENT_MAX_Y;
  const lineStep = options.lineStep ?? 4.5;
  const twoColumn = Boolean(options.twoColumn);
  const bulletIndent = 5;
  const textWidth = CONTENT_W - bulletIndent;
  let y = startY;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  if (twoColumn) {
    const half = Math.ceil(items.length / 2);
    const colGap = 5;
    const colW = (CONTENT_W - colGap) / 2;
    const colBulletIndent = 4;
    for (let row = 0; row < half; row += 1) {
      if (y + lineStep > maxEndY) break;
      for (let col = 0; col < 2; col += 1) {
        const item = items[row + col * half];
        if (!item) continue;
        const text = String(item || '').trim();
        if (!text) continue;
        const x = MARGIN + col * (colW + colGap);
        doc.text('•', x + 1, y);
        doc.text(pdfSafeText(text), x + colBulletIndent, y, {
          maxWidth: Math.max(8, colW - colBulletIndent - 2),
        });
      }
      y += lineStep + 0.3;
    }
    return y;
  }

  items.forEach((item) => {
    const text = String(item || '').trim();
    if (!text) return;
    if (y + lineStep > maxEndY) return;
    doc.text('•', MARGIN + 1, y);
    pdfSplitText(doc, text, textWidth).forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        y += lineStep;
        if (y + lineStep > maxEndY) return;
      }
      doc.text(line, MARGIN + bulletIndent, y);
    });
    y += lineStep + 0.5;
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

/** Altura estimada do corpo antes da lista de trabalhos (mm). */
export function estimateMaquinaBodyBeforeBullets(machineCount = 1, compactMachines = false) {
  let h = 14;
  if (compactMachines) {
    const rows = machineCount >= 6 ? Math.ceil(machineCount / 2) : machineCount;
    h += 4.2 + rows * 4 + 3;
  } else if (machineCount > 1) {
    h += machineCount * 5.5 + 4;
  } else {
    h += 10;
  }
  h += 2 + 10 + 6 + 10;
  return h;
}

function estimateMaquinaFooterHeight(precoLineCount, priceLineStep, twoColumnPrices) {
  const priceRows = twoColumnPrices ? Math.ceil(precoLineCount / 2) : precoLineCount;
  return priceRows * (priceLineStep + 0.5) + 18 + 22;
}

export function resolveManutencaoMaquinaPdfLayout(fill = {}, letterheadEndY = 83) {
  const meta = templateMetaFromFill(fill);
  const precoLinhas = formatManutencaoMaquinaPrecoLinhas(meta, meta);
  const machineCount = Math.max(collectTemplateMaquinaNomes(fill).length, 1);
  const compactMachines = machineCount >= 3;
  const bulletCount = MANUTENCAO_MAQUINA_TRABALHOS.length;
  const beforeBullets = estimateMaquinaBodyBeforeBullets(machineCount, compactMachines);
  const bulletStartY = letterheadEndY + beforeBullets;

  const twoColumnPrices = precoLinhas.length >= 4;
  let priceLineStep =
    precoLinhas.length >= 14 ? 3.4 : precoLinhas.length >= 8 ? 3.7 : precoLinhas.length > 4 ? 4.2 : 5;
  let footerHeight = estimateMaquinaFooterHeight(
    precoLinhas.length,
    priceLineStep,
    twoColumnPrices,
  );

  let maxBodyEndY = PROPOSTA_FOOTER_MAX_Y - footerHeight;
  let bulletSpace = maxBodyEndY - bulletStartY - 2;
  let twoColumnBullets = machineCount >= 4 || bulletSpace < bulletCount * 3.2;
  let bulletRows = twoColumnBullets ? Math.ceil(bulletCount / 2) : bulletCount;
  let bulletLineStep = Math.max(2.15, bulletSpace / Math.max(bulletRows, 1) - 0.35);

  if (bulletLineStep < 2.2 && !twoColumnBullets) {
    twoColumnBullets = true;
    bulletRows = Math.ceil(bulletCount / 2);
    bulletLineStep = Math.max(2.15, bulletSpace / bulletRows - 0.35);
  }

  while (bulletLineStep < 2.15 && priceLineStep > 3.1) {
    priceLineStep -= 0.15;
    footerHeight = estimateMaquinaFooterHeight(precoLinhas.length, priceLineStep, twoColumnPrices);
    maxBodyEndY = PROPOSTA_FOOTER_MAX_Y - footerHeight;
    bulletSpace = maxBodyEndY - bulletStartY - 2;
    bulletLineStep = Math.max(
      2.15,
      bulletSpace / Math.max(twoColumnBullets ? Math.ceil(bulletCount / 2) : bulletCount, 1) - 0.35,
    );
  }

  bulletLineStep = Math.min(MAQUINA_BULLET_LINE_STEP, bulletLineStep);
  const bulletsEndY = bulletStartY + bulletRows * (bulletLineStep + 0.35);
  const footerStartY = bulletsEndY + 2;

  return {
    bulletStartY,
    bulletsMaxY: maxBodyEndY,
    bodyMaxY: bulletStartY - 1,
    footerStartY,
    footerMaxY: PROPOSTA_FOOTER_MAX_Y,
    precoLinhas,
    twoColumnPrices,
    priceLineStep,
    bulletLineStep,
    twoColumnBullets,
    compactMachines: machineCount >= 3,
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
  let y = layout.footerStartY ?? MAQUINA_FOOTER_ANCHOR_Y;
  const footerMaxY = layout.footerMaxY ?? PROPOSTA_FOOTER_MAX_Y;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  const precoLinhas =
    layout.precoLinhas ||
    formatManutencaoMaquinaPrecoLinhas(templateMetaFromFill(fill), templateMetaFromFill(fill));

  y = drawManutencaoMaquinaPrecoLines(doc, precoLinhas, y, footerMaxY, {
    twoColumn: layout.twoColumnPrices,
    lineStep: layout.priceLineStep,
  });

  y = drawOrcamentoIvaTotals(doc, fill, y + 1, footerMaxY);
  y += 1;

  pdfSetFont(doc, 'normal');
  const blocks = [
    `Prazo de Entrega: ${pdfSafeText(formatPrazoEntregaForPdf(fill.prazo_entrega))}`,
    `Forma de Pagamento: ${pdfSafeText(fill.forma_pagamento)}`,
    `Validade do orçamento – ${pdfSafeText(fill.validade_orcamento)}`,
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

async function renderManutencaoMaquinaOrcamentoPDF(doc, report, job) {
  const fill = buildOrcamentoFillData(report, job);
  const legalText = await loadLegalText();

  let y = drawOrcamentoLetterhead(doc, fill);
  const layout = resolveManutencaoMaquinaPdfLayout(fill, y);
  const preBulletMaxY = layout.bodyMaxY;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  y = drawOrcamentoBodyParagraphs(doc, [fill.texto_intro || MANUTENCAO_MAQUINA_INTRO], y, {
    maxEndY: preBulletMaxY,
  });
  y += 2;
  y = drawTemplateMaquinaIdentBlocks(doc, fill, y, {
    maxEndY: preBulletMaxY,
    compact: layout.compactMachines,
  });
  y += 2;

  pdfSetFont(doc, 'bold');
  if (canDrawContentLine(y, 5) && y + 5 <= preBulletMaxY) {
    doc.text(MANUTENCAO_MAQUINA_PLANO_TITULO, MARGIN, y);
    y = advanceContentY(y, 5);
  }
  pdfSetFont(doc, 'normal');
  if (canDrawContentLine(y, 5) && y + 5 <= preBulletMaxY) {
    doc.text(`– ${MANUTENCAO_MAQUINA_PLANO_DETALHE}`, MARGIN, y);
    y = advanceContentY(y, 5);
  }

  pdfSetFont(doc, 'bold');
  if (canDrawContentLine(y, 5) && y + 5 <= preBulletMaxY) {
    doc.text(MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO, MARGIN, y);
    y = advanceContentY(y, 5);
  }

  pdfSetFont(doc, 'normal');
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_MAQUINA_TRABALHOS_INTRO], y, {
    lineStep: 4.2,
    maxEndY: preBulletMaxY,
  });
  y = drawOrcamentoBulletList(doc, MANUTENCAO_MAQUINA_TRABALHOS, y, {
    lineStep: layout.bulletLineStep,
    twoColumn: layout.twoColumnBullets,
    maxEndY: layout.bulletsMaxY,
  });

  drawManutencaoMaquinaFooter(doc, fill, {
    ...layout,
    footerStartY: y + 2,
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
