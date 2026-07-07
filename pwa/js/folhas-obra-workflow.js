/**
 * Faturação de folhas de obra — envio técnico → fila RH.
 */

import {
  getFolhaObra,
  isFolhaObraPendingBilling,
  updateFolhaObra,
  assignFolhaObraEtq,
  validateFolhaObraPayload,
} from './folhas-obra-db.js';
import { FOLHA_RESPONSABILIDADE, normalizeFolhaResponsabilidade } from './folha-obra-orcamento.js';
import {
  normalizeInvoiceAmountInput,
  resolveInvoiceBillingFields,
} from './billing-workflow.js';
import { getReportOrcamentoMeta, computeOrcamentoTotals } from './orcamento-linhas.js';
import { getReport } from './app.js';

const DEFAULT_ESTIMATE_EUR = 150;

export function estimateFolhaObraValue(folha) {
  if (!folha) return DEFAULT_ESTIMATE_EUR;

  if (folha.orcamentoReportId) {
    const report = getReport(folha.orcamentoReportId);
    const meta = getReportOrcamentoMeta(report);
    if (meta?.linhas?.length) {
      const totals = computeOrcamentoTotals(meta.linhas, meta);
      if (totals.total > 0) return totals.total;
    }
  }

  const horas = (folha.intervencoes || []).reduce((sum, row) => {
    const h = Number(String(row.horas || '').replace(',', '.'));
    return sum + (Number.isFinite(h) ? h : 0);
  }, 0);
  if (horas > 0) return Math.max(80, Math.round(horas * 45));
  return DEFAULT_ESTIMATE_EUR;
}

export function resolveFolhaObraEstadoAfterEntrada(responsabilidade) {
  return normalizeFolhaResponsabilidade(responsabilidade) === FOLHA_RESPONSABILIDADE.MS
    ? 'em_reparacao'
    : 'aguarda_orcamento';
}

export async function registerFolhaObraEntrada(folhaId, payload = null) {
  const existing = getFolhaObra(folhaId);
  if (!existing) throw new Error('Folha de obra não encontrada.');

  const merged = payload ? { ...existing, ...payload, id: existing.id } : existing;
  validateFolhaObraPayload(merged, 'entrada');

  const etq = assignFolhaObraEtq(merged);
  if (!etq) {
    throw new Error('Não foi possível gerar o número da etiqueta. Guarde a folha e tente novamente.');
  }

  const responsabilidade = normalizeFolhaResponsabilidade(merged.responsabilidade);
  const nextEstado = resolveFolhaObraEstadoAfterEntrada(responsabilidade);

  const saved = await updateFolhaObra(folhaId, {
    clientId: merged.clientId,
    technicianId: merged.technicianId,
    tipo: merged.tipo,
    marcaModelo: merged.marcaModelo,
    numeroSerie: merged.numeroSerie,
    dataRececao: merged.dataRececao || existing.dataRececao || new Date().toISOString().split('T')[0],
    intervencoes: merged.intervencoes || [],
    observacoes: merged.observacoes || '',
    responsavel: merged.responsavel || existing.responsavel || '',
    responsabilidade,
    estado: nextEstado,
    etq,
  });

  return saved;
}

export async function submitFolhaObraForBilling(folhaId) {
  const folha = getFolhaObra(folhaId);
  if (!folha) throw new Error('Folha de obra não encontrada.');
  if (folha.estado === 'pendente_faturacao') {
    throw new Error('Esta folha já foi enviada para faturação.');
  }
  if (folha.estado === 'faturado') {
    throw new Error('Esta folha já foi faturada.');
  }
  if (folha.estado === 'rascunho') {
    throw new Error('Registe primeiro a entrada do equipamento.');
  }
  if (folha.estado !== 'em_reparacao') {
    throw new Error('A folha só pode ser concluída durante a reparação.');
  }
  validateFolhaObraPayload(folha, 'concluir');

  return updateFolhaObra(folhaId, {
    estado: 'pendente_faturacao',
    faturacaoStatus: 'pendente',
    submittedAt: new Date().toISOString(),
  });
}

export async function registerFolhaObraInvoice(
  folhaId,
  { numeroFatura, dataFatura, valorFaturado, statusRecebimento },
) {
  const folha = getFolhaObra(folhaId);
  if (!folha) throw new Error('Folha de obra não encontrada.');
  if (!isFolhaObraPendingBilling(folha)) {
    throw new Error('Esta folha já não está pendente de faturação.');
  }

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const { value: valor } = normalizeInvoiceAmountInput(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');

  const billing = resolveInvoiceBillingFields(statusRecebimento, data);

  return updateFolhaObra(folhaId, {
    estado: 'faturado',
    faturacaoStatus: 'faturado',
    numeroFatura: numero,
    dataFatura: data,
    valorFaturado: valor,
    statusRecebimento: billing.statusRecebimento,
    dataVencimento: billing.dataVencimento,
    dataRecebimento: billing.dataRecebimento,
    faturaCondicaoPagamento: billing.faturaCondicaoPagamento,
  });
}

export async function confirmFolhaObraInvoicePayment(folhaId, dataRecebimento) {
  const folha = getFolhaObra(folhaId);
  if (!folha) throw new Error('Folha de obra não encontrada.');
  if (folha.faturacaoStatus !== 'faturado') {
    throw new Error('Esta folha ainda não foi faturada.');
  }

  const data = String(dataRecebimento || new Date().toISOString().split('T')[0]).trim();

  return updateFolhaObra(folhaId, {
    statusRecebimento: 'pago',
    dataRecebimento: data,
  });
}

export async function revertFolhaObraInvoice(folhaId) {
  const folha = getFolhaObra(folhaId);
  if (!folha) throw new Error('Folha de obra não encontrada.');
  if (folha.statusRecebimento === 'pago') {
    throw new Error('Não é possível reverter uma folha já recebida.');
  }

  return updateFolhaObra(folhaId, {
    estado: 'pendente_faturacao',
    faturacaoStatus: 'pendente',
    numeroFatura: '',
    dataFatura: '',
    valorFaturado: null,
    statusRecebimento: 'pendente',
    dataVencimento: null,
    dataRecebimento: null,
    faturaCondicaoPagamento: null,
  });
}
