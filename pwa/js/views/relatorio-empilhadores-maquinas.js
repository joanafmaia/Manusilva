/**
 * Preventiva Empilhadores — várias máquinas por visita (Fase 1).
 * Tabela de identificação (Geral) + selector de máquina na Checklist.
 */

import {
  VERIFICACOES_EXTERNAS_ITEMS,
  VERIFICACOES_INTERNAS_ITEMS,
  empilhadoresMatrixOptionFromDataValue,
} from '../preventiva-empilhadores-items.js';
import { EMPILHADORES_PER_MACHINE_FIELD_DEFS } from '../mock_data.js';
import { sanitizePdfFilenameSegment } from '../pdf-storage.js';
import { escapeHtml } from '../html-utils.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_HORAS,
} from '../field-labels.js';

export const EMPILHADORES_MAQUINAS_FIELD_ID = 'maquinas';
export const EMPILHADORES_SERVICE_TYPE = 'manutencao_preventiva_empilhadores';

export const EMPILHADORES_ID_COLUMNS = [
  { key: 'marca', label: LABEL_MARCA, input: 'text' },
  { key: 'modelo', label: LABEL_MODELO, input: 'text' },
  { key: 'numero_de_serie', label: LABEL_NUMERO_SERIE, input: 'text' },
  { key: 'n_interno', label: LABEL_N_INTERNO, input: 'text' },
  { key: 'horas', label: LABEL_HORAS, input: 'number' },
];

const LEGACY_SCALAR_KEYS = [
  'marca',
  'modelo',
  'numero_de_serie',
  'n_interno',
  'horas',
  'litros_oleo_diferencial',
  'litros_oleo_torque',
  'litros_oleo_hidraulico',
  'litros_oleo_travoes',
  'litros_oleo_motor',
  'qtd_filtro_oleo_motor',
  'qtd_filtro_ar',
  'qtd_filtro_combustivel',
  'qtd_kit_gaseificador',
  'qtd_limpeza_lubrificante',
  'observacoes',
  'estado_maquina',
];

const LEGACY_OBJECT_KEYS = ['componentes_externos', 'componentes_internos'];

export const EMPILHADORES_LEGACY_ROOT_KEYS = [...LEGACY_SCALAR_KEYS, ...LEGACY_OBJECT_KEYS];

