/**
 * Combobox pesquisável de clientes — 560 registos (produção)
 */

import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  searchClients,
  normalizeClientRecord,
  MAX_DROPDOWN_RESULTS,
} from './clients-catalog.js';
import { escapeHtml } from './html-utils.js';
  cliente: 'Nome',
  nif: 'NIF',
  email: 'E-mail',
  e_mail: 'E-mail',
  morada: 'Morada',
  codigo_postal: 'Código postal',
  localidade: 'Localidade',
  pais: 'País/Região',
  pais_regiao: 'País/Região',
};

const INPUT_DEBOUNCE_MS = 120;

/** @deprecated Usar getProductionClientsCatalog — mantido para compatibilidade */
export function getClientsCatalog() {
  return getProductionClientsCatalog();
}

export { normalizeClientRecord, getProductionClientsCatalog, getClientFromCatalog };

export function findClientById(id, catalog = null) {
  const list = catalog ?? getProductionClientsCatalog({ warn: false });
  return getClientFromCatalog(id, list);
}

export function findClientByNome(nome, catalog = null) {
  const list = catalog ?? getProductionClientsCatalog({ warn: false });
  const q = String(nome || '').trim().toLowerCase();
  if (!q) return null;
  return list.find((c) => c.Nome.toLowerCase() === q) || null;
}

function renderOptions(items, activeIndex, searchMeta = null) {
  if (!searchMeta?.query) {
    return '<li class="client-combobox-hint">Digite o nome ou NIF do cliente</li>';
  }
  if (!items.length) {
    return '<li class="client-combobox-empty">Nenhum cliente encontrado</li>';
  }

  const options = items
    .map(
      (c, i) => `
    <li class="client-combobox-option${i === activeIndex ? ' is-active' : ''}"
      role="option"
      data-client-id="${escapeHtml(c.id)}"
      data-client-nome="${escapeHtml(c.Nome)}"
      aria-selected="${i === activeIndex}">
      <span class="client-combobox-option-name">${escapeHtml(c.Nome)}</span>
      <span class="client-combobox-option-meta">${escapeHtml(c.NIF || '—')} · ${escapeHtml(c.Localidade || '—')}</span>
    </li>
  `
    )
    .join('');

  const more =
    searchMeta.truncated && searchMeta.totalMatches > items.length
      ? `<li class="client-combobox-more" aria-hidden="true">${searchMeta.totalMatches} resultados — a mostrar ${MAX_DROPDOWN_RESULTS}</li>`
      : '';

  return options + more;
}

export function renderClientCombobox({
  fieldId = 'cliente',
  label = 'Cliente',
  value = '',
  selectedId = '',
  compact = false,
}) {
  const wrapClass = compact
    ? 'client-combobox client-combobox--compact'
    : 'client-combobox';

  return `
    <div class="form-group field-block ${wrapClass}" data-client-combobox data-field-id="${escapeHtml(fieldId)}">
      ${label ? `<label class="form-label">${escapeHtml(label)}</label>` : ''}
      <div class="client-combobox-control">
        <span class="client-combobox-icon" aria-hidden="true">⌕</span>
        <input type="text"
          class="client-combobox-input form-input"
          autocomplete="off"
          spellcheck="false"
          placeholder="Pesquisar por Nome ou NIF..."
          value="${escapeHtml(value)}"
          aria-autocomplete="list"
          aria-expanded="false"
          role="combobox">
        <input type="hidden" class="client-combobox-id" value="${escapeHtml(selectedId)}">
        <span class="client-combobox-clear" title="Limpar" aria-label="Limpar seleção" hidden>&times;</span>
      </div>
      <ul class="client-combobox-list" role="listbox" hidden></ul>
    </div>
  `;
}

export function renderHeaderClientCombobox({ value, selectedId }) {
  return `
    <div class="header-client-picker">
      <span class="hf-label">Cliente</span>
      ${renderClientCombobox({
        fieldId: 'cliente',
        label: '',
        value,
        selectedId,
        compact: true,
      })}
    </div>
  `;
}

