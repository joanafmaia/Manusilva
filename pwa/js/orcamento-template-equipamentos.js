/**
 * Vários equipamentos nas propostas Manutenção Baterias / Máquinas.
 */

import { escapeHtml } from './html-utils.js';
import { formatEuro, parseOrcamentoNumber } from './orcamento-linhas.js';

const BATERIA_VALOR_DEFAULT = 85;
const BATERIA_PERIODICIDADE_DEFAULT = '3_em_3';
const MAQUINA_INSPECAO_DL50_DEFAULT = 40;

/** Máximo de cartões de máquina na proposta Manutenção Máquina (PDF compacto até aqui). */
export const MAX_TEMPLATE_MAQUINAS = 8;

function periodicidadeInputValue(value) {
  const raw = String(value || '').trim();
  const map = {
    mensal: 'mensal',
    '2_em_2': 'de 2 em 2 meses',
    '3_em_3': 'de 3 em 3 meses',
  };
  if (map[raw]) return map[raw];
  return raw || 'de 3 em 3 meses';
}

export function defaultBateriaEquipValores() {
  return {
    periodicidadeManutencao: periodicidadeInputValue(BATERIA_PERIODICIDADE_DEFAULT),
    valorManutencaoVisita: formatEuro(BATERIA_VALOR_DEFAULT),
  };
}

export function defaultMaquinaEquipValores() {
  return {
    valorManutencaoGeral: '',
    incluirInspecaoDl50: false,
    valorInspecaoDl50: formatEuro(MAQUINA_INSPECAO_DL50_DEFAULT),
  };
}

function pickBateriaValoresFromMeta(meta = {}, index = 0) {
  const maquinas = Array.isArray(meta.maquinas) ? meta.maquinas : [];
  const row = maquinas[index];
  if (row?.periodicidadeManutencao || row?.valorManutencaoVisita) {
    return {
      periodicidadeManutencao:
        row.periodicidadeManutencao ||
        meta.periodicidadeManutencao ||
        defaultBateriaEquipValores().periodicidadeManutencao,
      valorManutencaoVisita:
        row.valorManutencaoVisita ||
        meta.valorManutencaoVisita ||
        defaultBateriaEquipValores().valorManutencaoVisita,
    };
  }
  if (index === 0 && (meta.periodicidadeManutencao || meta.valorManutencaoVisita)) {
    return {
      periodicidadeManutencao:
        meta.periodicidadeManutencao || defaultBateriaEquipValores().periodicidadeManutencao,
      valorManutencaoVisita:
        meta.valorManutencaoVisita || defaultBateriaEquipValores().valorManutencaoVisita,
    };
  }
  return defaultBateriaEquipValores();
}

function pickMaquinaValoresFromMeta(meta = {}, index = 0) {
  const maquinas = Array.isArray(meta.maquinas) ? meta.maquinas : [];
  const row = maquinas[index];
  if (
    row &&
    (row.valorManutencaoGeral ||
      row.incluirInspecaoDl50 ||
      row.valorInspecaoDl50 ||
      row.valorManutencaoGeral === 0)
  ) {
    return {
      valorManutencaoGeral: row.valorManutencaoGeral ?? meta.valorManutencaoGeral ?? '',
      incluirInspecaoDl50: Boolean(row.incluirInspecaoDl50 ?? meta.incluirInspecaoDl50),
      valorInspecaoDl50:
        row.valorInspecaoDl50 ||
        meta.valorInspecaoDl50 ||
        defaultMaquinaEquipValores().valorInspecaoDl50,
    };
  }
  if (index === 0 && (meta.valorManutencaoGeral || meta.incluirInspecaoDl50 || meta.maquinaManutencaoNome)) {
    return {
      valorManutencaoGeral: meta.valorManutencaoGeral || '',
      incluirInspecaoDl50: Boolean(meta.incluirInspecaoDl50),
      valorInspecaoDl50:
        meta.valorInspecaoDl50 || defaultMaquinaEquipValores().valorInspecaoDl50,
    };
  }
  return defaultMaquinaEquipValores();
}

export function emptyTemplateMaquinaIdentRow() {
  return { maquinaManutencaoNome: '' };
}

