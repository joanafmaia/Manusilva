/**
 * Campos de equipamento editáveis por proposta MS.015 (rótulos + chaves estáveis).
 */

import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
} from './field-labels.js';
import { escapeHtml } from './html-utils.js';

export const DEFAULT_ORCAMENTO_EQUIPAMENTO_CAMPOS = [
  { key: 'marca', label: LABEL_MARCA },
  { key: 'modelo', label: LABEL_MODELO },
  { key: 'tipo', label: LABEL_TIPO },
  { key: 'numeroSerie', label: LABEL_NUMERO_SERIE },
  { key: 'numeroInterno', label: LABEL_N_INTERNO },
];

export function normalizeEquipamentoCampo(raw = {}) {
  const key = String(raw?.key ?? '').trim();
  const label = String(raw?.label ?? '').trim();
  if (!key) return null;
  return { key, label: label || key };
}

export function normalizeEquipamentoCampos(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    return DEFAULT_ORCAMENTO_EQUIPAMENTO_CAMPOS.map((row) => ({ ...row }));
  }
  const out = raw.map(normalizeEquipamentoCampo).filter(Boolean);
  return out.length
    ? out
    : DEFAULT_ORCAMENTO_EQUIPAMENTO_CAMPOS.map((row) => ({ ...row }));
}

export function suggestEquipamentoCampos(report) {
  const saved = report?.data?.orcamento?.equipamentoCampos;
  if (Array.isArray(saved) && saved.length) return normalizeEquipamentoCampos(saved);
  return DEFAULT_ORCAMENTO_EQUIPAMENTO_CAMPOS.map((row) => ({ ...row }));
}

export function nextEquipamentoCampoKey(campos = []) {
  const keys = new Set(campos.map((c) => c.key));
  let n = 1;
  while (keys.has(`campo_${n}`)) n += 1;
  return `campo_${n}`;
}

function renderEquipamentoCampoRow(campo, { canRemove }) {
  return `
    <div class="review-orc-equip-campo" data-orc-equip-campo data-campo-key="${escapeHtml(campo.key)}">
      <input
        type="text"
        class="review-orc-input review-orc-equip-campo__label"
        data-orc-campo-label
        value="${escapeHtml(campo.label)}"
        placeholder="Nome do campo"
        aria-label="Rótulo do campo"
      />
      ${
        canRemove
          ? `<button type="button" class="btn-icon review-orc-equip-campo-remove" title="Remover campo" aria-label="Remover campo">×</button>`
          : ''
      }
    </div>`;
}

export function renderOrcamentoEquipamentoCamposSection(campos = []) {
  const list = normalizeEquipamentoCampos(campos);
  return `
    <section class="review-orc-equip-campos" aria-label="Campos do equipamento">
      <div class="review-orc-equip-campos__head">
        <h4 class="review-orc-cabecalho__title">Campos do equipamento</h4>
        <span class="review-orc-field-hint text-muted">Edite os rótulos ou adicione campos — aplicam-se a todos os equipamentos desta proposta.</span>
      </div>
      <div class="review-orc-equip-campos__list" id="review-orc-equip-campos-list">
        ${list.map((campo, index) => renderEquipamentoCampoRow(campo, { canRemove: list.length > 1 })).join('')}
      </div>
      <button type="button" class="btn-outline btn-touch review-orc-equip-campos-add" id="review-orc-add-campo">+ Adicionar campo</button>
    </section>`;
}

export function readOrcamentoEquipamentoCamposFromDom(root) {
  const list = root?.querySelector('#review-orc-equip-campos-list');
  if (!list) return normalizeEquipamentoCampos();
  const rows = [];
  list.querySelectorAll('[data-orc-equip-campo]').forEach((row) => {
    const key = row.dataset.campoKey || '';
    const label = row.querySelector('[data-orc-campo-label]')?.value?.trim() || '';
    const normalized = normalizeEquipamentoCampo({ key, label });
    if (normalized) rows.push(normalized);
  });
  return normalizeEquipamentoCampos(rows);
}
