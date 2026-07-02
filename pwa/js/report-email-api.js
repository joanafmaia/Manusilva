/**
 * Envio de e-mail oficial via API serverless (`/api/enviar-email`).
 */

import { formatInterventionDatePt } from './report-intervention-date.js';

/**
 * @param {{ tipoRelatorio?: string, reportId?: string, clienteNome?: string, nome_empresa?: string, tecnico?: string, dataConclusao?: string, to?: string, serieFrota?: string, numeroOrdem?: number | null, pdfUrl?: string, pdfUrls?: Array<string | { url: string, filename?: string, label?: string }>, pdfFilename?: string, pdfBase64?: string, pdfAttachments?: Array<{ pdfFilename: string, pdfBase64: string }>, orcamentoNumero?: string }} [meta]
 */
function formatEmailApiError(err = {}) {
  return [err.error, err.hint, err.detail, err.code, err.responseCode].filter(Boolean).join(' | ');
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

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
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
      pdfFilename: meta.pdfFilename,
      pdfBase64: meta.pdfBase64,
      pdfAttachments: meta.pdfAttachments,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const details = formatEmailApiError(err);
    throw new Error(details || `Falha ao enviar e-mail pela API (código de erro: ${response.status}).`);
  }

  return true;
}

/** Envia proposta comercial MS.015 por e-mail. */
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

  const payload = {
    to: toList,
    reportId: meta.reportId,
    clienteNome: meta.clienteNome || meta.nome_empresa || 'Cliente não indicado',
    tecnico: meta.tecnico || 'Técnico não indicado',
    dataConclusao: dateStamp,
    tipoRelatorio: 'orcamento',
    orcamentoNumero: meta.orcamentoNumero || '',
    numeroOrdem: meta.numeroOrdem ?? null,
    pdfUrl: meta.pdfUrl,
  };
  if (meta.pdfBase64 && meta.pdfFilename) {
    payload.pdfBase64 = meta.pdfBase64;
    payload.pdfFilename = meta.pdfFilename;
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
    const details = formatEmailApiError(err);
    throw new Error(details || `Falha ao enviar e-mail da proposta (código de erro: ${response.status}).`);
  }

  return true;
}
