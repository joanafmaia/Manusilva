/**
 * Relatórios de intervenção — Supabase (tabela `relatorios`)
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import {
  ensureJobsLoaded,
  getJobsSnapshot,
  insertTrabalhoFromReport,
} from './trabalhos-db.js';
import { legacyPrazoToCondicao } from './billing-constants.js';
import { sameEntityId } from './entity-id.js';

let reportsCache = null;
/** true só depois de um SELECT completo à tabela relatorios (não rascunhos locais). */
let reportsFullyLoaded = false;
let reportsLoadPromise = null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ids do servidor (trabalhos/relatorios) são uuid — ids locais/mock não são. */
export function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function parseClientId(clientId) {
  if (clientId == null || clientId === '') return null;
  const n = Number(clientId);
  return Number.isFinite(n) ? n : null;
}

/** Linha Supabase → formato da app (manusilva_db.reports) */
export function mapRowToReport(row) {
  if (!row) return null;
  const dados = row.dados && typeof row.dados === 'object' ? row.dados : {};

  return {
    id: String(row.id),
    jobId: row.trabalho_id ? String(row.trabalho_id) : '',
    technicianId: row.tecnico_id,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    forkliftSerial: row.numero_serie || '',
    serviceType: row.tipo_servico,
    status: row.estado || 'draft',
    submittedAt: row.submetido_em || '',
    approvedAt: row.aprovado_em || null,
    pdfFilename: row.nome_pdf || null,
    rejectionNote: row.nota_rejeicao ?? null,
    faturacaoStatus: row.faturacao_status || null,
    numeroFatura: row.numero_fatura || null,
    dataFatura: row.data_fatura || null,
    valorFaturado:
      row.valor_faturado != null && row.valor_faturado !== ''
        ? Number(row.valor_faturado)
        : null,
    faturaCondicaoPagamento:
      row.condicao_pagamento ||
      legacyPrazoToCondicao(row.prazo_pagamento) ||
      null,
    statusRecebimento: row.status_recebimento || row.pagamento_status || null,
    dataVencimento: row.data_vencimento || null,
    data: {
      values: dados.values || {},
      signatures: dados.signatures || {},
      photos: Array.isArray(dados.photos) ? dados.photos : [],
      fotoAntesUrl: dados.fotoAntesUrl || null,
      fotoDepoisUrl: dados.fotoDepoisUrl || null,
      urlPdfs: Array.isArray(dados.urlPdfs) ? dados.urlPdfs : null,
      pdfFilenames: Array.isArray(dados.pdfFilenames) ? dados.pdfFilenames : null,
      urlPdfOrcamento: dados.urlPdfOrcamento || null,
      orcamentoPdfFilename: dados.orcamentoPdfFilename || null,
      urlDocxOrcamento: dados.urlDocxOrcamento || null,
      orcamentoDocxFilename: dados.orcamentoDocxFilename || null,
      orcamento: dados.orcamento && typeof dados.orcamento === 'object' ? dados.orcamento : null,
    },
  };
}

export function mapReportToRow(report) {
  const data = report.data || {};
  return {
    trabalho_id: report.jobId || null,
    tecnico_id: report.technicianId,
    cliente_id: parseClientId(report.clientId),
    numero_serie: report.forkliftSerial || null,
    tipo_servico: report.serviceType,
    estado: report.status || 'draft',
    submetido_em: report.submittedAt || null,
    aprovado_em: report.approvedAt || null,
    nome_pdf: report.pdfFilename || null,
    nota_rejeicao: report.rejectionNote ?? null,
    faturacao_status: report.faturacaoStatus || null,
    numero_fatura: report.numeroFatura || null,
    data_fatura: report.dataFatura || null,
    valor_faturado:
      report.valorFaturado != null && Number.isFinite(Number(report.valorFaturado))
        ? Number(report.valorFaturado)
        : null,
    condicao_pagamento: report.faturaCondicaoPagamento || null,
    status_recebimento: report.statusRecebimento || null,
    data_vencimento: report.dataVencimento || null,
    dados: {
      values: data.values || {},
      signatures: data.signatures || {},
      photos: Array.isArray(data.photos) ? data.photos : [],
      fotoAntesUrl: data.fotoAntesUrl || null,
      fotoDepoisUrl: data.fotoDepoisUrl || null,
      urlPdfs: Array.isArray(data.urlPdfs) ? data.urlPdfs : null,
      pdfFilenames: Array.isArray(data.pdfFilenames) ? data.pdfFilenames : null,
      urlPdfOrcamento: data.urlPdfOrcamento || null,
      orcamentoPdfFilename: data.orcamentoPdfFilename || null,
      urlDocxOrcamento: data.urlDocxOrcamento || null,
      orcamentoDocxFilename: data.orcamentoDocxFilename || null,
      orcamento: data.orcamento && typeof data.orcamento === 'object' ? data.orcamento : null,
    },
  };
}

export function formatRelatoriosError(err) {
  if (!err) return 'Erro ao aceder aos relatórios.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === 'PGRST205' || /Could not find the table|relation.*does not exist/i.test(msg)) {
    return 'Tabela "relatorios" não encontrada. Executa pwa/supabase-schema-operacoes.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela relatorios (RLS). Inicie sessão e confirme migrations/007_lockdown_anon.sql (role authenticated).';
  }

  return msg || 'Erro ao aceder aos relatórios.';
}

export function getReportsSnapshot() {
  return reportsCache ? [...reportsCache] : [];
}

