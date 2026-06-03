/**
 * Trabalhos agendados — Supabase (tabela `trabalhos`)
 */

import { getSupabaseClient } from './supabase-client.js';

let jobsCache = null;
let jobsLoadPromise = null;

function parseClientId(clientId) {
  if (clientId == null || clientId === '') return null;
  const n = Number(clientId);
  return Number.isFinite(n) ? n : null;
}

function formatDateOnly(value) {
  if (!value) return '';
  const s = String(value);
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

function formatTime(value) {
  if (!value) return '';
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Linha Supabase → formato da app (manusilva_db.jobs) */
export function mapRowToJob(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    technicianId: row.tecnico_id,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    forkliftSerial: row.numero_serie || '',
    serviceType: row.tipo_servico,
    date: formatDateOnly(row.data),
    time: formatTime(row.hora),
    status: row.estado || 'scheduled',
    rejectionNote: row.nota_rejeicao ?? null,
  };
}

function mapJobToRow(jobData, overrides = {}) {
  return {
    tecnico_id: jobData.technicianId,
    cliente_id: parseClientId(jobData.clientId),
    numero_serie: jobData.forkliftSerial || null,
    tipo_servico: jobData.serviceType,
    data: jobData.date,
    hora: jobData.time || null,
    estado: overrides.estado ?? jobData.status ?? 'scheduled',
    nota_rejeicao: overrides.nota_rejeicao ?? jobData.rejectionNote ?? null,
  };
}

export function formatTrabalhosError(err) {
  if (!err) return 'Erro ao aceder aos trabalhos.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === 'PGRST205' || /Could not find the table|relation.*does not exist/i.test(msg)) {
    return 'Tabela "trabalhos" não encontrada. Executa pwa/supabase-schema-operacoes.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela trabalhos (RLS). Executa pwa/supabase-schema-operacoes.sql.';
  }

  return msg || 'Erro ao aceder aos trabalhos.';
}

export function getJobsSnapshot() {
  return jobsCache ? [...jobsCache] : [];
}

export async function ensureJobsLoaded(force = false) {
  if (jobsCache && !force) return jobsCache;
  if (!jobsLoadPromise || force) {
    jobsLoadPromise = loadJobsFromSupabase().catch((err) => {
      jobsLoadPromise = null;
      throw err;
    });
  }
  return jobsLoadPromise;
}

async function loadJobsFromSupabase() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('trabalhos')
    .select('*')
    .order('data', { ascending: true })
    .order('hora', { ascending: true });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar trabalhos:', error);
    throw new Error(formatTrabalhosError(error));
  }

  jobsCache = (data || []).map(mapRowToJob).filter(Boolean);
  console.info(`[ManuSilva] ${jobsCache.length} trabalho(s) carregados do Supabase.`);
  return jobsCache;
}

export function invalidateJobsCache() {
  jobsCache = null;
  jobsLoadPromise = null;
}

export async function insertTrabalho(jobData) {
  const supabase = await getSupabaseClient();
  const row = mapJobToRow(jobData, { estado: 'scheduled', nota_rejeicao: null });

  const { data, error } = await supabase.from('trabalhos').insert(row).select();

  if (error) {
    console.error('[ManuSilva] Erro ao criar trabalho:', error);
    throw new Error(formatTrabalhosError(error));
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted) {
    await ensureJobsLoaded(true);
    return null;
  }

  const job = mapRowToJob(inserted);
  if (job) {
    if (!jobsCache) jobsCache = [];
    jobsCache.push(job);
  }
  return job;
}

export async function deleteTrabalho(jobId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('trabalhos').delete().eq('id', jobId);

  if (error) {
    console.error('[ManuSilva] Erro ao eliminar trabalho:', error);
    throw new Error(formatTrabalhosError(error));
  }

  if (jobsCache) {
    jobsCache = jobsCache.filter((j) => j.id !== jobId);
  }
}

export async function patchTrabalhoStatus(jobId, { status, rejectionNote = null }) {
  if (!jobId) return;

  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('trabalhos')
    .update({
      estado: status,
      nota_rejeicao: rejectionNote,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error('[ManuSilva] Erro ao atualizar trabalho:', error);
    throw new Error(formatTrabalhosError(error));
  }

  if (jobsCache) {
    const job = jobsCache.find((j) => j.id === jobId);
    if (job) {
      job.status = status;
      job.rejectionNote = rejectionNote;
    }
  }
}
