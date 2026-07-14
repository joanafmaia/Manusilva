/**
 * Linhas e totais da proposta MS.015 — sugestões, cálculo e persistência no relatório.
 */

import { normalizeMaterialRows } from './material-table-field.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';
import { readOrcamentoCabecalhoFromDom, resolveOrcamentoCabecalho, suggestOrcamentoMaquinas } from './orcamento-cabecalho.js';
import {
  formatOrcamentoMaquinaShortLabel,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquinasList,
} from './orcamento-maquinas.js';
import { suggestOrcamentoTipoProposta, normalizeOrcamentoTipoProposta } from './orcamento-tipo-proposta.js';

const IVA_RATE = 0.23;
const MIN_LINHAS_VAZIAS = 3;

export function normalizeEquipamentoIndex(value, machineCount = 1) {
  if (machineCount <= 1) return 0;
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n < machineCount) return n;
  return 0;
}

export function emptyOrcamentoLinha(equipamentoIndex = 0) {
  return { descricao: '', qtd: '1', precoUnit: '', total: '', equipamentoIndex };
}

export function resolveLinhaEquipamentoLabel(linha, maquinas = []) {
  const list = normalizeOrcamentoMaquinasList(maquinas);
  if (list.length <= 1) return '';
  const idx = normalizeEquipamentoIndex(linha?.equipamentoIndex, list.length);
  return formatOrcamentoMaquinaShortLabel(list[idx] || {}, idx);
}

export function resolveLinhaEquipamentoDescricao(linha, maquinas = []) {
  const list = normalizeOrcamentoMaquinasList(maquinas);
  if (list.length <= 1) return String(linha?.descricao ?? '').trim();
  const descricao = String(linha?.descricao ?? '').trim();
  if (!descricao) return '';
  const idx = normalizeEquipamentoIndex(linha?.equipamentoIndex, list.length);
  const prefix = formatOrcamentoMaquinaShortLabel(list[idx] || {}, idx);
  return prefix ? `[${prefix}] ${descricao}` : descricao;
}

