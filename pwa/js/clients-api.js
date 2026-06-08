/**
 * API de clientes — PUT /api/clients/[id] com fallback Supabase direto.
 */

import { updateClient, updateDB } from './app.js';
import { normalizeClientRecord, registerClientInCatalog } from './clients-catalog.js';

const SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';

function persistClientRecord(raw) {
  const record = normalizeClientRecord(raw);
  registerClientInCatalog(record);
  updateDB((d) => {
    if (!Array.isArray(d.clients)) d.clients = [];
    const rid = String(record.id);
    const idx = d.clients.findIndex((c) => String(c.id) === rid);
    if (idx >= 0) Object.assign(d.clients[idx], record);
    else d.clients.push(record);
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return record;
}

/**
 * @param {string|number} clientId
 * @param {{ email?: string, morada?: string, telemovel?: string }} patch
 */
export async function putClient(clientId, patch) {
  const id = encodeURIComponent(String(clientId ?? '').trim());
  if (!id) throw new Error('Cliente inválido.');

  try {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.record) return persistClientRecord(body.record);
      return body.record || body;
    }

    if (res.status !== 404 && res.status !== 405) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao atualizar cliente (${res.status}).`);
    }
  } catch (err) {
    if (err?.message && !/Failed to fetch|NetworkError|404|405/i.test(err.message)) {
      throw err;
    }
  }

  const record = await updateClient(clientId, patch);
  if (!record) {
    throw new Error('Não foi possível guardar as alterações do cliente.');
  }
  return record;
}

export { SUPABASE_URL };
