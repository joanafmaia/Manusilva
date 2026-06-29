/**
 * Metadados de cliente e contexto de renderização PDF.
 */

import {
  ensureProductionCatalog,
  getClientFromCatalog,
  getProductionClientsCatalog,
} from './clients-catalog.js';
import { getClient } from './entity-lookups.js';
import { cleanPdfText } from './pdf-format-utils.js';

export async function resolvePdfClientMeta(report, values = {}) {
  let catalog = [];
  try {
    await ensureProductionCatalog();
    catalog = getProductionClientsCatalog();
  } catch (err) {
    console.warn('[PDF] Catálogo de clientes indisponível; a usar dados locais.', err);
  }
  const dbClient = getClient(report.clientId);

  let prod =
    (values.cliente_id && getClientFromCatalog(values.cliente_id, catalog)) || null;
  if (!prod && values.cliente) {
    const q = String(values.cliente).trim().toLowerCase();
    prod = catalog.find((c) => c.Nome.toLowerCase() === q) || null;
  }

  const nome = values.cliente || prod?.Nome || dbClient?.name || dbClient?.Nome || '—';
  const morada = values.morada || prod?.Morada || dbClient?.morada || dbClient?.Morada || '';
  const localidade = values.localidade || prod?.Localidade || dbClient?.localidade || dbClient?.Localidade || '';
  const nif = values.nif || prod?.NIF || dbClient?.NIF || dbClient?.nif || '';
  const cp = values.codigo_postal || prod?.['Código postal'] || dbClient?.['Código postal'] || '';

  const street = cleanPdfText(morada);
  const cpLoc = [cp, localidade].filter(Boolean).map((p) => cleanPdfText(p)).join(' ').trim();
  let addressLine = street;
  let addressSubline = cpLoc;

  if (!street && !cpLoc) {
    const fallback = cleanPdfText(dbClient?.address || '');
    if (fallback) {
      addressLine = fallback;
      addressSubline = '';
    }
  }

  return { nome, addressLine: addressLine || '—', addressSubline, localidade, nif };
}

export function buildPdfRenderContext(report, job, clientMeta, tech) {
  return {
    techName: tech?.name || '',
    jobDate: job?.date || '',
    localidade: clientMeta?.localidade || '',
    forkliftSerial: report?.forkliftSerial || job?.forkliftSerial || '',
    report,
    data: report?.data || {},
    clientMeta,
    values: null,
  };
}
