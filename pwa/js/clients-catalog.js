/**
 * Catálogo de clientes — Supabase (tabela `clientes`)
 */

import { ensureSupabaseAuthSession, getSupabaseClient } from './supabase-client.js';

const MAX_DROPDOWN_RESULTS = 10;

let productionCatalog = null;
/** Mapa NIF / id → registo para lookup O(1) */
let catalogByNif = null;
let catalogLoadPromise = null;

export { MAX_DROPDOWN_RESULTS };

export function normalizeClientRecord(raw, index = 0) {
  if (!raw) return null;
  const nome = String(raw.nome_empresa ?? raw.Nome ?? raw.name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const nif = String(raw.nif ?? raw.NIF ?? '')
    .replace(/\s+/g, '')
    .trim();
  const id =
    raw.id !== undefined && raw.id !== null
      ? String(raw.id)
      : nif || `cli-${index}`;
  return {
    id,
    Nome: nome,
    NIF: nif,
    'E-mail': raw.email ?? raw['E-mail'] ?? '',
    Morada: raw.morada ?? raw.Morada ?? raw.address ?? '',
    'Código postal': raw.codigo_postal ?? raw['Código postal'] ?? raw.codigoPostal ?? '',
    Localidade: raw.localidade ?? raw.Localidade ?? '',
    'País/Região': raw['País/Região'] ?? raw.pais ?? 'Portugal',
    Telemovel: raw.telemovel ?? raw.Telemovel ?? raw.phone ?? '',
    condicao_pagamento:
      raw.condicao_pagamento ?? raw['Condição de pagamento'] ?? raw.condicaoPagamento ?? '',
    forklifts: raw.forklifts || [],
  };
}

function buildCatalogIndexes() {
  catalogByNif = new Map();
  productionCatalog.forEach((c) => {
    if (c.NIF) catalogByNif.set(c.NIF, c);
    catalogByNif.set(c.id, c);
  });
}

export function resetProductionCatalogCache() {
  productionCatalog = null;
  catalogByNif = null;
  catalogLoadPromise = null;
}

/** Mensagem legível para toasts / consola (F12) */
export function formatClientsLoadError(err) {
  if (!err) return 'Erro desconhecido ao carregar clientes.';

  const msg = String(err.message || err.details || err.hint || err).trim();
  const code = err.code || err.status || '';

  if (msg.includes('sb_secret_') || msg.includes('publishable')) {
    return msg;
  }
  if (msg.includes('SDK Supabase') || msg.includes('Chave Supabase')) {
    return msg;
  }
  if (
    code === '42501' ||
    /permission denied|row-level security|RLS/i.test(msg)
  ) {
    return (
      'Sem permissão na tabela clientes (RLS). Inicia sessão na app e confirma que executaste ' +
      'pwa/supabase/migrations/007_lockdown_anon.sql (SELECT só para authenticated).'
    );
  }
  if (code === 'PGRST205' || /relation.*does not exist|Could not find the table/i.test(msg)) {
    return 'Tabela "clientes" não encontrada no Supabase. Confirma o nome da tabela no Table Editor.';
  }
  if (/Invalid API key|JWT|401|403/i.test(msg) || code === 401 || code === 403) {
    return 'Chave API inválida. Usa a chave publishable ou anon (não uses sb_secret_ no browser).';
  }

  return msg || 'Não foi possível carregar a lista de clientes.';
}

/** Mensagens para falhas ao criar cliente no Supabase */
export function formatClientInsertError(err) {
  if (!err) return 'Não foi possível gravar o cliente.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
    return (
      'Já existe um registo com este ID ou NIF. No Supabase SQL Editor, executa pwa/supabase-rls-clientes.sql (bloco RESTART WITH).'
    );
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return (
      'Sem permissão para inserir (RLS). Executa pwa/supabase-rls-clientes.sql no SQL Editor do Supabase.'
    );
  }
  if (code === '23502' || /null value.*id/i.test(msg)) {
    return (
      'A coluna id está vazia no INSERT. Executa pwa/supabase-rls-clientes.sql no Supabase (RESTART WITH).'
    );
  }

  return msg || formatClientsLoadError(err);
}

/** Mensagens para falhas ao atualizar cliente no Supabase */
export function formatClientUpdateError(err) {
  if (!err) return 'Não foi possível atualizar o cliente.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return (
      'Sem permissão para atualizar (RLS). Executa pwa/supabase-rls-clientes.sql no SQL Editor do Supabase.'
    );
  }
  if (code === 'PGRST116' || /0 rows/i.test(msg)) {
    return 'Cliente não encontrado na base de dados.';
  }

  return msg || formatClientsLoadError(err);
}