export async function ensureReportsLoaded(force = false) {
  // O cache pode existir só com rascunhos locais hidratados antes do arranque;
  // nesse caso o carregamento do servidor ainda tem de acontecer.
  if (reportsFullyLoaded && reportsCache && !force) return reportsCache;
  if (!reportsLoadPromise || force) {
    reportsLoadPromise = loadReportsFromSupabase().catch((err) => {
      reportsLoadPromise = null;
      throw err;
    });
  }
  return reportsLoadPromise;
}

async function loadReportsFromSupabase() {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('relatorios')
    .select('*')
    .order('atualizado_em', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar relatórios:', error);
    throw new Error(formatRelatoriosError(error));
  }

  reportsCache = (data || []).map(mapRowToReport).filter(Boolean);
  reportsFullyLoaded = true;
  console.info(`[ManuSilva] ${reportsCache.length} relatório(s) carregados do Supabase.`);
  return reportsCache;
}

export function invalidateReportsCache() {
  reportsCache = null;
  reportsLoadPromise = null;
  reportsFullyLoaded = false;
}

function upsertCacheEntry(report) {
  if (!report) return;
  if (!reportsCache) reportsCache = [];
  const idx = reportsCache.findIndex(
    (r) => sameEntityId(r.id, report.id) || (report.jobId && sameEntityId(r.jobId, report.jobId)),
  );
  if (idx >= 0) reportsCache[idx] = report;
  else reportsCache.unshift(report);
}

/** Atualiza cache em memória (ex.: rascunho local antes de sincronizar com Supabase). */
export function mergeReportInCache(report) {
  upsertCacheEntry(report);
}

/** Atualiza cache local a partir de um evento Realtime (INSERT/UPDATE) */
export function mergeReportFromRealtime(row) {
  const report = mapRowToReport(row);
  if (!report) return null;
  upsertCacheEntry(report);
  return report;
}

/**
 * Remove relatório do cache pelo id (evento Realtime DELETE).
 * Devolve o relatório removido (para sabermos o jobId associado).
 */
export function removeReportFromCache(reportId) {
  if (reportId == null || !reportsCache) return null;
  const id = String(reportId);
  const removed = reportsCache.find((r) => String(r.id) === id) || null;
  reportsCache = reportsCache.filter((r) => String(r.id) !== id);
  return removed;
}

/** Remove do cache todos os relatórios de um trabalho (trabalho eliminado pelo RH). */
export function removeReportsForJobFromCache(jobId) {
  if (jobId == null || !reportsCache) return;
  const id = String(jobId);
  reportsCache = reportsCache.filter((r) => String(r.jobId ?? '') !== id);
}

function findExistingReportId(report) {
  if (report.id && isUuid(report.id)) return report.id;
  const byJob = reportsCache?.find((r) => report.jobId && sameEntityId(r.jobId, report.jobId));
  if (byJob?.id && isUuid(byJob.id)) return byJob.id;
  return null;
}

/**
 * Garante que existe um trabalho em Supabase (com numero_ordem) antes de gravar o relatório.
 * @returns {{ report: object, job: object | null }}
 */
async function ensureTrabalhoForReport(report) {
  await ensureJobsLoaded();
  if (report.jobId) {
    const job = getJobsSnapshot().find((j) => j.id === report.jobId);
    if (job) return { report, job };
  }

  const job = await insertTrabalhoFromReport(report);
  if (!job?.id) {
    throw new Error('Não foi possível criar o trabalho para este relatório.');
  }

  return { report: { ...report, jobId: job.id }, job };
}

/** Cria ou atualiza relatório (um por trabalho, identificado por trabalho_id) */
export async function upsertRelatorio(report) {
  const { report: linkedReport } = await ensureTrabalhoForReport(report);

  const supabase = await getAuthenticatedSupabaseClient();
  const row = mapReportToRow(linkedReport);
  const existingId = findExistingReportId(linkedReport);

  let data;
  let error;

  if (existingId) {
    ({ data, error } = await supabase
      .from('relatorios')
      .update(row)
      .eq('id', existingId)
      .select());
  } else {
    ({ data, error } = await supabase.from('relatorios').insert(row).select());
  }

  if (error) {
    console.error('[ManuSilva] Erro ao gravar relatório:', error);
    throw new Error(formatRelatoriosError(error));
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted) {
    await ensureReportsLoaded(true);
    return reportsCache?.find((r) => sameEntityId(r.jobId, linkedReport.jobId)) || null;
  }

  const saved = mapRowToReport(inserted);
  upsertCacheEntry(saved);
  return saved;
}

export async function updateRelatorio(reportId, patch) {
  const current = reportsCache?.find((r) => r.id === reportId);
  if (!current) {
    await ensureReportsLoaded();
  }
  const base = reportsCache?.find((r) => r.id === reportId);
  if (!base) throw new Error('Relatório não encontrado.');

  const merged = {
    ...base,
    ...patch,
    data: patch.data ? { ...base.data, ...patch.data } : base.data,
  };

  return upsertRelatorio(merged);
}

export async function deleteRelatoriosByTrabalho(trabalhoId) {
  if (!trabalhoId) return;
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase.from('relatorios').delete().eq('trabalho_id', trabalhoId);
  if (error) {
    console.error('[ManuSilva] Erro ao eliminar relatórios do trabalho:', error);
    throw new Error(formatRelatoriosError(error));
  }
  if (reportsCache) {
    reportsCache = reportsCache.filter((r) => r.jobId !== trabalhoId);
  }
}