export function normalizeTemplateMaquinaIdentRow(raw = {}) {
  const saved = String(raw.maquinaManutencaoNome || '').trim();
  const legacyFromCampos = [raw.marca, raw.modelo]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  const row = { maquinaManutencaoNome: saved || legacyFromCampos };
  if (raw.valorManutencaoGeral != null) row.valorManutencaoGeral = raw.valorManutencaoGeral;
  if (raw.incluirInspecaoDl50 != null) row.incluirInspecaoDl50 = raw.incluirInspecaoDl50;
  if (raw.valorInspecaoDl50) row.valorInspecaoDl50 = raw.valorInspecaoDl50;
  return row;
}

export function formatTemplateMaquinaNome(row = {}, index = 0) {
  const nome = String(row.maquinaManutencaoNome || '').trim();
  return nome || `Máquina ${index + 1}`;
}

export function hasTemplateMaquinaIdentData(row = {}) {
  return Boolean(String(row.maquinaManutencaoNome || '').trim());
}

function resolveTemplateBateriaEquipamentos(meta = {}, cabecalho = {}) {
  let rows = [];
  if (Array.isArray(meta.maquinas) && meta.maquinas.length) {
    rows = meta.maquinas.map((row) => ({
      periodicidadeManutencao: row.periodicidadeManutencao || '',
      valorManutencaoVisita: row.valorManutencaoVisita || '',
    }));
  }
  if (!rows.length && (meta.periodicidadeManutencao || meta.valorManutencaoVisita)) {
    rows = [
      {
        periodicidadeManutencao: meta.periodicidadeManutencao || '',
        valorManutencaoVisita: meta.valorManutencaoVisita || '',
      },
    ];
  }
  if (!rows.length) rows = [{}];
  return rows.map((row, index) => ({
    ...row,
    ...pickBateriaValoresFromMeta({ ...meta, maquinas: rows }, index),
  }));
}

function resolveTemplateMaquinaEquipamentos(meta = {}, cabecalho = {}) {
  let rows = [];
  if (Array.isArray(meta.maquinas) && meta.maquinas.length) {
    rows = meta.maquinas.map(normalizeTemplateMaquinaIdentRow);
  } else if (Array.isArray(cabecalho.maquinas) && cabecalho.maquinas.length) {
    rows = cabecalho.maquinas.map(normalizeTemplateMaquinaIdentRow);
  }
  const legacyNome = String(meta.maquinaManutencaoNome || '').trim();
  if (!rows.length && legacyNome) {
    rows = [{ maquinaManutencaoNome: legacyNome }];
  }
  const rowsHaveData = rows.some(
    (row, index) =>
      hasTemplateMaquinaIdentData(row) ||
      resolveEquipamentoValorGeral({
        ...row,
        ...pickMaquinaValoresFromMeta({ ...meta, maquinas: rows }, index),
      }) > 0,
  );
  if (
    !rowsHaveData &&
    Array.isArray(cabecalho.maquinas) &&
    cabecalho.maquinas.length &&
    rows !== cabecalho.maquinas
  ) {
    rows = cabecalho.maquinas.map(normalizeTemplateMaquinaIdentRow);
  }
  if (!rows.length) rows = [emptyTemplateMaquinaIdentRow()];
  return rows.map((row, index) => ({
    ...normalizeTemplateMaquinaIdentRow(row),
    ...pickMaquinaValoresFromMeta({ ...meta, maquinas: rows }, index),
  }));
}

/** Garante lista de equipamentos com valores de template por índice. */
export function resolveTemplateEquipamentos(meta = {}, cabecalho = {}, mode = 'bateria') {
  if (mode === 'maquina') return resolveTemplateMaquinaEquipamentos(meta, cabecalho);
  return resolveTemplateBateriaEquipamentos(meta, cabecalho);
}

export function readTemplateEquipValoresFromDom(root, mode) {
  const list = root?.querySelector('[data-orc-template-equip-valores-list]');
  if (!list) return [];
  const rows = [];
  list.querySelectorAll('[data-orc-template-equip-valores]').forEach((card) => {
    if (mode === 'bateria') {
      rows.push({
        periodicidadeManutencao:
          card.querySelector('[data-orc-field="periodicidadeManutencao"]')?.value?.trim() || '',
        valorManutencaoVisita:
          card.querySelector('[data-orc-field="valorManutencaoVisita"]')?.value?.trim() || '',
      });
    } else {
      rows.push({
        valorManutencaoGeral:
          card.querySelector('[data-orc-field="valorManutencaoGeral"]')?.value?.trim() || '',
        incluirInspecaoDl50:
          card.querySelector('[data-orc-field="incluirInspecaoDl50"]')?.checked ?? false,
        valorInspecaoDl50:
          card.querySelector('[data-orc-field="valorInspecaoDl50"]')?.value?.trim() || '',
      });
    }
  });
  return rows;
}

