/**
 * Pedido de orçamento — deteção e URLs associados ao relatório.
 */

export function reportHasPedidoOrcamento(report) {
  const values = report?.data?.values || {};
  return String(values.pedido_orcamento || '').trim().toLowerCase() === 'sim';
}

/** Proposta MS.015 ainda não guardada/enviada pelo RH (inclui após aprovar o relatório técnico). */
export function reportOrcamentoPorPreparar(report) {
  if (!reportHasPedidoOrcamento(report)) return false;
  const meta = report?.data?.orcamento;
  if (meta?.enviadoEm) return false;
  return !meta?.atualizadoEm;
}

/** Fila RH «Orçamento» — relatório com pedido de orçamento pendente de aprovação ou MS.015 por preparar. */
export function isRhOrcamentoQueueReport(report) {
  if (!reportHasPedidoOrcamento(report)) return false;
  if (report?.status === 'pending_review') return true;
  if (report?.status === 'approved') return reportOrcamentoPorPreparar(report);
  return false;
}

/** Fila RH «Pendente RH» — aprovação do relatório técnico sem pedido de orçamento. */
export function isRhPendingReviewWithoutOrcamento(report) {
  return report?.status === 'pending_review' && !reportHasPedidoOrcamento(report);
}

export function reportOrcamentoGuardado(report) {
  return Boolean(report?.data?.orcamento?.atualizadoEm);
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
