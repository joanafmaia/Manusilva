/**
 * Faturação de folhas de obra — envio técnico → fila RH.
 */

import {
  getFolhaObra,
  isFolhaObraPendingBilling,
  updateFolhaObra,
  buildFolhaObraEtqLabel,
  validateFolhaObraPayload,
} from './folhas-obra-db.js';
import {
  normalizeInvoiceAmountInput,
  resolveInvoiceBillingFields,
} from './billing-workflow.js';

const DEFAULT_ESTIMATE_EUR = 150;

export function estimateFolhaObraValue(folha) {
  if (!folha) return DEFAULT_ESTIMATE_EUR;
  const horas = (folha.intervencoes || []).reduce((sum, row) => {
    const h = Number(String(row.horas || '').replace(',', '.'));
    return sum + (Number.isFinite(h) ? h : 0);
  }, 0);
  if (horas > 0) return Math.max(80, Math.round(horas * 45));
  return DEFAULT_ESTIMATE_EUR;
}

export async function registerFolhaObraEntrada(folhaId, payload = null) {
  const existing = getFolhaObra(folhaId);
  if (!existing) throw new Error('Folha de obra não encontrada.');

  const merged = payload ? { ...existing, ...payload, id: existing.id } : existing;
  validateFolhaObraPayload(merged, 'entrada');

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
    estado: 'em_reparacao',
    etq: buildFolhaObraEtqLabel(merged) || buildFolhaObraEtqLabel(existing) || merged.etq || '',
  });

  if (!saved.etq?.trim() && saved.numeroOrdem != null) {
    return updateFolhaObra(folhaId, { etq: `FO-${saved.numeroOrdem}` });
  }
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