export function formatTemplateBateriaLabel(index = 0, total = 1) {
  if (total <= 1) return 'Bateria';
  return `Bateria ${index + 1}`;
}

export function mergeMaquinasWithTemplateValores(maquinas, valores, mode, meta = {}) {
  const pick = mode === 'bateria' ? pickBateriaValoresFromMeta : pickMaquinaValoresFromMeta;
  const defaults = mode === 'bateria' ? defaultBateriaEquipValores() : defaultMaquinaEquipValores();
  const emptyRow = mode === 'bateria' ? {} : emptyTemplateMaquinaIdentRow();
  const list = Array.isArray(maquinas) && maquinas.length ? maquinas : [emptyRow];
  return list.map((row, index) => ({
    ...row,
    ...(valores[index] || pick(meta, index) || defaults),
  }));
}

export function readTemplateMaquinasIdentFromDom(root) {
  const fromCards = readTemplateMaquinasCardsFromDom(root);
  if (fromCards) {
    return fromCards.map((row) => ({ maquinaManutencaoNome: row.maquinaManutencaoNome }));
  }
  const list = root?.querySelector('[data-template-maquinas-ident-list]');
  if (!list) return [];
  const rows = [];
  list.querySelectorAll('[data-template-maquina-ident]').forEach((card) => {
    rows.push({
      maquinaManutencaoNome:
        card.querySelector('[data-orc-field="maquinaManutencaoNome"]')?.value?.trim() || '',
    });
  });
  return rows.length ? rows : [emptyTemplateMaquinaIdentRow()];
}

export function readTemplateMaquinasFromDom(root, mode, meta = {}) {
  if (mode === 'maquina') {
    const fromCards = readTemplateMaquinasCardsFromDom(root);
    if (fromCards) return { campos: [], maquinas: fromCards };
    const maquinas = readTemplateMaquinasIdentFromDom(root);
    const valores = readTemplateEquipValoresFromDom(root, mode);
    const merged = mergeMaquinasWithTemplateValores(maquinas, valores, mode, meta);
    return { campos: [], maquinas: merged };
  }
  const valores = readTemplateEquipValoresFromDom(root, mode);
  const merged = mergeMaquinasWithTemplateValores(valores, valores, mode, meta);
  return { campos: [], maquinas: merged };
}

function renderBateriaPeriodicidadeInput(value, datalistSuffix) {
  const current = periodicidadeInputValue(value);
  const datalistId = `periodicidadeManutencaoOpcoes-${datalistSuffix}`;
  const options = ['mensal', 'de 2 em 2 meses', 'de 3 em 3 meses']
    .map((label) => `<option value="${label}"></option>`)
    .join('');
  return `
    <input
      type="text"
      class="review-orc-input"
      data-orc-field="periodicidadeManutencao"
      list="${datalistId}"
      value="${escapeHtml(current)}"
      placeholder="de 3 em 3 meses"
    />
    <datalist id="${datalistId}">${options}</datalist>`;
}

function renderBateriaValorRow(row, index, total) {
  const label = formatTemplateBateriaLabel(index, total);
  const removeHidden = total <= 1 ? ' hidden' : '';
  const valor = escapeHtml(
    row.valorManutencaoVisita ||
      (parseOrcamentoNumber(row.valorManutencaoVisita) > 0
        ? formatEuro(parseOrcamentoNumber(row.valorManutencaoVisita))
        : formatEuro(BATERIA_VALOR_DEFAULT)),
  );
  return `
    <article class="review-orc-template-equip-valores__card" data-orc-template-equip-valores data-equip-index="${index}">
      <div class="review-orc-template-equip-valores__head">
        <h5 class="review-orc-template-equip-valores__title">${escapeHtml(label)}</h5>
        <button type="button" class="review-orc-template-icon-remove" data-template-bateria-valor-remove${removeHidden} title="Remover" aria-label="Remover">×</button>
      </div>
      <div class="review-orc-cabecalho__grid">
        <label class="review-orc-field">
          <span>Periodicidade da visita</span>
          ${renderBateriaPeriodicidadeInput(row.periodicidadeManutencao, index)}
        </label>
        <label class="review-orc-field">
          <span>Valor por visita (€)</span>
          <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorManutencaoVisita" value="${valor}" inputmode="decimal" placeholder="85,00" />
        </label>
      </div>
    </article>`;
}

