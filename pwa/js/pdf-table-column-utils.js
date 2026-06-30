/**
 * Utilitários de colunas autoTable — cabeçalhos curtos e larguras proporcionais.
 */

import {
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_TABLE,
} from './pdf-design-system.js';
import {
  columnKey as materialColumnKey,
  columnLabel as materialColumnLabel,
} from './material-table-field.js';
import { LABEL_TIPO, LABEL_HORAS } from './field-labels.js';

const TABLE_HEADER_SHORT = {
  artigo: 'Artigo / Desc.',
  quantidade: 'Qtd.',
  qtd: 'Qtd.',
  data_intervencao: 'Data',
  servico_efectuado_equipamento: 'Serviço / Equip.',
  tecnico: 'Técnico',
  equipamento: 'Equipamento',
  material: 'Material',
  tipo: LABEL_TIPO,
  horas: LABEL_HORAS,
};

const columnKey = materialColumnKey;

export function formatTableHeaderLabel(col) {
  const key = columnKey(col);
  if (TABLE_HEADER_SHORT[key]) return TABLE_HEADER_SHORT[key];
  const label = materialColumnLabel(col);
  return label
    .replace(/Descrição/gi, 'Desc.')
    .replace(/Quantidade/gi, 'Qtd.')
    .replace(/Intervenção/gi, 'Interv.')
    .replace(/Verificação/gi, 'Verif.')
    .replace(/Efectuado/gi, 'Efect.')
    .replace(/Identificação/gi, 'Ident.');
}

function columnPdfWeight(col) {
  const label = materialColumnLabel(col);
  const key = columnKey(col);
  const compactDataKeys = new Set(['qtd', 'quantidade', 'horas', 'qty', 'tipo', 'tensao_v']);
  const len = Math.max(String(label).length, 4);
  return compactDataKeys.has(key) ? len * 0.75 : len;
}

export function buildSmartColumnStyles(columns, tableWidth = CONTENT_W) {
  const weights = columns.map((c) => columnPdfWeight(c));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const styles = {};
  columns.forEach((_, i) => {
    styles[i] = {
      cellWidth: (weights[i] / total) * tableWidth,
      overflow: 'linebreak',
      fontSize: PDF_FONT_TABLE,
    };
  });
  return styles;
}
