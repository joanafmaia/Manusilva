/**
 * Design system global — geração de PDF Manusilva (todos os relatórios)
 */

import {
  isMaterialTableField,
  MATERIAL_TABLE_PDF_LABEL,
} from './material-table-field.js';

/** Tipografia (pt) */
export const PDF_FONT_TITLE = 16;
export const PDF_FONT_SECTION = 14;
export const PDF_FONT_SUBTITLE = 12;
export const PDF_FONT_BODY = 10;
export const PDF_FONT_CAPTION = 8;

/** Cores institucionais */
export const PDF_COLOR_CORPORATE_BLUE = [30, 64, 115];
export const PDF_COLOR_CORPORATE_BLUE_DARK = [15, 39, 68];
export const PDF_COLOR_SLATE_LINE = [100, 116, 139];
export const PDF_COLOR_TEXT_DARK = [30, 41, 59];
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
export const PDF_FOOTER_TEXT_RGB = [148, 163, 184];

/** Tabelas autoTable */
export const PDF_TABLE_HEAD_FILL = PDF_COLOR_CORPORATE_BLUE;
export const PDF_TABLE_HEAD_TEXT = PDF_COLOR_WHITE;
export const PDF_TABLE_LINE = [226, 232, 240];
export const PDF_TABLE_BODY_FILL = PDF_COLOR_WHITE;
export const PDF_TABLE_ALT_ROW_FILL = [248, 249, 250];
export const PDF_SECTION_BG = [248, 250, 252];

export const PDF_MACHINE_SECTION = 'Informações da Máquina';
export const PDF_VERIFICATION_SECTION_TITLE = 'Verificações Efetuadas';
export const PDF_FOTO_SECTION_TITLE = 'Registo Fotográfico';
export const PDF_FOTO_LABEL_ANTES = 'Antes';
export const PDF_FOTO_LABEL_DEPOIS = 'Depois';

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
    norm.includes('tempo de intervencao')
  ) {
    return true;
  }
  if (norm.includes('resultado do teste') || norm.includes('periodicidade')) return true;
  return false;
}

export function shouldSkipPdfSectionHeader(section, service, ctx = {}) {
  if (!section) return false;
  if (ctx.machineBlockRendered && isMachineInfoSection(section)) return true;
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

/** Estilos base autoTable — todos os relatórios */
export function buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont) {
  pdfSetFont(doc, 'normal');
  return {
    theme: 'plain',
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_BODY,
      cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
      lineColor: PDF_TABLE_LINE,
      lineWidth: 0.15,
      textColor: PDF_COLOR_TEXT_DARK,
      fontStyle: 'normal',
      valign: 'middle',
      overflow: 'linebreak',
    },
    bodyStyles: { fillColor: PDF_TABLE_BODY_FILL },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_TABLE_HEAD_FILL,
      textColor: PDF_TABLE_HEAD_TEXT,
      fontStyle: 'bold',
      fontSize: PDF_FONT_BODY,
      lineColor: PDF_COLOR_CORPORATE_BLUE_DARK,
      lineWidth: 0.15,
      halign: 'left',
      overflow: 'linebreak',
    },
    alternateRowStyles: { fillColor: PDF_TABLE_ALT_ROW_FILL },
  };
}

export function mergePdfTableDidParseCell(extra) {
  return (data) => {
    if (data.section === 'body' && data.row.index % 2 === 1) {
      data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
    }
    if (data.section === 'body') {
      data.cell.styles.fontSize = PDF_FONT_BODY;
    }
    if (extra) extra(data);
  };
}
