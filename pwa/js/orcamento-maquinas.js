/**
 * Máquinas da proposta MS.015 — vários equipamentos, campos editáveis por orçamento.
 */

import { LABEL_N_INTERNO } from './field-labels.js';
import { escapeHtml } from './html-utils.js';
import {
  normalizeEquipamentoCampos,
  nextEquipamentoCampoKey,
  readMaquinaCamposFromCard,
  readOrcamentoEquipamentoCamposFromDom,
} from './orcamento-equipamento-campos.js';
import {
  computeLinhaTotal,
  formatEuro,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';

function readMaquinaFieldValue(raw, key) {
  if (raw == null || typeof raw !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return String(raw[key] ?? '').trim();
  }
  if (key === 'numeroSerie') return String(raw.numero_de_serie ?? '').trim();
  if (key === 'numeroInterno') return String(raw.n_interno ?? raw.numeroInterno ?? '').trim();
  return '';
}

/** Campos extra das propostas template (baterias / máquinas) preservados em cada equipamento. */
const ORCAMENTO_MAQUINA_TEMPLATE_EXTRA_KEYS = [
  'maquinaManutencaoNome',
  'periodicidadeManutencao',
  'valorManutencaoVisita',
  'valorManutencaoGeral',
  'incluirInspecaoDl50',
  'valorInspecaoDl50',
];

export function resolveMaquinaFieldDefs(row = {}, fallbackCampos = null) {
  if (Array.isArray(row?.campos) && row.campos.length) {
    return normalizeEquipamentoCampos(row.campos);
  }
  return normalizeEquipamentoCampos(fallbackCampos);
}

export function emptyOrcamentoMaquina(campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const row = Object.fromEntries(fields.map(({ key }) => [key, '']));
  row.campos = fields.map((field) => ({ ...field }));
  return row;
}

export function hasOrcamentoMaquinaData(row, campos = null) {
  const fields = resolveMaquinaFieldDefs(row, campos);
  const m = normalizeOrcamentoMaquina(row, fields);
  return fields.some(({ key }) => Boolean(String(m[key] ?? '').trim()));
}

export function normalizeOrcamentoMaquina(raw = {}, campos = null) {
  const fieldDefs = resolveMaquinaFieldDefs(raw, campos);
  const base = Object.fromEntries(fieldDefs.map(({ key }) => [key, readMaquinaFieldValue(raw, key)]));
  ORCAMENTO_MAQUINA_TEMPLATE_EXTRA_KEYS.forEach((key) => {
    if (raw == null || typeof raw !== 'object') return;
    if (key === 'incluirInspecaoDl50') {
      if (raw.incluirInspecaoDl50 != null) base.incluirInspecaoDl50 = raw.incluirInspecaoDl50;
      return;
    }
    const value = String(raw[key] ?? '').trim();
    if (value) base[key] = value;
  });
  base.campos = fieldDefs.map((field) => ({ ...field }));
  return base;
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
  const m = normalizeOrcamentoMaquina(row, campos);
  const fields = resolveMaquinaFieldDefs(m, campos);
  const equipField =
    fields.find((field) => /equipamento/i.test(field.label)) || fields[0] || null;
  const equipValue = equipField ? String(m[equipField.key] ?? '').trim() : '';
  if (equipValue) return equipValue;
  const label = joinParts(
    fields.map(({ key }) => m[key]).filter((value) => String(value).trim()).slice(0, 2),
  );
  return label || `Equipamento ${index + 1}`;
}

export function collectMaquinaPdfFieldRows(machine, campos = null) {
  const m = normalizeOrcamentoMaquina(machine, campos);
  const fields = resolveMaquinaFieldDefs(m, campos);
  return fields
    .map(({ key, label }) => [label, m[key]])
    .filter(([, value]) => String(value || '').trim());
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
  const m = normalizeOrcamentoMaquina(row, campos);
  const fields = resolveMaquinaFieldDefs(m, campos);
  const pairs = fields
    .map(({ key, label }) => {
      const value = String(m[key] ?? '').trim();
      if (!value) return '';
      return `${label}: ${value}`;
    })
    .filter(Boolean);
  return pairs.join(' — ') || formatOrcamentoMaquinaLabel(row, index, campos);
}

export function formatMaquinaPdfHorizontalText(rows = []) {
  return rows
    .map(([label, value]) => `${label}: ${String(value || '').trim() || '—'}`)
    .join('    ');
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

export function countOrcamentoMaquinasForLinhas(maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const list = normalizeOrcamentoMaquinasList(maquinas, fields);
  const withData = list.filter((row) => hasOrcamentoMaquinaData(row, fields));
  return Math.max(withData.length, list.length, 1);
}

export function shouldShowLinhaEquipamentoColumn(maquinas = [], campos = null) {
  return countOrcamentoMaquinasForLinhas(maquinas, campos) > 1;
}

/** Agrupa linhas por máquina para tabela/PDF com secções separadas. */
export function shouldGroupOrcamentoLinhasByEquipamento(maquinas = [], campos = null) {
  return shouldShowLinhaEquipamentoColumn(maquinas, campos);
}

export function filterOrcamentoTableLinhas(linhas, maquinas = []) {
  const machineCount = Math.max(Array.isArray(maquinas) ? maquinas.length : 0, 1);
  const rows = normalizeOrcamentoLinhas(linhas, { machineCount }).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  return rows.length
    ? rows
    : [{ descricao: '—', qtd: '1', precoUnit: '', total: '', equipamentoIndex: 0 }];
}

export function groupOrcamentoLinhasByEquipamento(linhas, maquinas = [], campos = null) {
  const list = normalizeOrcamentoMaquinasList(maquinas, campos);
  const machineCount = Math.max(list.length, 1);
  const rows = filterOrcamentoTableLinhas(linhas, list);

  if (!shouldGroupOrcamentoLinhasByEquipamento(list, campos)) {
    return [
      {
        equipamentoIndex: 0,
        label: formatOrcamentoMaquinaLabel(list[0] || {}, 0, campos),
        linhas: rows,
      },
    ];
  }

  return list.map((machine, index) => {
    const machineLines = rows.filter(
      (row) => normalizeEquipamentoIndex(row.equipamentoIndex, machineCount) === index,
    );
    return {
      equipamentoIndex: index,
      label: formatOrcamentoMaquinaLabel(machine, index, campos),
      linhas: machineLines.length
        ? machineLines
        : [
            {
              descricao: '—',
              qtd: '1',
              precoUnit: '',
              total: '',
              equipamentoIndex: index,
            },
          ],
    };
  });
}

export function filterOrcamentoPdfGroupLinhas(linhas = []) {
  const rows = Array.isArray(linhas) ? linhas : [];
  const real = rows.filter(
    (row) =>
      String(row?.descricao || '').trim() ||
      String(row?.precoUnit || '').trim() ||
      String(row?.qtd || '1').trim() !== '1',
  );
  return real.length ? real : rows;
}

export function countOrcamentoGroupedTableRows(linhas, maquinas = [], campos = null) {
  const groups = groupOrcamentoLinhasByEquipamento(linhas, maquinas, campos);
  if (!shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos)) {
    return 1 + groups[0].linhas.length;
  }
  return groups.reduce((sum, group) => sum + 1 + 1 + group.linhas.length, 0);
}

export function readOrcamentoLinhasFromDom(root) {
  const linhas = [];
  root?.querySelectorAll('[data-orcamento-linha]').forEach((row) => {
    const descricao = row.querySelector('[data-orc-field="descricao"]')?.value?.trim() || '';
    const qtd = row.querySelector('[data-orc-field="qtd"]')?.value?.trim() || '1';
    const precoUnit = row.querySelector('[data-orc-field="precoUnit"]')?.value?.trim() || '';
    const equipamentoRaw =
      row.querySelector('[data-orc-field="equipamentoIndex"]')?.value ??
      row.dataset.equipamentoIndex ??
      '0';
    const total = computeLinhaTotal({ qtd, precoUnit });
    linhas.push({
      descricao,
      qtd,
      precoUnit,
      total: total > 0 ? formatEuro(total) : '',
      equipamentoIndex:
        equipamentoRaw != null && equipamentoRaw !== '' ? Number(equipamentoRaw) : 0,
    });
  });
  return linhas;
}

export function renderOrcamentoLinhaRow(row, index, options = {}) {
  const { equipamentoIndex = Number(row.equipamentoIndex) || 0, grouped = false, maquinas = [] } =
    options;
  const descricao = escapeHtml(row.descricao || '');
  const qtd = escapeHtml(row.qtd || '1');
  const precoUnit = escapeHtml(row.precoUnit || '');
  const total = computeLinhaTotal(row);
  const totalLabel = total > 0 ? formatEuro(total) : '';
  const multi = !grouped && shouldShowLinhaEquipamentoColumn(maquinas);
  const equipCell = multi
    ? `<td class="review-orc-equip-cell" data-orc-equip-td>${renderOrcamentoEquipamentoSelect(maquinas, equipamentoIndex)}</td>`
    : '';
  const equipHidden = grouped
    ? `<input type="hidden" data-orc-field="equipamentoIndex" value="${equipamentoIndex}" />`
    : '';
  return `
    <tr data-orcamento-linha data-index="${index}" data-equipamento-index="${equipamentoIndex}">
      ${equipCell}
      <td>${equipHidden}<input type="text" class="review-orc-input review-orc-input--descricao" data-orc-field="descricao" value="${descricao}" placeholder="Artigo / descrição" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--qty" data-orc-field="qtd" value="${qtd}" inputmode="decimal" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--money" data-orc-field="precoUnit" value="${precoUnit}" inputmode="decimal" placeholder="0,00" /></td>
      <td class="review-orc-total" data-orc-line-total>${totalLabel}</td>
      <td class="review-orc-row-actions">
        <button type="button" class="btn-icon review-orc-remove" title="Remover linha" aria-label="Remover linha">×</button>
      </td>
    </tr>`;
}

export function renderOrcamentoLinhasTableBody(linhas = [], maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const groups = groupOrcamentoLinhasByEquipamento(linhas, maquinas, fields);
  const grouped = shouldGroupOrcamentoLinhasByEquipamento(maquinas, fields);
  const colSpan = 5;

  return groups
    .map((group) => {
      const header = grouped
        ? `<tr class="review-orc-equip-group" data-orc-equip-group="${group.equipamentoIndex}">
            <td colspan="${colSpan}" class="review-orc-equip-group__cell">
              <div class="review-orc-equip-group__head">
                <strong class="review-orc-equip-group__title">${escapeHtml(group.label)}</strong>
                <button type="button" class="btn-outline btn-sm" data-orc-add-linha-equip="${group.equipamentoIndex}">+ Linha</button>
              </div>
            </td>
          </tr>`
        : '';
      const rows = group.linhas
        .map((row, rowIndex) =>
          renderOrcamentoLinhaRow(row, rowIndex, {
            equipamentoIndex: group.equipamentoIndex,
            grouped,
            maquinas,
          }),
        )
        .join('');
      return header + rows;
    })
    .join('');
}

export function renderOrcamentoLinhasTableHead(maquinas = [], campos = null) {
  const grouped = shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos);
  const equipTh =
    !grouped && shouldShowLinhaEquipamentoColumn(maquinas, campos)
      ? '<th class="review-orc-equip-th" data-orc-equip-th scope="col">Equipamento</th>'
      : '';
  return `
    <tr>
      ${equipTh}
      <th>Na reparação precisa</th>
      <th>Qtd.</th>
      <th>Preço unit. (€)</th>
      <th>Total (€)</th>
      <th></th>
    </tr>`;
}