function renderTemplateRemoveButton(dataAttr, hidden = false) {
  const hiddenAttr = hidden ? ' hidden' : '';
  return `<button type="button" class="review-orc-template-icon-remove" ${dataAttr}${hiddenAttr} title="Remover" aria-label="Remover">×</button>`;
}

function renderTemplateMaquinaCard(row, index, total) {
  const nome = escapeHtml(row.maquinaManutencaoNome || '');
  const valorGeral = escapeHtml(row.valorManutencaoGeral || '');
  const valorInspecao = escapeHtml(
    row.valorInspecaoDl50 || formatEuro(MAQUINA_INSPECAO_DL50_DEFAULT),
  );
  const incluirDl50 = row.incluirInspecaoDl50 ? ' checked' : '';
  return `
    <article class="review-orc-template-maquina-card" data-template-maquina-card data-maquina-index="${index}">
      <div class="review-orc-template-maquina-card__grid">
        <label class="review-orc-field">
          <span>Máquina ${index + 1}</span>
          <input
            type="text"
            class="review-orc-input"
            data-orc-field="maquinaManutencaoNome"
            value="${nome}"
            placeholder="ex.: Toyota 8FBMT16"
          />
        </label>
        <label class="review-orc-field">
          <span>Manutenção (€)</span>
          <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorManutencaoGeral" value="${valorGeral}" inputmode="decimal" placeholder="0,00" />
        </label>
        <label class="review-orc-field review-orc-field--checkbox-inline">
          <input type="checkbox" class="review-orc-checkbox" data-orc-field="incluirInspecaoDl50"${incluirDl50} />
          <span>DL50/2005</span>
        </label>
        <label class="review-orc-field">
          <span>Inspeção (€)</span>
          <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorInspecaoDl50" value="${valorInspecao}" inputmode="decimal" placeholder="40,00" />
        </label>
        ${renderTemplateRemoveButton('data-template-maquina-remove', total <= 1)}
      </div>
    </article>`;
}

export function renderTemplateMaquinasSection(maquinas = [], meta = {}) {
  const rows = resolveTemplateEquipamentos({ ...meta, maquinas }, { maquinas }, 'maquina');
  const atMax = rows.length >= MAX_TEMPLATE_MAQUINAS;
  const cards = rows.map((row, index) => renderTemplateMaquinaCard(row, index, rows.length)).join('');
  return `
    <section class="review-orc-template-maquinas" aria-label="Máquinas">
      <h4 class="review-orc-cabecalho__title">Máquinas</h4>
      <p class="review-orc-field-hint text-muted">Marca/modelo e preços por máquina (até ${MAX_TEMPLATE_MAQUINAS}); a deslocação é única em Condições.</p>
      <div class="review-orc-template-maquinas__list" data-template-maquinas-list>
        ${cards}
      </div>
      <button type="button" class="btn-outline btn-sm btn-touch review-orc-template-maquinas__add" data-template-maquinas-add${atMax ? ' disabled' : ''}>
        + Adicionar máquina
      </button>
    </section>`;
}

export function readTemplateMaquinasCardsFromDom(root) {
  const list = root?.querySelector('[data-template-maquinas-list]');
  if (!list) return null;
  const rows = [];
  list.querySelectorAll('[data-template-maquina-card]').forEach((card) => {
    rows.push({
      maquinaManutencaoNome:
        card.querySelector('[data-orc-field="maquinaManutencaoNome"]')?.value?.trim() || '',
      valorManutencaoGeral:
        card.querySelector('[data-orc-field="valorManutencaoGeral"]')?.value?.trim() || '',
      incluirInspecaoDl50:
        card.querySelector('[data-orc-field="incluirInspecaoDl50"]')?.checked ?? false,
      valorInspecaoDl50:
        card.querySelector('[data-orc-field="valorInspecaoDl50"]')?.value?.trim() || '',
    });
  });
  return rows.length ? rows : [{ ...emptyTemplateMaquinaIdentRow(), ...defaultMaquinaEquipValores() }];
}

