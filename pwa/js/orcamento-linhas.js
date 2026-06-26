/**
 * Linhas e totais da proposta MS.015 — sugestões, cálculo e persistência no relatório.
 */

import { normalizeMaterialRows } from './material-table-field.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';

const IVA_RATE = 0.23;
const MIN_LINHAS_VAZIAS = 3;

export function emptyOrcamentoLinha() {
  return { descricao: '', qtd: '1', precoUnit: '', total: '' };
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

export function getReportOrcamentoMeta(report) {
  const meta = report?.data?.orcamento;
  return meta && typeof meta === 'object' ? meta : null;
}

export function computeLinhaTotal(linha) {
  const qtd = parseOrcamentoNumber(linha?.qtd);
  const preco = parseOrcamentoNumber(linha?.precoUnit);
  if (qtd <= 0 || preco <= 0) return 0;
  return Math.round(qtd * preco * 100) / 100;
}

export function normalizeOrcamentoLinhas(raw) {
  if (!Array.isArray(raw)) return [];
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
    };
  });
}

export function computeOrcamentoTotals(linhas = [], taxaSaida = '') {
  const rows = normalizeOrcamentoLinhas(linhas);
  const subtotalLinhas = rows.reduce((sum, row) => sum + computeLinhaTotal(row), 0);
  const taxa = parseOrcamentoNumber(taxaSaida);
  const base = subtotalLinhas + taxa;
  const iva = Math.round(base * IVA_RATE * 100) / 100;
  const total = Math.round((base + iva) * 100) / 100;
  return {
    subtotalLinhas,
    taxaSaida: taxa,
    subtotal: base,
    iva,
    total,
  };
}

function splitDetalheEmLinhas(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .map((descricao) => ({ ...emptyOrcamentoLinha(), descricao }));
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
  const existing = normalizeOrcamentoLinhas(getReportOrcamentoMeta(report)?.linhas);
  if (existing.some((r) => r.descricao || r.precoUnit)) return existing;

  const values = report?.data?.values || {};
  const fromDetalhe = splitDetalheEmLinhas(getPedidoOrcamentoDetalhe(report));
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
  const taxaSaida = existing?.taxaSaida ?? '';
  const prazoEntrega = existing?.prazoEntrega ?? '';
  const totals = computeOrcamentoTotals(linhas, taxaSaida);

  return {
    numeroSequencial: sequencial,
    ano,
    numeroFormatado:
      sequencial != null ? formatOrcamentoNumeroLabel(sequencial, ano) : existing?.numeroFormatado || null,
    taxaSaida: taxaSaida === '' ? '' : formatEuro(taxaSaida),
    prazoEntrega: String(prazoEntrega || ''),
    linhas,
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
    atualizadoEm: new Date().toISOString(),
  };
}

export function readOrcamentoFormFromDom(root) {
  const linhas = [];
  root?.querySelectorAll('[data-orcamento-linha]').forEach((row) => {
    const descricao = row.querySelector('[data-orc-field="descricao"]')?.value?.trim() || '';
    const qtd = row.querySelector('[data-orc-field="qtd"]')?.value?.trim() || '1';
    const precoUnit = row.querySelector('[data-orc-field="precoUnit"]')?.value?.trim() || '';
    const total = computeLinhaTotal({ qtd, precoUnit });
    linhas.push({
      descricao,
      qtd,
      precoUnit,
      total: total > 0 ? formatEuro(total) : '',
    });
  });

  const taxaSaida = root.querySelector('[data-orc-field="taxaSaida"]')?.value?.trim() || '';
  const prazoEntrega = root.querySelector('[data-orc-field="prazoEntrega"]')?.value?.trim() || '';
  const emailDestinatario =
    root.querySelector('[data-orc-field="emailDestinatario"]')?.value?.trim() || '';
  const totals = computeOrcamentoTotals(linhas, taxaSaida);
  const meta = getReportOrcamentoMetaFromDom(root);

  return {
    ...meta,
    emailDestinatario,
    taxaSaida: taxaSaida === '' ? '' : formatEuro(taxaSaida),
    prazoEntrega,
    linhas: normalizeOrcamentoLinhas(linhas),
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
    atualizadoEm: new Date().toISOString(),
  };
}

function getReportOrcamentoMetaFromDom(root) {
  const sequencialRaw = root?.querySelector('[data-orc-numero-sequencial]')?.textContent?.trim();
  const anoRaw = root?.querySelector('[data-orc-numero-ano]')?.textContent?.trim();
  const formatado = root?.querySelector('[data-orc-numero-formatado]')?.textContent?.trim();
  const sequencial = parseOrcamentoNumber(sequencialRaw);
  const ano = parseOrcamentoNumber(anoRaw) || new Date().getFullYear();
  return {
    numeroSequencial: sequencial > 0 ? sequencial : null,
    ano,
    numeroFormatado: formatado || (sequencial > 0 ? formatOrcamentoNumeroLabel(sequencial, ano) : null),
  };
}
