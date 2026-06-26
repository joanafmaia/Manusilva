/**
 * Pedido de orçamento — deteção e URLs associados ao relatório.
 */

export function reportHasPedidoOrcamento(report) {
  const values = report?.data?.values || {};
  return String(values.pedido_orcamento || '').trim().toLowerCase() === 'sim';
}

export function getPedidoOrcamentoDetalhe(report) {
  const values = report?.data?.values || {};
  return String(values.detalhe_pedido_orcamento || '').trim();
}

export function getReportOrcamentoPdfUrl(report) {
  const url = report?.data?.urlPdfOrcamento;
  return url && String(url).trim() ? String(url).trim() : null;
}

export function getReportOrcamentoPdfFilename(report) {
  const name = report?.data?.orcamentoPdfFilename;
  return name && String(name).trim() ? String(name).trim() : null;
}
