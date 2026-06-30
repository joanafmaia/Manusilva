/**
 * Máquinas da proposta MS.015 — vários equipamentos por orçamento.
 */

import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
} from './field-labels.js';
import { escapeHtml } from './html-utils.js';

export function emptyOrcamentoMaquina() {
  return {
    marca: '',
    modelo: '',
    tipo: '',
    numeroSerie: '',
    numeroInterno: '',
  };
}

export function hasOrcamentoMaquinaData(row) {
  const m = normalizeOrcamentoMaquina(row);
  return Boolean(m.marca || m.modelo || m.tipo || m.numeroSerie || m.numeroInterno);
}

export function normalizeOrcamentoMaquina(raw = {}) {
  return {
    marca: String(raw?.marca ?? '').trim(),
    modelo: String(raw?.modelo ?? '').trim(),
    tipo: String(raw?.tipo ?? '').trim(),
    numeroSerie: String(raw?.numeroSerie ?? raw?.numero_de_serie ?? '').trim(),
    numeroInterno: String(raw?.numeroInterno ?? raw?.n_interno ?? '').trim(),
  };
}

export function normalizeOrcamentoMaquinasList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeOrcamentoMaquina);
}

function joinParts(parts, separator = ' / ') {
  return parts
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(separator);
}

export function formatOrcamentoMaquinaLabel(row, index = 0) {
  const m = normalizeOrcamentoMaquina(row);
  const label = joinParts([m.marca, m.modelo, m.tipo]);
  return label || `Máquina ${index + 1}`;
}

export function formatOrcamentoMaquinaMatricula(row) {
  const m = normalizeOrcamentoMaquina(row);
  return m.numeroInterno || m.numeroSerie || '—';
}

export function syncLegacyMaquinaFieldsFromList(maquinas = []) {
  const first = normalizeOrcamentoMaquina(maquinas[0] || {});
  const maquina = joinParts([first.marca, first.modelo, first.tipo]);
  const matricula = first.numeroInterno || first.numeroSerie;
  return { ...first, maquina, matricula };
}

export function formatOrcamentoMaquinasDocxText(maquinas = []) {
  const rows = normalizeOrcamentoMaquinasList(maquinas).filter(hasOrcamentoMaquinaData);
  if (!rows.length) return '—';
  if (rows.length === 1) {
    return formatOrcamentoMaquinaLabel(rows[0], 0);
  }
  return rows
    .map((row, index) => {
      const label = formatOrcamentoMaquinaLabel(row, index);
      const matricula = formatOrcamentoMaquinaMatricula(row);
      return `${index + 1}. ${label} — ${LABEL_N_INTERNO}: ${matricula}`;
    })
    .join('\n');
}

function renderMaquinaCard(row, index, { canRemove }) {
  const m = normalizeOrcamentoMaquina(row);
  return `
    <article class="review-orc-maquina" data-orcamento-maquina data-index="${index}">
      <div class="review-orc-maquina__head">
        <strong class="review-orc-maquina__title">Equipamento ${index + 1}</strong>
        ${
          canRemove
            ? `<button type="button" class="btn-icon review-orc-maquina-remove" title="Remover equipamento" aria-label="Remover equipamento">×</button>`
            : ''
        }
      </div>
      <div class="review-orc-maquina__grid">
        <label class="review-orc-field">
          <span>${LABEL_MARCA}</span>
          <input type="text" class="review-orc-input" data-orc-maquina-field="marca" value="${escapeHtml(m.marca)}" placeholder="${LABEL_MARCA}" />
        </label>
        <label class="review-orc-field">
          <span>${LABEL_MODELO}</span>
          <input type="text" class="review-orc-input" data-orc-maquina-field="modelo" value="${escapeHtml(m.modelo)}" placeholder="${LABEL_MODELO}" />
        </label>
        <label class="review-orc-field">
          <span>${LABEL_TIPO}</span>
          <input type="text" class="review-orc-input" data-orc-maquina-field="tipo" value="${escapeHtml(m.tipo)}" placeholder="${LABEL_TIPO}" />
        </label>
        <label class="review-orc-field">
          <span>${LABEL_NUMERO_SERIE}</span>
          <input type="text" class="review-orc-input" data-orc-maquina-field="numeroSerie" value="${escapeHtml(m.numeroSerie)}" placeholder="${LABEL_NUMERO_SERIE}" />
        </label>
        <label class="review-orc-field">
          <span>${LABEL_N_INTERNO}</span>
          <input type="text" class="review-orc-input" data-orc-maquina-field="numeroInterno" value="${escapeHtml(m.numeroInterno)}" placeholder="${LABEL_N_INTERNO}" />
        </label>
      </div>
    </article>`;
}

