/**
 * Lista de clientes (pesquisa paginada) — clique abre histórico.
 */

import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  searchClients,
  MAX_DROPDOWN_RESULTS,
} from '../clients-catalog.js';
import { escapeHtml } from '../app.js';

const LIST_PAGE_SIZE = 25;

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

export function renderClientsListSection() {
  return `
    <section class="clients-list-section glass-card" data-clients-list-section aria-labelledby="clients-list-title">
      <h3 id="clients-list-title" class="dashboard-section-title">Lista de clientes</h3>
      <p class="text-muted clients-list-hint">Pesquise e clique numa empresa para ver o histórico de relatórios de bateria.</p>
      <div class="clients-list-toolbar">
        <input type="search"
          class="form-input clients-list-search"
          placeholder="Filtrar por nome ou NIF…"
          autocomplete="off"
          spellcheck="false"
          aria-label="Filtrar lista de clientes">
        <span class="clients-list-count text-muted" data-clients-list-count></span>
      </div>
      <ul class="clients-list" role="list" data-clients-list-ul></ul>
      <p class="text-muted clients-list-more" data-clients-list-more hidden></p>
    </section>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {(clientId: string) => void} onClientClick
 */
export function mountClientsList(root, onClientClick) {
  if (!root) return;

  root.innerHTML = renderClientsListSection();

  const section = root.querySelector('[data-clients-list-section]');
  const input = section?.querySelector('.clients-list-search');
  const ul = section?.querySelector('[data-clients-list-ul]');
  const countEl = section?.querySelector('[data-clients-list-count]');
  const moreEl = section?.querySelector('[data-clients-list-more]');

  if (!input || !ul) return;

  let catalog = getProductionClientsCatalog();

  const paint = (query = '') => {
    const result = searchClients(query, catalog);
    const items = result.items.slice(0, LIST_PAGE_SIZE);

    if (countEl) {
      countEl.textContent =
        result.totalMatches === 0
          ? '0 clientes'
          : `${result.totalMatches} cliente${result.totalMatches !== 1 ? 's' : ''}`;
    }

    if (moreEl) {
      const hidden = result.totalMatches > items.length;
      moreEl.hidden = !hidden;
      moreEl.textContent = hidden
        ? `A mostrar ${items.length} de ${result.totalMatches}. Refine a pesquisa para encontrar mais rapidamente.`
        : '';
    }

    if (!items.length) {
      ul.innerHTML =
        '<li class="clients-list-empty text-muted">Nenhum cliente corresponde à pesquisa.</li>';
      return;
    }

    ul.innerHTML = items
      .map(
        (c) => `
      <li>
        <button type="button"
          class="clients-list-item"
          data-client-id="${escapeAttr(c.id)}"
          data-client-nome="${escapeAttr(c.Nome)}">
          <span class="clients-list-item-name">${escapeHtml(c.Nome)}</span>
          <span class="clients-list-item-meta">${escapeHtml(c.NIF || '—')} · ${escapeHtml(c.Localidade || '—')}</span>
        </button>
      </li>
    `,
      )
      .join('');

    ul.querySelectorAll('.clients-list-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idCliente = item.dataset.clientId;
        onClientClick?.(idCliente);
      });
    });
  };

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => paint(input.value), 120);
  });

  ensureProductionCatalog().then(() => {
    catalog = getProductionClientsCatalog();
    paint('');
  });

  paint('');
}
