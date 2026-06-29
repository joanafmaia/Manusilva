/**
 * API de clientes — PUT /api/clients/[id] com fallback Supabase direto (sessão RH).
 */

import { updateClient, updateDB } from './app.js';
import { normalizeClientRecord, registerClientInCatalog } from './clients-catalog.js';
import { getSession } from './session.js';
import { isRhOrAdminSession } from './auth-roles-core.js';
import { ensureSupabaseAuthSession } from './supabase-client.js';

function requireRhSession() {
  const session = getSession();
  if (!isRhOrAdminSession(session)) {
    throw new Error('Acesso reservado a Recursos Humanos.');
  }
  if (!session.token) {
    throw new Error('Sessão expirada. Volte a iniciar sessão.');
  }
  return session;
}

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

function buildApiHeaders(session) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.token}`,
  };
}

/**
 * @param {string|number} clientId
 * @param {{ email?: string, morada?: string, telemovel?: string, codigo_postal?: string, localidade?: string, condicao_pagamento?: string }} patch
 */
export async function putClient(clientId, patch) {
  const session = requireRhSession();
  const id = encodeURIComponent(String(clientId ?? '').trim());
  if (!id) throw new Error('Cliente inválido.');

  const { isValidEmail } = await import('./validators.js');
  if (patch.email !== undefined && patch.email && !isValidEmail(patch.email)) {
    throw new Error('E-mail inválido.');
  }

  await ensureSupabaseAuthSession();

  try {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PUT',
      headers: buildApiHeaders(session),
      body: JSON.stringify(patch),
    });

    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.record) return persistClientRecord(body.record);
      return body.record || body;
    }

    if (res.status === 401 || res.status === 403) {
      const record = await updateClient(clientId, patch, { origem: 'rh_ficha', silent: true });
      if (record) return record;
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Sem permissão para atualizar clientes.');
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

  const record = await updateClient(clientId, patch, { origem: 'rh_ficha' });
  if (!record) {
    throw new Error('Não foi possível guardar as alterações do cliente.');
  }
  return record;
}