export function renderOrcamentoMaquinasSection(maquinas = []) {
  const rows = normalizeOrcamentoMaquinasList(maquinas);
  const list = rows.length ? rows : [emptyOrcamentoMaquina()];
  return `
    <section class="review-orc-maquinas" aria-label="Equipamentos da proposta">
      <div class="review-orc-maquinas__head">
        <h4 class="review-orc-cabecalho__title">Equipamentos</h4>
        <span class="review-orc-field-hint text-muted">Pode incluir várias máquinas no mesmo orçamento.</span>
      </div>
      <div class="review-orc-maquinas__list" id="review-orc-maquinas-list">
        ${list.map((row, index) => renderMaquinaCard(row, index, { canRemove: list.length > 1 })).join('')}
      </div>
      <button type="button" class="btn-outline btn-touch review-orc-maquinas-add" id="review-orc-add-maquina">+ Adicionar máquina</button>
    </section>`;
}

export function readOrcamentoMaquinasFromDom(root) {
  const list = root?.querySelector('#review-orc-maquinas-list');
  if (!list) return [];
  const rows = [];
  list.querySelectorAll('[data-orcamento-maquina]').forEach((card) => {
    const read = (field) =>
      card.querySelector(`[data-orc-maquina-field="${field}"]`)?.value?.trim() || '';
    rows.push(
      normalizeOrcamentoMaquina({
        marca: read('marca'),
        modelo: read('modelo'),
        tipo: read('tipo'),
        numeroSerie: read('numeroSerie'),
        numeroInterno: read('numeroInterno'),
      }),
    );
  });
  return rows.length ? rows : [emptyOrcamentoMaquina()];
}

export function bindOrcamentoMaquinasSection(root) {
  const list = root?.querySelector('#review-orc-maquinas-list');
  const addBtn = root?.querySelector('#review-orc-add-maquina');
  if (!list || !addBtn) return;

  const renumber = () => {
    const cards = list.querySelectorAll('[data-orcamento-maquina]');
    cards.forEach((card, index) => {
      card.dataset.index = String(index);
      const title = card.querySelector('.review-orc-maquina__title');
      if (title) title.textContent = `Equipamento ${index + 1}`;
      const removeBtn = card.querySelector('.review-orc-maquina-remove');
      if (removeBtn) removeBtn.hidden = cards.length <= 1;
    });
  };

  addBtn.addEventListener('click', () => {
    const index = list.querySelectorAll('[data-orcamento-maquina]').length;
    list.insertAdjacentHTML(
      'beforeend',
      renderMaquinaCard(emptyOrcamentoMaquina(), index, { canRemove: true }),
    );
    renumber();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.review-orc-maquina-remove');
    if (!btn) return;
    const card = btn.closest('[data-orcamento-maquina]');
    if (!card) return;
    const cards = list.querySelectorAll('[data-orcamento-maquina]');
    if (cards.length <= 1) {
      card.querySelectorAll('input').forEach((input) => {
        input.value = '';
      });
      return;
    }
    card.remove();
    renumber();
  });
}
