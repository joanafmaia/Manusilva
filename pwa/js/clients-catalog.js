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
      'Sem permissão na tabela clientes (RLS). No Supabase → SQL Editor, permite SELECT para anon: ' +
      'CREATE POLICY "anon_read_clientes" ON public.clientes FOR SELECT TO anon USING (true);'
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

async function fetchClientsFromSupabase() {
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
