/**
 * Reenvio e envio em lote de e-mails de relatórios aprovados.
 */

import { buildReportEmailMeta } from './report-email-meta.js';
import { showToast } from './toast-modal.js';
import { ensureJobsLoaded } from './trabalhos-db.js';
import { updateRelatorio } from './relatorios-db.js';
import { patchTrabalho } from './trabalhos-db.js';
import { arrayBufferToBase64 } from './base64-utils.js';
import {
  getClient,
  getJob,
  getReport,
  getServiceType,
  getTechnician,
} from './entity-lookups.js';
import { syncClientEmailIfChanged } from './clients-admin.js';
import { sendOfficialReportEmail } from './report-email-api.js';
import {
  buildReportEmailPdfPayload,
  blobToBase64,
  generateAndUploadApprovedReportPdfs,
  resolveApprovedReportPdfSources,
} from './report-email-pdf.js';

function buildRecipientList(primaryEmail, extraEmail) {
  const seen = new Set();
  return [primaryEmail, extraEmail]
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * @param {string} reportId
 * @param {{ clientEmail?: string, extraClientEmail?: string }} [options]
 */
export async function resendApprovedReportEmail(reportId, options = {}) {
  await ensureJobsLoaded(true);

  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }
  if (report.status !== 'approved') {
    showToast('Só é possível reenviar e-mail de relatórios já aprovados.', 'warning');
    return false;
  }

  const client = getClient(report.clientId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const service = getServiceType(report.serviceType);
  const clientEmailInput = String(options.clientEmail ?? '').trim();
  const extraClientEmailInput = String(options.extraClientEmail ?? '').trim();

  if (clientEmailInput || extraClientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (clientEmailInput && !isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido.', 'error');
      return false;
    }
    if (extraClientEmailInput && !isValidEmail(extraClientEmailInput)) {
      showToast('Introduza um e-mail adicional válido.', 'error');
      return false;
    }
    if (report.clientId) {
      await syncClientEmailIfChanged(report.clientId, clientEmailInput || extraClientEmailInput);
    }
  }

  const primaryRecipient = clientEmailInput || client?.email || client?.['E-mail'] || '';
  const recipients = buildRecipientList(primaryRecipient, extraClientEmailInput);
  if (!recipients.length) {
    showToast('O cliente não tem e-mail registado. Indique um e-mail antes de reenviar.', 'warning');
    return false;
  }
  const recipientsLabel = recipients.join(', ');

  const {
    isEmpilhadoresMultiMaquinaReport,
    getEmpilhadoresMaquinasFromReport,
  } = await import('./views/relatorio-empilhadores-maquinas.js');

  let pdfSources = resolveApprovedReportPdfSources(report, job);
  const expectedPdfCount = isEmpilhadoresMultiMaquinaReport(report)
    ? getEmpilhadoresMaquinasFromReport(report).length
    : 1;

  if (pdfSources.length < expectedPdfCount) {
    try {
      showToast('A preparar todos os PDFs da ordem de trabalho...', 'info', 4000);
      const regenerated = await generateAndUploadApprovedReportPdfs(report, job, service);
      if (regenerated.length) {
        pdfSources = regenerated;
        await updateRelatorio(reportId, {
          data: {
            urlPdfs: regenerated.map((entry) => entry.publicUrl),
            pdfFilenames: regenerated.map((entry) => entry.filename),
          },
        });
        if (report.jobId && regenerated[0]?.publicUrl) {
          await patchTrabalho(report.jobId, { urlPdf: regenerated[0].publicUrl });
        }
      }
    } catch (err) {
      console.warn('[Email] Regeneração multi-PDF no reenvio:', err);
    }
  }

  if (!pdfSources.length) {
    showToast('PDF do relatório não encontrado no Storage. Contacte suporte técnico.', 'error');
    return false;
  }

  const MAX_BASE64_LEN = 3_000_000;
  const emailPdfEntries = pdfSources.map((source) => ({
    publicUrl: source.publicUrl,
    filename: source.filename,
    machineLabel: source.machineLabel,
  }));

  if (pdfSources.length === 1) {
    const source = pdfSources[0];
    try {
      if (source.blob) {
        emailPdfEntries[0].base64 = await blobToBase64(source.blob);
      } else if (source.publicUrl) {
        const res = await fetch(source.publicUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          if (b64.length > 0 && b64.length <= MAX_BASE64_LEN) {
            emailPdfEntries[0].base64 = b64;
          }
        }
      }
    } catch (err) {
      console.warn('[Email] Anexo PDF no reenvio:', err);
    }
  }

  const emailPdfPayload = buildReportEmailPdfPayload(emailPdfEntries);
  const pdfCount = pdfSources.length;

  showToast(
    pdfCount > 1
      ? `A reenviar e-mail com ${pdfCount} relatórios para ${recipientsLabel}...`
      : `A reenviar e-mail para ${recipientsLabel}...`,
    'info',
    5000,
  );

  try {
    await sendOfficialReportEmail({
      ...buildReportEmailMeta(report, {
        client,
        job,
        technicianName: getTechnician(report.technicianId)?.name || '',
      }),
      to: recipients,
      ...emailPdfPayload,
    });
    showToast(`E-mail reenviado para ${recipientsLabel}.`, 'success', 6000);
    return true;
  } catch (err) {
    console.error('[Email] Reenvio falhou:', err);
    showToast(`Falha ao reenviar e-mail. ${err?.message || ''}`.trim(), 'error', 8000);
    return false;
  }
}

/**
 * @param {string[]} reportIds
 * @param {{ clientEmail?: string, extraClientEmail?: string }} [options]
 */
export async function sendSelectedReportsEmail(reportIds, options = {}) {
  const uniqueIds = [...new Set((reportIds || []).map((id) => String(id)).filter(Boolean))];
  if (!uniqueIds.length) {
    showToast('Selecione pelo menos um relatório aprovado.', 'warning');
    return false;
  }

  await ensureJobsLoaded(true);

  const reports = uniqueIds
    .map((id) => getReport(id))
    .filter((report) => report?.status === 'approved');

  if (!reports.length) {
    showToast('Só pode enviar relatórios já aprovados.', 'warning', 7000);
    return false;
  }

  if (reports.length < uniqueIds.length) {
    showToast('Relatórios não aprovados foram ignorados.', 'info', 5000);
  }

  const clientId = reports[0]?.clientId;
  const sameClient = reports.every((report) => String(report.clientId) === String(clientId));
  if (!sameClient) {
    showToast('Selecione relatórios do mesmo cliente.', 'error');
    return false;
  }

  const client = getClient(clientId);
  const clientEmailInput = String(options.clientEmail ?? '').trim();
  const extraClientEmailInput = String(options.extraClientEmail ?? '').trim();
  if (clientEmailInput || extraClientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (clientEmailInput && !isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido.', 'error');
      return false;
    }
    if (extraClientEmailInput && !isValidEmail(extraClientEmailInput)) {
      showToast('Introduza um e-mail adicional válido.', 'error');
      return false;
    }
    if (clientId) {
      await syncClientEmailIfChanged(clientId, clientEmailInput || extraClientEmailInput);
    }
  }

  const primaryRecipient = clientEmailInput || client?.email || client?.['E-mail'] || '';
  const recipients = buildRecipientList(primaryRecipient, extraClientEmailInput);
  if (!recipients.length) {
    showToast('O cliente não tem e-mail registado.', 'warning');
    return false;
  }
  const recipientsLabel = recipients.join(', ');

  const pdfEntries = [];
  for (const report of reports) {
    const job = report.jobId ? getJob(report.jobId) : null;
    const service = getServiceType(report.serviceType);
    let sources = resolveApprovedReportPdfSources(report, job);

    if (!sources.length) {
      try {
        const regenerated = await generateAndUploadApprovedReportPdfs(report, job, service);
        sources = regenerated;
        await updateRelatorio(report.id, {
          data: {
            urlPdfs: regenerated.map((entry) => entry.publicUrl),
            pdfFilenames: regenerated.map((entry) => entry.filename),
          },
        });
        if (report.jobId && regenerated[0]?.publicUrl) {
          await patchTrabalho(report.jobId, { urlPdf: regenerated[0].publicUrl });
        }
      } catch (err) {
        console.warn('[Email] Regeneração PDF seleção:', err);
      }
    }

    const serviceLabel = service?.label || report.serviceType || 'Relatório';
    sources.forEach((source, index) => {
      pdfEntries.push({
        ...source,
        machineLabel:
          sources.length > 1
            ? `${serviceLabel} — ${source.machineLabel || source.filename || `PDF ${index + 1}`}`
            : serviceLabel,
      });
    });
  }

  if (!pdfEntries.length) {
    showToast('Não foi possível obter os PDFs dos relatórios selecionados.', 'error');
    return false;
  }

  const emailPdfPayload = buildReportEmailPdfPayload(pdfEntries);
  const tech = getTechnician(reports[0]?.technicianId);

  showToast(
    `A enviar ${reports.length} relatório${reports.length === 1 ? '' : 's'} (${pdfEntries.length} PDF${pdfEntries.length === 1 ? '' : 's'}) para ${recipientsLabel}...`,
    'info',
    6000,
  );

  try {
    await sendOfficialReportEmail({
      ...buildReportEmailMeta(reports[0], {
        client,
        job: reports[0].jobId ? getJob(reports[0].jobId) : null,
        technicianName: tech?.name || '',
        multiReport: reports.length > 1,
        multiPdf: pdfEntries.length > 1,
      }),
      reportId: reports[0].id,
      numeroOrdem: null,
      to: recipients,
      ...emailPdfPayload,
    });

    const sentAt = new Date().toISOString();
    for (const report of reports) {
      await updateRelatorio(report.id, {
        data: { visitClienteEmailSentAt: sentAt },
      });
    }

    showToast(`E-mail enviado para ${recipientsLabel} com ${pdfEntries.length} anexo(s).`, 'success', 7000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    return true;
  } catch (err) {
    console.error('[Email] Envio selecionados falhou:', err);
    showToast(`Falha ao enviar e-mail. ${err?.message || ''}`.trim(), 'error', 8000);
    return false;
  }
}
