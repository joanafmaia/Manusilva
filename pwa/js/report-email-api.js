/**
 * Envio de e-mail oficial via API serverless (`/api/enviar-email`).
 */

import { formatInterventionDatePt } from './report-intervention-date.js';

/**
 * @param {{ tipoRelatorio?: string, reportId?: string, clienteNome?: string, nome_empresa?: string, tecnico?: string, dataConclusao?: string, to?: string | string[], serieFrota?: string, numeroOrdem?: number | null, pdfUrl?: string, pdfUrls?: Array<string | { url: string, filename?: string, label?: string }>, pdfFilename?: string, pdfBase64?: string, pdfAttachments?: Array<{ pdfFilename: string, pdfBase64: string }>, orcamentoNumero?: string }} [meta]
 */
function formatEmailApiError(err = {}, status = 0) {
  const details = [err.error, err.hint, err.detail, err.code, err.responseCode]
    .filter((part) => part != null && String(part).trim() !== '')
    .map((part) => String(part).trim())
    .join(' | ');
  if (details) return details;
  if (status === 502 || status === 504) {
    return `Servidor de e-mail indisponível ou demorou demasiado (HTTP ${status}). Tente «Reenviar e-mail» daqui a momentos.`;
  }
  if (status === 413) {
    return 'Pedido de e-mail demasiado grande. O PDF será anexado a partir do Storage — tente reenviar.';
  }
  if (status) return `Falha ao enviar e-mail pela API (código de erro: ${status}).`;
  return 'Falha ao enviar e-mail pela API.';
}

export async function sendOfficialReportEmail(meta = {}) {
  const { getFreshAccessToken } = await import('./supabase-client.js');
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sessão expirada. Inicie sessão novamente para enviar o e-mail.');
  }

  const dateStamp = formatInterventionDatePt(meta.dataConclusao) || '';
  const clienteNome = meta.clienteNome || meta.nome_empresa || 'Cliente não indicado';
  const tecnico = meta.tecnico || 'Técnico não indicado';
  const tipoRelatorio = meta.tipoRelatorio || 'outro';
  const serieFrota = meta.serieFrota || '';

  // Preferir URLs do Storage — base64 no body provoca 502/timeout no proxy.
  const body = {
    to: meta.to,
    reportId: meta.reportId,
    clienteNome,
    tecnico,
    dataConclusao: dateStamp,
    tipoRelatorio,
    serieFrota,
    numeroOrdem: meta.numeroOrdem ?? null,
    orcamentoNumero: meta.orcamentoNumero,
    pdfUrl: meta.pdfUrl,
    pdfUrls: meta.pdfUrls,
    servicoId: meta.servicoId || null,
    includeRatingLinks: meta.includeRatingLinks !== false,
    skipRatingLink: Boolean(meta.skipRatingLink),
  };
  const hasUrls =
    Boolean(meta.pdfUrl) || (Array.isArray(meta.pdfUrls) && meta.pdfUrls.length > 0);
  if (!hasUrls) {
    if (meta.pdfFilename && meta.pdfBase64) {
      body.pdfFilename = meta.pdfFilename;
      body.pdfBase64 = meta.pdfBase64;
    }
    if (Array.isArray(meta.pdfAttachments) && meta.pdfAttachments.length) {
      body.pdfAttachments = meta.pdfAttachments;
    }
  }

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(formatEmailApiError(err, response.status));
  }

  return true;
}

/** Envia proposta comercial MS.015 por e-mail (1 ou N PDFs). */
export async function sendOrcamentoProposalEmail(meta = {}) {
  const { getFreshAccessToken } = await import('./supabase-client.js');
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sessão expirada. Inicie sessão novamente para enviar a proposta.');
  }

  const dateStamp = formatInterventionDatePt(meta.dataConclusao) || '';
  const toList = Array.isArray(meta.to)
    ? meta.to
    : String(meta.to || '')
        .split(/[;,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  const propostaCount = Number(meta.propostaCount) || 0;
  const isLote =
    Boolean(meta.lote) ||
    propostaCount > 1 ||
    (Array.isArray(meta.pdfUrls) && meta.pdfUrls.length > 1) ||
    (Array.isArray(meta.pdfAttachments) && meta.pdfAttachments.length > 1);

  const payload = {
    to: toList,
    reportId: meta.reportId,
    reportIds: meta.reportIds,
    clienteNome: meta.clienteNome || meta.nome_empresa || 'Cliente não indicado',
    tecnico: meta.tecnico || 'Técnico não indicado',
    dataConclusao: dateStamp,
    tipoRelatorio: isLote ? 'orcamento_lote' : 'orcamento',
    orcamentoNumero: meta.orcamentoNumero || '',
    orcamentoNumeros: meta.orcamentoNumeros || [],
    propostaCount: propostaCount || (isLote ? meta.pdfUrls?.length || meta.pdfAttachments?.length || 0 : 1),
    numeroOrdem: meta.numeroOrdem ?? null,
    pdfUrl: meta.pdfUrl,
    pdfUrls: meta.pdfUrls,
  };
  const hasUrls =
    Boolean(meta.pdfUrl) || (Array.isArray(meta.pdfUrls) && meta.pdfUrls.length > 0);
  if (!hasUrls) {
    if (meta.pdfBase64 && meta.pdfFilename) {
      payload.pdfBase64 = meta.pdfBase64;
      payload.pdfFilename = meta.pdfFilename;
    }
    if (Array.isArray(meta.pdfAttachments) && meta.pdfAttachments.length) {
      payload.pdfAttachments = meta.pdfAttachments;
    }
  }

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(formatEmailApiError(err, response.status));
  }

  return true;
}

/** Alias explícito para lote de propostas (mesmo payload multi-PDF). */
export async function sendOrcamentoLoteEmail(meta = {}) {
  return sendOrcamentoProposalEmail({ ...meta, lote: true });
}