export function applyClientAutofill(overlay, client) {
  if (!client) return;
  const catalog = getProductionClientsCatalog({ warn: false });
  const record = client.Nome ? client : getClientFromCatalog(client.id || client, catalog) || findClientByNome(client, catalog);
  if (!record) return;

  Object.entries(AUTOFILL_BINDINGS).forEach(([fieldId, prop]) => {
    const val = record[prop];
    if (val === undefined || val === '') return;

    overlay.querySelectorAll(`[data-client-combobox][data-field-id="${fieldId}"]`).forEach((combobox) => {
      const input = combobox.querySelector('.client-combobox-input');
      const hidden = combobox.querySelector('.client-combobox-id');
      if (input) input.value = record.Nome;
      if (hidden) hidden.value = record.id;
      combobox.classList.add('client-combobox--selected');
    });

    const el = overlay.querySelector(`[data-field-id="${fieldId}"]:not(.client-combobox-input)`);
    if (el && !el.closest('[data-client-combobox]')) {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.closest('.material-qty-field')?.classList.toggle('has-value', String(val).trim() !== '');
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function bindClientComboboxes(overlay) {
  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog();

  overlay.querySelectorAll('[data-client-combobox]').forEach((wrap) => {
    const input = wrap.querySelector('.client-combobox-input');
    const hidden = wrap.querySelector('.client-combobox-id');
    const list = wrap.querySelector('.client-combobox-list');
    const clearBtn = wrap.querySelector('.client-combobox-clear');
    let filtered = [];
    let searchMeta = { query: '', totalMatches: 0, truncated: false };
    let activeIndex = 0;
    let debouncedFilter = null;

    const openList = () => {
      list.hidden = false;
      input?.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
    };

    const closeList = () => {
      list.hidden = true;
      input?.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('is-open');
    };

    const renderList = () => {
      list.innerHTML = renderOptions(filtered, activeIndex, searchMeta);
      list.querySelectorAll('.client-combobox-option').forEach((opt) => {
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectClient(opt.dataset.clientId, opt.dataset.clientNome);
        });
      });
    };

    const runSearch = (query) => {
      const result = searchClients(query, catalog);
      filtered = result.items;
      searchMeta = {
        query: String(query || '').trim(),
        totalMatches: result.totalMatches,
        truncated: result.truncated,
      };
      activeIndex = 0;
      renderList();
    };

    debouncedFilter = debounce((query) => {
      runSearch(query);
      openList();
    }, INPUT_DEBOUNCE_MS);

    const selectClient = (id, nome) => {
      const record = getClientFromCatalog(id, catalog) || findClientByNome(nome, catalog);
      if (!record) return;
      input.value = record.Nome;
      hidden.value = record.id;
      wrap.classList.add('client-combobox--selected');
      wrap.classList.remove('client-combobox--pulse');
      void wrap.offsetWidth;
      wrap.classList.add('client-combobox--pulse');
      if (clearBtn) clearBtn.hidden = false;
      closeList();
      applyClientAutofill(overlay, record);
    };

    const syncFilter = (immediate = false) => {
      const q = input?.value || '';
      if (immediate) {
        runSearch(q);
        openList();
      } else {
        debouncedFilter(q);
      }
      wrap.classList.toggle('client-combobox--selected', Boolean(hidden?.value));
    };

    input?.addEventListener('focus', () => {
      syncFilter(true);
    });

    input?.addEventListener('input', () => {
      hidden.value = '';
      wrap.classList.remove('client-combobox--selected');
      syncFilter(false);
    });

    input?.addEventListener('keydown', (e) => {
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
        const c = filtered[activeIndex];
        selectClient(c.id, c.Nome);
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    clearBtn?.addEventListener('click', () => {
      input.value = '';
      hidden.value = '';
      wrap.classList.remove('client-combobox--selected');
      clearBtn.hidden = true;
      filtered = [];
      searchMeta = { query: '', totalMatches: 0, truncated: false };
      renderList();
      closeList();
    });

    document.addEventListener(
      'click',
      (e) => {
        if (!wrap.contains(e.target)) closeList();
      },
      { capture: true }
    );

    if (hidden?.value || input?.value) {
      const existing = getClientFromCatalog(hidden.value, catalog) || findClientByNome(input.value, catalog);
      if (existing && clearBtn) clearBtn.hidden = false;
    }
  });
}

export function collectClientComboboxValues(overlay, values) {
  overlay.querySelectorAll('[data-client-combobox]').forEach((wrap) => {
    const fieldId = wrap.dataset.fieldId || 'cliente';
    const input = wrap.querySelector('.client-combobox-input');
    const hidden = wrap.querySelector('.client-combobox-id');
    if (input?.value?.trim()) values[fieldId] = input.value.trim();
    if (hidden?.value) values.cliente_id = hidden.value;
  });
}
