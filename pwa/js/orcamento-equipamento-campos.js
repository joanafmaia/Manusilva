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

/** Lê rótulos do primeiro equipamento (definem o schema da proposta). */
export function readOrcamentoEquipamentoCamposFromDom(root) {
  const firstCard = root?.querySelector('[data-orcamento-maquina]');
  if (!firstCard) return normalizeEquipamentoCampos();
  const rows = [];
  firstCard.querySelectorAll('[data-orc-maquina-campo]').forEach((row) => {
    const key = row.dataset.campoKey || '';
    const label =
      row.querySelector('[data-orc-campo-label]')?.value?.trim() ||
      row.querySelector('[data-orc-maquina-label-for]')?.textContent?.trim() ||
      '';
    const normalized = normalizeEquipamentoCampo({ key, label });
    if (normalized) rows.push(normalized);
  });
  return normalizeEquipamentoCampos(rows);
}