function columnKey(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function defaultVerificationMap(items = []) {
  const out = {};
  items.forEach((item) => {
    const id = typeof item === 'string' ? columnKey(item) : item.id || columnKey(item.label);
    out[id] = '';
  });
  return out;
}

export function emptyEmpilhadoresMaquinaRow() {
  return {
    marca: '',
    modelo: '',
    numero_de_serie: '',
    n_interno: '',
    horas: '',
    componentes_externos: defaultVerificationMap(VERIFICACOES_EXTERNAS_ITEMS),
    componentes_internos: defaultVerificationMap(VERIFICACOES_INTERNAS_ITEMS),
    litros_oleo_diferencial: '',
    litros_oleo_torque: '',
    litros_oleo_hidraulico: '',
    litros_oleo_travoes: '',
    litros_oleo_motor: '',
    qtd_filtro_oleo_motor: '',
    qtd_filtro_ar: '',
    qtd_filtro_combustivel: '',
    qtd_kit_gaseificador: '',
    qtd_limpeza_lubrificante: '',
    observacoes: '',
    estado_maquina: 'Operacional',
  };
}

export function normalizeEmpilhadoresMaquinaRow(raw = {}) {
  const base = emptyEmpilhadoresMaquinaRow();
  EMPILHADORES_ID_COLUMNS.forEach((col) => {
    const v = raw[col.key];
    base[col.key] = v === undefined || v === null ? '' : String(v);
  });

  LEGACY_OBJECT_KEYS.forEach((key) => {
    if (raw[key] && typeof raw[key] === 'object') {
      base[key] = { ...base[key], ...raw[key] };
    }
  });

  LEGACY_SCALAR_KEYS.forEach((key) => {
    if (LEGACY_OBJECT_KEYS.includes(key)) return;
    if (raw[key] === undefined || raw[key] === null) return;
    base[key] = raw[key];
  });

  if (!base.estado_maquina) base.estado_maquina = 'Operacional';
  return base;
}

/** Converte rascunhos antigos (campos únicos no topo) para array de máquinas. */
export function migrateLegacyEmpilhadoresMaquinas(values = {}) {
  let existing = values[EMPILHADORES_MAQUINAS_FIELD_ID];
  if (typeof existing === 'string') {
    try {
      existing = JSON.parse(existing);
    } catch {
      existing = null;
    }
  }
  if (Array.isArray(existing) && existing.length) {
    return existing.map(normalizeEmpilhadoresMaquinaRow);
  }

  const hasLegacy = [...EMPILHADORES_ID_COLUMNS.map((c) => c.key), ...LEGACY_SCALAR_KEYS].some(
    (k) => String(values[k] ?? '').trim() !== '',
  ) || LEGACY_OBJECT_KEYS.some((k) => values[k] && typeof values[k] === 'object');

  if (!hasLegacy) return [emptyEmpilhadoresMaquinaRow()];

  const row = normalizeEmpilhadoresMaquinaRow({
    marca: values.marca,
    modelo: values.modelo,
    numero_de_serie: values.numero_de_serie,
    n_interno: values.n_interno,
    horas: values.horas,
    componentes_externos: values.componentes_externos,
    componentes_internos: values.componentes_internos,
    litros_oleo_diferencial: values.litros_oleo_diferencial,
    litros_oleo_torque: values.litros_oleo_torque,
    litros_oleo_hidraulico: values.litros_oleo_hidraulico,
    litros_oleo_travoes: values.litros_oleo_travoes,
    litros_oleo_motor: values.litros_oleo_motor,
    qtd_filtro_oleo_motor: values.qtd_filtro_oleo_motor,
    qtd_filtro_ar: values.qtd_filtro_ar,
    qtd_filtro_combustivel: values.qtd_filtro_combustivel,
    qtd_kit_gaseificador: values.qtd_kit_gaseificador,
    qtd_limpeza_lubrificante: values.qtd_limpeza_lubrificante,
    observacoes: values.observacoes,
    estado_maquina: values.estado_maquina,
  });
  return [row];
}

/** Achata uma linha de máquina para o formato legado (PDF / compat). */
export function maquinaRowToFlatValues(row = {}) {
  return normalizeEmpilhadoresMaquinaRow(row);
}

export function flattenEmpilhadoresValues(values = {}, machineIndex = 0) {
  const maquinas = migrateLegacyEmpilhadoresMaquinas(values);
  const idx = Math.max(0, Math.min(machineIndex, maquinas.length - 1));
  return { ...values, ...maquinaRowToFlatValues(maquinas[idx] || emptyEmpilhadoresMaquinaRow()) };
}

/** @param {object} report */
export function getEmpilhadoresMaquinasFromReport(report) {
  return migrateLegacyEmpilhadoresMaquinas(report?.data?.values || {});
}

/** @param {object} report */
export function isEmpilhadoresMultiMaquinaReport(report) {
  if (String(report?.serviceType || '') !== EMPILHADORES_SERVICE_TYPE) return false;
  return getEmpilhadoresMaquinasFromReport(report).length > 1;
}

/** Segmento do nome do ficheiro PDF, ex.: M1-Linde-E20 */
export function buildEmpilhadoresMachineFilenameTag(row = {}, index = 0) {
  const parts = [`M${index + 1}`];
  const marca = sanitizePdfFilenameSegment(row.marca);
  const modelo = sanitizePdfFilenameSegment(row.modelo);
  if (marca) parts.push(marca);
  if (modelo) parts.push(modelo);
  if (parts.length === 1) {
    const interno = sanitizePdfFilenameSegment(row.n_interno);
    const serie = sanitizePdfFilenameSegment(row.numero_de_serie);
    if (interno) parts.push(interno);
    else if (serie) parts.push(serie);
  }
  return parts.join('-');
}

export function maquinaRowLabel(row = {}, index = 0) {
  const parts = [
    String(row.marca || '').trim(),
    String(row.modelo || '').trim(),
  ].filter(Boolean);
  const interno = String(row.n_interno || '').trim();
  const serie = String(row.numero_de_serie || '').trim();
  if (parts.length) {
    const suffix = interno ? ` (${interno})` : serie ? ` (${serie})` : '';
    return `Máquina ${index + 1} — ${parts.join(' ')}${suffix}`;
  }
  if (interno) return `Máquina ${index + 1} — ${LABEL_N_INTERNO} ${interno}`;
  if (serie) return `Máquina ${index + 1} — ${LABEL_NUMERO_SERIE} ${serie}`;
  return `Máquina ${index + 1}`;
}

export function getEmpilhadoresPerMachineFieldDefs() {
  return EMPILHADORES_PER_MACHINE_FIELD_DEFS;
}

export const EMPILHADORES_MACHINE_ID_FIELD_DEFS = [
  { type: 'text', id: 'marca', label: LABEL_MARCA, section: 'Informações da Máquina' },
  { type: 'text', id: 'modelo', label: LABEL_MODELO, section: 'Informações da Máquina' },
  { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Máquina' },
  { type: 'number', id: 'horas', label: LABEL_HORAS, section: 'Informações da Máquina', min: 0, step: 1, placeholder: '0' },
  { type: 'text', id: 'n_interno', label: LABEL_N_INTERNO, section: 'Informações da Máquina' },
];

/** Serviço virtual com campos escalares para PDF (1 máquina por documento). */
export function buildEmpilhadoresPdfService(service, machineIndex = 0) {
  return {
    ...service,
    fields: [
      ...(service?.fields || []).filter((f) => f.id === 'data_de_conclusao'),
      ...EMPILHADORES_MACHINE_ID_FIELD_DEFS,
      ...EMPILHADORES_PER_MACHINE_FIELD_DEFS,
    ],
    __pdfMachineIndex: machineIndex,
  };
}

function readStore(overlay) {
  const input = overlay.querySelector('[data-empilhadores-maquinas-store]');
  if (input?.value) {
    try {
      const parsed = JSON.parse(input.value);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeEmpilhadoresMaquinaRow);
      }
    } catch {
      /* tentar fonte inicial */
    }
  }

  const wrap = overlay.querySelector('[data-empilhadores-maquinas]');
  const encoded = wrap?.dataset?.initialMaquinas;
  if (encoded) {
    try {
      const parsed = JSON.parse(decodeURIComponent(encoded));
      if (Array.isArray(parsed) && parsed.length) {
        const rows = parsed.map(normalizeEmpilhadoresMaquinaRow);
        writeStore(overlay, rows);
        delete wrap.dataset.initialMaquinas;
        return rows;
      }
    } catch {
      /* ignorar */
    }
  }

  return [];
}

