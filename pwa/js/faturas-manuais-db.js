/**
 * Faturas manuais — controlo interno sem relatório/visita associada.
 * Migração SQL: pwa/supabase/migrations/022_faturas_manuais.sql
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { resolveAuditActor } from './audit-actor.js';
import {
  AUDIT_MANUAL_COLUMNS,
  isMissingAuditColumnError,
  stripAuditColumns,
} from './audit-fields.js';
import {
  normalizeInvoiceAmountInput,
  resolveInvoiceBillingFields,
} from './billing-workflow.js';

let faturasManuaisCache = null;
let faturasManuaisLoadPromise = null;
let faturasManuaisFullyLoaded = false;

function formatDateOnly(value) {
  if (!value) return '';
  const s = String(value);
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

/** Linha Supabase → formato da app (alinhado com serviços/relatórios faturados). */
export function mapRowToManualInvoice(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    numeroFatura: row.numero_fatura || '',
    dataFatura: formatDateOnly(row.data_fatura),
    valorFaturado:
      row.valor_faturado != null && row.valor_faturado !== ''
        ? Number(row.valor_faturado)
        : null,
    faturaCondicaoPagamento: row.condicao_pagamento || null,
    statusRecebimento: row.status_recebimento || 'pendente',
    dataVencimento: formatDateOnly(row.data_vencimento) || null,
    dataRecebimento: formatDateOnly(row.data_recebimento) || null,
    descricao: row.descricao || null,
    createdAt: row.criado_em || null,
    registeredBy: row.registado_por || null,
  };
}

export function mapManualInvoiceToRow(invoice) {
  return {
    cliente_id:
      invoice.clientId != null && invoice.clientId !== '' ? Number(invoice.clientId) : null,
    numero_fatura: invoice.numeroFatura || null,
    data_fatura: formatDateOnly(invoice.dataFatura),
    valor_faturado: invoice.valorFaturado ?? null,
    condicao_pagamento: invoice.faturaCondicaoPagamento ?? null,
    status_recebimento: invoice.statusRecebimento ?? 'pendente',
    data_vencimento: invoice.dataVencimento ? formatDateOnly(invoice.dataVencimento) : null,
    data_recebimento: invoice.dataRecebimento ? formatDateOnly(invoice.dataRecebimento) : null,
    descricao: invoice.descricao ?? null,
    registado_por: invoice.registeredBy ?? null,
  };
}

export function formatFaturasManuaisError(err) {
  if (!err) return 'Erro ao aceder às faturas manuais.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === 'PGRST205' || /Could not find the table|relation.*does not exist/i.test(msg)) {
    return 'Tabela "faturas_manuais" não encontrada. Executa pwa/supabase/migrations/022_faturas_manuais.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela faturas_manuais (RLS).';
  }

  return msg || 'Erro ao aceder às faturas manuais.';
}

function formatFaturasManuaisAuditError(err) {
  if (!err) return 'Erro ao registar eliminação.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (
    code === 'PGRST205' ||
    /Could not find the table|relation.*faturas_manuais_eliminadas.*does not exist/i.test(msg)
  ) {
    return 'Tabela "faturas_manuais_eliminadas" não encontrada. Executa pwa/supabase/migrations/023_faturas_manuais_audit.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela faturas_manuais_eliminadas (RLS).';
  }

  return msg || 'Erro ao registar eliminação.';
}

function resolveDeleteActor() {
  return resolveAuditActor();
}

export function getManualInvoicesSnapshot() {
  return faturasManuaisCache ? [...faturasManuaisCache] : [];
}

export function getManualInvoice(id) {
  if (id == null) return null;
  const key = String(id);
  return getManualInvoicesSnapshot().find((item) => String(item.id) === key) || null;
}

export function isFaturasManuaisCacheLoaded() {
  return faturasManuaisFullyLoaded && faturasManuaisCache !== null;
}

export async function ensureFaturasManuaisLoaded(force = false) {
  if (faturasManuaisFullyLoaded && faturasManuaisCache && !force) return faturasManuaisCache;
  if (!faturasManuaisLoadPromise || force) {
    faturasManuaisLoadPromise = loadFaturasManuaisFromSupabase().catch((err) => {
      faturasManuaisLoadPromise = null;
      throw err;
    });
  }
  return faturasManuaisLoadPromise;
}

/** Não falha o arranque se a migração 022 ainda não foi aplicada. */
export async function ensureFaturasManuaisLoadedSafe(force = false) {
  try {
    return await ensureFaturasManuaisLoaded(force);
  } catch (err) {
    const msg = formatFaturasManuaisError(err);
    if (/tabela "faturas_manuais" não encontrada|Could not find the table|relation.*faturas_manuais/i.test(msg)) {
      console.warn('[ManuSilva] Tabela faturas_manuais ainda não existe — executar migração 022.');
      faturasManuaisCache = [];
      faturasManuaisFullyLoaded = true;
      return [];
    }
    throw err;
  }
}

async function loadFaturasManuaisFromSupabase() {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('faturas_manuais')
    .select('*')
    .order('data_fatura', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar faturas manuais:', error);
    throw new Error(formatFaturasManuaisError(error));
  }

  faturasManuaisCache = (data || []).map(mapRowToManualInvoice).filter(Boolean);
  faturasManuaisFullyLoaded = true;
  console.info(`[ManuSilva] ${faturasManuaisCache.length} fatura(s) manual(is) carregada(s).`);
  return faturasManuaisCache;
}

export function invalidateFaturasManuaisCache() {
  faturasManuaisCache = null;
  faturasManuaisLoadPromise = null;
  faturasManuaisFullyLoaded = false;
}

