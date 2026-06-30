/**
 * Autocomplete de artigos do catálogo nas linhas do orçamento MS.015.
 */

import { escapeHtml } from './html-utils.js';
import {
  catalogoItemToLinhaDescricao,
  formatCatalogoPreco,
  loadCatalogoProdutos,
  searchCatalogoProdutos,
} from './catalogo-produtos.js';

const INPUT_DEBOUNCE_MS = 120;

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function formatOptionMeta(item) {
  const parts = [];
  if (item.tipo && item.tipo !== '—') parts.push(item.tipo);
  if (item.codigo) parts.push(item.codigo);
  if (item.unidade) parts.push(item.unidade);
  if (item.precoVenda != null) parts.push(`${formatCatalogoPreco(item.precoVenda)} €`);
  return parts.join(' · ');
}

function renderOptions(items, activeIndex, query, catalogEmpty) {
  if (catalogEmpty) {
    return '<li class="client-combobox-hint">Catálogo vazio — importe Listagem Produtos.xlsx</li>';
  }
  if (!String(query || '').trim()) {
    return '<li class="client-combobox-hint">Escreva código ou descrição do artigo</li>';
  }
  if (!items.length) {
    return '<li class="client-combobox-empty">Nenhum artigo encontrado</li>';
  }
  return items
    .map(
      (item, i) => `
    <li class="client-combobox-option${i === activeIndex ? ' is-active' : ''}"
      role="option"
      data-index="${i}"
      aria-selected="${i === activeIndex}">
      <span class="client-combobox-option-name">${escapeHtml(item.descricao)}</span>
      <span class="client-combobox-option-meta">${escapeHtml(formatOptionMeta(item))}</span>
    </li>`,
    )
    .join('');
}

function applyCatalogItemToRow(row, item, { onChange } = {}) {
  const descInput = row.querySelector('[data-orc-field="descricao"]');
  const precoInput = row.querySelector('[data-orc-field="precoUnit"]');
  const qtdInput = row.querySelector('[data-orc-field="qtd"]');

  if (descInput) descInput.value = catalogoItemToLinhaDescricao(item);
  if (precoInput && item.precoVenda != null) {
    precoInput.value = formatCatalogoPreco(item.precoVenda);
  }
  if (qtdInput && !String(qtdInput.value || '').trim()) {
    qtdInput.value = '1';
  }
  onChange?.();
}

function bindDescricaoCombobox(input, { pool, catalogEmpty, onChange }) {
  if (!input || input.dataset.orcCatalogBound === '1') return;
  input.dataset.orcCatalogBound = '1';

  const row = input.closest('[data-orcamento-linha]');
  const wrap = document.createElement('div');
  wrap.className = 'client-combobox-wrap review-orc-catalog-combobox';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'client-combobox-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);

  let activeIndex = -1;
  let items = [];

  const close = () => {
    list.hidden = true;
    activeIndex = -1;
  };

  const open = () => {
    list.hidden = false;
  };

  const refresh = () => {
    const query = input.value;
    items = searchCatalogoProdutos(query, pool);
    if (activeIndex >= items.length) activeIndex = items.length - 1;
    list.innerHTML = renderOptions(items, activeIndex, query, catalogEmpty);
    if (String(query || '').trim()) open();
    else close();
  };

  const selectIndex = (index) => {
    const item = items[index];
    if (!item || !row) return;
    applyCatalogItemToRow(row, item, { onChange });
    close();
  };

  const debouncedRefresh = debounce(refresh, INPUT_DEBOUNCE_MS);

  input.addEventListener('input', () => {
    activeIndex = -1;
    debouncedRefresh();
  });

  input.addEventListener('focus', () => {
    if (String(input.value || '').trim()) refresh();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!items.length) return;
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      refresh();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      activeIndex = Math.max(activeIndex - 1, 0);
      refresh();
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0 && !list.hidden) {
      e.preventDefault();
      selectIndex(activeIndex);
    }
  });

  list.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const option = e.target.closest('.client-combobox-option');
    if (!option) return;
    const index = Number(option.dataset.index);
    if (!Number.isFinite(index) || index < 0) return;
    selectIndex(index);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
}

/**
 * @param {HTMLElement} root — #orcamento-editor
 * @param {{ onChange?: () => void }} [opts]
 */
export async function bindOrcamentoCatalogoComboboxes(root, opts = {}) {
  if (!root) return { itemCount: 0 };

  const catalog = await loadCatalogoProdutos();
  const pool = catalog.items;
  const catalogEmpty = pool.length === 0;

  root.querySelectorAll('[data-orc-field="descricao"]').forEach((input) => {
    bindDescricaoCombobox(input, { pool, catalogEmpty, onChange: opts.onChange });
  });

  return { itemCount: pool.length, catalogEmpty };
}
