/**
 * Formulário Clientes Grandes — tabela dinâmica «Identificação Bateria»
 */

import { escapeHtml } from '../html-utils.js';
import { LABEL_MAQUINA, LABEL_MATRICULA, LABEL_TIPO } from '../field-labels.js';

export const GRANDES_BATTERY_FIELD_ID = 'identificacao_baterias';

/** Colunas da tabela (chave → rótulo) */
export const GRANDES_BATTERY_COLUMNS = [
  { key: 'maquina', label: LABEL_MAQUINA, input: 'text' },
  { key: 'matricula', label: LABEL_MATRICULA, input: 'text' },
  { key: 'tipo', label: LABEL_TIPO, input: 'text' },
  { key: 'tensao_v', label: 'Tensão (V)', input: 'text' },
  { key: 'densidade', label: 'Densidade', input: 'text' },
  {
    key: 'nivel_eletrolito',
    label: 'Nível Eletrólito',
    input: 'select',
    options: ['Correto', 'Abaixo do Nível', 'Necessita Reposição Urgentemente'],
  },
  { key: 'estado_cofre', label: 'Estado Cofre', input: 'text' },
  { key: 'curto_circuito', label: 'C.C.', input: 'text' },
];

const NIVEL_OPTIONS = GRANDES_BATTERY_COLUMNS.find((c) => c.key === 'nivel_eletrolito').options;

function emptyRow() {
  return {
    maquina: '',
    matricula: '',
    tipo: '',
    tensao_v: '',
    densidade: '',
    nivel_eletrolito: '',
    estado_cofre: '',
    curto_circuito: '',
  };
}

function normalizeRow(raw = {}) {
  const base = emptyRow();
  GRANDES_BATTERY_COLUMNS.forEach((col) => {
    const v = raw[col.key];
    base[col.key] = v === undefined || v === null ? base[col.key] : String(v);
  });
  return base;
}

/** Converte rascunhos antigos (campos estáticos únicos) para array de linhas */
export function migrateLegacyBatteryRows(values = {}) {
  if (Array.isArray(values[GRANDES_BATTERY_FIELD_ID]) && values[GRANDES_BATTERY_FIELD_ID].length) {
    return values[GRANDES_BATTERY_FIELD_ID].map(normalizeRow);
  }

  const legacyKeys = GRANDES_BATTERY_COLUMNS.map((c) => c.key);
  const hasLegacy = legacyKeys.some((k) => String(values[k] ?? '').trim() !== '');
  if (!hasLegacy) return [emptyRow()];

  return [
    normalizeRow({
      maquina: values.maquina,
      matricula: values.matricula,
      tipo: values.tipo,
      tensao_v: values.tensao_v,
      densidade: values.densidade,
      nivel_eletrolito: values.nivel_eletrolito,
      estado_cofre: values.estado_cofre,
      curto_circuito: values.curto_circuito ?? '',
    }),
  ];
}

function renderCell(col, row) {
  const val = row[col.key] ?? '';
  if (col.input === 'select') {
    const opts = NIVEL_OPTIONS
      .map(
        (opt) =>
          `<option value="${escapeHtml(opt)}"${opt === val ? ' selected' : ''}>${escapeHtml(opt)}</option>`,
      )
      .join('');
    return `
      <select class="form-input form-input-sm grandes-battery-cell"
        data-col="${col.key}"
        data-field-kind="grandes-battery"
        aria-label="${escapeHtml(col.label)}">
        <option value="">—</option>
        ${opts}
      </select>
    `;
  }

  return `
    <input type="text"
      class="form-input form-input-sm grandes-battery-cell"
      data-col="${col.key}"
      data-field-kind="grandes-battery"
      value="${escapeHtml(val)}"
      aria-label="${escapeHtml(col.label)}">
  `;
}