async function logManualInvoiceDeletion(supabase, invoice) {
  const { error } = await supabase.from('faturas_manuais_eliminadas').insert({
    fatura_id: invoice.id,
    cliente_id: Number(invoice.clientId),
    numero_fatura: invoice.numeroFatura,
    data_fatura: invoice.dataFatura || null,
    valor_faturado: invoice.valorFaturado ?? null,
    descricao: invoice.descricao ?? null,
    status_recebimento: invoice.statusRecebimento ?? null,
    snapshot: invoice,
    eliminado_por: resolveDeleteActor(),
  });

  if (error) {
    const msg = formatFaturasManuaisAuditError(error);
    if (
      /faturas_manuais_eliminadas.*não encontrada|Could not find the table|relation.*faturas_manuais_eliminadas/i.test(
        msg,
      )
    ) {
      console.warn('[ManuSilva] Eliminação sem auditoria — migração 023 pendente.');
      return false;
    }
    console.error('[ManuSilva] logManualInvoiceDeletion:', error);
    throw new Error(`Não foi possível registar a eliminação: ${msg}`);
  }

  return true;
}

export function mergeManualInvoiceInCache(invoice) {
  if (!invoice?.id) return;
  if (!faturasManuaisCache) faturasManuaisCache = [];
  const id = String(invoice.id);
  faturasManuaisCache = faturasManuaisCache.filter((item) => String(item.id) !== id);
  faturasManuaisCache.unshift(invoice);
}

/** Regista fatura emitida externamente — sem relatório/visita na app. */
export async function registerManualInvoice({
  clientId,
  numeroFatura,
  dataFatura,
  valorFaturado,
  statusRecebimento,
  descricao,
}) {
  const clienteId = String(clientId ?? '').trim();
  if (!clienteId) throw new Error('Selecione um cliente.');

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const { value: valor } = normalizeInvoiceAmountInput(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');

  const billing = resolveInvoiceBillingFields(statusRecebimento, data);
  const descricaoTrim = String(descricao ?? '').trim();
  if (!descricaoTrim) throw new Error('Indique do que é a fatura (Visita / Relatório).');

  const supabase = await getAuthenticatedSupabaseClient();
  const insertRow = {
    cliente_id: Number(clienteId),
    numero_fatura: numero,
    data_fatura: data,
    valor_faturado: valor == null ? null : Math.round(valor * 100) / 100,
    condicao_pagamento: billing.faturaCondicaoPagamento,
    status_recebimento: billing.statusRecebimento,
    data_vencimento: billing.dataVencimento,
    descricao: descricaoTrim || null,
    registado_por: resolveAuditActor(),
  };

  let { data: inserted, error } = await supabase
    .from('faturas_manuais')
    .insert(insertRow)
    .select();

  if (error && isMissingAuditColumnError(error)) {
    const { patch } = stripAuditColumns(insertRow, AUDIT_MANUAL_COLUMNS);
    ({ data: inserted, error } = await supabase.from('faturas_manuais').insert(patch).select());
  }

  if (error) {
    console.error('[ManuSilva] registerManualInvoice:', error);
    throw new Error(formatFaturasManuaisError(error));
  }

  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  const invoice = mapRowToManualInvoice(row);
  if (invoice) mergeManualInvoiceInCache(invoice);
  window.dispatchEvent(new CustomEvent('db-updated'));
  return invoice;
}

/** Confirma recebimento de fatura manual pendente. */
export async function confirmManualInvoicePayment(invoiceId, { dataRecebimento } = {}) {
  const invoice = getManualInvoice(invoiceId);
  if (!invoice) throw new Error('Fatura não encontrada.');
  if (invoice.statusRecebimento === 'pago') {
    throw new Error('Este recebimento já foi confirmado.');
  }

  const data = String(dataRecebimento ?? new Date().toISOString()).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Indique uma data de recebimento válida.');
  }

  const supabase = await getAuthenticatedSupabaseClient();
  const { data: updated, error } = await supabase
    .from('faturas_manuais')
    .update({
      status_recebimento: 'pago',
      data_recebimento: data,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select();

  if (error) {
    console.error('[ManuSilva] confirmManualInvoicePayment:', error);
    throw new Error(formatFaturasManuaisError(error));
  }

  const row = Array.isArray(updated) ? updated[0] : updated;
  const saved = mapRowToManualInvoice(row);
  if (saved) mergeManualInvoiceInCache(saved);
  window.dispatchEvent(new CustomEvent('db-updated'));
  return saved;
}

export function removeManualInvoiceFromCache(invoiceId) {
  if (!faturasManuaisCache || invoiceId == null) return;
  const id = String(invoiceId);
  faturasManuaisCache = faturasManuaisCache.filter((item) => String(item.id) !== id);
}

/**
 * Elimina registo manual de fatura (só faturas_manuais — não afeta relatórios).
 * Grava auditoria em faturas_manuais_eliminadas (consultável só no Supabase).
 */
export async function deleteManualInvoice(invoiceId) {
  const invoice = getManualInvoice(invoiceId);
  if (!invoice) throw new Error('Fatura não encontrada.');

  const supabase = await getAuthenticatedSupabaseClient();
  await logManualInvoiceDeletion(supabase, invoice);

  const { error } = await supabase.from('faturas_manuais').delete().eq('id', invoiceId);

  if (error) {
    console.error('[ManuSilva] deleteManualInvoice:', error);
    throw new Error(formatFaturasManuaisError(error));
  }

  removeManualInvoiceFromCache(invoiceId);
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}
