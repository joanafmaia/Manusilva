/**
 * Serviços — visita ao cliente (contentor de N relatórios, assinaturas, faturação).
 * Migração SQL: pwa/supabase/migrations/020_servicos_multi_relatorio.sql
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';

let servicosCache = null;
let servicosLoadPromise = null;
let servicosFullyLoaded = false;

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

/** Linha Supabase → formato da app */
export function mapRowToServico(row) {
  if (!row) return null;
  const dados = row.dados && typeof row.dados === 'object' ? row.dados : {};
  return {
    id: String(row.id),
    numeroOrdem: row.numero_ordem != null ? Number(row.numero_ordem) : null,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    date: formatDateOnly(row.data),
    time: formatTime(row.hora),
    technicianIds: row.tecnico_ids || '',
    status: row.estado || 'scheduled',
    rejectionNote: row.nota_rejeicao ?? null,
    submittedAt: row.submetido_em || '',
    approvedAt: row.aprovado_em || null,
    clientEmailSentAt: row.email_cliente_enviado_em || dados.visitClienteEmailSentAt || null,
    faturacaoStatus: row.faturacao_status || null,
    numeroFatura: row.numero_fatura || null,
    dataFatura: row.data_fatura || null,
    valorFaturado:
      row.valor_faturado != null && row.valor_faturado !== ''
        ? Number(row.valor_faturado)
        : null,
    faturaCondicaoPagamento: row.condicao_pagamento || null,
    statusRecebimento: row.status_recebimento || null,
    dataVencimento: row.data_vencimento || null,
    dataRecebimento: row.data_recebimento || null,
    data: {
      signatures: dados.signatures || {},
      values: dados.values || {},
      ...dados,
    },
  };
}

export function mapServicoToRow(servico, overrides = {}) {
  const data = servico.data || {};
  const signatures = data.signatures || {};
  const { signatures: _s, values: _v, ...restDados } = data;
  return {
    cliente_id: servico.clientId != null && servico.clientId !== '' ? Number(servico.clientId) : null,
    data: formatDateOnly(servico.date || overrides.data),
    hora: servico.time || null,
    tecnico_ids: servico.technicianIds || overrides.tecnico_ids || '',
    estado: overrides.estado ?? servico.status ?? 'scheduled',
    nota_rejeicao: overrides.nota_rejeicao ?? servico.rejectionNote ?? null,
    submetido_em: servico.submittedAt || overrides.submetido_em || null,
    aprovado_em: servico.approvedAt || overrides.aprovado_em || null,
    email_cliente_enviado_em: servico.clientEmailSentAt || overrides.email_cliente_enviado_em || null,
    faturacao_status: servico.faturacaoStatus ?? overrides.faturacao_status ?? null,
    numero_fatura: servico.numeroFatura ?? overrides.numero_fatura ?? null,
    data_fatura: servico.dataFatura ?? overrides.data_fatura ?? null,
    valor_faturado: servico.valorFaturado ?? overrides.valor_faturado ?? null,
    condicao_pagamento: servico.faturaCondicaoPagamento ?? overrides.condicao_pagamento ?? null,
    status_recebimento: servico.statusRecebimento ?? overrides.status_recebimento ?? null,
    data_vencimento: servico.dataVencimento ?? overrides.data_vencimento ?? null,
    data_recebimento: servico.dataRecebimento ?? overrides.data_recebimento ?? null,
    dados: {
      ...restDados,
      values: data.values || {},
      signatures,
    },
  };
}

export function formatServicosError(err) {
  if (!err) return 'Erro ao aceder aos serviços.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === 'PGRST205' || /Could not find the table|relation.*does not exist/i.test(msg)) {
    return 'Tabela "servicos" não encontrada. Executa pwa/supabase/migrations/020_servicos_multi_relatorio.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela servicos (RLS).';
  }

  return msg || 'Erro ao aceder aos serviços.';
}

export function getServicosSnapshot() {
  return servicosCache ? [...servicosCache] : [];
}

export function isServicosCacheLoaded() {
  return servicosFullyLoaded && servicosCache !== null;
}

export async function ensureServicosLoaded(force = false) {
  if (servicosFullyLoaded && servicosCache && !force) return servicosCache;
  if (!servicosLoadPromise || force) {
    servicosLoadPromise = loadServicosFromSupabase().catch((err) => {
      servicosLoadPromise = null;
      throw err;
    });
  }
  return servicosLoadPromise;
}

