/**
 * Autocomplete nos campos de máquina (marca, modelo, nº série, …) — equipamentos guardados do cliente.
 */

import { escapeHtml } from './html-utils.js';
import {
  SERVICE_CATEGORIA,
  applyEquipamentoToForm,
  formatEquipamentoLabel,
} from './cliente-equipamentos.js';
import { LABEL_NUMERO_SERIE, LABEL_N_INTERNO } from './field-labels.js';

const INPUT_DEBOUNCE_MS = 120;
const MAX_DROPDOWN_RESULTS = 12;

const COMBOBOX_FIELD_IDS = new Set([
  'marca',
  'modelo',
  'numero_de_serie',
  'num_serie',
  'n_interno',
  'tipo',
  'data_fabrico',
]);

function norm(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return norm(value).toLowerCase();
}

function resolveFieldId(input) {
  return input?.dataset?.fieldId || input?.dataset?.col || '';
}

function equipamentoFieldValue(equipamento, fieldId) {
  if (fieldId === 'numero_de_serie' || fieldId === 'num_serie') {
    return norm(equipamento.numero_serie);
  }
  return norm(equipamento[fieldId]);
}

function formatOptionMeta(equipamento, fieldId) {
  const parts = [];
  if (fieldId !== 'marca' && norm(equipamento.marca)) parts.push(norm(equipamento.marca));
  if (fieldId !== 'modelo' && norm(equipamento.modelo)) parts.push(norm(equipamento.modelo));
  if (fieldId !== 'numero_de_serie' && fieldId !== 'num_serie' && norm(equipamento.numero_serie)) {
    parts.push(`${LABEL_NUMERO_SERIE}: ${norm(equipamento.numero_serie)}`);
  }
  if (fieldId !== 'n_interno' && norm(equipamento.n_interno)) {
    parts.push(`${LABEL_N_INTERNO}: ${norm(equipamento.n_interno)}`);
  }
  if (parts.length) return parts.join(' · ');
  return formatEquipamentoLabel(equipamento);
}

/**
 * @param {string} fieldId
 * @param {string} query
 * @param {object[]} pool
 * @param {{ marcaFilter?: string }} [opts]
 */
export function searchEquipamentoFieldSuggestions(fieldId, query, pool, opts = {}) {
  const q = normKey(query);
  const marcaFilter = normKey(opts.marcaFilter);
  const seen = new Set();
  const items = [];

  for (const equipamento of pool) {
    if (marcaFilter && normKey(equipamento.marca) !== marcaFilter) continue;

    const value = equipamentoFieldValue(equipamento, fieldId);
    if (!value) continue;

    const key = normKey(value);
    if (q && !key.includes(q)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ value, equipamento });
    if (items.length >= MAX_DROPDOWN_RESULTS) break;
  }

  items.sort((a, b) => a.value.localeCompare(b.value, 'pt'));
  return items;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function renderOptions(items, activeIndex, query, fieldId) {
  if (!norm(query)) {
    return '<li class="client-combobox-hint">Escreva para ver equipamentos guardados</li>';
  }
  if (!items.length) {
    return '<li class="client-combobox-empty">Nenhum valor encontrado</li>';
  }

  return items
    .map(
      (item, i) => `
    <li class="client-combobox-option${i === activeIndex ? ' is-active' : ''}"
      role="option"
      data-value="${escapeHtml(item.value)}"
      aria-selected="${i === activeIndex}">
      <span class="client-combobox-option-name">${escapeHtml(item.value)}</span>
      <span class="client-combobox-option-meta">${escapeHtml(formatOptionMeta(item.equipamento, fieldId))}</span>
    </li>
  `,
    )
    .join('');
}

function getMarcaFilterForInput(input, overlay) {
  const row = input.closest('tr') || input.closest('.form-field-section') || overlay;
  const marcaInput = row.querySelector('[data-field-id="marca"], [data-col="marca"]');
  return marcaInput?.value || '';
}

