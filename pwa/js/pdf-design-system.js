/**
 * Design system global — geração de PDF Manusilva (todos os relatórios)
 */

import {
  isMaterialTableField,
  MATERIAL_TABLE_PDF_LABEL,
} from './material-table-field.js';

/** Tipografia premium (pt) — título 13–14, secções 10.5, tabelas 8.5, corpo 9 */
export const PDF_FONT_TITLE = 13;
export const PDF_FONT_SECTION = 10.5;
export const PDF_FONT_SUBTITLE = 10.5;
export const PDF_FONT_BODY = 9;
export const PDF_FONT_TABLE = 8.5;
export const PDF_FONT_CAPTION = 8;

/** Espaçamento compacto (~10px entre blocos; células 4px vertical / 6px horizontal) */
export const PDF_SECTION_GAP_MM = 2.7;
/** Bloco meta (Data / Visitas / Técnico) — respiro abaixo do título e antes da 1.ª secção */
export const PDF_SERVICE_INFO_MARGIN_TOP_MM = 3.2;
export const PDF_SERVICE_INFO_MARGIN_BOTTOM_MM = 4;
export const PDF_SERVICE_INFO_ROW_H_MM = 5;
export const PDF_SERVICE_INFO_COL_GAP_MM = 4.2;
export const PDF_TABLE_ROW_STEP_MM = 5;
export const PDF_TABLE_CELL_PADDING = { top: 1.1, right: 1.6, bottom: 1.1, left: 1.6 };
export const PDF_TABLE_CELL_PADDING_HEAD = { top: 1.1, right: 1.6, bottom: 1.1, left: 1.6 };
/** ~3px vertical — tabelas de verificação empilhadores (linhas juntas) */
export const PDF_TABLE_CELL_PADDING_COMPACT = { top: 0.8, right: 1.2, bottom: 0.8, left: 1.2 };
export const PDF_TABLE_MIN_CELL_HEIGHT_COMPACT = 4;
export const PDF_TABLE_LINE_WIDTH = 0.1;
export const PDF_TABLE_MIN_CELL_HEIGHT = 5;
export const PDF_TITLE_BAR_HEIGHT_MM = 8;
export const PDF_SECTION_BAND_HEIGHT_MM = 8;

/** Cabeçalho bilateral compacto */
export const PDF_LOGO_WIDTH_MM = 40;
export const PDF_LOGO_HEIGHT_MM = 28;
export const PDF_HEADER_CLIENT_W = 82;

/** Cores premium — grafite #2D3748, azul técnico #2B6CB0, fundo secção #EDF2F7 */
export const PDF_COLOR_CORPORATE_BLUE = [43, 108, 176];
export const PDF_COLOR_CORPORATE_BLUE_DARK = [43, 108, 176];
export const PDF_COLOR_SLATE_LINE = [100, 116, 139];
export const PDF_COLOR_TEXT_DARK = [45, 55, 72];
export const PDF_COLOR_TEXT_MUTED = [100, 116, 139];
export const PDF_COLOR_WHITE = [255, 255, 255];
export const PDF_COLOR_SUCCESS = [16, 185, 129];
export const PDF_COLOR_DANGER = [248, 113, 113];

/** Layout (mm) */
export const PDF_MARGIN = 15;
export const PDF_PAGE_W = 210;
export const PDF_PAGE_H = 297;
export const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;
export const PDF_PAGE_CONTENT_START_Y = 22;
export const PDF_FOOTER_BLOCK_TOP = PDF_PAGE_H - 28;
export const PDF_PAGE_NUMBER_Y = PDF_FOOTER_BLOCK_TOP - 8;
export const PDF_CONTENT_SAFE_BOTTOM_MM = PDF_PAGE_H - PDF_PAGE_NUMBER_Y + 3;
export const PDF_AUTOTABLE_MARGIN_BOTTOM_MM = PDF_PAGE_H - PDF_FOOTER_BLOCK_TOP + 4;
export const PDF_FOOTER_TEXT_RGB = [75, 75, 75];
export const PDF_FOOTER_INSTITUTIONAL_RGB = PDF_FOOTER_TEXT_RGB;

/** Tabelas autoTable — linhas #E2E8F0, cabeçalhos fundo suave + texto grafite */
export const PDF_SECTION_BG = [237, 242, 247];
export const PDF_TABLE_HEAD_FILL = PDF_SECTION_BG;
export const PDF_TABLE_HEAD_TEXT = PDF_COLOR_TEXT_DARK;
export const PDF_TABLE_LINE = [226, 232, 240];
export const PDF_TABLE_BODY_FILL = PDF_COLOR_WHITE;
export const PDF_TABLE_ALT_ROW_FILL = [248, 250, 252];
export const PDF_CLIENT_BOX_FILL = [248, 250, 252];