export function rebuildOrcamentoLinhasTable(root, linhas = null) {
  const table = root?.querySelector('.review-orc-table');
  const theadRow = table?.querySelector('thead tr');
  const tbody = root?.querySelector('#review-orc-linhas-body');
  if (!table || !theadRow || !tbody) return;

  const campos = readOrcamentoEquipamentoCamposFromDom(root);
  const maquinas = readOrcamentoMaquinasFromDom(root, campos);
  const grouped = shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos);
  const preserved = Array.isArray(linhas) ? linhas : readOrcamentoLinhasFromDom(root);

  table.classList.toggle('review-orc-table--grouped-equip', grouped);
  table.classList.toggle('review-orc-table--multi-equip', !grouped && maquinas.length > 1);

  theadRow.innerHTML = renderOrcamentoLinhasTableHead(maquinas, campos)
    .trim()
    .replace(/^<tr>/, '')
    .replace(/<\/tr>$/, '');
  tbody.innerHTML = renderOrcamentoLinhasTableBody(preserved, maquinas, campos);
}

/** Atualiza só os títulos das secções agrupadas (sem reconstruir a tabela). */
export function syncOrcamentoGroupedEquipHeaders(root) {
  const maquinas = readOrcamentoMaquinasFromDom(root);
  if (!shouldGroupOrcamentoLinhasByEquipamento(maquinas)) return;
  root?.querySelectorAll('[data-orc-equip-group]').forEach((row) => {
    const index = Number(row.dataset.orcEquipGroup) || 0;
    const label = formatOrcamentoMaquinaLabel(maquinas[index] || {}, index);
    const title = row.querySelector('.review-orc-equip-group__title');
    if (title) title.textContent = label;
  });
}