function wrapInputWithCombobox(input) {
  if (!(input instanceof HTMLInputElement)) return null;
  if (input.readOnly || input.disabled) return null;
  if (input.closest('[data-equipamento-combobox]')) {
    return input.closest('[data-equipamento-combobox]');
  }

  const fieldId = resolveFieldId(input);
  if (!COMBOBOX_FIELD_IDS.has(fieldId)) return null;

  const wrap = document.createElement('div');
  wrap.className = 'equipamento-combobox';
  wrap.dataset.equipamentoCombobox = fieldId;
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  input.classList.add('equipamento-combobox-input');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  const list = document.createElement('ul');
  list.className = 'equipamento-combobox-list client-combobox-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);

  return wrap;
}

function collectMachineInputs(overlay) {
  const inputs = [];
  COMBOBOX_FIELD_IDS.forEach((fieldId) => {
    overlay
      .querySelectorAll(`[data-field-id="${fieldId}"], [data-col="${fieldId}"]`)
      .forEach((el) => {
        if (el instanceof HTMLInputElement && !el.closest('[data-client-combobox]')) {
          inputs.push(el);
        }
      });
  });
  return inputs;
}

function shouldAutofillFromSelection(fieldId, match, pool, input, overlay) {
  if (fieldId === 'numero_de_serie' || fieldId === 'num_serie') return true;
  if (fieldId === 'modelo') {
    const marca = getMarcaFilterForInput(input, overlay);
    const same = pool.filter(
      (e) =>
        normKey(e.marca) === normKey(marca) &&
        normKey(e.modelo) === normKey(match.value),
    );
    return same.length === 1;
  }
  if (fieldId === 'tipo') {
    const same = pool.filter((e) => normKey(e.tipo) === normKey(match.value));
    return same.length === 1;
  }
  return false;
}

/**
 * Liga autocomplete tipo RH nos campos de máquina do formulário aberto.
 */
export function bindEquipamentoFieldComboboxes(overlay, equipamentos = [], service = null) {
  if (!equipamentos.length || !overlay) return;

  const categoria = SERVICE_CATEGORIA[service?.id];
  const pool = categoria
    ? equipamentos.filter((e) => e.categoria === categoria)
    : equipamentos;
  if (!pool.length) return;

  const inputs = collectMachineInputs(overlay);
  inputs.forEach((input) => {
    const wrap = wrapInputWithCombobox(input);
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';

    const fieldId = resolveFieldId(input);
    const list = wrap.querySelector('.equipamento-combobox-list');
    let filtered = [];
    let activeIndex = 0;

    const openList = () => {
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
    };

    const closeList = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('is-open');
    };

    const renderList = () => {
      list.innerHTML = renderOptions(filtered, activeIndex, input.value, fieldId);
      list.querySelectorAll('.client-combobox-option').forEach((opt) => {
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectValue(opt.dataset.value);
        });
      });
    };

    const selectValue = (value) => {
      const match =
        filtered.find((item) => normKey(item.value) === normKey(value)) ||
        searchEquipamentoFieldSuggestions(fieldId, value, pool, {
          marcaFilter: fieldId === 'modelo' ? getMarcaFilterForInput(input, overlay) : '',
        }).find((item) => normKey(item.value) === normKey(value));

      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      if (match && shouldAutofillFromSelection(fieldId, match, pool, input, overlay)) {
        applyEquipamentoToForm(overlay, match.equipamento, service);
      }

      closeList();
    };

    const runSearch = (query) => {
      filtered = searchEquipamentoFieldSuggestions(fieldId, query, pool, {
        marcaFilter: fieldId === 'modelo' ? getMarcaFilterForInput(input, overlay) : '',
      });
      activeIndex = 0;
      renderList();
    };

    const debouncedSearch = debounce((query) => {
      runSearch(query);
      openList();
    }, INPUT_DEBOUNCE_MS);

    input.addEventListener('focus', () => {
      runSearch(input.value);
      openList();
    });

    input.addEventListener('input', () => {
      debouncedSearch(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0));
        renderList();
        openList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderList();
      } else if (e.key === 'Enter' && !list.hidden && filtered[activeIndex]) {
        e.preventDefault();
        selectValue(filtered[activeIndex].value);
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener(
      'click',
      (e) => {
        if (!wrap.contains(e.target)) closeList();
      },
      { capture: true },
    );
  });
}