async function fetchClientsFromSupabase() {
  await ensureSupabaseAuthSession();
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nome_empresa', { ascending: true });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar clientes do Supabase:', error);
    const wrapped = new Error(formatClientsLoadError(error));
    wrapped.cause = error;
    throw wrapped;
  }

  const rows = data || [];
  if (!rows.length) {
    console.warn(
      '[ManuSilva] Supabase devolveu 0 clientes. Confirma dados na tabela public.clientes e sessão authenticated (007_lockdown_anon.sql).',
    );
  } else {
    console.info(`[ManuSilva] ${rows.length} clientes carregados do Supabase.`);
  }

  return rows;
}

async function loadCatalogFromSupabase() {
  const rows = await fetchClientsFromSupabase();
  productionCatalog = rows
    .map((row, index) => normalizeClientRecord(row, index))
    .filter((r) => r?.Nome);
  buildCatalogIndexes();
  mergeClientsFromStorage();
  return productionCatalog;
}

export function isProductionCatalogReady() {
  return Array.isArray(productionCatalog);
}

export function getProductionClientsCatalog(options = {}) {
  const { warn = true } = options;
  if (!productionCatalog) {
    if (warn) {
      console.warn(
        '[ManuSilva] Catálogo de clientes ainda não carregado. Chame ensureProductionCatalog() antes.',
      );
    }
    return [];
  }
  return productionCatalog;
}

function resolveCatalog(catalog) {
  if (catalog) return catalog;
  return isProductionCatalogReady()
    ? getProductionClientsCatalog({ warn: false })
    : [];
}

/** Clientes criados no RH (localStorage) — disponíveis para pesquisa/agendamento */
export function mergeClientsFromStorage() {
  if (!productionCatalog) return;
  if (!catalogByNif) catalogByNif = new Map();

  let db;
  try {
    db = JSON.parse(localStorage.getItem('manusilva_db') || '{}');
  } catch {
    return;
  }

  (db.clients || []).forEach((row, index) => {
    registerClientInCatalog(row, index);
  });
}

/**
 * Regista cliente no catálogo em memória (pesquisa + combobox).
 * @param {object} raw
 * @param {number} [index]
 */
export function registerClientInCatalog(raw, index = 0) {
  const record = normalizeClientRecord(raw, index);
  if (!record?.Nome) return null;

  if (!productionCatalog) {
    productionCatalog = [];
    catalogByNif = new Map();
  }

  const dup = productionCatalog.find(
    (c) => c.id === record.id || (record.NIF && c.NIF === record.NIF),
  );
  if (dup) {
    Object.assign(dup, record);
    if (record.NIF) catalogByNif.set(record.NIF, dup);
    catalogByNif.set(dup.id, dup);
    return dup;
  }

  productionCatalog.push(record);
  if (record.NIF) catalogByNif.set(record.NIF, record);
  catalogByNif.set(record.id, record);
  return record;
}

/** @deprecated Alias de ensureProductionCatalog — compatibilidade */
export async function loadClientsDataModule() {
  return ensureProductionCatalog();
}

/** Carrega clientes do Supabase e constrói o catálogo em memória */
export async function ensureProductionCatalog() {
  if (productionCatalog) return productionCatalog;
  if (!catalogLoadPromise) {
    catalogLoadPromise = loadCatalogFromSupabase().catch((err) => {
      catalogLoadPromise = null;
      throw err;
    });
  }
  return catalogLoadPromise;
}

export function getClientFromCatalog(idOrNif, catalog = null) {
  if (!idOrNif) return null;
  const list = resolveCatalog(catalog);
  const byMap = catalogByNif?.get(idOrNif);
  if (byMap) return byMap;
  return list.find((c) => c.id === idOrNif || c.NIF === idOrNif) || null;
}

/**
 * Pesquisa por Nome, NIF ou E-mail — percorre o array completo, devolve no máximo 10 linhas.
 */
export function searchClients(query, catalog = null) {
  const list = resolveCatalog(catalog);
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) {
    return { items: [], totalMatches: 0, truncated: false };
  }

  const items = [];
  let totalMatches = 0;

  const qCompact = q.replace(/\s+/g, '');

  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const nome = c.Nome.toLowerCase();
    const nif = c.NIF.toLowerCase();
    const email = String(c['E-mail'] || '').toLowerCase();
    const nifCompact = nif.replace(/\s+/g, '');
    if (
      !nome.includes(q) &&
      !nif.includes(q) &&
      !email.includes(q) &&
      !(qCompact && nifCompact.includes(qCompact))
    ) {
      continue;
    }

    totalMatches += 1;
    if (items.length < MAX_DROPDOWN_RESULTS) {
      items.push(c);
    }
  }

  return {
    items,
    totalMatches,
    truncated: totalMatches > MAX_DROPDOWN_RESULTS,
  };
}