function writeStore(overlay, maquinas) {
  const input = overlay.querySelector('[data-empilhadores-maquinas-store]');
  if (!input) return;
  input.value = JSON.stringify(maquinas.map(normalizeEmpilhadoresMaquinaRow));
}

export function getActiveMaquinaIndex(overlay) {
  const active = overlay.querySelector('[data-empilhadores-maquina-tab].is-active');
  if (active?.dataset?.empilhadoresMaquinaTab != null) {
    return Number(active.dataset.empilhadoresMaquinaTab) || 0;
  }
  return Number(overlay.dataset.activeMaquinaIndex) || 0;
}

function collectIdRowsFromTable(overlay) {
  const tbody = overlay.querySelector('.empilhadores-maquinas-body');
  if (!tbody) return [];
  const rows = [];
  tbody.querySelectorAll('.empilhadores-maquinas-row').forEach((tr) => {
    const row = {};
    EMPILHADORES_ID_COLUMNS.forEach((col) => {
      const el = tr.querySelector(`[data-col="${col.key}"]`);
      row[col.key] = el?.value ?? '';
    });
    rows.push(row);
  });
  return rows;
}

/** Campos escalares na aba Geral (layout tipo DL50). */
function collectMachineIdFromGeralFields(overlay) {
  const geral = overlay.querySelector('.report-tab-panel[data-report-panel="geral"]');
  if (!geral) return null;
  const row = {};
  let found = false;
  EMPILHADORES_ID_COLUMNS.forEach((col) => {
    const el = geral.querySelector(`[data-field-id="${col.key}"]`);
    if (el) {
      row[col.key] = el.value ?? '';
      found = true;
    }
  });
  return found ? row : null;
}