/** Atualiza tabela de linhas ao adicionar/remover máquinas. */
export function syncOrcamentoLinhaEquipamentoColumn(root) {
  rebuildOrcamentoLinhasTable(root);
  const campos = readOrcamentoEquipamentoCamposFromDom(root);
  const maquinas = readOrcamentoMaquinasFromDom(root, campos);
  const grouped = shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos);
  const multi = shouldShowLinhaEquipamentoColumn(maquinas, campos);
  root?.querySelector('.review-orcamento-editor__toolbar')?.classList.toggle(
    'review-orcamento-editor__toolbar--hidden',
    grouped,
  );
  const hint = root?.querySelector('.review-orc-catalog-hint');
  if (hint) {
    hint.textContent = grouped
      ? 'Com várias máquinas, cada equipamento tem a sua secção. Use «+ Linha» em cada máquina para os artigos dessa máquina.'
      : multi
        ? 'Na coluna «Na reparação precisa», escreva para pesquisar no catálogo. Com várias máquinas, indique o equipamento em cada linha.'
        : 'Na coluna «Na reparação precisa», escreva para pesquisar no catálogo.';
  }
}

export function syncLegacyMaquinaFieldsFromList(maquinas = [], campos = null) {
  const fields = normalizeEquipamentoCampos(campos);
  const first = normalizeOrcamentoMaquina(maquinas[0] || {}, fields);
  const maquina = joinParts([first.marca, first.modelo, first.tipo]);
  const matricula = first.numeroInterno || first.numeroSerie;
  return { ...first, maquina, matricula };
}

