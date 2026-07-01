/**
 * Máquinas da proposta MS.015 — vários equipamentos, campos editáveis por orçamento.
 */

import { LABEL_N_INTERNO } from './field-labels.js';
import { escapeHtml } from './html-utils.js';
import {
  normalizeEquipamentoCampos,
  nextEquipamentoCampoKey,
  readOrcamentoEquipamentoCamposFromDom,
} from './orcamento-equipamento-campos.js';

function readMaquinaFieldValue(raw, key) {
  if (raw == null || typeof raw !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return String(raw[key] ?? '').trim();
  }
  if (key === 'numeroSerie') return String(raw.numero_de_serie ?? '').trim();
  if (key === 'numeroInterno') return String(raw.n_interno ?? raw.numeroInterno ?? '').trim();
  return '';
}

export function emptyOrcamentoMaquina(campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  return Object.fromEntries(fields.map(({ key }) => [key, '']));
}

export function hasOrcamentoMaquinaData(row, campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const m = normalizeOrcamentoMaquina(row, fields);
  return fields.some(({ key }) => Boolean(String(m[key] ?? '').trim()));
}

export function normalizeOrcamentoMaquina(raw = {}, campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  return Object.fromEntries(fields.map(({ key }) => [key, readMaquinaFieldValue(raw, key)]));
}

export function normalizeOrcamentoMaquinasList(raw, campos = null) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => normalizeOrcamentoMaquina(row, campos));
}

function joinParts(parts, separator = ' / ') {
  return parts
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(separator);
}

export function formatOrcamentoMaquinaLabel(row, index = 0, campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const m = normalizeOrcamentoMaquina(row, fields);
  const label = joinParts(fields.map(({ key }) => m[key]).filter((v) => String(v).trim()).slice(0, 3));
  return label || `Equipamento ${index + 1}`;
}

export function formatOrcamentoMaquinaMatricula(row, campos = null) {
  const m = normalizeOrcamentoMaquina(row, campos);
  return m.numeroInterno || m.matricula || m.numeroSerie || '—';
}

export function formatOrcamentoMaquinaShortLabel(row, index = 0, campos = null) {
  const label = formatOrcamentoMaquinaLabel(row, index, campos);
  if (label.length <= 24) return `Eq.${index + 1} — ${label}`;
  return `Eq.${index + 1}`;
}

/** Rótulo curto na tabela do PDF (detalhe do equipamento já aparece acima). */
export function formatOrcamentoMaquinaPdfTableLabel(index = 0) {
  return `Eq.${index + 1}`;
}

export function formatOrcamentoMaquinaCompactLine(row, index = 0, campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const m = normalizeOrcamentoMaquina(row, fields);
  const pairs = fields
    .map(({ key, label }) => {
      const value = String(m[key] ?? '').trim();
      if (!value) return '';
      return `${label}: ${value}`;
    })
    .filter(Boolean);
  return pairs.join(' — ') || formatOrcamentoMaquinaLabel(row, index, campos);
}