function collectChecklistFromPanel(overlay) {
  const panel = overlay.querySelector('[data-empilhadores-checklist]');
  if (!panel) return {};
  const out = {};

  panel.querySelectorAll('[data-field-id]').forEach((el) => {
    const id = el.dataset.fieldId;
    const kind = el.dataset.fieldKind;
    if (['text', 'textarea', 'longtext', 'number'].includes(kind)) {
      out[id] = el.value;
    }
  });

  panel.querySelectorAll('[data-verification-field]').forEach((wrap) => {
    const fieldId = wrap.dataset.verificationField;
    const items = {};
    if (wrap.dataset.empilhadoresVerify === '1') {
      wrap.querySelectorAll('[data-verify-item]').forEach((row) => {
        const selected = row.querySelector('.matrix-opt.selected');
        items[row.dataset.verifyItem] = selected
          ? empilhadoresMatrixOptionFromDataValue(selected.getAttribute('data-value'))
          : '';
      });
    } else {
      wrap.querySelectorAll("input[type='checkbox'][data-verify-item]").forEach((input) => {
        items[input.dataset.verifyItem] = input.checked ? 'Não OK' : 'OK';
      });
    }
    out[fieldId] = items;
  });

  panel.querySelectorAll('[data-status-pills]').forEach((group) => {
    const selected = group.querySelector('.status-pill.selected');
    if (selected) out[group.dataset.statusPills] = selected.dataset.value;
  });

  return out;
}

export function flushEmpilhadoresChecklistToStore(overlay) {
  collectEmpilhadoresMaquinas(overlay);
}

export function collectEmpilhadoresMaquinas(overlay) {
  const store = readStore(overlay);
  const idFromTable = collectIdRowsFromTable(overlay);
  const hasIdTable = Boolean(overlay.querySelector('.empilhadores-maquinas-body'));
  const idFromGeral = !hasIdTable ? collectMachineIdFromGeralFields(overlay) : null;
  const idRows = hasIdTable ? idFromTable : idFromGeral ? [idFromGeral] : [];
  const count = hasIdTable ? Math.max(idRows.length, 1) : 1;
  while (store.length < count) store.push(emptyEmpilhadoresMaquinaRow());
  while (store.length > count) store.pop();

  idRows.forEach((idPart, index) => {
    store[index] = normalizeEmpilhadoresMaquinaRow({ ...store[index], ...idPart });
  });

  const panel = overlay.querySelector('[data-empilhadores-checklist]');
  if (panel) {
    const activeIdx = getActiveMaquinaIndex(overlay);
    const checklist = collectChecklistFromPanel(overlay);
    if (store[activeIdx]) {
      store[activeIdx] = normalizeEmpilhadoresMaquinaRow({ ...store[activeIdx], ...checklist });
    }
  }

  writeStore(overlay, store);
  return store.map(normalizeEmpilhadoresMaquinaRow);
}

function renderIdCell(col, row) {
  const val = row[col.key] ?? '';
  if (col.input === 'number') {
    return `
      <input type="number"
        class="form-input form-input-sm empilhadores-maquinas-cell"
        data-col="${col.key}"
        data-field-kind="empilhadores-maquina-id"
        value="${escapeHtml(val)}"
        min="0"
        step="1"
        inputmode="numeric"
        aria-label="${escapeHtml(col.label)}">`;
  }
  return `
    <input type="text"
      class="form-input form-input-sm empilhadores-maquinas-cell"
      data-col="${col.key}"
      data-field-kind="empilhadores-maquina-id"
      value="${escapeHtml(val)}"
      aria-label="${escapeHtml(col.label)}">`;
}

function renderIdRow(row, rowIndex) {
  const cells = EMPILHADORES_ID_COLUMNS.map((col) => {
    return `<td class="empilhadores-maquinas-col" data-col-label="${escapeHtml(col.label)}">${renderIdCell(col, row)}</td>`;
  }).join('');
  return `
    <tr class="empilhadores-maquinas-row dynamic-table-row" data-row-index="${rowIndex}">
      <td class="empilhadores-maquinas-idx empilhadores-maquinas-row-num">${rowIndex + 1}</td>
      ${cells}
    </tr>`;
}

export function renderEmpilhadoresMaquinasSection(field, value) {
  const rows = migrateLegacyEmpilhadoresMaquinas({
    [EMPILHADORES_MAQUINAS_FIELD_ID]: Array.isArray(value) ? value : undefined,
    ...(typeof value === 'object' && !Array.isArray(value) ? value : {}),
  });
  const initialStore = encodeURIComponent(JSON.stringify(rows));

  return `
    <div class="form-group field-block empilhadores-maquinas-field"
      data-empilhadores-maquinas="${EMPILHADORES_MAQUINAS_FIELD_ID}"
      data-field-id="${EMPILHADORES_MAQUINAS_FIELD_ID}"
      data-initial-maquinas="${initialStore}">
      <input type="hidden" data-empilhadores-maquinas-store value="">
    </div>
  `;
}

