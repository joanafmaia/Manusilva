/**
 * Relatórios de intervenção — Supabase (tabela `relatorios`)
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import {
  ensureJobsLoaded,
  getJobsSnapshot,
  insertTrabalhoFromReport,
} from './trabalhos-db.js';
import { getServicosSnapshot } from './servicos-db.js';
import { legacyPrazoToCondicao } from './billing-constants.js';
import { sameEntityId } from './entity-id.js';
import { reportIsCommercialOrcamento } from './pedido-orcamento.js';
import { isReportLocallyDeleted, filterOutLocallyDeletedReports } from './report-deleted-local.js';
import {
  AUDIT_RELATORIO_COLUMNS,
  buildRelatorioAuditDados,
  isMissingAuditColumnError,
  readAuditField,
  stripAuditFromRelatorioRow,
  withOptionalAuditColumns,
} from './audit-fields.js';

let reportsCache = null;
/** Índice lazy jobId → relatório canónico (deduplicado). */
let reportsByJobIdIndex = null;
/** Índice lazy servicoId → relatórios da visita (lookup O(k) em vez de varrer todo o cache). */
let reportsByServicoIdIndex = null;
/** true só depois de um SELECT completo à tabela relatorios (não rascunhos locais). */
let reportsFullyLoaded = false;
let reportsLoadPromise = null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ids do servidor (trabalhos/relatorios) são uuid — ids locais/mock não são. */
export function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

/** Prioridade ao escolher um relatório canónico por trabalho/OP nas listas. */
const DISPLAY_REPORT_STATUS_PRIORITY = {
  approved: 50,
  pending_review: 40,
  rejected: 35,
  draft: 30,
};

function compareReportsForDisplayDedupe(a, b) {
  const pa = DISPLAY_REPORT_STATUS_PRIORITY[a?.status] || 0;
  const pb = DISPLAY_REPORT_STATUS_PRIORITY[b?.status] || 0;
  if (pa !== pb) return pa - pb;
  const oaTech = reportIsCommercialOrcamento(a) ? 0 : 1;
  const obTech = reportIsCommercialOrcamento(b) ? 0 : 1;
  if (oaTech !== obTech) return oaTech - obTech;
  const ta = String(a?.submittedAt || a?.approvedAt || '');
  const tb = String(b?.submittedAt || b?.approvedAt || '');
  if (ta !== tb) return ta.localeCompare(tb);
  const oa = String(a?.data?.values?.pedido_orcamento || '').toLowerCase() === 'sim' ? 0 : 1;
  const ob = String(b?.data?.values?.pedido_orcamento || '').toLowerCase() === 'sim' ? 0 : 1;
  return oa - ob;
}

/** Evita listar o mesmo trabalho duas vezes no painel RH (submissões duplicadas). */
export function dedupeReportsByJobPreferNewest(reports = []) {
  const byJob = new Map();
  const withoutJob = [];

  for (const report of reports) {
    if (!report?.jobId) {
      withoutJob.push(report);
      continue;
    }
    const key = String(report.jobId);
    const existing = byJob.get(key);
    if (!existing || compareReportsForDisplayDedupe(existing, report) < 0) {
      byJob.set(key, report);
    }
  }

  return [...withoutJob, ...byJob.values()];
}

function resolveReportNumeroOrdem(report) {
  if (report?.numeroOrdem != null && Number.isFinite(Number(report.numeroOrdem))) {
    return Number(report.numeroOrdem);
  }
  if (!report?.jobId) return null;
  const job = getJobsSnapshot().find((j) => sameEntityId(j.id, report.jobId));
  const n = job?.numeroOrdem;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : null;
}

/**
 * Uma OP oficial por número — evita duplicados quando existem vários relatórios/trabalhos
 * com o mesmo numero_ordem (erro de dados ou submissões repetidas).
 */
export function dedupeReportsByNumeroOrdem(reports = []) {
  const byOrdem = new Map();
  const rest = [];

  for (const report of reports) {
    const ordem = resolveReportNumeroOrdem(report);
    if (ordem == null) {
      rest.push(report);
      continue;
    }
    const key = String(ordem);
    const existing = byOrdem.get(key);
    if (!existing || compareReportsForDisplayDedupe(existing, report) < 0) {
      byOrdem.set(key, report);
    }
  }

  return [...rest, ...byOrdem.values()];
}

