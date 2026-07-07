/**
 * Folhas de obra — equipamentos em reparação na oficina.
 * Migração: pwa/supabase/migrations/025_folhas_obra.sql
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';

let folhasObraCache = null;
let folhasObraLoadPromise = null;
let folhasObraFullyLoaded = false;

function formatDateOnly(value) {
  if (!value) return '';
  const s = String(value);
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

export function emptyIntervencaoRow(technicianName = '') {
  return {
    data_intervencao: new Date().toISOString().split('T')[0],
    material_servico: '',
    quantidade: '',
    horas: '',
    realizado_por: technicianName || '',
  };
}

export function normalizeIntervencoes(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    data_intervencao: formatDateOnly(row?.data_intervencao || row?.data || ''),
    material_servico: String(row?.material_servico || row?.material || '').trim(),
    quantidade: String(row?.quantidade ?? row?.qtd ?? '').trim(),
    horas: String(row?.horas ?? '').trim(),
    realizado_por: String(row?.realizado_por || row?.tecnico || '').trim(),
  }));
}

export function mapRowToFolhaObra(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    numeroOrdem: row.numero_ordem != null ? Number(row.numero_ordem) : null,
    clientId: row.cliente_id != null ? String(row.cliente_id) : '',
    technicianId: row.tecnico_id || '',
    tipo: row.tipo || '',
    marcaModelo: row.marca_modelo || '',
    numeroSerie: row.numero_serie || '',
    etq: row.etq || '',
    dataRececao: formatDateOnly(row.data_rececao),
    intervencoes: normalizeIntervencoes(row.intervencoes),
    maquinaConcluidaEm: formatDateOnly(row.maquina_concluida_em),
    responsavel: row.responsavel || '',
    responsabilidade: row.responsabilidade || 'RC',
    orcamentoReportId: row.orcamento_report_id ? String(row.orcamento_report_id) : '',
    orcamentoAceiteEm: row.orcamento_aceite_em || null,
    estado: row.estado || 'rascunho',
    submittedAt: row.submetido_em || null,
    faturacaoStatus: row.faturacao_status || null,
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
    observacoes: row.observacoes || '',
    diagnosticoTecnico: row.diagnostico_tecnico || '',
    createdAt: row.criado_em || null,
    updatedAt: row.atualizado_em || null,
  };
}

export function mapFolhaObraToRow(folha, overrides = {}) {
  const data = { ...folha, ...overrides };
  const clientId = data.clientId != null && data.clientId !== '' ? parseFolhaClientId(data.clientId) : null;
  return {
    cliente_id: clientId,
    tecnico_id: data.technicianId || overrides.tecnico_id || '',
    tipo: data.tipo ?? '',
    marca_modelo: data.marcaModelo ?? '',
    numero_serie: data.numeroSerie ?? '',
    etq: data.etq ?? '',
    data_rececao: formatDateOnly(data.dataRececao) || null,
    intervencoes: normalizeIntervencoes(data.intervencoes),
    maquina_concluida_em: formatDateOnly(data.maquinaConcluidaEm) || null,
    responsavel: data.responsavel ?? '',
    responsabilidade: data.responsabilidade ?? 'RC',
    orcamento_report_id: data.orcamentoReportId || overrides.orcamento_report_id || null,
    orcamento_aceite_em: data.orcamentoAceiteEm ?? overrides.orcamento_aceite_em ?? null,
    estado: data.estado ?? 'rascunho',
    submetido_em: data.submittedAt ?? overrides.submetido_em ?? null,
    faturacao_status: data.faturacaoStatus ?? overrides.faturacao_status ?? null,
    numero_fatura: data.numeroFatura ?? overrides.numero_fatura ?? null,
    data_fatura: formatDateOnly(data.dataFatura) || null,
    valor_faturado: data.valorFaturado ?? overrides.valor_faturado ?? null,
    condicao_pagamento: data.faturaCondicaoPagamento ?? overrides.condicao_pagamento ?? null,
    status_recebimento: data.statusRecebimento ?? overrides.status_recebimento ?? null,
    data_vencimento: data.dataVencimento ? formatDateOnly(data.dataVencimento) : null,
    data_recebimento: data.dataRecebimento ? formatDateOnly(data.dataRecebimento) : null,
    observacoes: data.observacoes ?? null,
    diagnostico_tecnico: data.diagnosticoTecnico ?? '',
    atualizado_em: new Date().toISOString(),
  };
}

export function formatFolhasObraError(err) {
  if (!err) return 'Erro ao aceder às folhas de obra.';
  const msg = String(err.message || err.details || err.hint || '').trim();
  const code = err.code || '';

  if (code === 'PGRST205' || /Could not find the table|relation.*folhas_obra/i.test(msg)) {
    return 'Tabela "folhas_obra" não encontrada. Executa pwa/supabase/migrations/025_folhas_obra.sql no Supabase.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'Sem permissão na tabela folhas_obra (RLS).';
  }

  return msg || 'Erro ao aceder às folhas de obra.';
}

export function getFolhasObraSnapshot() {
  return folhasObraCache ? [...folhasObraCache] : [];
}

export function getFolhaObra(id) {
  if (id == null) return null;
  const key = String(id);
  return getFolhasObraSnapshot().find((item) => String(item.id) === key) || null;
}

export function isFolhasObraCacheLoaded() {
  return folhasObraFullyLoaded && folhasObraCache !== null;
}

export function replaceFolhasObraCache(folhas = []) {
  folhasObraCache = Array.isArray(folhas) ? folhas.map((f) => ({ ...f })) : [];
  folhasObraFullyLoaded = folhasObraCache.length > 0;
}

function upsertCacheEntry(folha) {
  if (!folha) return;
  if (!folhasObraCache) folhasObraCache = [];
  const idx = folhasObraCache.findIndex((f) => String(f.id) === String(folha.id));
  if (idx >= 0) folhasObraCache[idx] = folha;
  else folhasObraCache.push(folha);
}

export async function ensureFolhasObraLoaded(force = false) {
  if (folhasObraFullyLoaded && folhasObraCache && !force) return folhasObraCache;
  if (!folhasObraLoadPromise || force) {
    folhasObraLoadPromise = loadFolhasObraFromSupabase().catch((err) => {
      folhasObraLoadPromise = null;
      throw err;
    });
  }
  return folhasObraLoadPromise;
}

export async function ensureFolhasObraLoadedSafe(force = false) {
  try {
    return await ensureFolhasObraLoaded(force);
  } catch (err) {
    const msg = formatFolhasObraError(err);
    if (/tabela "folhas_obra" não encontrada|Could not find the table|relation.*folhas_obra/i.test(msg)) {
      console.warn('[ManuSilva] Tabela folhas_obra ainda não existe — executar migração 025.');
      folhasObraCache = [];
      folhasObraFullyLoaded = true;
      return [];
    }
    throw err;
  }
}

async function loadFolhasObraFromSupabase() {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('folhas_obra')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('[ManuSilva] Erro ao carregar folhas de obra:', error);
    throw new Error(formatFolhasObraError(error));
  }

  folhasObraCache = (data || []).map(mapRowToFolhaObra).filter(Boolean);
  folhasObraFullyLoaded = true;
  console.info(`[ManuSilva] ${folhasObraCache.length} folha(s) de obra carregadas.`);
  try {
    const { syncAllFolhasObraOrcamentoStates } = await import('./folha-obra-orcamento.js');
    await syncAllFolhasObraOrcamentoStates();
  } catch (err) {
    console.warn('[ManuSilva] Sync folhas/orçamento:', err);
  }
  return folhasObraCache;
}

export async function insertFolhaObra(payload) {
  validateFolhaObraPayload(payload, 'draft');
  const supabase = await getAuthenticatedSupabaseClient();
  const row = mapFolhaObraToRow({ ...payload, etq: '' });
  delete row.atualizado_em;

  const { data, error } = await supabase.from('folhas_obra').insert(row).select('*').single();
  if (error) throw new Error(formatFolhasObraError(error));

  const folha = mapRowToFolhaObra(data);
  upsertCacheEntry(folha);
  return folha;
}

export async function updateFolhaObra(id, updates) {
  const existing = getFolhaObra(id);
  if (!existing) throw new Error('Folha de obra não encontrada.');

  const supabase = await getAuthenticatedSupabaseClient();
  const merged = { ...existing, ...updates };
  if (existing.estado === 'rascunho' && merged.estado === 'rascunho') {
    merged.etq = '';
  }
  const row = mapFolhaObraToRow(merged);

  const { data, error } = await supabase
    .from('folhas_obra')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(formatFolhasObraError(error));

  const folha = mapRowToFolhaObra(data);
  upsertCacheEntry(folha);
  return folha;
}

export function canDeleteFolhaObra(folha) {
  if (!folha) return false;
  const estado = folha.estado || 'rascunho';
  return estado === 'rascunho' || estado === 'em_diagnostico' || estado === 'em_reparacao';
}

export async function deleteFolhaObra(id) {
  const existing = getFolhaObra(id);
  if (!existing) throw new Error('Folha de obra não encontrada.');
  if (!canDeleteFolhaObra(existing)) {
    throw new Error('Não é possível eliminar folhas já finalizadas ou em faturação.');
  }

  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase.from('folhas_obra').delete().eq('id', id);
  if (error) throw new Error(formatFolhasObraError(error));

  if (folhasObraCache) {
    folhasObraCache = folhasObraCache.filter((item) => String(item.id) !== String(id));
  }
  return true;
}

export function getInvoicedFolhasObra() {
  return getFolhasObraSnapshot().filter((f) => f.faturacaoStatus === 'faturado');
}

export function isFolhaObraPendingBilling(folha) {
  if (!folha) return false;
  if (folha.estado !== 'pendente_faturacao') return false;
  const fs = folha.faturacaoStatus;
  return !fs || fs === 'pendente';
}

export function getPendingBillingFolhasObra() {
  return getFolhasObraSnapshot()
    .filter(isFolhaObraPendingBilling)
    .sort((a, b) =>
      String(b.submittedAt || b.maquinaConcluidaEm || '').localeCompare(
        String(a.submittedAt || a.maquinaConcluidaEm || ''),
      ),
    );
}

export function formatFolhaObraOrdemLabel(folha) {
  if (!folha) return '—';
  if (folha.numeroOrdem != null) return `FO-${folha.numeroOrdem}`;
  return 'Folha de obra';
}

/** Rótulos para o painel Armazém / oficina (fases operacionais). */
export const FOLHA_OBRA_ESTADO_ARM_LABELS = {
  rascunho: 'Entrada em Armazém',
  em_diagnostico: 'Diagnóstico técnico',
  aguarda_orcamento: 'Aguarda orçamento',
  orcamento_enviado: 'Orçamento enviado',
  em_reparacao: 'Reparação',
  pendente_faturacao: 'Finalizado',
  faturado: 'Finalizado',
  dispensado: 'Finalizado',
};

