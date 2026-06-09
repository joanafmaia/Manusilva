/**
 * Auditoria de alterações a clientes (tabela cliente_alteracoes no Supabase).
 */

import { getSupabaseClient } from './supabase-client.js';
import { getSession } from './session.js';

const FIELD_LABELS = {
  email: 'E-mail',
  morada: 'Morada',
  telemovel: 'Telemóvel',
  codigo_postal: 'Código postal',
  localidade: 'Localidade',
  condicao_pagamento: 'Condição de pagamento',
};

function resolveActor() {
  const session = getSession();
  return session?.name || session?.username || session?.email || 'RH';
}

/**
 * Regista alterações campo a campo (não bloqueia o fluxo principal).
 * @param {string|number} clientId
 * @param {Record<string, string|null|undefined>} before
 * @param {Record<string, string|null|undefined>} after
 * @param {{ origem?: string }} [meta]
 */
export async function logClientChanges(clientId, before, after, meta = {}) {
  const id = String(clientId ?? '').trim();
  if (!id) return;

  const rows = [];
  Object.keys(after).forEach((campo) => {
    const prev = String(before[campo] ?? '').trim();
    const next = String(after[campo] ?? '').trim();
    if (prev === next) return;
    rows.push({
      cliente_id: /^\d+$/.test(id) ? Number(id) : id,
      campo: FIELD_LABELS[campo] || campo,
      valor_anterior: prev || null,
      valor_novo: next || null,
      alterado_por: resolveActor(),
      origem: meta.origem || 'rh_ficha',
    });
  });

  if (!rows.length) return;

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('cliente_alteracoes').insert(rows);
    if (error) {
      console.warn('[Auditoria] Não foi possível registar alterações:', error.message);
    }
  } catch (err) {
    console.warn('[Auditoria]', err);
  }
}
