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

export function renderClientsListSection() {
  return `
    <section class="clients-list-section rh-section rh-admin-section" data-clients-list-section aria-labelledby="clients-list-title">
      <h3 id="clients-list-title" class="dashboard-section-title">Lista de clientes</h3>
      <p class="clients-list-hint ms-label">
        Use «Editar Ficha» para os dados cadastrais (NIF, morada, e-mail e condição de pagamento) e «Ver Histórico» para os relatórios do cliente.
      </p>
      <div class="clients-list-toolbar">
        <input type="search"
          class="form-input clients-list-search"
          placeholder="Filtrar por nome, NIF ou e-mail…"
          autocomplete="off"
          spellcheck="false"
          aria-label="Filtrar lista de clientes">
        <span class="clients-list-count text-muted" data-clients-list-count></span>
      </div>

      <div class="clients-list-cards" data-clients-list-cards role="list"></div>

      <div class="clients-list-table-wrap">
        <div class="clients-list-table-scroll">
          <table class="clients-list-table rh-data-table rh-data-table--compact">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">NIF</th>
                <th scope="col">E-mail</th>
                <th scope="col">Localidade</th>
                <th scope="col">Ações</th>
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
      <div class="clients-list-card-actions">
        <button type="button" class="btn-ghost btn-sm" data-client-profile="${escapeAttr(c.id)}">${msIconHtml('pencil', 'btn-inline-icon')} Editar Ficha</button>
        <button type="button" class="btn-primary btn-sm" data-client-history="${escapeAttr(c.id)}">${msIconHtml('folder', 'btn-inline-icon')} Ver Histórico</button>
      </div>
    </article>
  `;
}

function renderClientTableRow(c) {
  return `
    <tr class="rh-data-table-row clients-list-table-row">
      <td class="rh-cell-client">
        <button type="button" class="rh-cell-link-btn clients-list-name-btn" data-client-profile="${escapeAttr(c.id)}">
          ${escapeHtml(c.Nome)}
        </button>
      </td>
      <td class="rh-cell-nif">${escapeHtml(c.NIF || '—')}</td>
      <td class="rh-cell-muted">${escapeHtml(c['E-mail'] || '—')}</td>
      <td class="rh-cell-muted">${escapeHtml(c.Localidade || '—')}</td>
      <td class="rh-col-action clients-list-table-actions">
        <div class="rh-table-actions">
          <button type="button" class="btn-ghost btn-sm rh-btn-compact" data-client-profile="${escapeAttr(c.id)}" title="Editar ficha cadastral">Ficha</button>
          <button type="button" class="btn-primary btn-sm rh-btn-compact" data-client-history="${escapeAttr(c.id)}" title="Ver histórico de relatórios">Histórico</button>
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

/**
 * @param {HTMLElement} root
 * @param {{ onClientHistory?: (clientId: string) => void }} [options]
 */
export async function mountClientsList(root, options = {}) {
  if (!root) return;

  const onClientHistory = options.onClientHistory || options.onClientClick;

  root.innerHTML = renderClientsListSection();

  const section = root.querySelector('[data-clients-list-section]');
  const input = section?.querySelector('.clients-list-search');
  const cardsMount = section?.querySelector('[data-clients-list-cards]');
  const tbody = section?.querySelector('[data-clients-list-tbody]');
  const countEl = section?.querySelector('[data-clients-list-count]');
  const moreEl = section?.querySelector('[data-clients-list-more]');

  if (!input || !cardsMount || !tbody) return;

  await ensureProductionCatalog();
  let catalog = getProductionClientsCatalog({ warn: false });

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
      cardsMount.innerHTML = '<p class="clients-list-empty text-muted">Nenhum cliente corresponde à pesquisa.</p>';
      tbody.innerHTML = `<tr><td colspan="5" class="clients-list-empty text-muted">Nenhum cliente corresponde à pesquisa.</td></tr>`;
      return;
    }

    cardsMount.innerHTML = items.map((c) => renderClientCard(c)).join('');
    tbody.innerHTML = items.map((c) => renderClientTableRow(c)).join('');
    bindClientListActions(section, { onClientHistory });
  };

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => paint(input.value), 120);
  });

  paint('');
}
