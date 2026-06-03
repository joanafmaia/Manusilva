/**
 * Catálogo de clientes — Supabase (tabela `clientes`)
 */

import { getSupabaseClient } from './supabase-client.js';

const MAX_DROPDOWN_RESULTS = 10;

let productionCatalog = null;
/** Mapa NIF / id → registo para lookup O(1) */
let catalogByNif = null;
let catalogLoadPromise = null;

export { MAX_DROPDOWN_RESULTS };

export function normalizeClientRecord(raw, index = 0) {
  if (!raw) return null;
  const nome = String(raw.nome_empresa ?? raw.Nome ?? raw.name ?? '').trim();
  const nif = String(raw.nif ?? raw.NIF ?? '').trim();
  const id = raw.id ?? (nif || `cli-${index}`);
  return {
    id,
    Nome: nome,
    NIF: nif,
    'E-mail': raw.email ?? raw['E-mail'] ?? '',
    Morada: raw.morada ?? raw.Morada ?? raw.address ?? '',
    'Código postal': raw.codigo_postal ?? raw['Código postal'] ?? raw.codigoPostal ?? '',
    Localidade: raw.localidade ?? raw.Localidade ?? '',
    'País/Região': raw['País/Região'] ?? raw.pais ?? 'Portugal',
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

async function fetchClientsFromSupabase() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nome_empresa', { ascending: true });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar clientes do Supabase:', error);
    throw error;
  }

  return data || [];
}

async function loadCatalogFromSupabase() {
  const rows = await fetchClientsFromSupabase();
  productionCatalog = rows.map((row, index) => normalizeClientRecord(row, index));
  buildCatalogIndexes();
  mergeClientsFromStorage();
  return productionCatalog;
}

export function getProductionClientsCatalog() {
  if (!productionCatalog) {
    console.warn(
      '[ManuSilva] Catálogo de clientes ainda não carregado. Chame ensureProductionCatalog() antes.',
    );
    return [];
  }
  return productionCatalog;
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

export function getClientFromCatalog(idOrNif, catalog = getProductionClientsCatalog()) {
  if (!idOrNif) return null;
  const byMap = catalogByNif?.get(idOrNif);
  if (byMap) return byMap;
  return catalog.find((c) => c.id === idOrNif || c.NIF === idOrNif) || null;
}

/**
 * Pesquisa por Nome ou NIF — percorre o array completo, devolve no máximo 10 linhas.
 */
export function searchClients(query, catalog = getProductionClientsCatalog()) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) {
    return { items: [], totalMatches: 0, truncated: false };
  }

  const items = [];
  let totalMatches = 0;

  for (let i = 0; i < catalog.length; i += 1) {
    const c = catalog[i];
    const nome = c.Nome.toLowerCase();
    const nif = c.NIF.toLowerCase();
    if (!nome.includes(q) && !nif.includes(q)) continue;

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
