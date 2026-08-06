/**
 * Lista de clientes (pesquisa paginada) — ficha cadastral + histórico.
 */

import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  searchClients,
} from '../clients-catalog.js';
import { escapeHtml } from '../app.js';
import { msIconHtml } from '../ui-icons.js';
import { openClientProfilePanel } from './client-profile-drawer.js';

const LIST_PAGE_SIZE = 25;

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

export function renderClientsListSection({ hideSearch = false, techMode = false } = {}) {
  const searchBlock = hideSearch
    ? `<span class="clients-list-count text-muted" data-clients-list-count></span>`
    : `
      <div class="clients-list-toolbar faturacao-filters-grid">
        <div class="form-group faturacao-filter-group faturacao-filter-search">
          <label class="form-label" for="clients-list-search">Pesquisar</label>
          <input type="search"
            class="form-input clients-list-search"
            id="clients-list-search"
            placeholder="Nome, NIF ou e-mail…"
            autocomplete="off"
            spellcheck="false"
            aria-label="Filtrar lista de clientes">
        </div>
        <span class="clients-list-count text-muted" data-clients-list-count></span>
      </div>`;

  return `
    <section class="clients-list-section rh-section rh-admin-section glass-card${techMode ? ' clients-list-section--tech' : ''}${hideSearch ? ' clients-list-section--external-search' : ''}" data-clients-list-section aria-labelledby="clients-list-title">
      ${
        techMode
          ? ''
          : `<h3 id="clients-list-title" class="ms-h2 faturacao-section-title">Lista de clientes</h3>
      <p class="clients-list-hint text-muted">
        «Ficha» para dados cadastrais · «Histórico» para relatórios do cliente.
      </p>`
      }
      ${searchBlock}

      <div class="clients-list-cards" data-clients-list-cards role="list"></div>

      <div class="clients-list-table-wrap">
        <div class="faturacao-table-wrap rh-table-scroll clients-list-table-scroll" data-clients-list-scroll>
          <table class="clients-list-table rh-data-table rh-data-table--compact faturacao-table--dense">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Contacto</th>
                <th scope="col" class="faturacao-col-action">Ação</th>
              </tr>
            </thead>
            <tbody data-clients-list-tbody></tbody>
          </table>
        </div>
      </div>

      <p class="text-muted clients-list-more" data-clients-list-more hidden></p>
    </section>
  `;
}

function renderClientCard(c) {
  return `
    <article class="clients-list-card" role="listitem">
      <button type="button" class="clients-list-card-name" data-client-profile="${escapeAttr(c.id)}">
        ${escapeHtml(c.Nome)}
      </button>
      <dl class="clients-list-card-meta">
        <div><dt>NIF</dt><dd>${escapeHtml(c.NIF || '—')}</dd></div>
        <div><dt>E-mail</dt><dd>${escapeHtml(c['E-mail'] || '—')}</dd></div>
      </dl>
      <div class="clients-list-card-actions faturacao-billing-actions">
        <button type="button" class="btn-ghost btn-sm faturacao-btn-compact" data-client-profile="${escapeAttr(c.id)}">${msIconHtml('pencil', 'btn-inline-icon')} Ficha</button>
        <button type="button" class="btn-primary btn-sm faturacao-btn-compact" data-client-history="${escapeAttr(c.id)}">${msIconHtml('folder', 'btn-inline-icon')} Histórico</button>
      </div>
    </article>
  `;
}

