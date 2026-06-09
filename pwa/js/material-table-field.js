/**
 * Tabela dinâmica de material — formato unificado [{ artigo, qtd }]
 */

export const MATERIAL_UTILIZADO_COLUMNS = [
  { id: 'artigo', label: 'Artigo / Descrição' },
  { id: 'qtd', label: 'Quantidade' },
];

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
    label: 'Material Utilizado',
    columns: MATERIAL_UTILIZADO_COLUMNS,
    columnTypes: { qtd: 'number' },
    tableVariant: 'material',
    addButtonLabel: 'Adicionar linha',
    ...overrides,
  };
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
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };

    Object.entries(LEGACY_MATERIAL_KEYS).forEach(([legacyKey, canonicalKey]) => {
      if (out[legacyKey] !== undefined && out[legacyKey] !== '' && !out[canonicalKey]) {
        out[canonicalKey] = out[legacyKey];
      }
      if (legacyKey !== canonicalKey) delete out[legacyKey];
    });

    if (row.tipo) {
      const base = String(out.artigo || '').trim();
      const tipo = String(row.tipo).trim();
      out.artigo = base && tipo ? `${base} (${tipo})` : base || tipo;
      delete out.tipo;
    }

    return out;
  });
}

/** Observações associadas ao material — primeira textarea de observações após o campo */
export function findPairedObservationsField(service, materialField) {
  const fields = service?.fields || [];
  const start = fields.indexOf(materialField);
  if (start < 0) return null;

  for (let i = start + 1; i < fields.length; i += 1) {
    const field = fields[i];
    if (isObservationsField(field)) return field;
    if (isMaterialTableField(field)) break;
  }
  return null;
}

export function getMaterialTableColumnLabels(field) {
  const columns = field?.columns?.length ? field.columns : MATERIAL_UTILIZADO_COLUMNS;
  return columns.map((c) => columnLabel(c));
}