/** Deduplicação completa para listas (trabalho + OP). */
export function dedupeReportsForDisplay(reports = []) {
  return dedupeReportsByNumeroOrdem(dedupeReportsByJobPreferNewest(reports));
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
    servicoId: row.servico_id ? String(row.servico_id) : '',
    technicianId: row.tecnico_id,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    forkliftSerial: row.numero_serie || '',
    serviceType: row.tipo_servico,
    status: row.estado || 'draft',
    submittedAt: row.submetido_em || '',
    approvedAt: row.aprovado_em || null,
    approvedBy: readAuditField(row, 'aprovado_por'),
    invoicedBy: readAuditField(row, 'faturado_por'),
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
    dataRecebimento: row.data_recebimento || null,
    numeroOrdem:
      row.numero_ordem != null && row.numero_ordem !== ''
        ? Number(row.numero_ordem)
        : null,
    data: {
      values: dados.values || {},
      signatures: dados.signatures || {},
      photos: Array.isArray(dados.photos) ? dados.photos : [],
      fotoAntesUrl: dados.fotoAntesUrl || null,
      fotoDepoisUrl: dados.fotoDepoisUrl || null,
      visitClienteEmailSentAt: dados.visitClienteEmailSentAt || null,
      urlPdfs: Array.isArray(dados.urlPdfs) ? dados.urlPdfs : null,
      pdfFilenames: Array.isArray(dados.pdfFilenames) ? dados.pdfFilenames : null,
      urlPdfOrcamento: dados.urlPdfOrcamento || null,
      orcamentoPdfFilename: dados.orcamentoPdfFilename || null,
      urlDocxOrcamento: dados.urlDocxOrcamento || null,
      orcamentoDocxFilename: dados.orcamentoDocxFilename || null,
      orcamento: dados.orcamento && typeof dados.orcamento === 'object' ? dados.orcamento : null,
      orcamentoOrigem: dados.orcamentoOrigem || null,
      technicianCompleted: dados.technicianCompleted === true,
      audit: dados.audit && typeof dados.audit === 'object' ? dados.audit : undefined,
    },
  };
}

function resolveServicoIdForReport(report) {
  const explicit = String(report?.servicoId || '').trim();
  if (explicit) return explicit;

  const jobId = String(report?.jobId || '').trim();
  if (!jobId) return null;

  const job = getJobsSnapshot().find((row) => sameEntityId(row.id, jobId));
  const fromJob = String(job?.servicoId || '').trim();
  return fromJob || null;
}