export function isFolhaObraFinalizada(folhaOrEstado) {
  const estado = typeof folhaOrEstado === 'string' ? folhaOrEstado : folhaOrEstado?.estado || 'rascunho';
  return estado === 'pendente_faturacao' || estado === 'faturado' || estado === 'dispensado';
}

export function formatFolhaObraEstadoLabel(estado, { rh = false } = {}) {
  const key = estado || 'rascunho';
  if (rh) {
    const rhLabels = {
      rascunho: 'Entrada em Armazém',
      em_diagnostico: 'Diagnóstico técnico',
      aguarda_orcamento: 'Aguarda orçamento RH',
      orcamento_enviado: 'Orçamento enviado ao cliente',
      em_reparacao: 'Reparação',
      pendente_faturacao: 'Aguarda faturação',
      faturado: 'Faturado',
      dispensado: 'Dispensado',
    };
    return rhLabels[key] || key;
  }
  return FOLHA_OBRA_ESTADO_ARM_LABELS[key] || key;
}

export function formatEtqNumber(numeroOrdem) {
  const n = Number(numeroOrdem);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `ETQ-${n}`;
}

/** Número da etiqueta física — gerado na entrada e pareado com a folha. */
export function buildFolhaObraEtqLabel(folha) {
  if (!folha) return '';
  if (folha.etq?.trim()) return folha.etq.trim();
  return formatEtqNumber(folha.numeroOrdem);
}