export const PDF_MACHINE_SECTION = 'Informações da Máquina';
export const PDF_VERIFICATION_SECTION_TITLE = 'Verificações Efetuadas';
export const PDF_FOTO_SECTION_TITLE = 'Registo Fotográfico';
export const PDF_FOTO_LABEL_ANTES = 'Antes';
export const PDF_FOTO_LABEL_DEPOIS = 'Depois';

/** Secção universal Antes/Depois — grelha 2 colunas (todos os relatórios com fotos opcionais) */
export const PDF_INTERVENTION_FOTO_TITLE = 'Fotografias da Intervenção';
export const PDF_INTERVENTION_FOTO_LABEL_ANTES = 'Foto Antes';
export const PDF_INTERVENTION_FOTO_LABEL_DEPOIS = 'Foto Depois';
export const PDF_INTERVENTION_FOTO_HEAD_FONT_PT = 10.5;
export const PDF_INTERVENTION_FOTO_CAPTION_PT = 8.5;
export const PDF_INTERVENTION_FOTO_BAR_H_MM = 5.5;
export const PDF_INTERVENTION_FOTO_BAR_RADIUS_MM = 1.1;
export const PDF_INTERVENTION_FOTO_IMG_RADIUS_MM = 1.6;
export const PDF_INTERVENTION_FOTO_GRID_GAP_MM = 4.2;
export const PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM = 3.2;
export const PDF_INTERVENTION_FOTO_MAX_H_MM = 52;
export const PDF_INTERVENTION_FOTO_CAPTION_H_MM = 5.5;
export const PDF_INTERVENTION_FOTO_SLOT_FILL = [248, 250, 252];
export const PDF_INTERVENTION_FOTO_IMG_PADDING_MM = 1.2;
export const PDF_APPENDIX_THUMB_W_MM = 42;
export const PDF_APPENDIX_THUMB_H_MM = 32;
export const PDF_APPENDIX_THUMB_GAP_MM = 6;

/** Altura reservada da secção de fotos (layout idêntico em todos os relatórios). */
export function estimatePdfInterventionFotosHeight(bottomGapMm = 4) {
  return (
    PDF_INTERVENTION_FOTO_BAR_H_MM +
    PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM +
    PDF_INTERVENTION_FOTO_MAX_H_MM +
    PDF_INTERVENTION_FOTO_CAPTION_H_MM +
    bottomGapMm
  );
}

export const PDF_SCALAR_FIELD_TYPES = new Set([
  'text',
  'date',
  'number',
  'status_pills',
  'toggle_component',
  'dropdown',
  'choice',
  'toggle',
  'client_combobox',
]);

/** Campos DL50 desenhados no bloco dedicado de máquina */
export const PDF_DL50_MACHINE_FIELD_IDS = new Set([
  'marca',
  'modelo',
  'numero_de_serie',
  'data_fabrico',
]);

