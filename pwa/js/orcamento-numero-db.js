/**
 * Reserva número sequencial de orçamento MS.015 no Supabase (por ano).
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { formatOrcamentoNumeroLabel, getReportOrcamentoMeta } from './orcamento-linhas.js';

export async function reserveOrcamentoNumero(ano = new Date().getFullYear()) {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase.rpc('reservar_numero_orcamento', { p_ano: ano });
  if (error) {
    console.error('[Orcamento] reservar_numero_orcamento:', error);
    throw new Error(
      error.message ||
        'Não foi possível reservar número de orçamento. Aplique a migração 015_orcamento_numeracao.sql no Supabase.',
    );
  }
  const sequencial = Number(data);
  if (!Number.isFinite(sequencial) || sequencial <= 0) {
    throw new Error('Resposta inválida ao reservar número de orçamento.');
  }
  return {
    sequencial,
    ano,
    numeroFormatado: formatOrcamentoNumeroLabel(sequencial, ano),
  };
}

/**
 * Garante número único por relatório (reutiliza se já reservado).
 * @param {object} report
 * @returns {Promise<{ sequencial: number, ano: number, numeroFormatado: string }>}
 */
export async function ensureOrcamentoNumeroForReport(report) {
  const existing = getReportOrcamentoMeta(report);
  if (existing?.numeroSequencial && existing?.ano) {
    return {
      sequencial: Number(existing.numeroSequencial),
      ano: Number(existing.ano),
      numeroFormatado:
        existing.numeroFormatado ||
        formatOrcamentoNumeroLabel(existing.numeroSequencial, existing.ano),
    };
  }

  const submitted = String(report?.submittedAt || '').trim();
  const year = submitted.match(/^(\d{4})/)?.[1]
    ? Number(submitted.match(/^(\d{4})/)[1])
    : new Date().getFullYear();

  return reserveOrcamentoNumero(year);
}