export function formatOrcamentoMaquinasDocxText(maquinas = [], campos = null) {
  const rows = normalizeOrcamentoMaquinasList(maquinas, campos).filter((row) =>
    hasOrcamentoMaquinaData(row, campos),
  );
  if (!rows.length) return '—';
  if (rows.length === 1) {
    return formatOrcamentoMaquinaCompactLine(rows[0], 0, campos);
  }
  return rows
    .map((row, index) => `${index + 1}. ${formatOrcamentoMaquinaCompactLine(row, index, campos)}`)
    .join('\n');
}

function renderMaquinaFieldRow({ key, label }, value, { canRemoveCampo }) {
  const removeBtn = canRemoveCampo
    ? `<button type="button" class="btn-icon review-orc-maquina-campo-remove" title="Remover campo" aria-label="Remover campo">×</button>`
    : '<span class="review-orc-maquina-field__action-spacer" aria-hidden="true"></span>';

  return `
    <div class="review-orc-maquina-field" data-orc-maquina-campo data-campo-key="${escapeHtml(key)}">
      <input
        type="text"
        class="review-orc-input review-orc-maquina-campo-label"
        data-orc-campo-label
        value="${escapeHtml(label)}"
        placeholder="Campo"
        aria-label="Nome do campo"
      />
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

function renderMaquinaCard(row, index, fallbackCampos, { canRemoveMachine }) {
  const fieldDefs = resolveMaquinaFieldDefs(row, fallbackCampos);
  const m = normalizeOrcamentoMaquina(row, fieldDefs);
  const inputs = fieldDefs
    .map((campo) =>
      renderMaquinaFieldRow(campo, m[campo.key], {
        canRemoveCampo: fieldDefs.length > 1,
      }),
    )
    .join('');

  return `
    <article class="review-orc-maquina" data-orcamento-maquina data-index="${index}">
      <div class="review-orc-maquina__head">
        <strong class="review-orc-maquina__title">Equipamento ${index + 1}</strong>
        <div class="review-orc-maquina__head-actions">
          <button type="button" class="btn-outline btn-sm" data-orc-add-campo-maquina>+ Campo</button>
          ${
            canRemoveMachine
              ? `<button type="button" class="btn-icon review-orc-maquina-remove" title="Remover equipamento" aria-label="Remover equipamento">×</button>`
              : ''
          }
        </div>
      </div>
      <div class="review-orc-maquina__fields">
        ${inputs}
      </div>
    </article>`;
}

function renderMaquinasList(maquinas, fallbackCampos) {
  const list = maquinas?.length ? maquinas : [emptyOrcamentoMaquina(fallbackCampos)];
  return list
    .map((row, index) =>
      renderMaquinaCard(row, index, fallbackCampos, {
        canRemoveMachine: list.length > 1,
      }),
    )
    .join('');
}

export function renderOrcamentoMaquinasSection(maquinas = [], equipamentoCampos = null) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  return `
    <section class="review-orc-maquinas" aria-label="Equipamentos da proposta">
      <div class="review-orc-maquinas__head">
        <h4 class="review-orc-cabecalho__title">Equipamentos</h4>
        <span class="review-orc-field-hint text-muted">Cada máquina pode ter títulos e campos diferentes (ex.: Equipamento, Material).</span>
      </div>
      <div class="review-orc-maquinas__list" id="review-orc-maquinas-list">
        ${renderMaquinasList(maquinas, campos)}
      </div>
      <div class="review-orc-maquinas__actions">
        <button type="button" class="btn-outline btn-touch review-orc-maquinas-add" id="review-orc-add-maquina">+ Adicionar máquina</button>
      </div>
    </section>`;
}

export function readOrcamentoMaquinasFromDom(root, campos = null) {
  const fallback = normalizeEquipamentoCampos(campos ?? readOrcamentoEquipamentoCamposFromDom(root));
  const list = root?.querySelector('#review-orc-maquinas-list');
  if (!list) return [emptyOrcamentoMaquina(fallback)];
  const rows = [];
  list.querySelectorAll('[data-orcamento-maquina]').forEach((card) => {
    const cardCampos = readMaquinaCamposFromCard(card);
    const values = {};
    cardCampos.forEach(({ key }) => {
      values[key] =
        card.querySelector(`[data-orc-maquina-field="${key}"]`)?.value?.trim() || '';
    });
    rows.push(normalizeOrcamentoMaquina({ ...values, campos: cardCampos }, cardCampos));
  });
  return rows.length ? rows : [emptyOrcamentoMaquina(fallback)];
}

export { readOrcamentoEquipamentoCamposFromDom };

export function bindOrcamentoMaquinasSection(root, { onChange, onFieldChange } = {}) {
  const list = root?.querySelector('#review-orc-maquinas-list');
  const addMaquinaBtn = root?.querySelector('#review-orc-add-maquina');
  if (!list || !addMaquinaBtn) return;

  const notifyStructure = () => onChange?.();
  const notifyField = () => onFieldChange?.();

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
    const maquinas = readOrcamentoMaquinasFromDom(root);
    const fallback = maquinas[0]?.campos || readOrcamentoEquipamentoCamposFromDom(root);
    list.innerHTML = renderMaquinasList(maquinas, fallback);
    renumber();
    notifyStructure();
  };

  list.addEventListener('click', (e) => {
    const addCampoBtn = e.target.closest('[data-orc-add-campo-maquina]');
    if (addCampoBtn) {
      const card = addCampoBtn.closest('[data-orcamento-maquina]');
      if (!card) return;
      const maquinas = readOrcamentoMaquinasFromDom(root);
      const index = Number(card.dataset.index) || 0;
      const row = maquinas[index] || emptyOrcamentoMaquina();
      const campos = resolveMaquinaFieldDefs(row);
      const key = nextEquipamentoCampoKey(campos);
      row[key] = '';
      row.campos = [...campos, { key, label: 'Novo campo' }];
      maquinas[index] = row;
      const fallback = maquinas[0]?.campos || readOrcamentoEquipamentoCamposFromDom(root);
      list.innerHTML = renderMaquinasList(maquinas, fallback);
      renumber();
      list
        .querySelector(
          `[data-orcamento-maquina][data-index="${index}"] [data-orc-maquina-field="${key}"]`,
        )
        ?.focus();
      notifyStructure();
      return;
    }

    const campoBtn = e.target.closest('.review-orc-maquina-campo-remove');
    if (campoBtn) {
      const fieldRow = campoBtn.closest('[data-orc-maquina-campo]');
      const card = campoBtn.closest('[data-orcamento-maquina]');
      if (!fieldRow || !card) return;
      const maquinas = readOrcamentoMaquinasFromDom(root);
      const index = Number(card.dataset.index) || 0;
      const row = maquinas[index];
      if (!row) return;
      const campos = resolveMaquinaFieldDefs(row);
      if (campos.length <= 1) return;
      const key = fieldRow.dataset.campoKey;
      row.campos = campos.filter((campo) => campo.key !== key);
      delete row[key];
      maquinas[index] = row;
      const fallback = maquinas[0]?.campos || readOrcamentoEquipamentoCamposFromDom(root);
      list.innerHTML = renderMaquinasList(maquinas, fallback);
      renumber();
      notifyStructure();
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
      notifyField();
      return;
    }
    card.remove();
    rerenderMaquinas();
  });

  list.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-campo-label], [data-orc-maquina-field]')) notifyField();
  });

  addMaquinaBtn.addEventListener('click', () => {
    const maquinas = readOrcamentoMaquinasFromDom(root);
    const templateCampos = maquinas[0]?.campos?.map((field) => ({ ...field }));
    maquinas.push(emptyOrcamentoMaquina(templateCampos));
    const fallback = maquinas[0]?.campos || readOrcamentoEquipamentoCamposFromDom(root);
    list.innerHTML = renderMaquinasList(maquinas, fallback);
    renumber();
    const cards = list.querySelectorAll('[data-orcamento-maquina]');
    const lastCard = cards[cards.length - 1];
    lastCard?.querySelector('[data-orc-maquina-field]')?.focus();
    notifyStructure();
  });
}
