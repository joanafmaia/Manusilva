/**
 * Catálogo de produtos/serviços — Supabase (tabela `catalogo_produtos`).
 * Alimentado automaticamente a partir das linhas de orçamento MS.015.
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';

function norm(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return norm(value).toLowerCase();
}

function parsePrecoVenda(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Converte linha do editor de orçamento para registo de catálogo. */
export function parseOrcamentoLinhaToCatalogItem(linha) {
  const descricaoRaw = norm(linha?.descricao);
  if (!descricaoRaw || descricaoRaw.length < 2) return null;

  let descricao = descricaoRaw;
  let codigo = '';
  const paren = descricaoRaw.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
  if (paren) {
    descricao = norm(paren[1]);
    codigo = norm(paren[2]);
  }
  if (!descricao) return null;

  return {
    tipo: 'Produto',
    codigo: codigo || null,
    descricao,
    descricaoNormalizada: normKey(descricao),
    unidade: 'un',
    precoVenda: parsePrecoVenda(linha?.precoUnit),
    origem: 'orcamento',
  };
}

export function mapDbRowToCatalogItem(row) {
  if (!row) return null;
  return {
    tipo: norm(row.tipo) || 'Produto',
    codigo: norm(row.codigo),
    descricao: norm(row.descricao) || norm(row.codigo),
    unidade: norm(row.unidade) || 'un',
    precoVenda:
      row.preco_venda != null && Number.isFinite(Number(row.preco_venda))
        ? Number(row.preco_venda)
        : null,
    source: 'db',
  };
}

/** @returns {Promise<object[]>} */
export async function fetchCatalogoProdutosFromDb() {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('catalogo_produtos')
    .select('tipo, codigo, descricao, unidade, preco_venda')
    .order('descricao', { ascending: true });

  if (error) {
    if (error.code === 'PGRST205' || /does not exist/i.test(String(error.message || ''))) {
      console.warn('[Catálogo] Tabela catalogo_produtos em falta — aplique migração 019.');
      return [];
    }
    throw error;
  }

  return (data || []).map(mapDbRowToCatalogItem).filter(Boolean);
}

/**
 * Insere ou atualiza um artigo (por descrição normalizada ou código).
 * @returns {Promise<boolean>} true se gravou com sucesso
 */
export async function upsertCatalogoProduto(item) {
  if (!item?.descricao || !item?.descricaoNormalizada) return false;

  const supabase = await getAuthenticatedSupabaseClient();
  const now = new Date().toISOString();
  const codigo = norm(item.codigo);

  if (codigo) {
    const { data: byCode } = await supabase
      .from('catalogo_produtos')
      .select('id, preco_venda')
      .ilike('codigo', codigo)
      .limit(1)
      .maybeSingle();

    if (byCode?.id) {
      const { error } = await supabase
        .from('catalogo_produtos')
        .update({
          descricao: item.descricao,
          descricao_normalizada: item.descricaoNormalizada,
          preco_venda: item.precoVenda ?? byCode.preco_venda,
          atualizado_em: now,
        })
        .eq('id', byCode.id);
      if (error) throw error;
      return true;
    }
  }

  const { data: existing } = await supabase
    .from('catalogo_produtos')
    .select('id, preco_venda')
    .eq('descricao_normalizada', item.descricaoNormalizada)
    .maybeSingle();

  if (existing?.id) {
    const patch = { atualizado_em: now };
    if (item.precoVenda != null) patch.preco_venda = item.precoVenda;
    if (codigo) patch.codigo = codigo;
    const { error } = await supabase.from('catalogo_produtos').update(patch).eq('id', existing.id);
    if (error) throw error;
    return true;
  }

  const { error } = await supabase.from('catalogo_produtos').insert({
    tipo: item.tipo || 'Produto',
    codigo: codigo || null,
    descricao: item.descricao,
    descricao_normalizada: item.descricaoNormalizada,
    unidade: item.unidade || 'un',
    preco_venda: item.precoVenda,
    origem: item.origem || 'orcamento',
    criado_em: now,
    atualizado_em: now,
  });

  if (error) throw error;
  return true;
}

/**
 * Grava linhas com descrição preenchida no catálogo (ignora falhas individuais).
 * @param {object[]} linhas
 * @returns {Promise<number>} quantidade gravada com sucesso
 */
export async function persistOrcamentoLinhasToCatalogo(linhas = []) {
  const items = (Array.isArray(linhas) ? linhas : [])
    .map(parseOrcamentoLinhaToCatalogItem)
    .filter(Boolean);

  if (!items.length) return 0;

  let saved = 0;
  for (const item of items) {
    try {
      const ok = await upsertCatalogoProduto(item);
      if (ok) saved += 1;
    } catch (err) {
      console.warn('[Catálogo] Falha ao gravar artigo:', item.descricao, err);
    }
  }
  return saved;
}

/** Grava uma linha do DOM do editor de orçamento. */
export async function persistOrcamentoLinhaFromDomRow(row) {
  if (!row) return false;
  const descricao = row.querySelector('[data-orc-field="descricao"]')?.value?.trim() || '';
  const precoUnit = row.querySelector('[data-orc-field="precoUnit"]')?.value?.trim() || '';
  const item = parseOrcamentoLinhaToCatalogItem({ descricao, precoUnit });
  if (!item) return false;
  return upsertCatalogoProduto(item);
}
