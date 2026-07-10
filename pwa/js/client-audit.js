/**
 * Auditoria de alterações a clientes (tabela cliente_alteracoes no Supabase).
 */

import { getSupabaseClient } from './supabase-client.js';
import { resolveAuditActor } from './audit-actor.js';

const FIELD_LABELS = {
  email: 'E-mail',
  morada: 'Morada',
  telemovel: 'Telemóvel',
  codigo_postal: 'Código postal',
  localidade: 'Localidade',
  condicao_pagamento: 'Condição de pagamento',
  plus_code: 'Plus Code',
  zona_rota: 'Zona / Rota',
};

function resolveActor() {
  return resolveAuditActor();
}

/**
 * Regista alterações campo a campo (não bloqueia o fluxo principal).
 * @param {string|number} clientId
 * @param {Record<string, string|null|undefined>} before
 * @param {Record<string, string|null|undefined>} after
 * @param {{ origem?: string }} [meta]
 */
function mapAlteracaoRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    campo: row.campo || '—',
    valorAnterior: row.valor_anterior || '',
    valorNovo: row.valor_novo || '',
    alteradoPor: row.alterado_por || '—',
    origem: row.origem || 'rh_ficha',
    criadoEm: row.created_at || null,
  };
}

export function formatClientAlteracaoDate(iso) {
  const date = String(iso || '').slice(0, 10);
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

/**
 * @param {string|number} clientId
 * @param {{ limit?: number }} [options]
 */
export async function fetchClientAlteracoes(clientId, options = {}) {
  const id = String(clientId ?? '').trim();
  if (!id) return [];

  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return [];

    const queryId = /^\d+$/.test(id) ? Number(id) : id;
    const { data, error } = await supabase
      .from('cliente_alteracoes')
      .select('id,campo,valor_anterior,valor_novo,alterado_por,origem,created_at')
      .eq('cliente_id', queryId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[Auditoria] fetch:', error.message);
      return [];
    }

    return (data || []).map(mapAlteracaoRow).filter(Boolean);
  } catch (err) {
    console.warn('[Auditoria] fetch:', err);
    return [];
  }
}

export function buildClientAlteracoesCsv(rows = [], clientName = 'cliente') {
  const header = ['Data', 'Campo', 'Valor anterior', 'Valor novo', 'Alterado por', 'Origem'];
  const lines = [header.join(';')];
  for (const row of rows) {
    const cells = [
      String(row.criadoEm || '').slice(0, 10),
      row.campo,
      row.valorAnterior,
      row.valorNovo,
      row.alteradoPor,
      row.origem,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  }
  const safeName = String(clientName || 'cliente')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return {
    content: `\uFEFF${lines.join('\n')}`,
    filename: `alteracoes-cliente-${safeName}.csv`,
  };
}

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
