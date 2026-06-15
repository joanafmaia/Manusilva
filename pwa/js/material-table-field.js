/**
 * Tabela dinâmica de material — formato unificado [{ artigo, qtd }]
 */

/** Título único no PDF e formulários — evita duplicar «Consumíveis» + subtítulo */
export const MATERIAL_TABLE_PDF_LABEL = 'Consumíveis Utilizados';

export const MATERIAL_UTILIZADO_COLUMNS = [
  { id: 'artigo', label: 'Artigo / Descrição' },
  { id: 'qtd', label: 'Quantidade' },
];

/** Linha vazia padronizada — evita [{}] e [object Object] nos inputs */
export function emptyMaterialRow() {
  return { artigo: '', qtd: '' };
}

const LEGACY_MATERIAL_KEYS = {
  material: 'artigo',
  equipamento: 'artigo',
  descricao: 'artigo',
  quantidade: 'qtd',
  qty: 'qtd',
};

export const MATERIAL_FIELD_IDS = new Set([
  'material_utilizado',
  'consumiveis',
  'consumiveis_utilizados',
  'consumiveis_material',
]);

const OBSERVATIONS_FIELD_IDS = new Set(['observacoes', 'observacao']);

export function columnLabel(col) {
  if (col && typeof col === 'object') return col.label || col.id || '';
  return String(col);
}

export function columnKey(col) {
  if (col && typeof col === 'object') {
    if (col.id) return col.id;
    return columnKey(String(col.label || ''));
  }
  return String(col)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Campo dynamic_table padronizado — aceita overrides de id, label, section */
export function createMaterialTableField(overrides = {}) {
  return {
    type: 'dynamic_table',
    id: 'material_utilizado',
    label: MATERIAL_TABLE_PDF_LABEL,
    columns: MATERIAL_UTILIZADO_COLUMNS,
    columnTypes: { qtd: 'number' },
    tableVariant: 'material',
    addButtonLabel: 'Adicionar linha',
    ...overrides,
  };
}

export function getMaterialTablePdfLabel() {
  return MATERIAL_TABLE_PDF_LABEL;
}

function normalizeSectionName(section) {
  return String(section || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Secções só com tabela de material — não repetir título genérico «Consumíveis» no PDF */
export function isMaterialOnlySection(section, service) {
  if (!section) return false;
  const norm = normalizeSectionName(section);
  const isMaterialSection =
    norm.includes('consumiveis') ||
    norm.includes('material aplicado') ||
    norm === 'consumiveis';
  if (!isMaterialSection) return false;

  const inSection = (service?.fields || []).filter((f) => f.section === section);
  return inSection.length > 0 && inSection.every((f) => isMaterialTableField(f));
}

const TRAILING_PDF_SKIP_TYPES = new Set(['status_pills', 'legal_verdict']);

/** Observações / material no fim do relatório — ancora fecho (fotos + assinaturas) */
export function fieldAnchorsReportClosing(service, field) {
  const fields = service?.fields || [];
  if (!fields.length) return false;

  let anchorField = null;
  if (isObservationsField(field)) anchorField = field;
  else if (isMaterialTableField(field)) anchorField = findPairedObservationsField(service, field);

  if (!anchorField) return false;

  for (let i = fields.length - 1; i >= 0; i -= 1) {
    const f = fields[i];
    if (TRAILING_PDF_SKIP_TYPES.has(f.type)) continue;
    if (f.id === 'declaracao_seguranca') continue;
    return f.id === anchorField.id || (isMaterialTableField(f) && f.id === field.id);
  }
  return false;
}

export function isMaterialTableField(field) {
  if (!field || field.type !== 'dynamic_table') return false;
  return (
    MATERIAL_FIELD_IDS.has(field.id) ||
    field.tableVariant === 'material' ||
    field.tableVariant === 'consumables'
  );
}

export function isObservationsField(field) {
  if (!field) return false;
  return (
    (field.type === 'textarea' || field.type === 'longtext') &&
    OBSERVATIONS_FIELD_IDS.has(field.id)
  );
}

/** Normaliza texto legado ou linhas com chaves antigas para [{ artigo, qtd }] */
export function normalizeMaterialRows(value) {
  if (value === undefined || value === null) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return [{ artigo: trimmed, qtd: '' }];
  }

  if (!Array.isArray(value)) return value;

  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      const text = row == null ? '' : String(row).trim();
      return text && text !== '[object Object]' ? { artigo: text, qtd: '' } : emptyMaterialRow();
    }

    const out = { ...row };

    Object.entries(LEGACY_MATERIAL_KEYS).forEach(([legacyKey, canonicalKey]) => {
      if (out[legacyKey] !== undefined && out[legacyKey] !== '' && !out[canonicalKey]) {
        out[canonicalKey] = out[legacyKey];
      }
      if (legacyKey !== canonicalKey) delete out[legacyKey];
    });

    if (row.tipo) {
      const base = materialCellText(out.artigo);
      const tipo = String(row.tipo).trim();
      out.artigo = base && tipo ? `${base} (${tipo})` : base || tipo;
      delete out.tipo;
    }

    return {
      artigo: materialCellText(out.artigo),
      qtd: materialCellText(out.qtd),
    };
  });
}

function materialCellText(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    const nested =
      val.artigo ??
      val.descricao ??
      val.material ??
      val.equipamento ??
      val.label ??
      val.value ??
      val.qtd ??
      val.quantidade;
    if (nested !== undefined && nested !== null && typeof nested !== 'object') {
      return String(nested).trim();
    }
    return '';
  }
  const text = String(val).trim();
  return text === '[object Object]' ? '' : text;
}

/** Observações associadas ao material — primeira textarea de observações após o campo */
export function findPairedObservationsField(service, materialField) {
  const fields = service?.fields || [];
  const start = fields.indexOf(materialField);
  if (start < 0) return null;

  for (let i = start + 1; i < fields.length; i += 1) {
    const field = fields[i];
    if (isObservationsField(field)) {
      if (normalizeSectionName(field.section).includes('estado final')) break;
      return field;
    }
    if (isMaterialTableField(field)) break;
  }
  return null;
}

export function getMaterialTableColumnLabels(field) {
  const columns = field?.columns?.length ? field.columns : MATERIAL_UTILIZADO_COLUMNS;
  return columns.map((c) => columnLabel(c));
}