/** Não falha o arranque se a migração 020 ainda não foi aplicada no Supabase. */
export async function ensureServicosLoadedSafe(force = false) {
  try {
    return await ensureServicosLoaded(force);
  } catch (err) {
    const msg = formatServicosError(err);
    if (/tabela "servicos" não encontrada|Could not find the table|relation.*servicos/i.test(msg)) {
      console.warn('[ManuSilva] Tabela servicos ainda não existe — executar migração 020.');
      servicosCache = [];
      servicosFullyLoaded = true;
      return [];
    }
    throw err;
  }
}

export function removeServicoFromCache(servicoId) {
  if (!servicosCache || servicoId == null) return;
  const id = String(servicoId);
  servicosCache = servicosCache.filter((s) => String(s.id) !== id);
}

/**
 * Carrega serviços do técnico num intervalo de datas (merge no cache).
 * Espelha ensureTrabalhosSemana — necessário para visitas criadas pelo RH.
 */
export async function ensureServicosSemana(technicianId, startDate, endDate) {
  if (!technicianId || !startDate || !endDate) return [];

  const { getTechnician } = await import('./entity-lookups.js');
  const tech = getTechnician(technicianId);
  const techName = tech?.name || String(technicianId);

  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
    .ilike('tecnico_ids', `%${techName}%`)
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: true })
    .order('hora', { ascending: true });

  if (error) {
    const msg = formatServicosError(error);
    if (/tabela "servicos" não encontrada|Could not find the table|relation.*servicos/i.test(msg)) {
      console.warn('[ManuSilva] Tabela servicos ainda não existe — executar migração 020.');
      return [];
    }
    console.error('[ManuSilva] Erro ao carregar semana de serviços:', error);
    throw new Error(msg);
  }

  const weekServicos = (data || []).map(mapRowToServico).filter(Boolean);
  if (!servicosCache) servicosCache = [];

  weekServicos.forEach((servico) => {
    mergeServicoInCache(servico);
  });

  return weekServicos;
}

async function loadServicosFromSupabase() {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar serviços:', error);
    throw new Error(formatServicosError(error));
  }

  servicosCache = (data || []).map(mapRowToServico).filter(Boolean);
  servicosFullyLoaded = true;
  console.info(`[ManuSilva] ${servicosCache.length} serviço(s) carregados do Supabase.`);
  return servicosCache;
}

export function invalidateServicosCache() {
  servicosCache = null;
  servicosLoadPromise = null;
  servicosFullyLoaded = false;
}

export function mergeServicoInCache(servico) {
  if (!servico?.id) return;
  if (!servicosCache) servicosCache = [];
  const id = String(servico.id);
  servicosCache = servicosCache.filter((s) => String(s.id) !== id);
  servicosCache.unshift(servico);
}

export function mergeServicoFromRealtime(row) {
  const servico = mapRowToServico(row);
  if (!servico) return null;
  mergeServicoInCache(servico);
  return servico;
}

export function getServico(id) {
  if (id == null) return null;
  const key = String(id);
  return getServicosSnapshot().find((s) => String(s.id) === key) || null;
}

export async function insertServico(servicoData) {
  const supabase = await getAuthenticatedSupabaseClient();
  const row = mapServicoToRow(servicoData, { estado: 'scheduled' });

  const { data, error } = await supabase.from('servicos').insert(row).select();

  if (error) {
    console.error('[ManuSilva] Erro ao criar serviço:', error);
    throw new Error(formatServicosError(error));
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  const servico = mapRowToServico(inserted);
  if (servico) mergeServicoInCache(servico);
  return servico;
}

export async function updateServico(servicoId, patch) {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('servicos')
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq('id', servicoId)
    .select();

  if (error) {
    console.error('[ManuSilva] Erro ao atualizar serviço:', error);
    throw new Error(formatServicosError(error));
  }

  const row = Array.isArray(data) ? data[0] : data;
  const servico = mapRowToServico(row);
  if (servico) mergeServicoInCache(servico);
  return servico;
}

/**
 * Estados derivados dos relatórios do serviço (para UI).
 * @param {object} servico
 * @param {object[]} reports — relatórios com servicoId
 */
export function deriveServicoStatusFromReports(servico, reports = []) {
  if (!reports.length) {
    return servico?.status === 'approved' ? 'approved' : servico?.status || 'scheduled';
  }
  if (reports.some((r) => r.status === 'pending_review')) return 'pending_review';
  if (reports.every((r) => r.status === 'approved')) return 'approved';
  if (reports.some((r) => r.status === 'rejected')) return 'in_progress';
  if (reports.some((r) => r.status === 'draft')) return 'in_progress';
  return servico?.status || 'scheduled';
}

/** Todos os relatórios do serviço estão aprovados? */
export function isServicoReadyForClientEmail(reports = []) {
  if (!reports.length) return false;
  return reports.every((r) => r.status === 'approved');
}
