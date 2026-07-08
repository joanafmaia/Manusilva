/**
 * Sincronização do catálogo Supabase → localStorage (`manusilva_db.clients`).
 */

import { mapClientToLegacy } from './mock_data.js';
import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
} from './clients-catalog.js';
import { getDB, updateDB } from './local-db.js';

function normalizeStoredClient(record) {
  if (!record) return null;
  return record.name ? record : mapClientToLegacy(record);
}

/**
 * Sincroniza o catálogo completo para `manusilva_db.clients` no localStorage.
 * Preserva empilhadores dos registos demo já existentes.
 */
export async function ensureFullClientsInStorage() {
  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog();
  const db = getDB();
  const stored = Array.isArray(db.clients) ? db.clients : [];

  if (!catalog.length) {
    return stored.map(normalizeStoredClient).filter(Boolean);
  }

  const forkliftsById = new Map();
  const aliasNamesById = new Map();
  stored.forEach((row) => {
    const leg = normalizeStoredClient(row);
    if (leg?.forklifts?.length) forkliftsById.set(leg.id, leg.forklifts);
    const aliasNames = [row?.Nome, row?.name, ...(Array.isArray(row?.aliasNames) ? row.aliasNames : [])]
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (leg?.id && aliasNames.length) aliasNamesById.set(leg.id, [...new Set(aliasNames)]);
  });

  const merged = catalog.map((row) => {
    const copy = { ...row };
    if (forkliftsById.has(copy.id)) copy.forklifts = forkliftsById.get(copy.id);
    if (aliasNamesById.has(copy.id)) {
      copy.aliasNames = [
        ...new Set([...(Array.isArray(copy.aliasNames) ? copy.aliasNames : []), ...aliasNamesById.get(copy.id)]),
      ];
    }
    return copy;
  });

  updateDB((d) => {
    d.clients = merged;
  });

  return merged.map(normalizeStoredClient).filter(Boolean);
}

/** Lista completa de clientes (localStorage + catálogo), ordenada por nome */
export async function getAllClientsList() {
  const list = await ensureFullClientsInStorage();
  return [...list].sort((a, b) =>
    String(a.name || a.Nome).localeCompare(String(b.name || b.Nome), 'pt'),
  );
}
