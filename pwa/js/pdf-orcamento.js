/**
 * PDF — Proposta Comercial MS.015
 * Folha 1: condições da proposta (equipamentos, observações, aprovação)
 * Folha 2+ (se a tabela não couber): mapa de preços + totais/pagamento
 * Manutenção máquinas / baterias: a partir de 9 equipamentos, mapa de preços na 2.ª folha
 * Última folha: Garantia de Reparação e Condições Gerais (texto)
 */

import { COMPANY } from './mock_data.js';
import { getJob } from './app.js';
import { buildOrcamentoFillData } from './orcamento-fill-data.js';
import { formatClienteAcForPdf, resolveOrcamentoTextoIntroForPdf } from './orcamento-cabecalho.js';
import {
  collectMaquinaPdfFieldRows,
  resolveOrcamentoEquipPdfDisplayLines,
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
import { TITULO_COLUNA_ARTIGOS_DEFAULT } from './orcamento-coluna-artigos.js';
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
  MANUTENCAO_MAQUINA_DL50_COL_LABEL,
  MANUTENCAO_MAQUINA_COL_LABEL,
} from './orcamento-templates.js';

const MARGIN = PDF_MARGIN;
const CONTENT_W = PDF_CONTENT_W;
const PAGE_W = PDF_PAGE_W;
const PAGE_BOTTOM = 287;
const MS015_DOC_REF = 'MS.015.0';
const MS015_DOC_REF_Y = 293.5;
/** Espaço reservado no fundo da folha 1 para a caixa de aprovação do cliente. */
const APPROVAL_BOX_H = 42;
const APPROVAL_TOP = PAGE_BOTTOM - APPROVAL_BOX_H - 5;
/** Folga clara entre a linha «Total:» e o topo da caixa de aprovação. */
const PROPOSTA_APPROVAL_GAP = 14;
const PROPOSTA_FOOTER_MAX_Y = APPROVAL_TOP - PROPOSTA_APPROVAL_GAP;
/** Zona fixa para taxa, prazo e totais — fica toda acima da folga da aprovação. */
const FOOTER_BLOCK_H = 42;
const FOOTER_TOP = PROPOSTA_FOOTER_MAX_Y - FOOTER_BLOCK_H;
/** Zona do corpo da proposta baterias — acima do bloco fixo de valores/pagamento. */
const BATERIA_FOOTER_ANCHOR_Y = FOOTER_TOP - FOOTER_BLOCK_H + 2;
const BATERIA_BODY_MAX_Y = BATERIA_FOOTER_ANCHOR_Y - 6;
/** Manutenção máquinas: rodapé mais alto (3 linhas de preço + prazo/pagamento). */
const MAQUINA_FOOTER_BLOCK_H = 42;
const MAQUINA_FOOTER_ANCHOR_Y = PROPOSTA_FOOTER_MAX_Y - MAQUINA_FOOTER_BLOCK_H;
const MAQUINA_BULLET_LINE_STEP = 3.35;
const MAQUINA_BULLET_MIN_STEP = 3.1;
const MAQUINA_BULLET_COMPACT_FONT = 7.5;
const MAQUINA_FOOTER_GAP_ABOVE = 5;
/** Espaço após o mapa de preços / grelha até Deslocação, taxas ou totais (todas as propostas). */
const ORC_AFTER_PRICE_TABLE_GAP = 2.6;
const ORC_AFTER_PRICE_TOTALS_GAP = 2.2;
/** @deprecated alias — usar ORC_AFTER_PRICE_TABLE_GAP */
const MAQUINA_DESLOCACAO_GAP = ORC_AFTER_PRICE_TABLE_GAP;
const MAQUINA_TOTALS_GAP = ORC_AFTER_PRICE_TOTALS_GAP;
const MAQUINA_PRECO_TABLE_ROW_H = 4.2;
const MAQUINA_PRECO_TABLE_ROW_H_COMPACT = 4;
const MAQUINA_PRECO_TABLE_FONT = 8;
const MAQUINA_PRECO_TABLE_COL_MANUT = MARGIN + 108;
const MAQUINA_FOOTER_MONEY_X = MARGIN + CONTENT_W - 1;
const MAQUINA_FOOTER_LINE_MIN = 4.6;
const MAQUINA_FOOTER_LINE_MAX = 6.2;
const MAQUINA_FOOTER_SEPARATOR_GAP = 4;
/** Manutenção máquinas/baterias: a partir deste nº, preços numa 2.ª folha. */
const MANUTENCAO_SPLIT_PRECO_FROM = 9;
const MAQUINA_SPLIT_TABLE_FROM = MANUTENCAO_SPLIT_PRECO_FROM;
const BATERIA_SPLIT_PRECO_FROM = MANUTENCAO_SPLIT_PRECO_FROM;
const BATERIA_FOOTER_GAP_ABOVE = 6;
/** Não subir o rodapé de baterias acima disto (reserva mínima para o corpo). */
const BATERIA_FOOTER_START_MIN = 115;
const BATERIA_FOOTER_VALOR_STEP_MAX = 5;
const BATERIA_FOOTER_VALOR_STEP_MIN = 3.4;
const BATERIA_FOOTER_BLOCK_STEP_MAX = 4.8;
const BATERIA_FOOTER_BLOCK_STEP_MIN = 3.5;
const BATERIA_FOOTER_VALOR_GAP = 1;
const BATERIA_FOOTER_BLOCK_GAP = 1.5;
const CONTENT_MAX_Y = FOOTER_TOP - 6;

const ORC_TABLE_ROW_H = 6.5;
const ORC_TABLE_GAP_ABOVE_FOOTER = 3;
const ORC_TABLE_COL_X = [MARGIN, MARGIN + 98, MARGIN + 112, MARGIN + 148, MARGIN + CONTENT_W];

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
  /** 3 equipamentos numa única folha — compressão extra garantida. */
  triple: {
    tableRowH: 4.2,
    tableFontSize: 8,
    tableCellPad: 2.8,
    equipLineStep: 3.2,
    equipTail: 1.5,
    separatorBefore: 1.5,
    separatorAfter: 3.5,
    sectionTail: 0,
    introStep: 4,
    introGap: 1.5,
    obsLineStep: 3.4,
    obsHeadGap: 2,
    obsTitleStep: 3.8,
  },
};