export function renderTemplateEquipValoresSection(maquinas, campos, meta, mode) {
  const rows = resolveTemplateEquipamentos({ ...meta, maquinas }, { maquinas }, mode);
  const title = mode === 'bateria' ? 'Valores por bateria' : 'Valores por máquina';
  const hint =
    mode === 'bateria'
      ? 'Indique periodicidade e valor por visita. Pode adicionar várias baterias.'
      : '';
  if (mode !== 'bateria') return '';
  const cards =
    mode === 'bateria'
      ? rows.map((row, i) => renderBateriaValorRow(row, i, rows.length)).join('')
      : '';
  const addBateriaBtn =
    mode === 'bateria'
      ? `<button type="button" class="btn-outline btn-touch review-orc-template-equip-valores__add" data-template-baterias-valores-add>+ Adicionar bateria</button>`
      : '';

  return `
    <section class="review-orc-template-equip-valores" aria-label="${escapeHtml(title)}">
      <h4 class="review-orc-cabecalho__title">${escapeHtml(title)}</h4>
      <p class="review-orc-field-hint text-muted">${escapeHtml(hint)}</p>
      <div class="review-orc-template-equip-valores__list" data-orc-template-equip-valores-list>
        ${cards}
      </div>
      ${addBateriaBtn}
    </section>`;
}

export function syncTemplateEquipValoresList(root, mode, meta = {}) {
  const listEl = root?.querySelector('[data-orc-template-equip-valores-list]');
  if (!listEl || mode === 'maquina') return;
  const valores = readTemplateEquipValoresFromDom(root, mode);
  const merged = mergeMaquinasWithTemplateValores(valores, valores, mode, meta);
  listEl.innerHTML = merged.map((row, i) => renderBateriaValorRow(row, i, merged.length)).join('');
}

export function bindTemplateBateriasValoresSection(root, { onChange } = {}) {
  const list = root?.querySelector('[data-orc-template-equip-valores-list]');
  const addBtn = root?.querySelector('[data-template-baterias-valores-add]');
  if (!list) return;

  const notify = () => onChange?.();

  const rerender = () => {
    const valores = readTemplateEquipValoresFromDom(root, 'bateria');
    const merged = mergeMaquinasWithTemplateValores(valores, valores, 'bateria');
    list.innerHTML = merged.map((row, i) => renderBateriaValorRow(row, i, merged.length)).join('');
    notify();
  };

  list.addEventListener('input', (e) => {
    if (
      e.target.matches(
        '[data-orc-field="periodicidadeManutencao"], [data-orc-field="valorManutencaoVisita"]',
      )
    ) {
      notify();
    }
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-template-bateria-valor-remove]');
    if (!btn || btn.hidden) return;
    const card = btn.closest('[data-orc-template-equip-valores]');
    if (!card) return;
    const cards = list.querySelectorAll('[data-orc-template-equip-valores]');
    if (cards.length <= 1) {
      card
        .querySelectorAll('[data-orc-field="periodicidadeManutencao"], [data-orc-field="valorManutencaoVisita"]')
        .forEach((input) => {
          input.value = '';
        });
      notify();
      return;
    }
    card.remove();
    rerender();
  });

  addBtn?.addEventListener('click', () => {
    const valores = readTemplateEquipValoresFromDom(root, 'bateria');
    const merged = mergeMaquinasWithTemplateValores(valores, valores, 'bateria');
    merged.push(defaultBateriaEquipValores());
    list.innerHTML = merged.map((row, i) => renderBateriaValorRow(row, i, merged.length)).join('');
    const cards = list.querySelectorAll('[data-orc-template-equip-valores]');
    cards[cards.length - 1]?.querySelector('[data-orc-field="periodicidadeManutencao"]')?.focus();
    notify();
  });
}

