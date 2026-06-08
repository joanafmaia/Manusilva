/**
 * Pesquisa inteligente de clientes (autocompletar) — sem carregar os 500+ no DOM.
 */

import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  searchClients,
  MAX_DROPDOWN_RESULTS,
} from '../clients-catalog.js';
import {
  getDB,
  getClient,
  getServiceType,
  escapeHtml,
  formatDateLong,
} from '../app.js';
import { mapClientToLegacy } from '../mock_data.js';

const INPUT_DEBOUNCE_MS = 120;

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function renderSearchOptions(items, activeIndex, searchMeta) {
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
      data-id="${escapeAttr(c.id)}"
      data-client-id="${escapeAttr(c.id)}"
      data-client-nome="${escapeAttr(c.Nome)}"
      tabindex="-1">
      <span class="client-combobox-option-name">${escapeHtml(c.Nome)}</span>
      <span class="client-combobox-option-meta">${escapeHtml(c.NIF || '—')} · ${escapeHtml(c.Localidade || '—')}</span>
    </li>
  `,
    )
    .join('');

  const more =
    searchMeta.truncated && searchMeta.totalMatches > items.length
      ? `<li class="client-combobox-more">${searchMeta.totalMatches} resultados — a mostrar ${MAX_DROPDOWN_RESULTS}</li>`
      : '';

  return options + more;
}

export function renderSearchSection() {
  return `
    <section class="dashboard-search rh-section" data-dashboard-search aria-labelledby="dashboard-search-title">
      <h3 id="dashboard-search-title" class="dashboard-section-title">Encontrar cliente</h3>
      <p class="dashboard-search-hint text-muted">
        Pesquisa por nome ou NIF. Escolha um resultado para abrir o histórico de relatórios da empresa.
      </p>
      <div class="dashboard-search-control client-combobox" data-dashboard-client-search>
        <div class="client-combobox-control">
          <span class="client-combobox-icon" aria-hidden="true">⌕</span>
          <input type="search"
            class="client-combobox-input form-input dashboard-search-input"
            autocomplete="off"
            spellcheck="false"
            placeholder="Ex.: Silva, 501234567..."
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="dashboard-client-search-list"
            role="combobox">
          <button type="button" class="client-combobox-clear dashboard-search-clear" title="Limpar" aria-label="Limpar pesquisa" hidden>&times;</button>
        </div>
        <ul id="dashboard-client-search-list" class="client-combobox-list dashboard-search-list" role="listbox" hidden></ul>
      </div>
    </section>
  `;
}

function getClientHistory(clientId) {
  const db = getDB();
  const reports = (db.reports || [])
    .filter((r) => r.clientId === clientId && ['approved', 'pending_review'].includes(r.status))
    .map((r) => ({
      date: r.submittedAt,
      service: getServiceType(r.serviceType)?.label || r.serviceType,
      status: r.status,
    }));

  const jobs = (db.jobs || [])
    .filter((j) => j.clientId === clientId)
    .map((j) => ({
      date: j.date,
      service: getServiceType(j.serviceType)?.label || j.serviceType,
      status: j.status,
    }));

  return [...reports, ...jobs]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);
}

export function renderClientDetail(clientRecord) {
  const legacy =
    getClient(clientRecord.id) ||
    mapClientToLegacy(clientRecord);
  const history = getClientHistory(legacy.id);
  const forklifts = legacy.forklifts || [];

  const historyHtml = history.length
    ? `
      <div class="history-timeline compact">
        ${history
          .map((h) => {
            const statusLabel =
              h.status === 'approved'
                ? 'Aprovado'
                : h.status === 'pending_review'
                  ? 'Pendente'
                  : h.status === 'scheduled'
                    ? 'Agendado'
                    : h.status === 'in_progress'
                      ? 'Em curso'
                      : h.status === 'rejected'
                        ? 'Rejeitado'
                        : 'Concluído';
            const dateStr = String(h.date || '').split('T')[0];
            return `
              <div class="history-item">
                <div class="history-dot"></div>
                <div class="history-content">
                  <span class="history-date">${escapeHtml(formatDateLong(dateStr))}</span>
                  <p>${escapeHtml(h.service)} <span class="status-mini ${escapeHtml(h.status)}">${statusLabel}</span></p>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `
    : '<p class="text-muted">Sem intervenções registadas para este cliente.</p>';

  return `
    <article class="dashboard-client-detail rh-section">
      <header class="dashboard-client-detail-header">
        <div>
          <h4>${escapeHtml(legacy.name || legacy.Nome)}</h4>
          <p class="text-muted">${escapeHtml(legacy.nif || legacy.NIF || '—')} · ${escapeHtml(legacy.email || legacy['E-mail'] || '—')}</p>
        </div>
        <button type="button" class="btn-ghost btn-sm dashboard-client-detail-close" aria-label="Fechar ficha">&times;</button>
      </header>
      <p class="text-muted dashboard-client-address">${escapeHtml(legacy.address || legacy.Morada || '—')}</p>
      <p class="text-muted" style="font-size:0.8125rem;margin:0 0 0.75rem">
        ${forklifts.length} empilhador(es) registado(s)
      </p>
      <h5 class="dashboard-client-history-title">Histórico recente</h5>
      ${historyHtml}
    </article>
  `;
}

/**
 * Liga pesquisa com autocompletar no contentor.
 * @param {HTMLElement} root
 * @param {(record: object) => void} onSelect
 * @returns {() => void} cleanup
 */
export async function mountClientSearch(root, onSelect) {
  if (!root) return () => {};

  const wrap = root.querySelector('[data-dashboard-client-search]');
  const input = wrap?.querySelector('.dashboard-search-input');
  const list = wrap?.querySelector('.dashboard-search-list');
  const clearBtn = wrap?.querySelector('.dashboard-search-clear');

  if (!wrap || !input || !list) return () => {};

  await ensureProductionCatalog();
  let catalog = getProductionClientsCatalog({ warn: false });
  let filtered = [];
  let searchMeta = { query: '', totalMatches: 0, truncated: false };
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
    list.innerHTML = renderSearchOptions(filtered, activeIndex, searchMeta);
    list.querySelectorAll('.client-combobox-option').forEach((opt) => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idCliente = opt.dataset.id || opt.dataset.clientId;
        selectById(idCliente);
      });
      opt.addEventListener('click', () => {
        const idCliente = opt.dataset.id || opt.dataset.clientId;
        selectById(idCliente);
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

  const debouncedSearch = debounce((query) => {
    runSearch(query);
    openList();
  }, INPUT_DEBOUNCE_MS);

  const selectById = (id) => {
    const record = getClientFromCatalog(id, catalog);
    if (!record) return;
    input.value = record.Nome;
    if (clearBtn) clearBtn.hidden = false;
    wrap.classList.add('client-combobox--selected');
    closeList();
    onSelect?.(record);
  };

  const onDocClick = (e) => {
    if (!wrap.contains(e.target)) closeList();
  };

  input.addEventListener('focus', () => {
    runSearch(input.value);
    openList();
  });

  input.addEventListener('input', () => {
    wrap.classList.remove('client-combobox--selected');
    if (clearBtn) clearBtn.hidden = !input.value;
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
      selectById(filtered[activeIndex].id);
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    wrap.classList.remove('client-combobox--selected');
    filtered = [];
    searchMeta = { query: '', totalMatches: 0, truncated: false };
    renderList();
    closeList();
    onSelect?.(null);
  });

  document.addEventListener('click', onDocClick, { capture: true });

  return () => {
    document.removeEventListener('click', onDocClick, { capture: true });
  };
}