/** Até 3 máquinas tentam caber numa folha; se a tabela não couber, vai para folha própria. */
const ORC_GENERIC_SINGLE_PAGE_GROUP_LIMIT = 3;

const ORC_GENERIC_BODY_MAX_Y = FOOTER_TOP - 2;
/** Página só com tabela — usa quase toda a altura A4 (sem caixa de aprovação). */
const ORC_TABLE_PAGE_MAX_Y = PAGE_BOTTOM - 10;

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

function getOrcamentoGenericDensityProfile(id = 'normal', groupCount = 1) {
  const base = ORC_GENERIC_DENSITY[id] || ORC_GENERIC_DENSITY.normal;
  let density = { ...ORC_GENERIC_DENSITY.normal, ...base };

  if (groupCount >= 4) {
    density = {
      ...density,
      tableRowH: 5.2,
      tableFontSize: 8.25,
      tableCellPad: 3.5,
      equipLineStep: 4,
      equipTail: 2,
      separatorBefore: 2,
      separatorAfter: 4.5,
      sectionTail: 1,
    };
  } else if (groupCount === 3) {
    if (id === 'triple') {
      density = { ...ORC_GENERIC_DENSITY.normal, ...ORC_GENERIC_DENSITY.triple };
    } else {
      density = {
        ...density,
        tableRowH: 4.8,
        tableFontSize: 8,
        tableCellPad: 3,
        equipLineStep: 3.4,
        equipTail: 2,
        separatorBefore: 2,
        separatorAfter: 4,
        sectionTail: 0.5,
        introStep: 4.2,
        introGap: 2,
      };
    }
  } else if (groupCount >= 2) {
    density = {
      ...density,
      tableRowH: 5.2,
      tableFontSize: 8.25,
      tableCellPad: 3.5,
      equipLineStep: 4,
      equipTail: 2,
      separatorBefore: 2,
      separatorAfter: 4.5,
      sectionTail: 1,
    };
  } else {
    density = withNormalTableMetrics(base);
  }

  return density;
}

function countOrcamentoEquipamentoGroups(fill = {}) {
  const campos = normalizeEquipamentoCampos(fill.equipamento_campos);
  return groupOrcamentoLinhasByEquipamento(fill.linhas || [], fill.maquinas || [], campos).length;
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
  const equipLines = Math.max(1, Number(equipFieldCount) || 0);
  return equipLines * density.equipLineStep + density.equipTail + density.tableRowH * (1 + rows.length);
}