export function renderOrcamentoEquipamentoSelect(maquinas = [], selectedIndex = 0, campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const list = normalizeOrcamentoMaquinasList(maquinas, fields);
  const options = list
    .map((row, index) => {
      const label = formatOrcamentoMaquinaLabel(row, index, fields);
      const selected = normalizeEquipamentoIndex(selectedIndex, list.length) === index ? ' selected' : '';
      return `<option value="${index}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
  return `<select class="review-orc-input review-orc-input--equip" data-orc-field="equipamentoIndex" aria-label="Equipamento">${options}</select>`;
}

function normalizeEquipamentoIndex(value, machineCount = 1) {
  if (machineCount <= 1) return 0;
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n < machineCount) return n;
  return 0;
}

export function countOrcamentoMaquinasForLinhas(maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const list = normalizeOrcamentoMaquinasList(maquinas, fields);
  const withData = list.filter((row) => hasOrcamentoMaquinaData(row, fields));
  return Math.max(withData.length, list.length, 1);
}

export function shouldShowLinhaEquipamentoColumn(maquinas = [], campos = null) {
  return countOrcamentoMaquinasForLinhas(maquinas, campos) > 1;
}

/** Atualiza coluna «Equipamento» na tabela de linhas (ao adicionar/remover máquinas). */
export function syncOrcamentoLinhaEquipamentoColumn(root) {
  const table = root?.querySelector('.review-orc-table');
  const theadRow = table?.querySelector('thead tr');
  const tbody = root?.querySelector('#review-orc-linhas-body');
  if (!table || !theadRow || !tbody) return;

  const campos = readOrcamentoEquipamentoCamposFromDom(root);
  const maquinas = readOrcamentoMaquinasFromDom(root, campos);
  const multi = shouldShowLinhaEquipamentoColumn(maquinas, campos);
  table.classList.toggle('review-orc-table--multi-equip', multi);

  let equipTh = theadRow.querySelector('[data-orc-equip-th]');
  if (multi && !equipTh) {
    theadRow.insertAdjacentHTML(
      'afterbegin',
      '<th class="review-orc-equip-th" data-orc-equip-th scope="col">Equipamento</th>',
    );
  } else if (!multi && equipTh) {
    equipTh.remove();
  }

  tbody.querySelectorAll('[data-orcamento-linha]').forEach((tr) => {
    let equipTd = tr.querySelector('[data-orc-equip-td]');
    const selected =
      tr.querySelector('[data-orc-field="equipamentoIndex"]')?.value ??
      tr.dataset.equipamentoIndex ??
      '0';

    if (multi) {
      if (!equipTd) {
        tr.insertAdjacentHTML(
          'afterbegin',
          `<td class="review-orc-equip-cell" data-orc-equip-td></td>`,
        );
        equipTd = tr.querySelector('[data-orc-equip-td]');
      }
      if (equipTd) {
        equipTd.innerHTML = renderOrcamentoEquipamentoSelect(maquinas, selected, campos);
      }
    } else if (equipTd) {
      equipTd.remove();
    }
  });
}

export function syncLegacyMaquinaFieldsFromList(maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const first = normalizeOrcamentoMaquina(maquinas[0] || {}, fields);
  const maquina = joinParts([first.marca, first.modelo, first.tipo]);
  const matricula = first.numeroInterno || first.numeroSerie;
  return { ...first, maquina, matricula };
}

export function formatOrcamentoMaquinasDocxText(maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const rows = normalizeOrcamentoMaquinasList(maquinas, fields).filter((row) =>
    hasOrcamentoMaquinaData(row, fields),
  );
  if (!rows.length) return '—';
  if (rows.length === 1) {
    return formatOrcamentoMaquinaLabel(rows[0], 0, fields);
  }
  return rows
    .map((row, index) => {
      const label = formatOrcamentoMaquinaLabel(row, index, fields);
      const matricula = formatOrcamentoMaquinaMatricula(row, fields);
      return `${index + 1}. ${label} — ${LABEL_N_INTERNO}: ${matricula}`;
    })
    .join('\n');
}

function renderMaquinaFieldRow({ key, label }, value, { isSchemaCard, canRemoveCampo }) {
  const labelCell = isSchemaCard
    ? `<input
        type="text"
        class="review-orc-input review-orc-maquina-campo-label"
        data-orc-campo-label
        value="${escapeHtml(label)}"
        placeholder="Campo"
        aria-label="Nome do campo"
      />`
    : `<span class="review-orc-maquina-campo-label-readonly" data-orc-maquina-label-for="${escapeHtml(key)}">${escapeHtml(label)}</span>`;

  const removeBtn =
    isSchemaCard && canRemoveCampo
      ? `<button type="button" class="btn-icon review-orc-maquina-campo-remove" title="Remover campo" aria-label="Remover campo">×</button>`
      : '';

  return `
    <div class="review-orc-maquina-field" data-orc-maquina-campo data-campo-key="${escapeHtml(key)}">
      ${labelCell}
      <input
        type="text"
        class="review-orc-input review-orc-maquina-field__value"
        data-orc-maquina-field="${escapeHtml(key)}"
        value="${escapeHtml(value || '')}"
        placeholder="${escapeHtml(label)}"
        aria-label="${escapeHtml(label)}"
      />
      ${removeBtn}
    </div>`;
}

function renderMaquinaCard(row, index, campos, { canRemoveMachine, campoCount }) {
  const fields = normalizeEquipamentoCampos(campos);
  const m = normalizeOrcamentoMaquina(row, fields);
  const isSchemaCard = index === 0;
  const inputs = fields
    .map((campo) =>
      renderMaquinaFieldRow(campo, m[campo.key], {
        isSchemaCard,
        canRemoveCampo: campoCount > 1,
      }),
    )
    .join('');

  return `
    <article class="review-orc-maquina" data-orcamento-maquina data-index="${index}">
      <div class="review-orc-maquina__head">
        <strong class="review-orc-maquina__title">Equipamento ${index + 1}</strong>
        ${
          canRemoveMachine
            ? `<button type="button" class="btn-icon review-orc-maquina-remove" title="Remover equipamento" aria-label="Remover equipamento">×</button>`
            : ''
        }
      </div>
      <div class="review-orc-maquina__fields">
        ${inputs}
      </div>
    </article>`;
}

function renderMaquinasList(maquinas, campos) {
  const fields = normalizeEquipamentoCampos(campos);
  const rows = normalizeOrcamentoMaquinasList(maquinas, fields);
  const list = rows.length ? rows : [emptyOrcamentoMaquina(fields)];
  return list
    .map((row, index) =>
      renderMaquinaCard(row, index, fields, {
        canRemoveMachine: list.length > 1,
        campoCount: fields.length,
      }),
    )
    .join('');
}

function syncMaquinaFieldLabels(root, campos) {
  const fields = normalizeEquipamentoCampos(campos);
  fields.forEach(({ key, label }) => {
    root.querySelectorAll(`[data-orc-maquina-label-for="${key}"]`).forEach((el) => {
      el.textContent = label;
    });
    root.querySelectorAll(`[data-orc-maquina-field="${key}"]`).forEach((input) => {
      input.placeholder = label;
      if (!input.value.trim()) input.setAttribute('aria-label', label);
    });
  });
}

export function renderOrcamentoMaquinasSection(maquinas = [], equipamentoCampos = null) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  return `
    <section class="review-orc-maquinas" aria-label="Equipamentos da proposta">
      <div class="review-orc-maquinas__head">
        <h4 class="review-orc-cabecalho__title">Equipamentos</h4>
        <span class="review-orc-field-hint text-muted">Edite o nome de cada campo no primeiro equipamento; os valores preenchem-se em cada máquina.</span>
      </div>
      <div class="review-orc-maquinas__list" id="review-orc-maquinas-list">
        ${renderMaquinasList(maquinas, campos)}
      </div>
      <div class="review-orc-maquinas__actions">
        <button type="button" class="btn-outline btn-touch" id="review-orc-add-campo">+ Adicionar campo</button>
        <button type="button" class="btn-outline btn-touch review-orc-maquinas-add" id="review-orc-add-maquina">+ Adicionar máquina</button>
      </div>
    </section>`;
}

export function readOrcamentoMaquinasFromDom(root, campos = null) {
  const fields = normalizeEquipamentoCampos(campos ?? readOrcamentoEquipamentoCamposFromDom(root));
  const list = root?.querySelector('#review-orc-maquinas-list');
  if (!list) return [emptyOrcamentoMaquina(fields)];
  const rows = [];
  list.querySelectorAll('[data-orcamento-maquina]').forEach((card) => {
    const values = {};
    fields.forEach(({ key }) => {
      values[key] =
        card.querySelector(`[data-orc-maquina-field="${key}"]`)?.value?.trim() || '';
    });
    rows.push(normalizeOrcamentoMaquina(values, fields));
  });
  return rows.length ? rows : [emptyOrcamentoMaquina(fields)];
}

export { readOrcamentoEquipamentoCamposFromDom };

export function bindOrcamentoMaquinasSection(root, { onChange } = {}) {
  const list = root?.querySelector('#review-orc-maquinas-list');
  const addMaquinaBtn = root?.querySelector('#review-orc-add-maquina');
  const addCampoBtn = root?.querySelector('#review-orc-add-campo');
  if (!list || !addMaquinaBtn) return;

  const notify = () => onChange?.();

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

  const rerenderMaquinas = () => {
    const campos = readOrcamentoEquipamentoCamposFromDom(root);
    const maquinas = readOrcamentoMaquinasFromDom(root, campos);
    list.innerHTML = renderMaquinasList(maquinas, campos);
    renumber();
    notify();
  };

  addCampoBtn?.addEventListener('click', () => {
    const campos = readOrcamentoEquipamentoCamposFromDom(root);
    const key = nextEquipamentoCampoKey(campos);
    const maquinas = readOrcamentoMaquinasFromDom(root, campos);
    maquinas.forEach((row) => {
      row[key] = '';
    });
    const nextCampos = [...campos, { key, label: 'Novo campo' }];
    list.innerHTML = renderMaquinasList(maquinas, nextCampos);
    renumber();
    notify();
  });

  list.addEventListener('click', (e) => {
    const campoBtn = e.target.closest('.review-orc-maquina-campo-remove');
    if (campoBtn) {
      const row = campoBtn.closest('[data-orc-maquina-campo]');
      const firstCard = list.querySelector('[data-orcamento-maquina]');
      if (!row || !firstCard?.contains(row)) return;
      const campos = readOrcamentoEquipamentoCamposFromDom(root);
      if (campos.length <= 1) return;
      const key = row.dataset.campoKey;
      const nextCampos = campos.filter((c) => c.key !== key);
      const maquinas = readOrcamentoMaquinasFromDom(root, campos);
      list.innerHTML = renderMaquinasList(maquinas, nextCampos);
      renumber();
      notify();
      return;
    }

    const btn = e.target.closest('.review-orc-maquina-remove');
    if (!btn) return;
    const card = btn.closest('[data-orcamento-maquina]');
    if (!card) return;
    const cards = list.querySelectorAll('[data-orcamento-maquina]');
    if (cards.length <= 1) {
      card.querySelectorAll('[data-orc-maquina-field]').forEach((input) => {
        input.value = '';
      });
      notify();
      return;
    }
    card.remove();
    rerenderMaquinas();
  });

  list.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-campo-label]')) {
      const campos = readOrcamentoEquipamentoCamposFromDom(root);
      syncMaquinaFieldLabels(root, campos);
      notify();
      return;
    }
    if (e.target.matches('[data-orc-maquina-field]')) notify();
  });

  addMaquinaBtn.addEventListener('click', () => {
    const campos = readOrcamentoEquipamentoCamposFromDom(root);
    const index = list.querySelectorAll('[data-orcamento-maquina]').length;
    list.insertAdjacentHTML(
      'beforeend',
      renderMaquinaCard(emptyOrcamentoMaquina(campos), index, campos, {
        canRemoveMachine: true,
        campoCount: campos.length,
      }),
    );
    renumber();
    notify();
  });
}