function renderClientTableRow(c) {
  const contacto = [c.NIF, c['E-mail'], c.Localidade].filter(Boolean).join(' · ') || '—';
  return `
    <tr class="rh-data-table-row clients-list-table-row faturacao-row--compact">
      <td class="faturacao-cell-client">
        <button type="button" class="rh-cell-link-btn clients-list-name-btn faturacao-cell-client-name" data-client-profile="${escapeAttr(c.id)}">
          ${escapeHtml(c.Nome)}
        </button>
      </td>
      <td class="faturacao-cell-detail">${escapeHtml(contacto)}</td>
      <td class="faturacao-col-action clients-list-table-actions">
        <div class="faturacao-billing-actions">
          <button type="button" class="btn-ghost btn-sm faturacao-btn-compact" data-client-profile="${escapeAttr(c.id)}" title="Editar ficha cadastral">Ficha</button>
          <button type="button" class="btn-primary btn-sm faturacao-btn-compact" data-client-history="${escapeAttr(c.id)}" title="Ver histórico de relatórios">Histórico</button>
        </div>
      </td>
    </tr>
  `;
}

function bindClientListActions(root, { onClientHistory }) {
  root.querySelectorAll('[data-client-profile]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.clientProfile;
      openClientProfilePanel(id, { onHistory: onClientHistory });
    });
  });

  root.querySelectorAll('[data-client-history]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClientHistory?.(btn.dataset.clientHistory);
    });
  });
}

let activeClientsListRefresh = null;
let activeClientsListPaint = null;
let activeClientsListQuery = '';

/**
 * @param {HTMLElement} root
 * @param {{
 *   onClientHistory?: (clientId: string) => void,
 *   hideSearch?: boolean,
 *   techMode?: boolean,
 *   initialQuery?: string,
 * }} [options]
 */
export async function mountClientsList(root, options = {}) {
  if (!root) return;

  const onClientHistory = options.onClientHistory || options.onClientClick;
  const hideSearch = Boolean(options.hideSearch);
  const techMode = Boolean(options.techMode);
  activeClientsListQuery = options.initialQuery || '';

  root.innerHTML = renderClientsListSection({ hideSearch, techMode });

  const section = root.querySelector('[data-clients-list-section]');
  const input = section?.querySelector('.clients-list-search');
  const cardsMount = section?.querySelector('[data-clients-list-cards]');
  const tbody = section?.querySelector('[data-clients-list-tbody]');
  const scrollWrap = section?.querySelector('[data-clients-list-scroll]');
  const countEl = section?.querySelector('[data-clients-list-count]');
  const moreEl = section?.querySelector('[data-clients-list-more]');

  if (!cardsMount || !tbody) return;

  await ensureProductionCatalog();
  let catalog = getProductionClientsCatalog({ warn: false });

  const paint = (query = '') => {
    activeClientsListQuery = query;
    if (input && input.value !== query) input.value = query;
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

    if (scrollWrap) {
      scrollWrap.classList.toggle('faturacao-table-wrap--scroll-y', items.length > 8);
    }

    if (!items.length) {
      cardsMount.innerHTML = '<p class="clients-list-empty text-muted">Nenhum cliente corresponde à pesquisa.</p>';
      tbody.innerHTML = `<tr><td colspan="3" class="clients-list-empty text-muted">Nenhum cliente corresponde à pesquisa.</td></tr>`;
      return;
    }

    cardsMount.innerHTML = items.map((c) => renderClientCard(c)).join('');
    tbody.innerHTML = items.map((c) => renderClientTableRow(c)).join('');
    bindClientListActions(section, { onClientHistory });
  };

  activeClientsListPaint = paint;

  if (input) {
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => paint(input.value), 120);
    });
  }

  activeClientsListRefresh = async () => {
    await ensureProductionCatalog();
    catalog = getProductionClientsCatalog({ warn: false });
    paint(activeClientsListQuery || input?.value || '');
  };

  paint(activeClientsListQuery);
}

/** Aplica pesquisa externa (ex.: toolbar do técnico). */
export function applyClientsListQuery(query = '') {
  if (typeof activeClientsListPaint === 'function') {
    activeClientsListPaint(String(query || ''));
    return true;
  }
  return false;
}

/** Atualiza dados da lista sem destruir a pesquisa / scroll. */
export async function softRefreshClientsList() {
  if (typeof activeClientsListRefresh === 'function') {
    await activeClientsListRefresh();
    return true;
  }
  return false;
}