export function resolveOrcamentoGenericLayout(doc, fill, bodyStartY) {
  const intro = resolveOrcamentoTextoIntroForPdf(fill.maquinas, fill.texto_intro);
  const groupCount = Math.max(1, countOrcamentoEquipamentoGroups(fill));
  const forceSplitByGroups = groupCount > ORC_GENERIC_SINGLE_PAGE_GROUP_LIMIT;
  const order =
    groupCount <= ORC_GENERIC_SINGLE_PAGE_GROUP_LIMIT
      ? ['normal', 'compact', 'tight', 'triple']
      : ['normal', 'compact'];

  for (const densityId of order) {
    const density = getOrcamentoGenericDensityProfile(densityId, groupCount);
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
    if (contentEndY <= ORC_GENERIC_BODY_MAX_Y && !forceSplitByGroups) {
      return {
        density,
        densityId,
        intro,
        introEndY,
        sectionsEndY,
        contentEndY,
        /** @deprecated use splitTablePage — já não se parte a tabela a meio da folha 1 */
        allowPagination: false,
        splitTablePage: false,
        groupCount,
      };
    }
  }

  if (groupCount <= ORC_GENERIC_SINGLE_PAGE_GROUP_LIMIT) {
    const density = getOrcamentoGenericDensityProfile('triple', groupCount);
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
    const fits = contentEndY <= ORC_GENERIC_BODY_MAX_Y;
    return {
      density,
      densityId: 'triple',
      intro,
      introEndY,
      sectionsEndY,
      contentEndY,
      allowPagination: !fits,
      /** Tabela não cabe com as condições → folha 2 só para preços; garantias depois. */
      splitTablePage: !fits,
      groupCount,
    };
  }

  const density = getOrcamentoGenericDensityProfile('compact', groupCount);
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
  return {
    density,
    densityId: 'compact',
    intro,
    introEndY,
    sectionsEndY,
    contentEndY,
    allowPagination: true,
    splitTablePage: true,
    groupCount,
  };
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

function canDrawContentLine(y, step = 5, maxY = CONTENT_MAX_Y) {
  return y + step <= maxY;
}

function advanceContentY(y, step = 5, maxY = CONTENT_MAX_Y) {
  return canDrawContentLine(y, step, maxY) ? y + step : y;
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
  const acLabel = pdfSafeText(formatClienteAcForPdf(fill.cliente_ac)).toUpperCase();
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
  strokeOrcamentoTableHairline(doc, headerBottom);

  let y = headerBottom + 9;
  const orcTitle = `Orçamento nº ${pdfSafeText(fill.orcamento_numero)}`;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text(orcTitle, MARGIN, y);
  const titleW = doc.getTextWidth(orcTitle);
  doc.setDrawColor(...PDF_COLOR_TEXT_DARK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1.1, MARGIN + titleW, y + 1.1);
  y += 6;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text(pdfSafeText(fill.data_extenso), MARGIN, y);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  return y + 8;
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

function drawOrcamentoTable(
  doc,
  linhas,
  startY,
  { maquinas = [], equipamentoCampos = null, layout = null, tituloColunaArtigos = null } = {},
) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  const table =
    layout ||
    computeOrcamentoTableLayout(linhas, maquinas, { equipamentoCampos: campos });
  const grouped = table.grouped;
  const groups = table.groups || groupOrcamentoLinhasByEquipamento(linhas, maquinas, campos);
  const y0 = table.startY ?? startY;
  const colTitulo =
    String(tituloColunaArtigos || '').trim() || TITULO_COLUNA_ARTIGOS_DEFAULT;

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
    strokeOrcamentoTableHairline(doc, y + 1.5);
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
    strokeOrcamentoTableHairline(doc, y + 1.5);
    return y + ORC_TABLE_ROW_H;
  };

  if (grouped) {
    groups.forEach((group, groupIndex) => {
      y = drawMachineHeader(group.label);
      y = drawRow([colTitulo, 'Qtd.', 'Preço Unit.', 'Total'], {
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

  y = drawRow([colTitulo, 'Qtd.', 'Preço Unit.', 'Total'], { bold: true, fill: true });
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
  const pad = 3.5;
  const bottomPad = 8;
  const rightX = boxX + boxW - pad;
  const leftColW = boxW * 0.58;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, APPROVAL_BOX_H, 'FD');

  let ty = boxY + 5.5;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('Aprovação', boxX + pad, ty);

  ty += 5.5;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(8);
  pdfSplitText(
    doc,
    'Declaro que aceito o presente orçamento e valores apresentados',
    leftColW - pad * 2,
  ).forEach((line) => {
    doc.text(line, boxX + pad, ty);
    ty += 3.6;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
  doc.text('Assinatura e carimbo do cliente', boxX + pad, boxY + APPROVAL_BOX_H - bottomPad);

  const closingY = boxY + APPROVAL_BOX_H - bottomPad - 11;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text('De V. Exas.', rightX, closingY, { align: 'right' });
  doc.text('Atentamente', rightX, closingY + 4.5, { align: 'right' });
  pdfSetFont(doc, 'bold');
  doc.text('MANUSILVA,LDA', rightX, closingY + 9, { align: 'right' });

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

/** Linha fina da grelha — mesmo estilo em todas as propostas (sem traço grosso). */
function strokeOrcamentoTableHairline(doc, y) {
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
}

function resolveOrcamentoAfterPriceGap(lineStep = 5) {
  return Math.min(ORC_AFTER_PRICE_TABLE_GAP, Math.max(2.4, lineStep * 0.55));
}

function drawOrcamentoEquipamentoSeparator(doc, y, density = ORC_GENERIC_DENSITY.normal) {
  y += density.separatorBefore;
  strokeOrcamentoTableHairline(doc, y);
  return y + density.separatorAfter;
}

function measureOrcamentoEquipamentoSeparator(y, density = ORC_GENERIC_DENSITY.normal) {
  return y + density.separatorBefore + density.separatorAfter;
}

export function estimateOrcamentoGroupBlockHeight(
  doc,
  equipRows,
  linhas,
  density = ORC_GENERIC_DENSITY.normal,
  includeSeparator = false,
) {
  let h = 0;
  if (equipRows.length) {
    h += measureHorizontalEquipFieldsHeight(doc, equipRows, 0, Number.POSITIVE_INFINITY, density);
  }
  h += density.tableRowH * (1 + filterOrcamentoPdfGroupLinhas(linhas).length);
  if (includeSeparator) {
    h += density.separatorBefore + density.separatorAfter;
  }
  return h;
}

function drawOrcamentoGenericContinuationHeader(doc, fill, { title } = {}) {
  let y = MARGIN + 4;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  const heading =
    title ||
    `Orçamento nº ${pdfSafeText(fill.orcamento_numero)} — continuação`;
  doc.text(heading, MARGIN, y);
  y += 5;
  if (title) {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...PDF_COLOR_TEXT_MUTED);
    doc.text(`Orçamento nº ${pdfSafeText(fill.orcamento_numero)}`, MARGIN, y);
    y += 5;
    doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  }
  strokeOrcamentoTableHairline(doc, y);
  return y + 7;
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
    strokeOrcamentoTableHairline(doc, y + 1.5);
    y += rowH;
    return y;
  };

  return { drawRow };
}

/** Conta linhas de texto (com wrap) da lista vertical de equipamento. */
function countVerticalEquipFieldLines(doc, equipRows, maxWidth = CONTENT_W) {
  const display = resolveOrcamentoEquipPdfDisplayLines(equipRows);
  if (!display.length) return 0;
  let count = 0;
  doc.setFontSize(PDF_FONT_BODY);
  display.forEach((line) => {
    if (line.kind === 'value') {
      pdfSetFont(doc, 'bold');
      count += Math.max(1, pdfSplitText(doc, pdfSafeText(line.value), maxWidth).length);
      return;
    }
    pdfSetFont(doc, 'bold');
    const prefix = `${pdfSafeText(line.label)} – `;
    const prefixW = doc.getTextWidth(prefix);
    const valueWidth = Math.max(12, maxWidth - prefixW);
    pdfSetFont(doc, 'normal');
    count += Math.max(1, pdfSplitText(doc, pdfSafeText(line.value), valueWidth).length);
  });
  return count;
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
  const lineCount = countVerticalEquipFieldLines(doc, equipRows);
  for (let i = 0; i < lineCount; i += 1) {
    if (y + density.equipLineStep > maxEndY) break;
    y += density.equipLineStep;
  }
  return y + density.equipTail;
}

/** Lista vertical estilo carta comercial (Label – Valor), uma spec por linha. */
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
  const fontSize = options.fontSize ?? PDF_FONT_BODY;
  const lineStep = options.lineStep ?? density.equipLineStep;
  const tail = options.tail ?? density.equipTail;
  let y = startY;
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  resolveOrcamentoEquipPdfDisplayLines(equipRows).forEach((line) => {
    if (y + lineStep > maxEndY) return;

    if (line.kind === 'value') {
      pdfSetFont(doc, 'bold');
      const wrapped = pdfSplitText(doc, pdfSafeText(line.value), maxWidth);
      wrapped.forEach((textLine) => {
        if (y + lineStep > maxEndY) return;
        doc.text(textLine, xStart, y);
        y += lineStep;
      });
      return;
    }

    pdfSetFont(doc, 'bold');
    const prefix = `${pdfSafeText(line.label)} – `;
    const prefixW = doc.getTextWidth(prefix);
    const valueWidth = Math.max(12, maxWidth - prefixW);
    pdfSetFont(doc, 'normal');
    const valueLines = pdfSplitText(doc, pdfSafeText(line.value), valueWidth);
    valueLines.forEach((textLine, index) => {
      if (y + lineStep > maxEndY) return;
      if (index === 0) {
        pdfSetFont(doc, 'bold');
        doc.text(prefix, xStart, y);
        pdfSetFont(doc, 'normal');
        doc.text(textLine, xStart + prefixW, y);
      } else {
        pdfSetFont(doc, 'normal');
        doc.text(textLine, xStart + prefixW, y);
      }
      y += lineStep;
    });
  });

  return y + tail;
}

function estimateMaquinaPrecoTableHeight(rowCount, compactFooter, rowH = null) {
  const table = {
    rows: Array.from({ length: rowCount }, () => ({})),
    deslocacao: '—',
  };
  const lineCount = countManutencaoMaquinaFooterLines(table);
  const lineStep =
    rowH != null && rowH > 0
      ? rowH
      : compactFooter
        ? MAQUINA_PRECO_TABLE_ROW_H_COMPACT
        : MAQUINA_PRECO_TABLE_ROW_H;
  return (
    MAQUINA_FOOTER_SEPARATOR_GAP +
    lineCount * lineStep +
    MAQUINA_DESLOCACAO_GAP +
    MAQUINA_TOTALS_GAP
  );
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
  const boldLabel = options.boldLabel !== false;
  const boldValue = Boolean(options.boldValue);
  pdfSetFont(doc, boldLabel ? 'bold' : 'normal');
  doc.text(label, MARGIN, y);
  pdfSetFont(doc, boldValue ? 'bold' : 'normal');
  doc.text(pdfSafeText(value), moneyX, y, { align: 'right' });
}

function measureManutencaoMaquinaFooterContentHeight(table, typography = {}) {
  const lineCount = typography.lineCount ?? countManutencaoMaquinaFooterLines(table);
  const separatorGap = typography.separatorGap ?? MAQUINA_FOOTER_SEPARATOR_GAP;
  const lineStep = typography.lineStep ?? MAQUINA_FOOTER_LINE_MIN;
  const deslocacaoExtra =
    table?.deslocacao != null ? MAQUINA_DESLOCACAO_GAP + MAQUINA_TOTALS_GAP : 0;
  return separatorGap + lineCount * lineStep + deslocacaoExtra;
}

/** Distribui o espaço do rodapé com passo de linha uniforme. */
export function resolveManutencaoMaquinaFooterTypography(availableHeight, table = {}) {
  const lineCount = countManutencaoMaquinaFooterLines(table);
  const separatorGap = MAQUINA_FOOTER_SEPARATOR_GAP;
  const deslocacaoExtra =
    table?.deslocacao != null ? MAQUINA_DESLOCACAO_GAP + MAQUINA_TOTALS_GAP : 0;
  const usable = Math.max(20, availableHeight - separatorGap - deslocacaoExtra);
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
  doc.text(MANUTENCAO_MAQUINA_COL_LABEL, MARGIN + 1, headerY);
  doc.text('Manutenção Geral', MAQUINA_PRECO_TABLE_COL_MANUT, headerY, { align: 'right' });
  doc.text(MANUTENCAO_MAQUINA_DL50_COL_LABEL, MAQUINA_FOOTER_MONEY_X, headerY, { align: 'right' });
  rowTop += lineStep;

  strokeOrcamentoTableHairline(doc, rowTop);

  pdfSetFont(doc, 'normal');
  const rows = table.rows || [];
  const hasDeslocacao = table.deslocacao != null;
  rows.forEach((row, index) => {
    if (rowTop + lineStep > maxY) return;
    const textY = manutencaoFooterRowTextY(rowTop, lineStep, fontSize);
    const maquinaText = fitTableCellText(doc, row.maquina, maquinaColW);
    doc.text(maquinaText, MARGIN + 1, textY);
    doc.text(pdfSafeText(row.manutencao), MAQUINA_PRECO_TABLE_COL_MANUT, textY, { align: 'right' });
    doc.text(pdfSafeText(row.dl50), MAQUINA_FOOTER_MONEY_X, textY, { align: 'right' });
    rowTop += lineStep;
    // Com Deslocação, o fecho da grelha é desenhado no bloco seguinte.
    if (!hasDeslocacao || index < rows.length - 1) {
      strokeOrcamentoTableHairline(doc, rowTop);
    }
  });

  if (hasDeslocacao && rowTop + lineStep + 1 <= maxY) {
    // Fecha a grelha; o espaço até à Deslocação basta (sem linha extra) — padrão de todas as propostas.
    strokeOrcamentoTableHairline(doc, rowTop);

    const gap = resolveOrcamentoAfterPriceGap(lineStep);
    rowTop += gap;

    if (rowTop + lineStep > maxY) {
      pdfSetFont(doc, 'normal');
      doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
      return rowTop;
    }

    const textY = manutencaoFooterRowTextY(rowTop, lineStep, fontSize);
    drawOrcamentoMoneyRow(doc, 'Deslocação:', table.deslocacao, textY, {
      boldLabel: true,
      boldValue: true,
    });
    rowTop += lineStep;
    rowTop += Math.min(ORC_AFTER_PRICE_TOTALS_GAP, Math.max(1.2, gap * 0.55));
  }

  pdfSetFont(doc, 'normal');
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  return rowTop;
}

function measureOrcamentoMachineTableHeight(doc, linhas, startY, density = ORC_GENERIC_DENSITY.normal) {
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  return startY + density.tableRowH * (1 + rows.length);
}

function drawOrcamentoMachineTableSection(
  doc,
  linhas,
  startY,
  density = ORC_GENERIC_DENSITY.normal,
  {
    clip = true,
    maxEndY = ORC_GENERIC_BODY_MAX_Y,
    tituloColunaArtigos = TITULO_COLUNA_ARTIGOS_DEFAULT,
  } = {},
) {
  const rows = filterOrcamentoPdfGroupLinhas(linhas);
  const { drawRow } = createOrcamentoTableRowDrawer(doc, startY, {
    maxEndY,
    density,
    clip,
  });
  const colTitulo = String(tituloColunaArtigos || '').trim() || TITULO_COLUNA_ARTIGOS_DEFAULT;
  let y = drawRow([colTitulo, 'Qtd.', 'Preço Unit.', 'Total'], {
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

function drawOrcamentoTableGroupTitle(doc, label, startY, maxEndY, density = ORC_GENERIC_DENSITY.normal) {
  const rowH = density.tableRowH ?? ORC_TABLE_ROW_H;
  if (startY + rowH + 2 > maxEndY) return startY;
  doc.setFillColor(226, 232, 240);
  doc.rect(MARGIN, startY - 4.2, CONTENT_W, rowH, 'F');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(density.tableFontSize ?? 9);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);
  doc.text(fitTableCellText(doc, label, CONTENT_W - 4), MARGIN + 1, startY);
  strokeOrcamentoTableHairline(doc, startY + 1.5);
  return startY + rowH;
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
  { allowPagination = false, mode = 'full' } = {},
) {
  const campos = normalizeEquipamentoCampos(fill.equipamento_campos);
  const groups = groupOrcamentoLinhasByEquipamento(fill.linhas, fill.maquinas, campos);
  const { blocks } = resolveOrcamentoEquipamentoPdfBlocks(fill);
  let y = startY;
  let bodyPage = doc.internal.getCurrentPageInfo().pageNumber;
  let pageStartY = startY;
  let pageMaxEndY = maxEndY;
  const drawEquip = mode === 'full' || mode === 'conditions';
  const drawTables = mode === 'full' || mode === 'tables';
  const colTitulo =
    String(fill.titulo_coluna_artigos || '').trim() || TITULO_COLUNA_ARTIGOS_DEFAULT;

  groups.forEach((group, groupIndex) => {
    const block = blocks.find((row) => row.index === group.equipamentoIndex) || blocks[groupIndex];
    const equipRows = resolveMaquinaEquipRows(block, fill);
    const includeSeparator = groupIndex < groups.length - 1;
    const groupHeight = estimateOrcamentoGroupBlockHeight(
      doc,
      drawEquip ? equipRows : [],
      drawTables ? group.linhas : [],
      density,
      includeSeparator && (drawEquip || drawTables),
    );

    if (allowPagination && y + groupHeight > pageMaxEndY && y > pageStartY) {
      doc.addPage();
      bodyPage = doc.getNumberOfPages();
      y = drawOrcamentoGenericContinuationHeader(
        doc,
        fill,
        mode === 'tables' ? { title: 'Mapa de preços — continuação' } : undefined,
      );
      pageStartY = y;
      pageMaxEndY = mode === 'tables' ? ORC_TABLE_PAGE_MAX_Y : maxEndY;
    }

    if (drawEquip && equipRows.length) {
      y = drawHorizontalEquipFields(doc, equipRows, y, pageMaxEndY, density);
    }
    if (drawTables) {
      if (mode === 'tables') {
        y = drawOrcamentoTableGroupTitle(doc, group.label, y, pageMaxEndY, density);
      }
      y = drawOrcamentoMachineTableSection(doc, group.linhas, y, density, {
        clip: allowPagination || mode === 'tables',
        maxEndY: pageMaxEndY,
        tituloColunaArtigos: colTitulo,
      });
    }
    if (includeSeparator && (drawEquip || drawTables)) {
      y = drawOrcamentoEquipamentoSeparator(doc, y, density);
    }
  });

  return { y: y + density.sectionTail, page: bodyPage };
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
    { label: 'Subtotal (s/ IVA):', value: formatOrcamentoPdfCurrency(fill.subtotal), boldValue: false },
    { label: 'IVA (23%):', value: formatOrcamentoPdfCurrency(fill.iva), boldValue: false },
    { label: 'Total:', value: formatOrcamentoPdfCurrency(fill.total_geral), boldValue: true },
  ];

  doc.setFontSize(fontSize);
  rows.forEach(({ label, value, boldValue }) => {
    if (y > maxY) return;
    const textY = alignMoney
      ? manutencaoFooterRowTextY(y, lineStep, fontSize)
      : y;
    if (alignMoney) {
      drawOrcamentoMoneyRow(doc, label, value, textY, { boldLabel: true, boldValue });
    } else {
      pdfSetFont(doc, boldValue ? 'bold' : 'normal');
      doc.text(`${label} ${value}`, MARGIN, textY);
    }
    y += lineStep;
  });
  pdfSetFont(doc, 'normal');
  return y;
}

function estimateOrcamentoFooterHeight(fill = {}) {
  const taxas = Array.isArray(fill.taxas_saida) ? fill.taxas_saida.filter(Boolean) : [];
  const taxaLines = Math.max(1, taxas.length);
  // taxas + prazo/pagamento/validade + 3 linhas IVA + folga
  return taxaLines * 5 + 15 + 15 + 4;
}

function drawOrcamentoFooter(doc, fill, options = {}) {
  const anchored = !Number.isFinite(options.startY);
  let y = anchored ? FOOTER_TOP + 4 : options.startY;
  const maxY = Number.isFinite(options.maxY)
    ? options.maxY
    : anchored
      ? PROPOSTA_FOOTER_MAX_Y
      : Infinity;
  const lineStep = options.lineStep ?? 5;
  const alignMoney = options.alignMoney !== false;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  const drawLabelValue = (label, value) => {
    if (y + lineStep > maxY + 0.5) return;
    if (alignMoney) {
      const textY = manutencaoFooterRowTextY(y, lineStep, PDF_FONT_BODY);
      drawOrcamentoMoneyRow(doc, label, value, textY, {
        boldLabel: true,
        boldValue: false,
      });
      y += lineStep;
      return;
    }
    pdfSetFont(doc, 'bold');
    const prefix = label;
    doc.text(prefix, MARGIN, y);
    const prefixW = doc.getTextWidth(prefix);
    pdfSetFont(doc, 'normal');
    doc.text(pdfSafeText(value), MARGIN + prefixW, y);
    y += lineStep;
  };

  const drawTaxasSaida = () => {
    const taxas = Array.isArray(fill.taxas_saida) ? fill.taxas_saida.filter(Boolean) : [];
    if (!taxas.length) {
      drawLabelValue('Taxa de Saída –', '—');
      return;
    }
    taxas.forEach((value, index) => {
      const label = taxas.length === 1 ? 'Taxa de Saída –' : `Taxa de Saída ${index + 1} –`;
      drawLabelValue(label, formatOrcamentoPdfCurrency(value));
    });
  };

  // Mesmo padrão das restantes propostas: espaço após o mapa, sem linha grossa.
  if (!anchored) {
    y += resolveOrcamentoAfterPriceGap(lineStep);
  }

  drawTaxasSaida();
  y += Math.min(ORC_AFTER_PRICE_TOTALS_GAP, 2.2);
  drawLabelValue('Prazo de Entrega:', formatPrazoEntregaForPdf(fill.prazo_entrega));
  drawLabelValue('Forma de Pagamento:', fill.forma_pagamento);
  drawLabelValue('Validade do orçamento –', fill.validade_orcamento);

  // Folga extra antes do Total face à caixa de aprovação.
  y += 1.5;
  return drawOrcamentoIvaTotals(doc, fill, y, maxY, { lineStep, alignMoney });
}

/** Papéis das folhas no orçamento genérico (split vs uma folha). */
export function resolveOrcamentoGenericPageRoles(splitTablePage) {
  if (splitTablePage) {
    return {
      conditionsMaxY: PROPOSTA_FOOTER_MAX_Y,
      conditionsAllowPagination: true,
      footerOnPricePage: true,
    };
  }
  return {
    conditionsMaxY: ORC_GENERIC_BODY_MAX_Y,
    conditionsAllowPagination: false,
    footerOnPricePage: false,
  };
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

export function resolveManutencaoMaquinaPdfFooterLayout(fill = {}) {
  const meta = templateMetaFromFill(fill);
  const precoTable = buildManutencaoMaquinaPrecoTable(meta, meta);
  const rowCount = precoTable.rows.length;
  const namedCount = collectTemplateMaquinaNomes(fill).length;
  // Densidade visual: nomes ou linhas de preço; split: só linhas que entram no mapa.
  const machineCount = Math.max(rowCount, namedCount, 1);
  const splitTablePage = rowCount >= MAQUINA_SPLIT_TABLE_FROM;
  const compactFooter = rowCount >= 6;
  const priceRowH = machineCount >= 7 ? MAQUINA_PRECO_TABLE_ROW_H_COMPACT : MAQUINA_PRECO_TABLE_ROW_H;
  const priceFontSize = machineCount >= 7 ? MAQUINA_BULLET_COMPACT_FONT : MAQUINA_PRECO_TABLE_FONT;
  const priceFooterHeight = estimateMaquinaPrecoTableHeight(rowCount, compactFooter, priceRowH);
  // Folha 1 sem tabela: não reservar altura do mapa de preços.
  const footerHeight = splitTablePage ? 0 : priceFooterHeight;

  return {
    machineCount,
    splitTablePage,
    compactMachines: machineCount >= 3,
    ultraCompactPreBullet: !splitTablePage && machineCount >= 4,
    compactFooter,
    precoTable,
    precoBlocks: buildManutencaoMaquinaPrecoEquipBlocks(meta, meta),
    precoLinhas: formatManutencaoMaquinaPrecoLinhas(meta, meta),
    twoColumnPrices: false,
    priceLineStep: priceRowH,
    priceFontSize,
    priceFooterHeight,
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
  const precoLineCount =
    footerLayout.precoTable?.rows?.length ?? footerLayout.precoBlocks?.length ?? footerLayout.precoLinhas?.length ?? 0;
  const compactFooter = footerLayout.compactFooter;
  const splitTablePage = Boolean(footerLayout.splitTablePage) || footerHeight <= 0;

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

    if (splitTablePage || bulletLineStep >= MAQUINA_BULLET_MIN_STEP || priceLineStep <= 2.75) {
      break;
    }
    priceLineStep = Math.max(2.75, priceLineStep - 0.12);
    footerHeight = estimateMaquinaPrecoTableHeight(precoLineCount, compactFooter, priceLineStep);
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

function estimateBateriaFooterHeight(valorLineCount, typography = {}) {
  const n = Math.max(1, valorLineCount);
  const valorStep = typography.valorLineStep ?? BATERIA_FOOTER_VALOR_STEP_MAX;
  const blockStep = typography.blockLineStep ?? BATERIA_FOOTER_BLOCK_STEP_MAX;
  const valorGap = typography.valorGap ?? BATERIA_FOOTER_VALOR_GAP;
  const blockGap = typography.blockGap ?? BATERIA_FOOTER_BLOCK_GAP;
  // Multi-bateria: texto mais longo → ~1.35 linhas por valor.
  const wrapFactor = n > 1 ? 1.35 : 1;
  const valorLines = Math.ceil(n * wrapFactor);
  const ivaLines = 3;
  const blockLines = 6;
  return (
    valorLines * (valorStep + valorGap * 0.35) +
    n * valorGap * 0.65 +
    ivaLines * Math.max(4, valorStep) +
    4 +
    blockLines * blockStep +
    4 * blockGap
  );
}

/** Tipografia do rodapé de baterias para caber no espaço vertical disponível. */
export function resolveManutencaoBateriaFooterTypography(availableHeight, valorLineCount) {
  const usable = Math.max(28, availableHeight);
  let valorLineStep = BATERIA_FOOTER_VALOR_STEP_MAX;
  let blockLineStep = BATERIA_FOOTER_BLOCK_STEP_MAX;
  let valorGap = BATERIA_FOOTER_VALOR_GAP;
  let blockGap = BATERIA_FOOTER_BLOCK_GAP;
  let fontSize = PDF_FONT_BODY;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const estimatedHeight = estimateBateriaFooterHeight(valorLineCount, {
      valorLineStep,
      blockLineStep,
      valorGap,
      blockGap,
    });
    if (estimatedHeight <= usable) {
      return {
        valorLineStep,
        blockLineStep,
        valorGap,
        blockGap,
        fontSize,
        estimatedHeight,
      };
    }
    valorLineStep = Math.max(BATERIA_FOOTER_VALOR_STEP_MIN, valorLineStep - 0.15);
    blockLineStep = Math.max(BATERIA_FOOTER_BLOCK_STEP_MIN, blockLineStep - 0.12);
    valorGap = Math.max(0.35, valorGap - 0.05);
    blockGap = Math.max(0.6, blockGap - 0.08);
    if (valorLineStep <= 4.1) fontSize = MAQUINA_BULLET_COMPACT_FONT;
  }

  return {
    valorLineStep,
    blockLineStep,
    valorGap,
    blockGap,
    fontSize,
    estimatedHeight: estimateBateriaFooterHeight(valorLineCount, {
      valorLineStep,
      blockLineStep,
      valorGap,
      blockGap,
    }),
  };
}

export function resolveManutencaoBateriaPdfFooterLayout(fill = {}) {
  const meta = templateMetaFromFill(fill);
  const valorLinhas = formatLinhasValorManutencaoBateria(meta, meta);
  const batteryCount = Math.max(valorLinhas.length, 1);
  const splitTablePage = batteryCount >= BATERIA_SPLIT_PRECO_FROM;

  if (splitTablePage) {
    const roomy = resolveManutencaoBateriaFooterTypography(160, valorLinhas.length);
    return {
      batteryCount,
      splitTablePage: true,
      valorLinhas,
      priceFooterHeight: roomy.estimatedHeight,
      footerHeight: 0,
      footerStartY: BATERIA_FOOTER_ANCHOR_Y,
      footerMaxY: PROPOSTA_FOOTER_MAX_Y,
      footerTypography: roomy,
      bodyMaxY: PROPOSTA_FOOTER_MAX_Y - 4,
    };
  }

  const defaultAvailable = PROPOSTA_FOOTER_MAX_Y - BATERIA_FOOTER_ANCHOR_Y;
  let footerTypography = resolveManutencaoBateriaFooterTypography(
    defaultAvailable,
    valorLinhas.length,
  );
  let footerStartY = BATERIA_FOOTER_ANCHOR_Y;

  if (footerTypography.estimatedHeight > defaultAvailable) {
    footerStartY = Math.max(
      BATERIA_FOOTER_START_MIN,
      PROPOSTA_FOOTER_MAX_Y - footerTypography.estimatedHeight,
    );
    footerTypography = resolveManutencaoBateriaFooterTypography(
      PROPOSTA_FOOTER_MAX_Y - footerStartY,
      valorLinhas.length,
    );
    footerStartY = Math.max(
      BATERIA_FOOTER_START_MIN,
      PROPOSTA_FOOTER_MAX_Y - footerTypography.estimatedHeight,
    );
  }

  return {
    batteryCount,
    splitTablePage: false,
    valorLinhas,
    priceFooterHeight: footerTypography.estimatedHeight,
    footerHeight: footerTypography.estimatedHeight,
    footerStartY,
    footerMaxY: PROPOSTA_FOOTER_MAX_Y,
    footerTypography,
    bodyMaxY: footerStartY - BATERIA_FOOTER_GAP_ABOVE,
  };
}

function drawManutencaoBateriaFooter(doc, fill, layout = {}) {
  let y = layout.footerStartY ?? BATERIA_FOOTER_ANCHOR_Y;
  const footerMaxY = layout.footerMaxY ?? PROPOSTA_FOOTER_MAX_Y;
  const availableHeight = Math.max(28, footerMaxY - y);
  const meta = templateMetaFromFill(fill);
  const valorLinhas =
    layout.valorLinhas || formatLinhasValorManutencaoBateria(meta, meta);
  const typography =
    layout.footerTypography ||
    resolveManutencaoBateriaFooterTypography(availableHeight, valorLinhas.length);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(typography.fontSize);
  doc.setTextColor(...PDF_COLOR_TEXT_DARK);

  pdfSetFont(doc, 'bold');
  valorLinhas.forEach((valorLine) => {
    pdfSplitText(doc, valorLine, CONTENT_W).forEach((line) => {
      if (y + typography.valorLineStep > footerMaxY + 0.5) return;
      doc.text(line, MARGIN, y);
      y += typography.valorLineStep;
    });
    y += typography.valorGap;
  });

  y += resolveOrcamentoAfterPriceGap(typography.valorLineStep);
  y = drawOrcamentoIvaTotals(doc, fill, y, footerMaxY, {
    lineStep: Math.max(4, typography.valorLineStep),
    fontSize: typography.fontSize,
    alignMoney: true,
  });
  y += ORC_AFTER_PRICE_TOTALS_GAP * 0.55;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(typography.fontSize);
  const blocks = [
    MANUTENCAO_BATERIA_MO_OBS,
    `Forma de Pagamento: ${pdfSafeText(fill.forma_pagamento)}`,
    `Validade do orçamento – ${pdfSafeText(fill.validade_orcamento)}`,
    MANUTENCAO_BATERIA_NOTA_PECAS,
  ];

  blocks.forEach((text) => {
    pdfSplitText(doc, text, CONTENT_W).forEach((line) => {
      if (y + typography.blockLineStep > footerMaxY + 0.5) return;
      doc.text(line, MARGIN, y);
      y += typography.blockLineStep;
    });
    y += typography.blockGap;
  });

  return y;
}

function drawManutencaoMaquinaFooter(doc, fill, layout = {}) {
  const footerMinY = layout.footerStartY ?? MAQUINA_FOOTER_ANCHOR_Y;
  const footerMaxY = layout.footerMaxY ?? PROPOSTA_FOOTER_MAX_Y;
  const availableHeight = Math.max(20, footerMaxY - footerMinY);

  const precoTable =
    layout.precoTable ||
    buildManutencaoMaquinaPrecoTable(templateMetaFromFill(fill), templateMetaFromFill(fill));

  const typography =
    layout.footerTypography ||
    resolveManutencaoMaquinaFooterTypography(availableHeight, precoTable);

  let y = footerMinY + typography.separatorGap;

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
  const splitTablePage = footerLayout.splitTablePage;
  const reservedFooter = splitTablePage ? 0 : footerLayout.footerHeight;
  const gapAboveFooter = splitTablePage ? 0 : MAQUINA_FOOTER_GAP_ABOVE;
  const preBulletMaxY = PROPOSTA_FOOTER_MAX_Y - reservedFooter - gapAboveFooter - 22;
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
  if (canDrawContentLine(y, sectionStep, preBulletMaxY)) {
    doc.text(MANUTENCAO_MAQUINA_PLANO_TITULO, MARGIN, y);
    y = advanceContentY(y, sectionStep, preBulletMaxY);
  }
  pdfSetFont(doc, 'normal');
  if (canDrawContentLine(y, sectionStep, preBulletMaxY)) {
    doc.text(`– ${MANUTENCAO_MAQUINA_PLANO_DETALHE}`, MARGIN, y);
    y = advanceContentY(y, sectionStep, preBulletMaxY);
  }

  pdfSetFont(doc, 'bold');
  if (canDrawContentLine(y, sectionStep, preBulletMaxY)) {
    doc.text(MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO, MARGIN, y);
    y = advanceContentY(y, sectionStep, preBulletMaxY);
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

  if (splitTablePage) {
    // Folha 1: condições + aprovação — sem mapa de preços.
    doc.setPage(1);
    drawClientApprovalBox(doc);

    // Folha 2: tabela de preços + Deslocação + totais + prazo/pagamento.
    doc.addPage();
    const tableY = drawOrcamentoGenericContinuationHeader(doc, fill, {
      title: 'Mapa de preços',
    });
    drawManutencaoMaquinaFooter(doc, fill, {
      ...footerLayout,
      footerStartY: tableY,
      footerMaxY: ORC_TABLE_PAGE_MAX_Y,
      gapBeforeFooter: 0,
    });
  } else {
    drawManutencaoMaquinaFooter(doc, fill, {
      ...footerLayout,
      ...bulletsLayout,
      footerStartY: y + bulletsLayout.gapBeforeFooter,
    });

    doc.setPage(1);
    drawClientApprovalBox(doc);
  }

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
  const footerLayout = resolveManutencaoBateriaPdfFooterLayout(fill);
  const splitTablePage = footerLayout.splitTablePage;
  const meta = templateMetaFromFill(fill);
  const paragrafos = buildManutencaoBateriaParagrafos(meta, meta);
  const bodyMaxY = footerLayout.bodyMaxY ?? BATERIA_BODY_MAX_Y;

  let y = drawOrcamentoLetterhead(doc, fill);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_BATERIA_INTRO], y, { maxEndY: bodyMaxY });
  y += 2;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  if (canDrawContentLine(y, 6, bodyMaxY)) {
    doc.text(MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO, MARGIN, y);
    y = advanceContentY(y, 6, bodyMaxY);
  }

  pdfSetFont(doc, 'normal');
  y = drawOrcamentoBodyParagraphs(doc, [MANUTENCAO_BATERIA_TRABALHOS_INTRO], y, {
    lineStep: 4.5,
    maxEndY: bodyMaxY,
  });
  y = drawOrcamentoBulletList(doc, MANUTENCAO_BATERIA_TRABALHOS, y, {
    maxEndY: bodyMaxY,
  });
  y += 2;
  y = drawOrcamentoBodyParagraphs(doc, paragrafos, y, {
    lineStep: 4.5,
    maxEndY: bodyMaxY,
  });

  if (splitTablePage) {
    // Folha 1: condições + aprovação — sem mapa de preços.
    doc.setPage(1);
    drawClientApprovalBox(doc);

    // Folha 2: valores por bateria + totais + pagamento.
    doc.addPage();
    const tableY = drawOrcamentoGenericContinuationHeader(doc, fill, {
      title: 'Mapa de preços',
    });
    drawManutencaoBateriaFooter(doc, fill, {
      ...footerLayout,
      footerStartY: tableY,
      footerMaxY: ORC_TABLE_PAGE_MAX_Y,
    });
  } else {
    drawManutencaoBateriaFooter(doc, fill, footerLayout);

    doc.setPage(1);
    drawClientApprovalBox(doc);
  }

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
  const { density, splitTablePage } = layout;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  pdfSplitText(doc, layout.intro, CONTENT_W).forEach((line) => {
    doc.text(line, MARGIN, y);
    y += density.introStep;
  });
  y += density.introGap;

  if (splitTablePage) {
    // Folhas de condições: equipamentos + observações + aprovação — sem tabela nem totais.
    const pageRoles = resolveOrcamentoGenericPageRoles(true);
    const conditions = drawOrcamentoMaquinaSections(
      doc,
      fill,
      y,
      pageRoles.conditionsMaxY,
      density,
      {
        mode: 'conditions',
        allowPagination: pageRoles.conditionsAllowPagination,
      },
    );
    doc.setPage(conditions.page);
    drawOrcamentoObservacoesCliente(doc, fill, conditions.y, {
      maxEndY: pageRoles.conditionsMaxY,
      density,
    });
    drawClientApprovalBox(doc);

    // Folhas de preços: mapa + totais/pagamento (alinhado com manutenção).
    doc.addPage();
    let tableY = drawOrcamentoGenericContinuationHeader(doc, fill, {
      title: 'Mapa de preços',
    });
    const tables = drawOrcamentoMaquinaSections(doc, fill, tableY, ORC_TABLE_PAGE_MAX_Y, density, {
      mode: 'tables',
      allowPagination: true,
    });
    doc.setPage(tables.page);
    let footerY = tables.y;
    const footerH = estimateOrcamentoFooterHeight(fill);
    if (footerY + footerH > ORC_TABLE_PAGE_MAX_Y) {
      doc.addPage();
      footerY = drawOrcamentoGenericContinuationHeader(doc, fill, {
        title: 'Totais e condições comerciais',
      });
    }
    drawOrcamentoFooter(doc, fill, {
      startY: footerY,
      maxY: ORC_TABLE_PAGE_MAX_Y,
    });
  } else {
    const sections = drawOrcamentoMaquinaSections(doc, fill, y, ORC_GENERIC_BODY_MAX_Y, density, {
      mode: 'full',
      allowPagination: false,
    });

    doc.setPage(sections.page);
    drawOrcamentoObservacoesCliente(doc, fill, sections.y, {
      maxEndY: ORC_GENERIC_BODY_MAX_Y,
      density,
    });

    drawOrcamentoFooter(doc, fill);

    doc.setPage(sections.page);
    drawClientApprovalBox(doc);
  }

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