export function renderEmpilhadoresMaquinaSelector(maquinas = [], activeIndex = 0) {
  if (!Array.isArray(maquinas) || maquinas.length <= 1) return '';
  const tabs = maquinas.map((row, index) => {
    const active = index === activeIndex ? ' is-active' : '';
    return `
      <button type="button" class="empilhadores-maquina-tab${active}"
        data-empilhadores-maquina-tab="${index}"
        role="tab"
        aria-selected="${index === activeIndex ? 'true' : 'false'}">
        ${escapeHtml(maquinaRowLabel(row, index))}
      </button>`;
  }).join('');

  return `
    <div class="empilhadores-maquina-selector" role="tablist" aria-label="Máquina em edição">
      <p class="empilhadores-maquina-selector-hint text-muted">Selecione a máquina para preencher o checklist e o material aplicado.</p>
      <div class="empilhadores-maquina-tabs">${tabs}</div>
    </div>`;
}

function updateRowNumbers(tbody) {
  tbody.querySelectorAll('.empilhadores-maquinas-row').forEach((tr, idx) => {
    const numCell = tr.querySelector('.empilhadores-maquinas-row-num');
    if (numCell) numCell.textContent = String(idx + 1);
    tr.dataset.rowIndex = String(idx);
  });
}

function updateCount(wrap) {
  const tbody = wrap?.querySelector('.empilhadores-maquinas-body');
  const countEl = wrap?.querySelector('[data-empilhadores-maquinas-count]');
  const n = tbody?.querySelectorAll('.empilhadores-maquinas-row').length || 0;
  if (countEl) countEl.textContent = `${n} máquina(s)`;
}

function syncStoreRowCount(overlay) {
  collectEmpilhadoresMaquinas(overlay);
  return readStore(overlay);
}

function buildIdRowElement(rowData = emptyEmpilhadoresMaquinaRow()) {
  const tr = document.createElement('tr');
  tr.className = 'empilhadores-maquinas-row dynamic-table-row';
  tr.innerHTML = `
    <td class="empilhadores-maquinas-idx empilhadores-maquinas-row-num"></td>
    ${EMPILHADORES_ID_COLUMNS.map(
      (col) =>
        `<td class="empilhadores-maquinas-col" data-col-label="${escapeHtml(col.label)}">${renderIdCell(col, rowData)}</td>`,
    ).join('')}`;
  return tr;
}

function bindIdTable(wrap, overlay, onRowChange) {
  const tbody = wrap.querySelector('.empilhadores-maquinas-body');
  if (!tbody) return;

  wrap.querySelectorAll('.empilhadores-maquinas-cell').forEach((input) => {
    input.addEventListener('input', () => {
      syncStoreRowCount(overlay);
      onRowChange?.();
    });
  });
}

function bindMaquinaSelector(overlay, options = {}) {
  overlay.querySelectorAll('[data-empilhadores-maquina-tab]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.empilhadoresMaquinaTab) || 0;
      overlay.dataset.activeMaquinaIndex = String(index);
      options.onMaquinaSelect?.(index);
    });
  });
}

function bindMachineIdFields(overlay, onRowChange) {
  const geral = overlay.querySelector('.report-tab-panel[data-report-panel="geral"]');
  if (!geral) return;
  EMPILHADORES_ID_COLUMNS.forEach((col) => {
    const el = geral.querySelector(`[data-field-id="${col.key}"]`);
    if (!el || el.dataset.empilhadoresIdBound === '1') return;
    el.dataset.empilhadoresIdBound = '1';
    el.addEventListener('input', () => {
      collectEmpilhadoresMaquinas(overlay);
      onRowChange?.();
    });
  });
}

/**
 * @param {HTMLElement} overlay
 * @param {{ onRowChange?: Function, onMaquinaSelect?: Function }} options
 */
export function initEmpilhadoresMaquinasForm(overlay, options = {}) {
  const wrap = overlay.querySelector('[data-empilhadores-maquinas]');
  if (wrap && wrap.dataset.bound !== '1') {
    wrap.dataset.bound = '1';
    syncStoreRowCount(overlay);
    bindIdTable(wrap, overlay, options.onRowChange);
  } else if (overlay.querySelector('[data-empilhadores-maquinas-store]')) {
    collectEmpilhadoresMaquinas(overlay);
  }
  bindMachineIdFields(overlay, options.onRowChange);
  bindMaquinaSelector(overlay, options);
}