export function bindTemplateMaquinasSection(root, { onChange } = {}) {
  const list = root?.querySelector('[data-template-maquinas-list]');
  const addBtn = root?.querySelector('[data-template-maquinas-add]');
  if (!list || !addBtn) return;

  const notify = () => onChange?.();

  const syncAddButton = (count) => {
    const atMax = count >= MAX_TEMPLATE_MAQUINAS;
    addBtn.disabled = atMax;
    addBtn.title = atMax ? `Máximo de ${MAX_TEMPLATE_MAQUINAS} máquinas` : '';
  };

  const rerender = () => {
    const rows = readTemplateMaquinasCardsFromDom(root) || [];
    list.innerHTML = rows.map((row, index) => renderTemplateMaquinaCard(row, index, rows.length)).join('');
    syncAddButton(rows.length);
    notify();
  };

  list.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-field]')) notify();
  });
  list.addEventListener('change', (e) => {
    if (e.target.matches('[data-orc-field]')) notify();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-template-maquina-remove]');
    if (!btn || btn.hidden) return;
    const card = btn.closest('[data-template-maquina-card]');
    if (!card) return;
    const cards = list.querySelectorAll('[data-template-maquina-card]');
    if (cards.length <= 1) {
      card.querySelectorAll('[data-orc-field]').forEach((input) => {
        if (input.type === 'checkbox') input.checked = false;
        else input.value = '';
      });
      notify();
      return;
    }
    card.remove();
    rerender();
  });

  addBtn.addEventListener('click', () => {
    const rows = readTemplateMaquinasCardsFromDom(root) || [];
    if (rows.length >= MAX_TEMPLATE_MAQUINAS) return;
    rows.push({ ...emptyTemplateMaquinaIdentRow(), ...defaultMaquinaEquipValores() });
    list.innerHTML = rows.map((row, index) => renderTemplateMaquinaCard(row, index, rows.length)).join('');
    syncAddButton(rows.length);
    const cards = list.querySelectorAll('[data-template-maquina-card]');
    cards[cards.length - 1]?.querySelector('[data-orc-field="maquinaManutencaoNome"]')?.focus();
    notify();
  });

  syncAddButton(list.querySelectorAll('[data-template-maquina-card]').length);
}

/** @deprecated usar bindTemplateMaquinasSection */
export function bindTemplateMaquinasIdentSection(root, options = {}) {
  bindTemplateMaquinasSection(root, options);
}

export function syncLegacyTemplateFieldsFromMaquinas(meta, mode) {
  const equipamentos = resolveTemplateEquipamentos(meta, meta, mode);
  const first = equipamentos[0] || {};
  if (mode === 'maquina') {
    const legacyNome = String(meta.maquinaManutencaoNome || '').trim();
    if (legacyNome && !hasTemplateMaquinaIdentData(first)) {
      equipamentos[0] = { ...first, maquinaManutencaoNome: legacyNome };
    }
    const updatedFirst = equipamentos[0] || {};
    return {
      ...meta,
      maquinas: equipamentos,
      maquinaManutencaoNome: formatTemplateMaquinaNome(updatedFirst, 0),
      valorManutencaoGeral: updatedFirst.valorManutencaoGeral || meta.valorManutencaoGeral,
      incluirInspecaoDl50: updatedFirst.incluirInspecaoDl50 ?? meta.incluirInspecaoDl50,
      valorInspecaoDl50: updatedFirst.valorInspecaoDl50 || meta.valorInspecaoDl50,
    };
  }
  if (mode === 'bateria') {
    return {
      ...meta,
      maquinas: equipamentos,
      periodicidadeManutencao: first.periodicidadeManutencao || meta.periodicidadeManutencao,
      valorManutencaoVisita: first.valorManutencaoVisita || meta.valorManutencaoVisita,
    };
  }
  return meta;
}

export function countTemplateEquipamentosComDados(meta, cabecalho, mode) {
  const rows = resolveTemplateEquipamentos(meta, cabecalho, mode);
  if (mode === 'maquina') {
    const withId = rows.filter((row) => hasTemplateMaquinaIdentData(row));
    return Math.max(withId.length, rows.length, 1);
  }
  return Math.max(rows.length, 1);
}

export function resolveEquipamentoValorGeral(row = {}) {
  return parseOrcamentoNumber(row.valorManutencaoGeral);
}

export function resolveEquipamentoValorVisita(row = {}) {
  const parsed = parseOrcamentoNumber(row.valorManutencaoVisita);
  if (parsed > 0) return parsed;
  return BATERIA_VALOR_DEFAULT;
}

export function resolveEquipamentoIncluirDl50(row = {}) {
  if (row.incluirInspecaoDl50 === true || row.incluirInspecaoDl50 === 'true') return true;
  if (row.incluirInspecaoDl50 === false || row.incluirInspecaoDl50 === 'false') return false;
  return Boolean(row.incluirInspecaoDl50);
}

export function resolveEquipamentoValorInspecaoDl50(row = {}) {
  const parsed = parseOrcamentoNumber(row.valorInspecaoDl50);
  if (parsed > 0) return parsed;
  return MAQUINA_INSPECAO_DL50_DEFAULT;
}
