/**
 * Catálogo de produção (560 clientes) — carregamento único em memória
 */

const MAX_DROPDOWN_RESULTS = 10;

let productionCatalog = null;
/** Mapa NIF → registo para lookup O(1) */
let catalogByNif = null;
let clientsDataModule = null;

export { MAX_DROPDOWN_RESULTS };

export async function loadClientsDataModule() {
  if (!clientsDataModule) {
    clientsDataModule = await import('../clients_data.js');
  }
  return clientsDataModule.default ?? clientsDataModule;
}

export function normalizeClientRecord(raw, index = 0) {
  if (!raw) return null;
  const nome = String(raw.Nome ?? raw.name ?? '').trim();
  const nif = String(raw.NIF ?? raw.nif ?? '').trim();
  const id = raw.id || nif || `cli-${index}`;
  return {
    id,
    Nome: nome,
    NIF: nif,
    'E-mail': raw['E-mail'] ?? raw.email ?? '',
    Morada: raw.Morada ?? raw.morada ?? raw.address ?? '',
    'Código postal': raw['Código postal'] ?? raw.codigoPostal ?? '',
    Localidade: raw.Localidade ?? raw.localidade ?? '',
    'País/Região': raw['País/Região'] ?? raw.pais ?? 'Portugal',
    forklifts: raw.forklifts || [],
  };
}

export function getProductionClientsCatalog() {
  if (productionCatalog) return productionCatalog;

  if (!clientsDataModule) {
    console.warn(
      '[ManuSilva] Catálogo de 560 clientes ainda não carregado. Chame loadClientsDataModule() antes.',
    );
    return [];
  }

  const raw = clientsDataModule.default ?? clientsDataModule;
  const data = Array.isArray(raw) ? raw : raw?.default;
  if (!Array.isArray(data)) {
    productionCatalog = [];
    catalogByNif = new Map();
    return productionCatalog;
  }

  productionCatalog = data.map((row, index) => normalizeClientRecord(row, index));
  catalogByNif = new Map();
  productionCatalog.forEach((c) => {
    if (c.NIF) catalogByNif.set(c.NIF, c);
    catalogByNif.set(c.id, c);
  });

  mergeClientsFromStorage();

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

/** Carrega `clients_data.js` e constrói o catálogo em memória */
export async function ensureProductionCatalog() {
  await loadClientsDataModule();
  return getProductionClientsCatalog();
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