export function pdfNormalizeHeading(text) {
  return String(text || '')
    .trim()
    .toLocaleLowerCase('pt-PT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isMachineInfoSection(section) {
  return pdfNormalizeHeading(section) === pdfNormalizeHeading(PDF_MACHINE_SECTION);
}

export function sectionFields(service, section) {
  return (service?.fields || []).filter((f) => f.section === section);
}

export function isPdfScalarFieldType(type) {
  return Boolean(type && PDF_SCALAR_FIELD_TYPES.has(type));
}

export function getMachineSectionScalarFields(service) {
  return (service?.fields || []).filter(
    (f) => f.section && isMachineInfoSection(f.section) && isPdfScalarFieldType(f.type),
  );
}

export function reportHasMachineSection(service) {
  return getMachineSectionScalarFields(service).length > 0;
}

export function isSelfTitledBlockField(field) {
  if (!field?.type) return false;
  if (isMaterialTableField(field)) return true;
  return [
    'verification_toggles',
    'dynamic_table',
    'grandes_identificacao_baterias',
    'matrix_4options',
    'multi_checkbox',
  ].includes(field.type);
}

export function isEmpilhadoresMaterialSubstitutionSection(section, service) {
  if (service?.id !== 'manutencao_preventiva_empilhadores' || !section) return false;
  const norm = pdfNormalizeHeading(section);
  return norm.includes('substituicao') && norm.includes('material');
}

export function isMaterialOnlySection(section, service) {
  if (!section) return false;
  const norm = pdfNormalizeHeading(section);
  if (!norm.includes('consumiveis') && !norm.includes('material aplicado')) return false;
  const inSection = sectionFields(service, section);
  return inSection.length > 0 && inSection.every((f) => isMaterialTableField(f));
}

export function isVerificationOnlySection(section, service) {
  if (!section) return false;
  const norm = pdfNormalizeHeading(section);
  if (!norm.includes('verific')) return false;
  const inSection = sectionFields(service, section);
  return inSection.length > 0 && inSection.every((f) => f.type === 'verification_toggles');
}

export function isSingleSelfTitledSection(section, service) {
  const inSection = sectionFields(service, section);
  if (inSection.length !== 1) return false;
  return isSelfTitledBlockField(inSection[0]);
}

/**
 * Secção cujos escalares já foram desenhados num bloco compacto dedicado.
 */
export function isScalarCompactSection(section, service) {
  if (!section) return false;
  if (isMachineInfoSection(section)) return true;
  const norm = pdfNormalizeHeading(section);
  if (norm.includes('identificacao cliente') || norm.includes('identificacao do carregador')) {
    return true;
  }
  if (norm.includes('logistica') || norm.includes('datas de intervencao')) return true;
  if (
    norm.includes('analise da bateria') ||
    norm.includes('deslocacao e tempo') ||
    norm.includes('tempo de intervencao') ||
    norm.includes('numero de visitas e tempo') ||
    norm.includes('estado final')
  ) {
    return true;
  }
  if (norm.includes('resultado do teste') || norm.includes('periodicidade')) return true;
  if (norm.includes('fecho')) return true;
  if (norm.includes('pedido de orcamento')) return true;
  return false;
}

export function shouldSkipPdfSectionHeader(section, service, ctx = {}) {
  if (!section) return false;
  if (ctx.machineBlockRendered && isMachineInfoSection(section)) return true;
  if (isEmpilhadoresMaterialSubstitutionSection(section, service)) return true;
  if (isMaterialOnlySection(section, service)) return true;
  if (isVerificationOnlySection(section, service)) return true;
  if (isSingleSelfTitledSection(section, service)) return true;
  return false;
}

/** Título único do bloco — nunca repetir secção + lista com o mesmo nome */
export function getBlockPdfTitle(field) {
  if (!field) return null;
  if (field.pdfTitle) return field.pdfTitle;
  if (isMaterialTableField(field)) return MATERIAL_TABLE_PDF_LABEL;
  if (field.type === 'verification_toggles') {
    return field.label || PDF_VERIFICATION_SECTION_TITLE;
  }
  if (field.type === 'grandes_identificacao_baterias') {
    return field.label || 'Identificação Bateria';
  }
  if (field.type === 'multi_checkbox') return field.label;
  if (field.type === 'matrix_4options') return field.label || 'Pontos de Inspeção';
  if (field.type === 'dynamic_table' && !isMaterialTableField(field)) {
    return field.label;
  }
  return field.label || field.section || null;
}

/** @deprecated usar getBlockPdfTitle */
export function getVerificationPdfTitle(field) {
  return getBlockPdfTitle(field);
}

/** Bloco de equipamento padronizado em todos os PDFs */
export const PDF_STANDARD_MACHINE_SPECS = [
  { id: 'marca', label: 'Marca' },
  { id: 'modelo', label: 'Modelo' },
  {
    id: 'numero_de_serie',
    label: 'Número de Série',
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'n_interno', label: 'Nº Interno', aliases: ['num_interno'] },
];

/** Campos de diagnóstico antes das assinaturas */
export const PDF_CLOSING_DIAGNOSTIC_SPECS = [
  { id: 'horas', label: 'Horas', aliases: ['horas_gastas'] },
  { id: 'estado_maquina', label: 'Estado da Máquina' },
];

/** Ordem e rótulos originais — Análise da Bateria (PDF Manutenção Preventiva) */
export const PREVENTIVA_BATERIA_ANALYSIS_SPECS = [
  { id: 'densidade', label: 'Densidade' },
  { id: 'tensao', label: 'Tensão', unit: 'V' },
  { id: 'tensao_media_elementos', label: 'Tensão Media de Elementos', unit: 'V' },
  { id: 'nivel_eletrolito', label: 'Nivel de Eletrólito' },
  { id: 'ficha', label: 'Ficha' },
  { id: 'condutividade', label: 'Condutividade' },
  { id: 'parafusos', label: 'Parafusos' },
  { id: 'elementos_curto_circuito', label: 'Nº Elementos Em Curto Circuito' },
  { id: 'estado_cofre', label: 'Estado do Cofre', multi: true },
  { id: 'enchimento', label: 'Verificação do Enchimento' },
  { id: 'terminal_olhal', label: 'Terminal olhal' },
  { id: 'qtd_parafusos_danificados', label: 'Quantidade de parafusos danificados' },
];

export const PREVENTIVA_BATERIA_PDF_FIELD_IDS = new Set([
  ...PREVENTIVA_BATERIA_ANALYSIS_SPECS.map((s) => s.id),
  'qtd_parafusos_danificados',
  'consumiveis',
  'horas',
  'visitas_realizadas',
  'visitas',
  'observacao',
  'estado_final',
  'data_de_conclusao',
]);

/** Campos desenhados no layout dedicado — Folha de Intervenção de Avarias */
export const FOLHA_INTERVENCAO_AVARIAS_PDF_FIELD_IDS = new Set([
  'marca',
  'modelo',
  'numero_de_serie',
  'num_serie',
  'numero_serie',
  'n_serie',
  'n_interno',
  'num_interno',
  'horas',
  'detecao_de_avaria',
  'resolucao_da_avaria',
  'material_utilizado',
  'visitas_realizadas',
  'data_1',
  'data_2',
  'horas_gastas',
  'pedido_orcamento',
  'detalhe_pedido_orcamento',
  'estado_maquina',
  'data_de_conclusao',
]);

/** Campos desenhados no layout dedicado — Reparação Carregador */
export const REPARACAO_CARREGADOR_PDF_FIELD_IDS = new Set([
  'data_rececao',
  'concluido_testado_em',
  'cliente',
  'cliente_id',
  'nif',
  'morada',
  'localidade',
  'etiqueta',
  'responsavel',
  'marca_modelo',
  'numero_de_serie',
  'num_serie',
  'registo_intervencao',
  'resultado_teste',
  'valor_amperagem_debitado',
  'consumiveis_material',
  'deslocacao',
]);

export const PDF_LAYOUT_SKIP_FIELD_IDS = new Set([
  ...PDF_STANDARD_MACHINE_SPECS.flatMap((s) => [s.id, ...(s.aliases || [])]),
  ...PDF_CLOSING_DIAGNOSTIC_SPECS.flatMap((s) => [s.id, ...(s.aliases || [])]),
  ...FOLHA_INTERVENCAO_AVARIAS_PDF_FIELD_IDS,
  ...REPARACAO_CARREGADOR_PDF_FIELD_IDS,
  ...PREVENTIVA_BATERIA_ANALYSIS_SPECS.map((s) => s.id),
  'qtd_parafusos_danificados',
  'deslocacao',
  'visitas_realizadas',
  'visitas',
  'deslocacao_base_km',
  'datas_visitas',
  'data_de_conclusao',
  'data_1',
  'data_2',
  'data_3',
  'data_4',
  'data_5',
  'tecnico',
]);

/** Resolve valor de campo padronizado (com aliases). */
export function resolvePdfStandardFieldValue(values, spec, fallback = null) {
  const pools = [values, values?.maquina, values?.machine].filter(Boolean);
  for (const pool of pools) {
    if (pool[spec.id] != null && String(pool[spec.id]).trim()) return pool[spec.id];
    for (const alias of spec.aliases || []) {
      if (pool[alias] != null && String(pool[alias]).trim()) return pool[alias];
    }
  }
  return fallback;
}

/** Bordas só horizontais (#E2E8F0) — sem linhas verticais */
export function applyPdfTableHorizontalBorders(data) {
  data.cell.styles.lineWidth = {
    top: PDF_TABLE_LINE_WIDTH,
    right: 0,
    bottom: PDF_TABLE_LINE_WIDTH,
    left: 0,
  };
  data.cell.styles.lineColor = PDF_TABLE_LINE;
}

/** Estilos base autoTable — todos os relatórios */
export function buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont) {
  pdfSetFont(doc, 'normal');
  return {
    theme: 'plain',
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_TABLE,
      cellPadding: PDF_TABLE_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: PDF_COLOR_TEXT_DARK,
      fontStyle: 'normal',
      valign: 'middle',
      overflow: 'linebreak',
    },
    bodyStyles: { fillColor: PDF_TABLE_BODY_FILL, minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_TABLE_HEAD_FILL,
      textColor: PDF_TABLE_HEAD_TEXT,
      fontStyle: 'bold',
      fontSize: PDF_FONT_TABLE,
      cellPadding: PDF_TABLE_CELL_PADDING_HEAD,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
      overflow: 'linebreak',
    },
    alternateRowStyles: { fillColor: PDF_TABLE_ALT_ROW_FILL },
  };
}

export function mergePdfTableDidParseCell(extra) {
  return (data) => {
    applyPdfTableHorizontalBorders(data);
    if (data.section === 'body' && data.row.index % 2 === 1) {
      data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
    }
    if (data.section === 'body') {
      data.cell.styles.fontSize = PDF_FONT_TABLE;
    } else if (data.section === 'head' && data.cell.styles.fontSize !== PDF_FONT_SECTION) {
      data.cell.styles.fontSize = PDF_FONT_TABLE;
    }
    if (extra) extra(data);
  };
}