export function parseOrcamentoNumber(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function formatEuro(value, { blankIfZero = false } = {}) {
  const n = parseOrcamentoNumber(value);
  if (blankIfZero && n === 0) return '';
  return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatOrcamentoNumeroLabel(sequencial, ano) {
  const n = Number(sequencial);
  const y = Number(ano);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(y)) return `…/ ${y || new Date().getFullYear()}`;
  return `${n}.0/${y}`;
}

export const ORCAMENTO_NUMERO_PLACEHOLDER = 'Atribuído ao guardar';

export function isPlaceholderOrcamentoNumero(value) {
  const text = String(value ?? '').trim();
  return !text || text === ORCAMENTO_NUMERO_PLACEHOLDER || text.startsWith('…');
}

export function resolveOrcamentoNumeroFormatado(meta, { year, numeroOrdem } = {}) {
  const fmt = String(meta?.numeroFormatado ?? '').trim();
  if (!isPlaceholderOrcamentoNumero(fmt)) return fmt;
  if (meta?.numeroSequencial && meta?.ano) {
    return formatOrcamentoNumeroLabel(meta.numeroSequencial, meta.ano);
  }
  const y = year || meta?.ano || new Date().getFullYear();
  if (numeroOrdem != null && Number.isFinite(Number(numeroOrdem))) {
    return `${numeroOrdem}.0/${y}`;
  }
  return `…/${y}`;
}

export function getReportOrcamentoMeta(report) {
  const meta = report?.data?.orcamento;
  return meta && typeof meta === 'object' ? meta : null;
}

export const MAX_TAXAS_SAIDA = 3;

/** @param {unknown} source */
export function normalizeTaxasSaida(source) {
  if (source == null) return [];
  if (Array.isArray(source)) {
    return source.map((value) => String(value ?? '').trim()).filter((value) => value !== '');
  }
  if (typeof source === 'object') {
    if (Array.isArray(source.taxasSaida) && source.taxasSaida.length) {
      return normalizeTaxasSaida(source.taxasSaida);
    }
    const legacy = String(source.taxaSaida ?? '').trim();
    return legacy ? [legacy] : [];
  }
  const single = String(source).trim();
  return single ? [single] : [];
}

/** @param {unknown} meta */
export function taxasSaidaSlotsFromMeta(meta) {
  const list = normalizeTaxasSaida(meta);
  const slots = [...list];
  while (slots.length < MAX_TAXAS_SAIDA) slots.push('');
  return slots.slice(0, MAX_TAXAS_SAIDA);
}

/** @param {ParentNode | null | undefined} root */
export function readTaxasSaidaFromDom(root) {
  const inputs = root?.querySelectorAll('[data-orc-field="taxaSaida"]');
  if (!inputs?.length) return taxasSaidaSlotsFromMeta(null);
  const values = Array.from(inputs).map((el) => el.value?.trim() || '');
  while (values.length < MAX_TAXAS_SAIDA) values.push('');
  return values.slice(0, MAX_TAXAS_SAIDA);
}

/** @param {string[]} slots */
export function formatTaxasSaidaMetaFromSlots(slots) {
  const taxasSaida = slots
    .map((value) => String(value ?? '').trim())
    .filter((value) => value !== '')
    .map((value) => formatEuro(value));
  const taxaTotal = slots.reduce((sum, value) => sum + parseOrcamentoNumber(value), 0);
  return {
    taxasSaida,
    taxaSaida: taxaTotal > 0 ? formatEuro(taxaTotal) : '',
  };
}

export function computeLinhaTotal(linha) {
  const qtd = parseOrcamentoNumber(linha?.qtd);
  const preco = parseOrcamentoNumber(linha?.precoUnit);
  if (qtd <= 0 || preco <= 0) return 0;
  return Math.round(qtd * preco * 100) / 100;
}

export function normalizeOrcamentoLinhas(raw, { machineCount } = {}) {
  if (!Array.isArray(raw)) return [];
  const count =
    machineCount ??
    Math.max(
      1,
      ...raw.map((row) => normalizeEquipamentoIndex(row?.equipamentoIndex, 99) + 1),
    );
  return raw.map((row) => {
    const descricao = String(row?.descricao ?? '').trim();
    const qtd = String(row?.qtd ?? '1').trim() || '1';
    const precoUnit = row?.precoUnit != null ? String(row.precoUnit).trim() : '';
    const totalNum = computeLinhaTotal({ qtd, precoUnit });
    return {
      descricao,
      qtd,
      precoUnit,
      total: totalNum > 0 ? formatEuro(totalNum) : String(row?.total ?? '').trim(),
      equipamentoIndex: normalizeEquipamentoIndex(row?.equipamentoIndex, count),
    };
  });
}

export function computeOrcamentoTotals(linhas = [], taxasInput = '') {
  const rows = normalizeOrcamentoLinhas(linhas);
  const subtotalLinhas = rows.reduce((sum, row) => sum + computeLinhaTotal(row), 0);
  const taxasLista = normalizeTaxasSaida(taxasInput);
  const taxaTotal = taxasLista.reduce((sum, value) => sum + parseOrcamentoNumber(value), 0);
  const base = subtotalLinhas + taxaTotal;
  const iva = Math.round(base * IVA_RATE * 100) / 100;
  const total = Math.round((base + iva) * 100) / 100;
  return {
    subtotalLinhas,
    taxaSaida: taxaTotal,
    taxasSaida: taxasLista.map((value) => parseOrcamentoNumber(value)),
    subtotal: base,
    iva,
    total,
  };
}


function linhasFromMaterial(values) {
  const materialKeys = [
    'material_utilizado',
    'consumiveis',
    'consumiveis_utilizados',
    'consumiveis_material',
  ];
  const rows = [];
  materialKeys.forEach((key) => {
    const data = values[key];
    if (!data) return;
    normalizeMaterialRows(data).forEach((row) => {
      const artigo = String(row.artigo || '').trim();
      const qtd = String(row.qtd ?? '').trim();
      if (!artigo && !qtd) return;
      rows.push({
        descricao: artigo,
        qtd: qtd || '1',
        precoUnit: '',
        total: '',
      });
    });
  });
  return rows;
}

/** Sugere linhas a partir do relatório técnico (sem preços — RH completa). */
export function suggestOrcamentoLinhas(report) {
  const meta = getReportOrcamentoMeta(report);
  const machineCount = Math.max(
    1,
    normalizeOrcamentoMaquinasList(suggestOrcamentoMaquinas(report)).filter(hasOrcamentoMaquinaData).length,
    normalizeOrcamentoMaquinasList(meta?.maquinas).length,
  );
  const existingRaw = meta?.linhas;
  const existing = normalizeOrcamentoLinhas(existingRaw, { machineCount });
  if (existing.some((r) => r.descricao || r.precoUnit)) return existing;

  const values = report?.data?.values || {};
  const fromDetalhe = (() => {
    const detalhe = String(getPedidoOrcamentoDetalhe(report) || '').trim();
    if (!detalhe) return [];
    return [{ ...emptyOrcamentoLinha(), descricao: detalhe }];
  })();
  const fromMaterial = linhasFromMaterial(values);

  const merged = [];
  const seen = new Set();
  [...fromDetalhe, ...fromMaterial].forEach((row) => {
    const key = `${row.descricao}::${row.qtd}`.toLowerCase();
    if (!row.descricao || seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });

  while (merged.length < MIN_LINHAS_VAZIAS) {
    merged.push(emptyOrcamentoLinha());
  }
  return merged;
}

export function buildOrcamentoMetaDraft(report, numeroReservado = null) {
  const existing = getReportOrcamentoMeta(report);
  const ano = numeroReservado?.ano || existing?.ano || new Date().getFullYear();
  const sequencial = numeroReservado?.sequencial || existing?.numeroSequencial || null;
  const linhas = suggestOrcamentoLinhas(report);
  const { taxasSaida, taxaSaida } = formatTaxasSaidaMetaFromSlots(taxasSaidaSlotsFromMeta(existing));
  const prazoEntrega = existing?.prazoEntrega ?? '';
  const totals = computeOrcamentoTotals(linhas, existing || taxasSaida);
  const cabecalho = resolveOrcamentoCabecalho(report);
  const tipoProposta = normalizeOrcamentoTipoProposta(existing?.tipoProposta, report);

  return {
    numeroSequencial: sequencial,
    ano,
    numeroFormatado:
      sequencial != null ? formatOrcamentoNumeroLabel(sequencial, ano) : existing?.numeroFormatado || null,
    tipoProposta,
    emailDestinatario: existing?.emailDestinatario ?? '',
    ...cabecalho,
    maquinas: cabecalho.maquinas,
    taxasSaida,
    taxaSaida,
    prazoEntrega: String(prazoEntrega || ''),
    linhas,
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
  };
}

export function readOrcamentoFormFromDom(root, report) {
  const linhas = [];
  root?.querySelectorAll('[data-orcamento-linha]').forEach((row) => {
    const descricao = row.querySelector('[data-orc-field="descricao"]')?.value?.trim() || '';
    const qtd = row.querySelector('[data-orc-field="qtd"]')?.value?.trim() || '1';
    const precoUnit = row.querySelector('[data-orc-field="precoUnit"]')?.value?.trim() || '';
    const equipamentoRaw = row.querySelector('[data-orc-field="equipamentoIndex"]')?.value;
    const total = computeLinhaTotal({ qtd, precoUnit });
    linhas.push({
      descricao,
      qtd,
      precoUnit,
      total: total > 0 ? formatEuro(total) : '',
      equipamentoIndex: equipamentoRaw != null && equipamentoRaw !== '' ? Number(equipamentoRaw) : 0,
    });
  });

  const taxaSlots = readTaxasSaidaFromDom(root);
  const { taxasSaida, taxaSaida } = formatTaxasSaidaMetaFromSlots(taxaSlots);
  const prazoEntrega = root.querySelector('[data-orc-field="prazoEntrega"]')?.value?.trim() || '';
  const emailDestinatario =
    root.querySelector('[data-orc-field="emailDestinatario"]')?.value?.trim() || '';
  const cabecalho = readOrcamentoCabecalhoFromDom(root, report);
  const machineCount = Math.max(1, cabecalho.maquinas?.length || 1);
  const totals = computeOrcamentoTotals(linhas, taxaSlots);
  const existing = getReportOrcamentoMeta(report) || {};
  const domMeta = getReportOrcamentoMetaFromDom(root);
  const tipoRaw = root.querySelector('[data-orc-field="tipoProposta"]')?.value?.trim() || '';
  const tipoProposta = normalizeOrcamentoTipoProposta(tipoRaw || existing.tipoProposta, report);

  return {
    ...existing,
    ...domMeta,
    ...cabecalho,
    tipoProposta,
    emailDestinatario,
    taxasSaida,
    taxaSaida,
    prazoEntrega,
    linhas: normalizeOrcamentoLinhas(linhas, { machineCount }),
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
    atualizadoEm: new Date().toISOString(),
  };
}

function getReportOrcamentoMetaFromDom(root) {
  const sequencialRaw = root?.querySelector('[data-orc-numero-sequencial]')?.textContent?.trim();
  const anoRaw = root?.querySelector('[data-orc-numero-ano]')?.textContent?.trim();
  const formatadoRaw = root?.querySelector('[data-orc-numero-formatado]')?.textContent?.trim();
  const sequencial = parseOrcamentoNumber(sequencialRaw);
  const ano = parseOrcamentoNumber(anoRaw) || new Date().getFullYear();
  const formatado = isPlaceholderOrcamentoNumero(formatadoRaw)
    ? sequencial > 0
      ? formatOrcamentoNumeroLabel(sequencial, ano)
      : null
    : formatadoRaw;
  return {
    numeroSequencial: sequencial > 0 ? sequencial : null,
    ano,
    numeroFormatado:
      formatado ||
      resolveOrcamentoNumeroFormatado({ numeroSequencial: sequencial, ano }, { year: ano }),
  };
}