export function assignFolhaObraEtq(folha) {
  if (!folha) return '';
  if (folha.etq?.trim()) return folha.etq.trim();
  return formatEtqNumber(folha.numeroOrdem);
}

export function parseFolhaClientId(clientId) {
  const n = Number(clientId);
  if (!clientId || !Number.isFinite(n) || n <= 0) {
    throw new Error('Selecione um cliente válido da lista.');
  }
  return n;
}

/**
 * @param {object} payload
 * @param {'draft'|'entrada'|'concluir'|'enviar_rh'} mode
 */
export function validateFolhaObraPayload(payload, mode = 'draft') {
  parseFolhaClientId(payload?.clientId);

  if (mode === 'draft') return;

  if (mode === 'enviar_rh') {
    if (!String(payload?.diagnosticoTecnico || '').trim()) {
      throw new Error('Preencha o diagnóstico técnico antes de enviar ao RH.');
    }
    return;
  }

  const responsabilidade = String(payload?.responsabilidade || 'RC').trim().toUpperCase();
  if (!['MS', 'RC'].includes(responsabilidade)) {
    throw new Error('Indique se a máquina é M.S ou R.C.');
  }

  if (!String(payload?.tipo || '').trim()) {
    throw new Error('Indique o tipo de equipamento.');
  }
  if (!String(payload?.marcaModelo || '').trim()) {
    throw new Error('Indique a marca/modelo.');
  }
  if (!String(payload?.dataRececao || '').trim()) {
    throw new Error('Indique a data de entrada.');
  }
  if ((mode === 'entrada' || mode === 'concluir') && !String(payload?.responsavel || '').trim()) {
    throw new Error('Selecione o técnico responsável.');
  }

  if (mode === 'concluir') {
    if (!String(payload?.maquinaConcluidaEm || '').trim()) {
      throw new Error('Indique a data em que a máquina foi concluída.');
    }
    if (!String(payload?.responsavel || '').trim()) {
      throw new Error('Indique o responsável.');
    }
  }
}