function renderRow(row, rowIndex) {
  const cells = GRANDES_BATTERY_COLUMNS.map(
    (col) => {
      const nowrapClass =
        col.key === 'tipo' || col.key === 'tensao_v' || col.key === 'densidade'
          ? ' grandes-battery-col--nowrap'
          : '';
      return `<td class="grandes-battery-col${nowrapClass}" data-col-label="${escapeHtml(col.label)}">${renderCell(col, row)}</td>`;
    },
  ).join('');

  return `
    <tr class="grandes-battery-row dynamic-table-row" data-row-index="${rowIndex}">
      <td class="grandes-battery-idx grandes-battery-row-num">${rowIndex + 1}</td>
      ${cells}
      <td class="dynamic-table-actions grandes-battery-actions">
        <button type="button" class="btn-row-remove grandes-battery-remove"
          title="Remover bateria" aria-label="Remover linha">&times;</button>
      </td>
    </tr>
  `;
}

/**
 * HTML da secção (form-engine chama via type grandes_identificacao_baterias)
 */
export function renderGrandesBatterySection(field, value) {
  const payload = Array.isArray(value)
    ? { [GRANDES_BATTERY_FIELD_ID]: value }
    : { [GRANDES_BATTERY_FIELD_ID]: value, ...(value && typeof value === 'object' ? value : {}) };
  const rows = migrateLegacyBatteryRows(payload);
  const header = GRANDES_BATTERY_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((row, i) => renderRow(row, i)).join('');

  return `
    <div class="form-group field-block grandes-battery-field dynamic-table-field dynamic-table-field--grandes"
      data-grandes-baterias="${GRANDES_BATTERY_FIELD_ID}"
      data-field-id="${GRANDES_BATTERY_FIELD_ID}">
      <div class="grandes-section-bar grandes-section-bar--table">
        <span class="grandes-section-bar-title">${escapeHtml(field.label || 'Identificação Bateria')}</span>
        <span class="grandes-battery-count text-muted" data-grandes-battery-count>${rows.length} linha(s)</span>
      </div>
      <p class="field-hint text-muted grandes-battery-hint">Adicione uma linha por bateria. Pode registar dezenas de unidades no mesmo relatório.</p>
      <div class="dynamic-table-wrap grandes-battery-wrap">
        <div class="grandes-battery-table-wrap">
          <div class="grandes-battery-scroll">
            <table class="dynamic-table grandes-battery-table">
              <thead>
                <tr>
                  <th class="grandes-battery-idx" scope="col">#</th>
                  ${header}
                  <th class="dynamic-table-actions-th" scope="col"></th>
                </tr>
              </thead>
              <tbody class="grandes-battery-body dynamic-table-body">
                ${body}
              </tbody>
            </table>
          </div>
        </div>
        <div class="grandes-battery-toolbar">
          <button type="button" class="btn-outline dynamic-table-add grandes-battery-add">
            <span aria-hidden="true">+</span> Adicionar bateria
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateRowNumbers(tbody) {
  tbody.querySelectorAll('.grandes-battery-row').forEach((tr, idx) => {
    let numCell = tr.querySelector('.grandes-battery-row-num');
    if (!numCell) {
      numCell = document.createElement('td');
      numCell.className = 'grandes-battery-idx grandes-battery-row-num';
      tr.insertBefore(numCell, tr.firstElementChild);
    }
    numCell.textContent = String(idx + 1);
    tr.dataset.rowIndex = String(idx);
  });
}

function updateCount(wrap) {
  const tbody = wrap?.querySelector('.grandes-battery-body');
  const countEl = wrap?.querySelector('[data-grandes-battery-count]');
  const n = tbody?.querySelectorAll('.grandes-battery-row').length || 0;
  if (countEl) countEl.textContent = `${n} linha(s)`;
}

function buildRowElement(rowData = emptyRow()) {
  const tr = document.createElement('tr');
  tr.className = 'grandes-battery-row dynamic-table-row';
  tr.innerHTML = `
    <td class="grandes-battery-idx grandes-battery-row-num"></td>
    ${GRANDES_BATTERY_COLUMNS.map((col) => {
      const nowrapClass =
        col.key === 'tipo' || col.key === 'tensao_v' || col.key === 'densidade'
          ? ' grandes-battery-col--nowrap'
          : '';
      return `<td class="grandes-battery-col${nowrapClass}" data-col-label="${escapeHtml(col.label)}">${renderCell(col, rowData)}</td>`;
    }).join('')}
    <td class="dynamic-table-actions grandes-battery-actions">
      <button type="button" class="btn-row-remove grandes-battery-remove"
        title="Remover bateria" aria-label="Remover linha">&times;</button>
    </td>
  `;
  tr.classList.add('dynamic-table-row--enter');
  requestAnimationFrame(() => tr.classList.remove('dynamic-table-row--enter'));
  return tr;
}

function bindRemoveButton(btn, wrap, tbody, onRowChange) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const rows = tbody.querySelectorAll('.grandes-battery-row');
    if (rows.length <= 1) {
      rows[0]?.querySelectorAll('.grandes-battery-cell').forEach((el) => {
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
      onRowChange?.();
      return;
    }
    btn.closest('.grandes-battery-row')?.remove();
    updateRowNumbers(tbody);
    updateCount(wrap);
    onRowChange?.();
  });
}

/**
 * Liga adicionar/remover linhas e notifica alterações (autosave).
 * @param {HTMLElement} overlay
 * @param {{ onRowChange?: () => void }} [options]
 */
export function init(overlay, options = {}) {
  const wrap = overlay?.querySelector(`[data-grandes-baterias="${GRANDES_BATTERY_FIELD_ID}"]`);
  if (!wrap || wrap.dataset.bound === 'true') return;
  wrap.dataset.bound = 'true';

  const tbody = wrap.querySelector('.grandes-battery-body');
  const onRowChange = options.onRowChange;

  const addRow = () => {
    const tr = buildRowElement(emptyRow());
    tbody.appendChild(tr);
    bindRemoveButton(tr.querySelector('.grandes-battery-remove'), wrap, tbody, onRowChange);
    tr.querySelectorAll('.grandes-battery-cell').forEach((el) => {
      el.addEventListener('input', () => onRowChange?.());
      el.addEventListener('change', () => onRowChange?.());
    });
    updateRowNumbers(tbody);
    updateCount(wrap);
    onRowChange?.();
  };

  wrap.querySelector('.grandes-battery-add')?.addEventListener('click', (e) => {
    e.preventDefault();
    addRow();
  });

  wrap.querySelectorAll('.grandes-battery-remove').forEach((btn) => {
    bindRemoveButton(btn, wrap, tbody, onRowChange);
  });

  wrap.querySelectorAll('.grandes-battery-cell').forEach((el) => {
    el.addEventListener('input', () => onRowChange?.());
    el.addEventListener('change', () => onRowChange?.());
  });

  updateRowNumbers(tbody);
  updateCount(wrap);
}

/** Lê todas as linhas do DOM para o rascunho / submissão */
export function collect(overlay) {
  const wrap = overlay?.querySelector(`[data-grandes-baterias="${GRANDES_BATTERY_FIELD_ID}"]`);
  if (!wrap) return [];

  const rows = [];
  wrap.querySelectorAll('.grandes-battery-row').forEach((tr) => {
    const row = emptyRow();
    let hasData = false;
    GRANDES_BATTERY_COLUMNS.forEach((col) => {
      const el = tr.querySelector(`[data-col="${col.key}"]`);
      const val = el?.value?.trim() ?? '';
      row[col.key] = val;
      if (val) hasData = true;
    });
    if (hasData) rows.push(row);
  });

  return rows;
}

/** Rótulos para PDF / revisão */
export function getColumnLabels() {
  return GRANDES_BATTERY_COLUMNS.map((c) => c.label);
}

export function getColumnKeys() {
  return GRANDES_BATTERY_COLUMNS.map((c) => c.key);
}

/** Rótulo do select de consumíveis — só matrícula (fallback: nome/tipo). */
export function formatGrandesMaquinaOptionLabel(row = {}) {
  const matricula = String(row.matricula ?? '').trim();
  if (matricula) return matricula;
  const maquina = String(row.maquina ?? '').trim();
  if (maquina) return maquina;
  return String(row.tipo ?? '').trim();
}

/** Valor do select de consumíveis — guarda nome e matrícula em separado. */
export function encodeGrandesMaquinaSelectValue(row = {}) {
  const maquina = String(row.maquina ?? '').trim();
  const matricula = String(row.matricula ?? '').trim();
  if (!maquina && !matricula) return '';
  return JSON.stringify({ maquina, matricula });
}

/** Lê valor do select (JSON novo ou texto legado «Nome · Matrícula»). */
export function decodeGrandesMaquinaSelectValue(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { maquina: '', matricula: '' };
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          maquina: String(parsed.maquina ?? '').trim(),
          matricula: String(parsed.matricula ?? '').trim(),
        };
      }
    } catch {
      /* texto livre */
    }
  }
  const sep = ' · ';
  const idx = text.indexOf(sep);
  if (idx >= 0) {
    return {
      maquina: text.slice(0, idx).trim(),
      matricula: text.slice(idx + sep.length).trim(),
    };
  }
  return { maquina: '', matricula: text };
}

/** Resolve nome/matrícula a partir da linha de consumível (incl. legado). */
export function resolveGrandesConsumivelMaquina(row = {}) {
  const rawMaquina = String(row.maquina ?? '').trim();
  const rawMatricula = String(row.matricula ?? '').trim();

  if (rawMatricula.startsWith('{')) {
    return decodeGrandesMaquinaSelectValue(rawMatricula);
  }
  if (rawMaquina.startsWith('{') || rawMaquina.includes(' · ')) {
    const decoded = decodeGrandesMaquinaSelectValue(rawMaquina);
    return {
      maquina: decoded.maquina,
      matricula: rawMatricula || decoded.matricula,
    };
  }
  return {
    maquina: rawMaquina,
    matricula: rawMatricula,
  };
}

export function listGrandesBatteryMaquinaOptions(rows = []) {
  const options = [];
  const seen = new Set();
  rows.forEach((row) => {
    const maquina = String(row.maquina ?? '').trim();
    const matricula = String(row.matricula ?? '').trim();
    const label = formatGrandesMaquinaOptionLabel(row);
    if (!label) return;
    const value = encodeGrandesMaquinaSelectValue({ maquina, matricula });
    const key = value || label;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ value: value || label, label, maquina, matricula });
  });
  return options;
}

export function readGrandesBatteryMaquinaOptionsFromOverlay(overlay) {
  return listGrandesBatteryMaquinaOptions(collect(overlay));
}

function selectValueMatchesOption(current, option) {
  if (!current) return false;
  if (current === option.value || current === option.label) return true;
  if (option.matricula && current === option.matricula) return true;
  const decoded = decodeGrandesMaquinaSelectValue(current);
  return (
    decoded.maquina === option.maquina &&
    decoded.matricula === option.matricula &&
    (decoded.maquina || decoded.matricula)
  );
}

/** Atualiza os selects de matrícula nos consumíveis após alterar a identificação bateria. */
export function refreshGrandesMachineSelectsInOverlay(overlay) {
  if (!overlay) return;
  const options = readGrandesBatteryMaquinaOptionsFromOverlay(overlay);
  overlay.querySelectorAll('[data-maquina-select]').forEach((select) => {
    const current = select.value?.trim() || '';
    const optionHtml = options
      .map(
        (opt) =>
          `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`,
      )
      .join('');
    select.innerHTML = `<option value="">—</option>${optionHtml}`;
    const match = options.find((opt) => selectValueMatchesOption(current, opt));
    if (match) {
      select.value = match.value;
      return;
    }
    if (current) {
      const resolved =
        current.startsWith('{') || current.includes(' · ')
          ? decodeGrandesMaquinaSelectValue(current)
          : { maquina: '', matricula: current };
      const orphanValue = encodeGrandesMaquinaSelectValue(resolved) || current;
      const orphanLabel = formatGrandesMaquinaOptionLabel(resolved) || current;
      select.insertAdjacentHTML(
        'beforeend',
        `<option value="${escapeHtml(orphanValue)}" selected>${escapeHtml(orphanLabel)} (já não na lista)</option>`,
      );
    }
  });
}
