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
    numeroOrdem: row.numero_ordem != null ? Number(row.numero_ordem) : null,
    technicianId: row.tecnico_id,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    forkliftSerial: row.numero_serie || '',
    serviceType: row.tipo_servico,
    date: formatDateOnly(row.data),
    time: formatTime(row.hora),
    status: row.estado || 'scheduled',
    rejectionNote: row.nota_rejeicao ?? null,
    urlPdf: row.url_pdf || null,
    fotoAntes: row.foto_antes || null,
    fotoDepois: row.foto_depois || null,
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
    foto_antes: overrides.foto_antes ?? jobData.fotoAntes ?? null,
    foto_depois: overrides.foto_depois ?? jobData.fotoDepois ?? null,
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
    return 'Sem permissão na tabela trabalhos (RLS). Executa pwa/supabase-rls-authenticated.sql no Supabase (login Auth usa role authenticated).';
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

/** Atualiza cache local a partir de um evento Realtime (INSERT) */
export function mergeJobFromRealtime(row) {
  const job = mapRowToJob(row);
  if (!job) return null;
  if (!jobsCache) jobsCache = [];
  const idx = jobsCache.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobsCache[idx] = job;
  else jobsCache.unshift(job);
  return job;
}

export function invalidateJobsCache() {
  jobsCache = null;
  jobsLoadPromise = null;
}

/**
 * Carrega trabalhos do técnico num intervalo de datas (semana visível no calendário).
 * Faz merge no cache local sem substituir os restantes trabalhos.
 */
export async function ensureTrabalhosSemana(technicianId, startDate, endDate) {
  if (!technicianId || !startDate || !endDate) return [];

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('trabalhos')
    .select('*')
    .eq('tecnico_id', technicianId)
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: true })
    .order('hora', { ascending: true });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar semana de trabalhos:', error);
    throw new Error(formatTrabalhosError(error));
  }

  const weekJobs = (data || []).map(mapRowToJob).filter(Boolean);
  if (!jobsCache) jobsCache = [];

  weekJobs.forEach((job) => {
    const idx = jobsCache.findIndex((j) => j.id === job.id);
    if (idx >= 0) jobsCache[idx] = job;
    else jobsCache.push(job);
  });

  return weekJobs;
}

/** Datas (YYYY-MM-DD) com pelo menos um trabalho do técnico na semana indicada */
export function getTechnicianJobDatesInRange(technicianId, dates) {
  const allowed = new Set(dates);
  const out = new Set();
  getJobsSnapshot().forEach((j) => {
    if (j.technicianId === technicianId && allowed.has(j.date)) {
      out.add(j.date);
    }
  });
  return out;
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
  return patchTrabalho(jobId, { status, rejectionNote });
}

/** Atualiza campos do trabalho (estado, nota, url_pdf, …) */
export async function patchTrabalho(jobId, patch = {}) {
  if (!jobId) return;

  const update = { atualizado_em: new Date().toISOString() };
  if (patch.status !== undefined) update.estado = patch.status;
  if (patch.rejectionNote !== undefined) update.nota_rejeicao = patch.rejectionNote;
  if (patch.urlPdf !== undefined) update.url_pdf = patch.urlPdf;
  if (patch.fotoAntes !== undefined) update.foto_antes = patch.fotoAntes;
  if (patch.fotoDepois !== undefined) update.foto_depois = patch.fotoDepois;

  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('trabalhos').update(update).eq('id', jobId);

  if (error) {
    console.error('[ManuSilva] Erro ao atualizar trabalho:', error);
    throw new Error(formatTrabalhosError(error));
  }

  if (jobsCache) {
    const job = jobsCache.find((j) => j.id === jobId);
    if (job) {
      if (patch.status !== undefined) job.status = patch.status;
      if (patch.rejectionNote !== undefined) job.rejectionNote = patch.rejectionNote;
      if (patch.urlPdf !== undefined) job.urlPdf = patch.urlPdf;
      if (patch.fotoAntes !== undefined) job.fotoAntes = patch.fotoAntes;
      if (patch.fotoDepois !== undefined) job.fotoDepois = patch.fotoDepois;
    }
  }
}

export function getJobsForClient(clientId) {
  const id = String(clientId ?? '');
  return getJobsSnapshot().filter((j) => String(j.clientId) === id);
}

/** Dados mínimos de um relatório → linha `trabalhos` (obtém numero_ordem no INSERT) */
export function jobDataFromReport(report) {
  const submitted = report.submittedAt || new Date().toISOString();
  return {
    technicianId: report.technicianId,
    clientId: report.clientId,
    forkliftSerial: report.forkliftSerial || '',
    serviceType: report.serviceType,
    date: String(submitted).split('T')[0],
    time: '',
    status: 'scheduled',
    rejectionNote: null,
  };
}

export async function insertTrabalhoFromReport(report) {
  return insertTrabalho(jobDataFromReport(report));
}