export function mapReportToRow(report) {
  const data = report.data || {};
  const dados = buildRelatorioAuditDados(
    {
      values: data.values || {},
      signatures: data.signatures || {},
      photos: Array.isArray(data.photos) ? data.photos : [],
      fotoAntesUrl: data.fotoAntesUrl || null,
      fotoDepoisUrl: data.fotoDepoisUrl || null,
      visitClienteEmailSentAt: data.visitClienteEmailSentAt || null,
      urlPdfs: Array.isArray(data.urlPdfs) ? data.urlPdfs : null,
      pdfFilenames: Array.isArray(data.pdfFilenames) ? data.pdfFilenames : null,
      urlPdfOrcamento: data.urlPdfOrcamento || null,
      orcamentoPdfFilename: data.orcamentoPdfFilename || null,
      urlDocxOrcamento: data.urlDocxOrcamento || null,
      orcamentoDocxFilename: data.orcamentoDocxFilename || null,
      orcamento: data.orcamento && typeof data.orcamento === 'object' ? data.orcamento : null,
      orcamentoOrigem: data.orcamentoOrigem || null,
      technicianCompleted: data.technicianCompleted === true ? true : null,
      audit: data.audit && typeof data.audit === 'object' ? data.audit : undefined,
    },
    report,
  );
  return withOptionalAuditColumns(
    {
      trabalho_id: report.jobId || null,
      servico_id: resolveServicoIdForReport(report),
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
      data_recebimento: report.dataRecebimento || null,
      numero_ordem:
        report.numeroOrdem != null && Number.isFinite(Number(report.numeroOrdem))
          ? Number(report.numeroOrdem)
          : null,
      dados,
    },
    {
      aprovado_por: report.approvedBy,
      faturado_por: report.invoicedBy,
    },
    AUDIT_RELATORIO_COLUMNS,
  );
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

function invalidateReportsJobIndex() {
  reportsByJobIdIndex = null;
  reportsByServicoIdIndex = null;
}

function resolveServicoIdForReportIndex(report, servicoIds, jobsById) {
  if (!report) return '';
  const direct = report.servicoId ? String(report.servicoId) : '';
  if (direct) return direct;
  const jobId = report.jobId ? String(report.jobId) : '';
  if (!jobId) return '';
  if (servicoIds.has(jobId)) return jobId;
  const job = jobsById.get(jobId);
  const viaJob = job?.servicoId ? String(job.servicoId) : '';
  if (viaJob && servicoIds.has(viaJob)) return viaJob;
  return '';
}

function rebuildReportsServicoIndex() {
  reportsByServicoIdIndex = new Map();
  if (!reportsCache?.length) return reportsByServicoIdIndex;

  const servicoIds = new Set(getServicosSnapshot().map((s) => String(s.id)));
  const jobsById = new Map(getJobsSnapshot().map((j) => [String(j.id), j]));

  for (const report of filterOutLocallyDeletedReports(reportsCache)) {
    const sid = resolveServicoIdForReportIndex(report, servicoIds, jobsById);
    if (!sid) continue;
    if (!reportsByServicoIdIndex.has(sid)) reportsByServicoIdIndex.set(sid, []);
    reportsByServicoIdIndex.get(sid).push(report);
  }
  return reportsByServicoIdIndex;
}

/** Relatórios ligados a uma visita — lookup indexado (fallback ordem+cliente em servicos-panel-utils). */
export function getReportsSnapshotByServicoId(servicoId) {
  if (servicoId == null || servicoId === '') return [];
  const key = String(servicoId);
  if (!reportsByServicoIdIndex) rebuildReportsServicoIndex();
  const bucket = reportsByServicoIdIndex.get(key);
  return bucket ? [...bucket] : [];
}

function rebuildReportsJobIndex() {
  reportsByJobIdIndex = new Map();
  if (!reportsCache?.length) return reportsByJobIdIndex;
  for (const report of dedupeReportsForDisplay(reportsCache)) {
    if (!report?.jobId) continue;
    reportsByJobIdIndex.set(String(report.jobId), report);
  }
  return reportsByJobIdIndex;
}

/** Relatório canónico para um trabalho — O(1) após índice, sem copiar todo o cache. */
export function getCanonicalReportForJob(jobId) {
  if (jobId == null || jobId === '') return null;
  const key = String(jobId);
  if (!reportsByJobIdIndex) rebuildReportsJobIndex();
  return reportsByJobIdIndex.get(key) || null;
}

export function getReportsSnapshot() {
  return reportsCache ? [...reportsCache] : [];
}

export function replaceReportsCache(reports = []) {
  reportsCache = Array.isArray(reports)
    ? filterOutLocallyDeletedReports(reports.map((report) => ({ ...report })))
    : [];
  reportsFullyLoaded = reportsCache.length > 0;
  invalidateReportsJobIndex();
}

async function tryHydrateReportsFromOfflineSnapshot() {
  const { isEffectivelyOffline } = await import('./network-status.js');
  if (!isEffectivelyOffline()) return false;
  const { hydrateOpsSnapshot } = await import('./ops-snapshot.js');
  return hydrateOpsSnapshot();
}

async function hydrateLocalReportsIfBrowser() {
  if (typeof window === 'undefined') return;
  try {
    const { hydrateLocalReportsIntoCache } = await import('./report-local-storage.js');
    await hydrateLocalReportsIntoCache();
  } catch (err) {
    console.warn('[ManuSilva] Hidratar rascunhos locais:', err);
  }
}

export async function ensureReportsLoaded(force = false) {
  // O cache pode existir só com rascunhos locais hidratados antes do arranque;
  // nesse caso o carregamento do servidor ainda tem de acontecer.
  if (reportsFullyLoaded && reportsCache && !force) {
    await hydrateLocalReportsIfBrowser();
    return reportsCache;
  }

  const { isEffectivelyOffline } = await import('./network-status.js');
  if (isEffectivelyOffline() && !force) {
    if (reportsCache?.length) {
      await hydrateLocalReportsIfBrowser();
      return reportsCache;
    }
    const hydrated = await tryHydrateReportsFromOfflineSnapshot();
    if (hydrated && reportsCache?.length) {
      await hydrateLocalReportsIfBrowser();
      return reportsCache;
    }
    await hydrateLocalReportsIfBrowser();
    return reportsCache || [];
  }

  if (!reportsLoadPromise || force) {
    reportsLoadPromise = loadReportsFromSupabase()
      .then(async (cache) => {
        await hydrateLocalReportsIfBrowser();
        return cache;
      })
      .catch(async (err) => {
        reportsLoadPromise = null;
        const hydrated = await tryHydrateReportsFromOfflineSnapshot();
        if (hydrated && reportsCache?.length) {
          await hydrateLocalReportsIfBrowser();
          return reportsCache;
        }
        throw err;
      });
  }
  return reportsLoadPromise;
}

const RELATORIOS_IN_BATCH_SIZE = 80;

/**
 * Carrega relatórios só dos trabalhos indicados (merge no cache).
 * Útil no arranque do técnico — evita descarregar todos os relatórios de imediato.
 */
export async function ensureRelatoriosForTrabalhos(jobIds = []) {
  const ids = [...new Set(jobIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  const { isEffectivelyOffline } = await import('./network-status.js');
  if (isEffectivelyOffline()) {
    await ensureReportsLoaded();
    const idSet = new Set(ids);
    return getReportsSnapshot().filter((report) => idSet.has(String(report.jobId || '')));
  }

  const supabase = await getAuthenticatedSupabaseClient();
  const loaded = [];

  for (let offset = 0; offset < ids.length; offset += RELATORIOS_IN_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + RELATORIOS_IN_BATCH_SIZE);
    const { data, error } = await supabase.from('relatorios').select('*').in('trabalho_id', batch);

    if (error) {
      console.error('[ManuSilva] Erro ao carregar relatórios dos trabalhos:', error);
      throw new Error(formatRelatoriosError(error));
    }

    for (const row of data || []) {
      const report = mapRowToReport(row);
      if (report) {
        upsertCacheEntry(report);
        loaded.push(report);
      }
    }
  }

  return loaded;
}

/**
 * Carrega relatórios ligados a serviços (servico_id) — merge no cache.
 */
export async function ensureRelatoriosForServicos(servicoIds = []) {
  const ids = [...new Set(servicoIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  const { isEffectivelyOffline } = await import('./network-status.js');
  if (isEffectivelyOffline()) {
    await ensureReportsLoaded();
    const idSet = new Set(ids);
    return getReportsSnapshot().filter((report) => idSet.has(String(report.servicoId || '')));
  }

  const supabase = await getAuthenticatedSupabaseClient();
  const loaded = [];

  for (let offset = 0; offset < ids.length; offset += RELATORIOS_IN_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + RELATORIOS_IN_BATCH_SIZE);
    const orFilter = batch
      .flatMap((id) => [`servico_id.eq.${id}`, `trabalho_id.eq.${id}`])
      .join(',');
    const { data, error } = await supabase.from('relatorios').select('*').or(orFilter);

    if (error) {
      console.error('[ManuSilva] Erro ao carregar relatórios dos serviços:', error);
      throw new Error(formatRelatoriosError(error));
    }

    for (const row of data || []) {
      const report = mapRowToReport(row);
      if (report) {
        upsertCacheEntry(report);
        loaded.push(report);
      }
    }
  }

  return loaded;
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

  reportsCache = filterOutLocallyDeletedReports((data || []).map(mapRowToReport).filter(Boolean));
  reportsFullyLoaded = true;
  invalidateReportsJobIndex();
  console.info(`[ManuSilva] ${reportsCache.length} relatório(s) carregados do Supabase.`);
  return reportsCache;
}

export function invalidateReportsCache() {
  reportsCache = null;
  reportsLoadPromise = null;
  reportsFullyLoaded = false;
  invalidateReportsJobIndex();
}

function reportsShareSameSlot(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && sameEntityId(a.id, b.id)) return true;
  if (a.servicoId && b.servicoId && sameEntityId(a.servicoId, b.servicoId)) {
    return false;
  }
  if (a.jobId && b.jobId && sameEntityId(a.jobId, b.jobId)) {
    if (a.servicoId || b.servicoId) return false;
    if (a.serviceType && b.serviceType && a.serviceType !== b.serviceType) return false;
    return true;
  }
  return false;
}

function upsertCacheEntry(report) {
  if (!report || isReportLocallyDeleted(report)) return;
  if (!reportsCache) reportsCache = [];
  reportsCache = reportsCache.filter((r) => {
    if (sameEntityId(r.id, report.id)) return false;
    if (reportsShareSameSlot(r, report)) return false;
    return true;
  });
  reportsCache.unshift(report);
  invalidateReportsJobIndex();
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
  invalidateReportsJobIndex();
  return removed;
}

/** Remove do cache todos os relatórios de um trabalho (trabalho eliminado pelo RH). */
export function removeReportsForJobFromCache(jobId) {
  if (jobId == null || !reportsCache) return;
  const id = String(jobId);
  reportsCache = reportsCache.filter((r) => String(r.jobId ?? '') !== id);
  invalidateReportsJobIndex();
}

/** Remove do cache todos os relatórios de um serviço. */
export function removeReportsForServicoFromCache(servicoId) {
  if (servicoId == null || !reportsCache) return;
  const id = String(servicoId);
  reportsCache = reportsCache.filter(
    (r) => !sameEntityId(r.servicoId, id) && !sameEntityId(r.jobId, id),
  );
  invalidateReportsJobIndex();
}

async function findExistingReportId(report) {
  if (report.id && isUuid(report.id)) {
    const supabase = await getAuthenticatedSupabaseClient();
    const { data, error } = await supabase
      .from('relatorios')
      .select('id')
      .eq('id', report.id)
      .maybeSingle();
    if (!error && data?.id) return String(data.id);

    // UUID gerado no cliente — ainda não existe no Supabase → INSERT
    return null;
  }

  const byId = reportsCache?.find((r) => report.id && sameEntityId(r.id, report.id));
  if (byId?.id && isUuid(byId.id)) return byId.id;

  const byJob = reportsCache?.find((r) => report.jobId && sameEntityId(r.jobId, report.jobId));
  if (byJob?.id && isUuid(byJob.id)) return byJob.id;

  if (report.jobId && isUuid(report.jobId)) {
    const supabase = await getAuthenticatedSupabaseClient();
    const { data, error } = await supabase
      .from('relatorios')
      .select('id')
      .eq('trabalho_id', report.jobId)
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return String(data.id);
  }

  return null;
}

/**
 * Garante que existe um trabalho em Supabase (com numero_ordem) antes de gravar o relatório.
 * @returns {{ report: object, job: object | null }}
 */
async function ensureTrabalhoForReport(report) {
  const servicoId = resolveServicoIdForReport(report);
  if (servicoId) {
    return {
      report: { ...report, servicoId, jobId: report.jobId || null },
      job: null,
    };
  }

  await ensureJobsLoaded();

  if (report.jobId) {
    const job = getJobsSnapshot().find((j) => sameEntityId(j.id, report.jobId));
    if (job) return { report, job };
  }

  const job = await insertTrabalhoFromReport(report);
  if (!job?.id) {
    throw new Error('Não foi possível criar o trabalho para este relatório.');
  }

  return { report: { ...report, jobId: job.id }, job };
}

async function persistRelatorioRow(supabase, { existingId, row, linkedReport }) {
  let currentRow = row;
  let data;
  let error;

  const execute = () => {
    if (existingId) {
      return supabase.from('relatorios').update(currentRow).eq('id', existingId).select();
    }
    const insertRow =
      linkedReport.id && isUuid(linkedReport.id)
        ? { id: linkedReport.id, ...currentRow }
        : currentRow;
    return supabase.from('relatorios').insert(insertRow).select();
  };

  ({ data, error } = await execute());
  if (error && isMissingAuditColumnError(error)) {
    currentRow = stripAuditFromRelatorioRow(row);
    ({ data, error } = await execute());
  }

  return { data, error };
}

/** Cria ou atualiza relatório (um por trabalho, identificado por trabalho_id) */
export async function upsertRelatorio(report) {
  const { report: linkedReport } = await ensureTrabalhoForReport(report);

  const supabase = await getAuthenticatedSupabaseClient();
  const row = mapReportToRow(linkedReport);
  const existingId = await findExistingReportId(linkedReport);

  let { data, error } = await persistRelatorioRow(supabase, { existingId, row, linkedReport });

  if (error) {
    console.error('[ManuSilva] Erro ao gravar relatório:', error);
    throw new Error(formatRelatoriosError(error));
  }

  let inserted = Array.isArray(data) ? data[0] : data;

  if (!inserted && existingId) {
    let insertRow = { id: existingId, ...row };
    ({ data, error } = await supabase.from('relatorios').insert(insertRow).select());
    if (error && isMissingAuditColumnError(error)) {
      insertRow = { id: existingId, ...stripAuditFromRelatorioRow(row) };
      ({ data, error } = await supabase.from('relatorios').insert(insertRow).select());
    }
    if (error) {
      console.error('[ManuSilva] Erro ao inserir relatório (fallback):', error);
      throw new Error(formatRelatoriosError(error));
    }
    inserted = Array.isArray(data) ? data[0] : data;
  }

  if (!inserted) {
    await ensureReportsLoaded(true);
    const cached = reportsCache || [];
    if (linkedReport.id) {
      const byId = cached.find((r) => sameEntityId(r.id, linkedReport.id));
      if (byId) return byId;
    }
    if (linkedReport.servicoId && linkedReport.serviceType) {
      return (
        cached.find(
          (r) =>
            sameEntityId(r.servicoId, linkedReport.servicoId) &&
            r.serviceType === linkedReport.serviceType &&
            linkedReport.id &&
            sameEntityId(r.id, linkedReport.id),
        ) || null
      );
    }
    if (linkedReport.jobId) {
      return cached.find((r) => sameEntityId(r.jobId, linkedReport.jobId)) || null;
    }
    return null;
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

/**
 * Reserva a OP oficial do relatório na BD (antes de gerar o PDF na aprovação).
 * @param {object} report
 * @param {{ testClient?: boolean }} [options]
 * @returns {Promise<number|null>}
 */
export async function reserveRelatorioNumeroOrdem(report, options = {}) {
  if (!report?.id) return null;

  if (report.numeroOrdem != null && Number.isFinite(Number(report.numeroOrdem))) {
    return Number(report.numeroOrdem);
  }

  if (options.testClient) return null;

  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase.rpc('assign_relatorio_numero_ordem', {
    p_relatorio_id: report.id,
  });

  if (error) {
    console.error('[ManuSilva] Reservar OP relatório:', error);
    throw new Error(formatRelatoriosError(error));
  }

  const op = data != null && Number.isFinite(Number(data)) ? Number(data) : null;
  if (op != null) {
    mergeReportInCache({ ...report, numeroOrdem: op });
  }
  return op;
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
    reportsCache = reportsCache.filter((r) => !sameEntityId(r.jobId, trabalhoId));
    invalidateReportsJobIndex();
  }
}

export async function deleteRelatoriosByServico(servicoId) {
  if (!servicoId) return;
  const key = String(servicoId);
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('relatorios')
    .delete()
    .or(`servico_id.eq.${key},trabalho_id.eq.${key}`);
  if (error) {
    console.error('[ManuSilva] Erro ao eliminar relatórios do serviço:', error);
    throw new Error(formatRelatoriosError(error));
  }
  if (reportsCache) {
    reportsCache = reportsCache.filter(
      (r) => !sameEntityId(r.servicoId, key) && !sameEntityId(r.jobId, key),
    );
    invalidateReportsJobIndex();
  }
}

export async function deleteRelatorioById(reportId) {
  if (!reportId) return;
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase.from('relatorios').delete().eq('id', reportId);
  if (error) {
    console.error('[ManuSilva] Erro ao eliminar relatório:', error);
    throw new Error(formatRelatoriosError(error));
  }
  removeReportFromCache(reportId);
}
