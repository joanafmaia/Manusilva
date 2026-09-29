/**
 * Paleta de comando RH — Ctrl+K / ⌘K.
 */

import { searchAdminIndex } from './admin-command-search.js';
import { escapeHtml } from './html-utils.js';

const KIND_LABEL = {
  client: 'Cliente',
  technician: 'Técnico',
  report: 'OP / Relatório',
  servico: 'Visita',
  job: 'Trabalho',
  invoice: 'Fatura',
  orcamento: 'Proposta',
  folha: 'Folha de obra',
};

let overlay = null;
let activeIndex = 0;
let currentHits = [];
let indexCache = [];
let indexCachedAt = 0;
let searchGen = 0;
let searchTimer = null;
const INDEX_TTL_MS = 15_000;
const SEARCH_DEBOUNCE_MS = 120;

function isTypingTarget(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

async function getIndex() {
  const now = Date.now();
  if (!indexCache.length || now - indexCachedAt > INDEX_TTL_MS) {
    const { buildAdminSearchIndex } = await import('./admin-command-index.js');
    indexCache = buildAdminSearchIndex();
    indexCachedAt = now;
  }
  return indexCache;
}

function closePalette() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  overlay?.remove();
  overlay = null;
  activeIndex = 0;
  currentHits = [];
}

function renderHits() {
  const list = overlay?.querySelector('#admin-cmd-list');
  if (!list) return;
  if (!currentHits.length) {
    const q = overlay.querySelector('#admin-cmd-input')?.value?.trim();
    list.innerHTML = q
      ? '<li class="admin-cmd-empty">Sem resultados.</li>'
      : '<li class="admin-cmd-empty">Escreva um cliente, OP, NIF ou nº de fatura.</li>';
    return;
  }
  list.innerHTML = currentHits
    .map(
      (hit, i) => `
      <li>
        <button type="button" class="admin-cmd-item${i === activeIndex ? ' is-active' : ''}" data-cmd-index="${i}">
          <span class="admin-cmd-kind">${escapeHtml(KIND_LABEL[hit.kind] || hit.kind)}</span>
          <span class="admin-cmd-copy">
            <span class="admin-cmd-title">${escapeHtml(hit.title)}</span>
            <span class="admin-cmd-sub">${escapeHtml(hit.subtitle || '')}</span>
          </span>
        </button>
      </li>`,
    )
    .join('');
}

async function refreshHits(query) {
  const gen = ++searchGen;
  const q = String(query || '').trim();
  if (!q) {
    currentHits = [];
    activeIndex = 0;
    renderHits();
    return;
  }
  const index = await getIndex();
  if (gen !== searchGen || !overlay) return;
  currentHits = searchAdminIndex(index, query, { limit: 20 });
  if (activeIndex >= currentHits.length) activeIndex = Math.max(0, currentHits.length - 1);
  renderHits();
}

async function runAction(hit) {
  const action = hit?.action;
  if (!action) return;
  closePalette();

  if (action.type === 'report' && action.reportId) {
    window.dispatchEvent(
      new CustomEvent('ms-admin-goto', { detail: { tab: 'relatorios', reportId: action.reportId } }),
    );
    return;
  }
  if (action.type === 'client' && action.clientId) {
    const { openClientProfilePanel } = await import('./views/client-profile-drawer.js');
    await openClientProfilePanel(action.clientId, { initialTab: action.tab || 'contactos' });
    return;
  }
  if (action.type === 'invoice') {
    window.dispatchEvent(
      new CustomEvent('ms-admin-goto', {
        detail: {
          tab: 'faturacao',
          faturacaoClientId: action.clientId,
          faturacaoClientNome: action.clientNome,
          faturacaoSearch: action.query,
        },
      }),
    );
    return;
  }
  if (action.type === 'calendar') {
    window.dispatchEvent(
      new CustomEvent('ms-admin-goto', {
        detail: { tab: 'calendario', calendar: action },
      }),
    );
    return;
  }
  if (action.type === 'tab' && action.tab) {
    window.dispatchEvent(new CustomEvent('ms-admin-goto', { detail: { tab: action.tab } }));
  }
}

function openPalette() {
  if (overlay) {
    overlay.querySelector('#admin-cmd-input')?.focus();
    overlay.querySelector('#admin-cmd-input')?.select();
    return;
  }

  overlay = document.createElement('div');
  overlay.id = 'admin-cmd-overlay';
  overlay.className = 'admin-cmd-overlay';
  overlay.innerHTML = `
    <div class="admin-cmd-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-cmd-title">
      <p id="admin-cmd-title" class="admin-cmd-eyebrow">Pesquisa global</p>
      <input type="search" id="admin-cmd-input" class="admin-cmd-input" placeholder="Cliente, OP, NIF, fatura, técnico…" autocomplete="off" spellcheck="false">
      <ul id="admin-cmd-list" class="admin-cmd-list" role="listbox"></ul>
      <p class="admin-cmd-hint">Enter abre · Esc fecha · ↑↓ navega</p>
    </div>
  `;
  document.body.appendChild(overlay);
  void refreshHits('');

  const input = overlay.querySelector('#admin-cmd-input');
  input?.addEventListener('input', () => {
    activeIndex = 0;
    const q = input.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      void refreshHits(q);
    }, SEARCH_DEBOUNCE_MS);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
    const btn = e.target.closest('[data-cmd-index]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-cmd-index'));
    if (currentHits[idx]) void runAction(currentHits[idx]);
  });
  input?.focus();
}

function onPaletteKeydown(e) {
  const openCombo = (e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k';
  if (openCombo) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (overlay) closePalette();
    else openPalette();
    return;
  }

  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    closePalette();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, Math.max(0, currentHits.length - 1));
    renderHits();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    renderHits();
    return;
  }
  if (e.key === 'Enter') {
    if (isTypingTarget(e.target) && e.target.id !== 'admin-cmd-input') return;
    e.preventDefault();
    if (currentHits[activeIndex]) void runAction(currentHits[activeIndex]);
  }
}

export function initAdminCommandPalette() {
  if (document.documentElement.dataset.boundAdminCmd === '1') return;
  document.documentElement.dataset.boundAdminCmd = '1';
  document.addEventListener('keydown', onPaletteKeydown);
  document.getElementById('btn-admin-search')?.addEventListener('click', () => openPalette());
  window.addEventListener('db-updated', () => {
    indexCache = [];
  });
}

export { closePalette as closeAdminCommandPalette };
