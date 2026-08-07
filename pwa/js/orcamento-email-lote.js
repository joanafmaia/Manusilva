/**
 * Envio em lote de propostas comerciais MS.015 por cliente.
 */

import { getClient, getJob, getTechnician, showToast } from './app.js';
import { getClientName } from './client-display.js';
import { resolveOrcamentoClienteNome, resolveOrcamentoPastaKey } from './orcamento-cabecalho.js';
import { getReportOrcamentoMeta, resolveOrcamentoNumeroFormatado } from './orcamento-linhas.js';
import { attachOrcamentoPdfToReport } from './orcamento-pdf-service.js';
import {
  getReportOrcamentoPdfUrl,
  reportIsRhOrcamento,
  reportOrcamentoPorPreparar,
} from './pedido-orcamento.js';
import { prepareEmailPdfPayload } from './report-email-pdf.js';
import { sendOrcamentoLoteEmail } from './report-email-api.js';
import { resolveOrcamentoDocumentDate } from './orcamento-fill-data.js';
import { formatInterventionDatePt } from './report-intervention-date.js';
import { mergeReportInCache, updateRelatorio } from './relatorios-db.js';
import {
  formatEmailListForStorage,
  isValidEmailList,
  normalizeEmailList,
} from './validators.js';

/**
 * @param {object} report
 * @returns {boolean}
 */
export function isOrcamentoLotePendente(report) {
  if (!reportIsRhOrcamento(report)) return false;
  const meta = getReportOrcamentoMeta(report);
  if (meta?.enviadoEm) return false;
  if (reportOrcamentoPorPreparar(report)) return false;
  return true;
}

/**
 * @param {object} report
 * @returns {boolean}
 */
export function isOrcamentoLoteEnviado(report) {
  if (!reportIsRhOrcamento(report)) return false;
  return Boolean(getReportOrcamentoMeta(report)?.enviadoEm);
}

/**
 * @param {object[]} reports
 * @param {string} clientId
 * @param {{ mode?: 'pendentes' | 'reenvio', pastaKey?: string, clienteNome?: string }} [options]
 */
export function filterOrcamentoLoteReports(reports = [], clientId, { mode = 'pendentes', pastaKey = '', clienteNome = '' } = {}) {
  const cid = String(clientId || '').trim();
  const key = String(pastaKey || '').trim();
  let list = Array.isArray(reports) ? reports : [];

  if (key) {
    list = list.filter((report) => resolveOrcamentoPastaKey(report) === key);
  } else if (cid) {
    list = list.filter((report) => String(report?.clientId || '') === cid);
  } else {
    const nomeWanted = String(clienteNome || '').trim().toLowerCase();
    if (!nomeWanted) return [];
    list = list.filter((report) => {
      if (String(report?.clientId || '').trim()) return false;
      const nome = resolveOrcamentoClienteNome(report);
      return nome !== '—' && nome.toLowerCase() === nomeWanted;
    });
  }

  if (mode === 'reenvio') {
    return list.filter(isOrcamentoLoteEnviado);
  }
  return list.filter(isOrcamentoLotePendente);
}

export function formatOrcamentoLoteNumeros(reports = []) {
  return reports
    .map((report) => {
      const meta = getReportOrcamentoMeta(report) || {};
      return (
        resolveOrcamentoNumeroFormatado(meta, {
          year: meta.ano || new Date().getFullYear(),
        }) || meta.numeroFormatado || '—'
      );
    })
    .filter(Boolean);
}

/**
 * Garante PDF em Storage para cada proposta do lote.
 * @param {object[]} reports
 * @returns {Promise<object[]>}
 */
export async function ensureOrcamentoLotePdfs(reports = []) {
  const out = [];
  for (const report of reports) {
    let current = report;
    let pdfUrl = getReportOrcamentoPdfUrl(current);
    if (!pdfUrl) {
      current = (await attachOrcamentoPdfToReport(current, { force: true })) || current;
      pdfUrl = getReportOrcamentoPdfUrl(current);
    }
    if (!pdfUrl) {
      const meta = getReportOrcamentoMeta(current) || {};
      const numero = meta.numeroFormatado || current.id;
      throw new Error(`Não foi possível obter o PDF da proposta ${numero}.`);
    }
    out.push(current);
  }
  return out;
}

/**
 * @param {object[]} reports
 * @param {{ to?: string | string[], mode?: 'pendentes' | 'reenvio' }} [options]
 */
