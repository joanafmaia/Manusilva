/**
 * Persistência Supabase — equipamentos por cliente.
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { extractEquipamentosFromReport, reconcileEquipamentoChaves } from './cliente-equipamentos.js';

const cache = new Map();
const CACHE_MS = 60_000;

function parseClientId(clientId) {
  if (clientId == null || clientId === '') return null;
  const n = Number(clientId);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    clienteId: String(row.cliente_id),
    categoria: row.categoria,
    chave: row.chave,
    marca: row.marca || '',
    modelo: row.modelo || '',
    numero_serie: row.numero_serie || '',
    matricula: row.matricula || '',
    maquina: row.maquina || '',
    tipo: row.tipo || '',
    n_interno: row.n_interno || '',
    data_fabrico: row.data_fabrico || '',
    tensao_v: row.tensao_v || '',
    densidade: row.densidade || '',
    horas: row.horas || '',
    ultimo_servico: row.ultimo_servico || '',
    ultima_intervencao_em: row.ultima_intervencao_em || '',
  };
}

export function invalidateClienteEquipamentosCache(clientId = null) {
  if (clientId == null) {
    cache.clear();
    return;
  }
  cache.delete(String(clientId));
}

/** @param {string|number} clientId */
export async function fetchClienteEquipamentos(clientId) {
  const numericId = parseClientId(clientId);
  if (!numericId) return [];

  const cacheKey = String(clientId);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.rows;
  }

  try {
    const supabase = await getAuthenticatedSupabaseClient();
    const { data, error } = await supabase
      .from('cliente_equipamentos')
      .select('*')
      .eq('cliente_id', numericId)
      .order('ultima_intervencao_em', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        console.warn('[Equipamentos] Tabela cliente_equipamentos em falta — correr migração 014.');
        return [];
      }
      throw error;
    }

    const rows = (data || []).map(mapRow).filter(Boolean);
    cache.set(cacheKey, { at: Date.now(), rows });
    return rows;
  } catch (err) {
    console.warn('[Equipamentos] Não foi possível carregar equipamentos:', err);
    return [];
  }
}

/** Grava/atualiza equipamentos extraídos de um relatório. */
export async function upsertClienteEquipamentosFromReport(report) {
  const clientId = parseClientId(report?.clientId);
  if (!clientId) return;

  const extracted = extractEquipamentosFromReport(report);
  if (!extracted.length) return;

  try {
    const supabase = await getAuthenticatedSupabaseClient();
    const now = new Date().toISOString();
    const existing = await fetchClienteEquipamentos(report.clientId);
    const rows = reconcileEquipamentoChaves(extracted, existing);

    const payload = rows.map((row) => ({
      cliente_id: clientId,
      categoria: row.categoria,
      chave: row.chave,
      marca: row.marca,
      modelo: row.modelo,
      numero_serie: row.numero_serie,
      matricula: row.matricula,
      maquina: row.maquina,
      tipo: row.tipo,
      n_interno: row.n_interno,
      data_fabrico: row.data_fabrico || null,
      tensao_v: row.tensao_v,
      densidade: row.densidade,
      horas: row.horas,
      ultimo_servico: report?.serviceType || null,
      ultima_intervencao_em: now,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('cliente_equipamentos')
      .upsert(payload, { onConflict: 'cliente_id,categoria,chave' });

    if (error) {
      if (error.code === '42P01') return;
      throw error;
    }

    invalidateClienteEquipamentosCache(report.clientId);
  } catch (err) {
    console.warn('[Equipamentos] Falha ao gravar equipamentos do relatório:', err);
  }
}
