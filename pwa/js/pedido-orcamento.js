/**
 * Pedido de orçamento — deteção e URLs associados ao relatório.
 */

import {
  reportIsStandaloneOrcamento,
  STANDALONE_ORCAMENTO_ORIGEM,
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
} from './orcamento-standalone.js';

export {
  reportIsStandaloneOrcamento,
  STANDALONE_ORCAMENTO_ORIGEM,
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
} from './orcamento-standalone.js';

export function reportHasPedidoOrcamento(report) {
  const values = report?.data?.values || {};
  return String(values.pedido_orcamento || '').trim().toLowerCase() === 'sim';
}

/** Relatório com pedido técnico ou proposta RH criada do zero. */
export function reportIsRhOrcamento(report) {
  return reportHasPedidoOrcamento(report) || reportIsStandaloneOrcamento(report);
}

function readOrcamentoMeta(report) {
  const meta = report?.data?.orcamento;
  return meta && typeof meta === 'object' ? meta : null;
}

/**
 * Relatório ligado a proposta MS.015 (pedido técnico, standalone ou PDF/meta comercial).
 * Não deve aparecer em «Por faturar» como relatório técnico.
 */
export function reportHasOrcamentoSignals(report) {
  if (!report) return false;
  if (reportIsRhOrcamento(report)) return true;
  if (getReportOrcamentoPdfUrl(report)) return true;
  const meta = readOrcamentoMeta(report);
  if (meta?.enviadoEm || meta?.atualizadoEm) return true;
  if (String(report?.data?.orcamentoOrigem || '').trim()) return true;
  if (String(report?.data?.faturacaoOrigem || '') === 'orcamento_aceite') return true;
  return false;
}

/** Proposta MS.015 ainda não guardada/enviada pelo RH (inclui após aprovar o relatório técnico). */
export function reportOrcamentoPorPreparar(report) {
  if (!reportIsRhOrcamento(report)) return false;
  const meta = report?.data?.orcamento;
  if (meta?.enviadoEm) return false;
  return !reportOrcamentoGuardado(report);
}

/** Fila RH «Orçamento» — pedido de orçamento ou proposta criada pelo RH. */
export function isRhOrcamentoQueueReport(report) {
  if (!reportIsRhOrcamento(report)) return false;
  if (reportIsStandaloneOrcamento(report)) {
    if (report?.status === 'rejected') return false;
    return true;
  }
  if (report?.status === 'pending_review') return true;
  if (report?.status === 'approved') {
    const meta = report?.data?.orcamento;
    if (meta?.enviadoEm || reportOrcamentoGuardado(report)) return true;
    return reportOrcamentoPorPreparar(report);
  }
  return false;
}

/** Fila RH «Pendente RH» — qualquer relatório técnico à espera de aprovação (inclui pedido de orçamento). */
export function isRhPendingReviewReport(report) {
  return report?.status === 'pending_review';
}

/** RH guardou a proposta (PDF MS.015 gerado), não apenas rascunho automático. */
export function reportOrcamentoGuardado(report) {
  const meta = report?.data?.orcamento;
  return Boolean(meta?.atualizadoEm && getReportOrcamentoPdfUrl(report));
}

export function getPedidoOrcamentoDetalhe(report) {
  const values = report?.data?.values || {};
  return String(values.detalhe_pedido_orcamento || '').trim();
}

export function getReportOrcamentoPdfUrl(report) {
  const url = report?.data?.urlPdfOrcamento;
  return url && String(url).trim() ? String(url).trim() : null;
}

export function getReportOrcamentoDocxUrl(report) {
  const url = report?.data?.urlDocxOrcamento;
  return url && String(url).trim() ? String(url).trim() : null;
}

export function getReportOrcamentoPdfFilename(report) {
  const name = report?.data?.orcamentoPdfFilename;
  return name && String(name).trim() ? String(name).trim() : null;
}

export function getReportOrcamentoDocxFilename(report) {
  const name = report?.data?.orcamentoDocxFilename;
  return name && String(name).trim() ? String(name).trim() : null;
}

/** PDF do relatório técnico (após aprovação RH). */
export function getReportTechnicalPdfUrl(report) {
  const urls = report?.data?.urlPdfs;
  if (Array.isArray(urls)) {
    const first = urls.find((u) => u && String(u).trim());
    if (first) return String(first).trim();
  }
  return null;
}

export function getReportOrcamentoNumero(report) {
  const meta = report?.data?.orcamento;
  if (!meta || typeof meta !== 'object') return null;
  return meta.numeroFormatado || null;
}

/** Abre ficheiro do Storage evitando cache do browser (mesmo nome de ficheiro). */
export function openOrcamentoStorageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const base = raw.split('?')[0];
  const busted = `${base}?v=${Date.now()}`;
  window.open(busted, '_blank', 'noopener,noreferrer');
  return true;
}

export function withOrcamentoUrlCacheBust(url, version = Date.now()) {
  const base = String(url || '').trim().split('?')[0];
  if (!base) return '';
  return `${base}?v=${version}`;
}