export async function sendOrcamentoLoteForReports(reports = [], options = {}) {
  const mode = options.mode === 'reenvio' ? 'reenvio' : 'pendentes';
  const list = Array.isArray(reports) ? reports.filter(Boolean) : [];
  if (!list.length) {
    throw new Error(
      mode === 'reenvio'
        ? 'Não há propostas enviadas para reenviar neste cliente.'
        : 'Não há propostas preparadas para enviar neste cliente.',
    );
  }

  const pastaKey = resolveOrcamentoPastaKey(list[0]);
  if (!pastaKey || !list.every((report) => resolveOrcamentoPastaKey(report) === pastaKey)) {
    throw new Error('O lote só pode incluir propostas do mesmo cliente.');
  }

  const clientId = String(list[0]?.clientId || '').trim();
  const client = clientId ? getClient(clientId) : null;
  const toRaw = options.to != null ? options.to : '';
  let recipients = normalizeEmailList(
    Array.isArray(toRaw) ? toRaw.join(';') : String(toRaw || ''),
  );
  if (!recipients.length) {
    const values = list[0]?.data?.values || {};
    const fallback = String(
      client?.email ||
        client?.['E-mail'] ||
        values.email ||
        values['E-mail'] ||
        values.email_cliente ||
        '',
    ).trim();
    recipients = normalizeEmailList(fallback);
  }
  if (!recipients.length) {
    throw new Error('Indique pelo menos um e-mail de destino.');
  }
  if (!isValidEmailList(recipients.join(';'))) {
    throw new Error('Um ou mais e-mails são inválidos.');
  }

  const withPdfs = await ensureOrcamentoLotePdfs(list);
  const pdfEntries = withPdfs.map((report) => {
    const meta = getReportOrcamentoMeta(report) || {};
    const numero =
      resolveOrcamentoNumeroFormatado(meta, {
        year: meta.ano || new Date().getFullYear(),
      }) || meta.numeroFormatado || 'Proposta';
    const filename =
      String(report.data?.orcamentoPdfFilename || '').trim() ||
      `MS015_Orcamento_${String(numero).replace(/[^\w.-]+/g, '_')}.pdf`;
    return {
      publicUrl: getReportOrcamentoPdfUrl(report),
      filename,
      machineLabel: `Proposta nº ${numero}`,
    };
  });

  const emailPdfPayload = await prepareEmailPdfPayload(pdfEntries);
  const deliveredCount =
    emailPdfPayload.pdfAttachments?.length || emailPdfPayload.pdfUrls?.length || 0;
  if (deliveredCount < pdfEntries.length) {
    throw new Error(
      `Só ${deliveredCount} de ${pdfEntries.length} PDF(s) estão disponíveis. Não foi enviado e-mail incompleto.`,
    );
  }

  const numeros = formatOrcamentoLoteNumeros(withPdfs);
  const values = withPdfs[0]?.data?.values || {};
  const resolvedNome = resolveOrcamentoClienteNome(withPdfs[0]);
  const clienteNome =
    resolvedNome !== '—'
      ? resolvedNome
      : getClientName(client, values) || client?.name || client?.Nome || 'Cliente';
  const job = withPdfs[0]?.jobId ? getJob(withPdfs[0].jobId) : null;
  const tech = getTechnician(withPdfs[0]?.technicianId);

  await sendOrcamentoLoteEmail({
    to: recipients,
    reportId: withPdfs[0].id,
    reportIds: withPdfs.map((r) => r.id),
    clienteNome,
    tecnico: tech?.name || tech?.Nome || 'ManuSilva',
    dataConclusao: formatInterventionDatePt(resolveOrcamentoDocumentDate(withPdfs[0])),
    numeroOrdem: job?.numeroOrdem ?? null,
    orcamentoNumero: numeros.length === 1 ? numeros[0] : '',
    orcamentoNumeros: numeros,
    propostaCount: withPdfs.length,
    ...emailPdfPayload,
  });

  const enviadoEm = new Date().toISOString();
  const emailStored = formatEmailListForStorage(recipients);
  const saved = [];
  for (const report of withPdfs) {
    const meta = {
      ...(getReportOrcamentoMeta(report) || {}),
      emailDestinatario: emailStored,
      enviadoEm,
    };
    const updated = await updateRelatorio(report.id, {
      data: {
        orcamento: meta,
      },
    });
    if (updated) {
      mergeReportInCache(updated);
      saved.push(updated);
    } else {
      const fallback = {
        ...report,
        data: { ...(report.data || {}), orcamento: meta },
      };
      mergeReportInCache(fallback);
      saved.push(fallback);
    }
  }

  return { reports: saved, recipients, numeros };
}

/**
 * UI helper — toast + send for a client folder.
 * @param {object[]} allReports
 * @param {string} clientId
 * @param {{ to?: string, mode?: 'pendentes' | 'reenvio', pastaKey?: string, clienteNome?: string }} [options]
 */
export async function sendOrcamentoLoteForClient(allReports, clientId, options = {}) {
  const mode = options.mode === 'reenvio' ? 'reenvio' : 'pendentes';
  const lote = filterOrcamentoLoteReports(allReports, clientId, {
    mode,
    pastaKey: options.pastaKey || '',
    clienteNome: options.clienteNome || '',
  });
  if (!lote.length) {
    showToast(
      mode === 'reenvio'
        ? 'Não há propostas enviadas para reenviar.'
        : 'Não há propostas preparadas para enviar. Guarde as propostas primeiro.',
      'warning',
      7000,
    );
    return null;
  }

  const numeros = formatOrcamentoLoteNumeros(lote);
  showToast(
    `A enviar ${lote.length} proposta${lote.length === 1 ? '' : 's'} (${numeros.join(', ')})…`,
    'info',
    6000,
  );

  const result = await sendOrcamentoLoteForReports(lote, options);
  showToast(
    `${result.reports.length} proposta${result.reports.length === 1 ? '' : 's'} enviada${result.reports.length === 1 ? '' : 's'} para ${result.recipients.join(', ')}.`,
    'success',
    8000,
  );
  return result;
}
