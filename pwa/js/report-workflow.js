/**
 * Ciclo de vida dos relatórios — rascunho, submissão, aprovação e rejeição.
 */

import { buildReportEmailMeta } from './report-email-meta.js';
import { showToast } from './toast-modal.js';
import { sameEntityId } from './entity-id.js';
import { reportIsRhOrcamento } from './pedido-orcamento.js';
import { FATURACAO_AGUARDA_ACEITE_ORCAMENTO } from './orcamento-billing-workflow.js';
import {
  getClient,
  getJob,
  getReport,
  getReportForJob,
  getServiceType,
  getTechnician,
} from './entity-lookups.js';
import { syncClientEmailIfChanged } from './clients-admin.js';
import { canReachServer } from './offline-mode.js';
import { sendOfficialReportEmail } from './report-email-api.js';
import {
  buildReportEmailPdfPayload,
  blobToBase64,
  generateAndUploadApprovedReportPdfs,
} from './report-email-pdf.js';
import { formatPdfStorageError } from './pdf-storage.js';
import {
  ensureJobsLoaded,
  insertTrabalhoFromReport,
  patchTrabalho,
  patchTrabalhoStatus,
} from './trabalhos-db.js';
import {
  ensureReportsLoaded,
  getReportsSnapshot,
  upsertRelatorio,
  updateRelatorio,
  formatRelatoriosError,
} from './relatorios-db.js';
import { reportHasPedidoOrcamento, reportOrcamentoPorPreparar } from './pedido-orcamento.js';
import { deleteStandaloneOrcamentoReport, reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { getServicoActiveReports, resolveServicoIdForVisitEmail, shouldDeferServicoVisitEmail } from './servicos-email-workflow.js';
import { resolveServicoIdForReport } from './servicos-panel-utils.js';

/**
 * @param {object} report
 * @param {{ silent?: boolean }} [options]
 */
export async function saveReportDraft(report, options = {}) {
  const { silent = false } = options;

  if (!report?.jobId && !report?.servicoId) {
    if (!silent) showToast('Não foi possível guardar o rascunho.', 'error');
    return null;
  }

  const draft = {
    ...report,
    status: 'draft',
    submittedAt: report.submittedAt || new Date().toISOString(),
  };

  const { saveLocalReportDraft } = await import('./report-local-storage.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  await saveLocalReportDraft(draft);
  mergeReportInCache(draft);
  window.dispatchEvent(new CustomEvent('db-updated'));

  if (!canReachServer()) {
    if (!silent) {
      showToast('Relatório em aberto guardado neste dispositivo.', 'info', 3500);
    }
    return draft;
  }

  try {
    const saved = await upsertRelatorio(draft);
    if (saved) mergeReportInCache(saved);
    const { removeLocalReportDraft, reportDraftStorageKey } = await import('./report-local-storage.js');
    await removeLocalReportDraft(reportDraftStorageKey(draft));
    const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
    void upsertClienteEquipamentosFromReport(saved || draft);
    window.dispatchEvent(new CustomEvent('db-updated'));
    if (!silent) {
      showToast(
        'Relatório guardado em aberto. Pode continuar amanhã e somar novas visitas.',
        'success',
        5000,
      );
    }
    return saved || draft;
  } catch (err) {
    console.error('[ManuSilva] saveReportDraft:', err);
    if (!silent) {
      showToast(
        'Rascunho guardado neste dispositivo. Sincroniza quando tiver rede.',
        'warning',
        5000,
      );
    }
    return draft;
  }
}

/**
 * @param {object} report
 * @param {{ isCorrection?: boolean }} [options]
 */
export async function submitReport(report, options = {}) {
  const { isCorrection = false, skipDuplicateToast = false } = options;
  const {
    addTrabalhoPendente,
    sincronizarTrabalhosOffline,
    hasTrabalhoPendente,
    canSyncToServer,
    MSG_OFFLINE_SUBMIT,
  } = await import('./trabalhos-offline.js');
  const { removeLocalReportDraft } = await import('./report-local-storage.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const final = {
    ...report,
    status: 'pending_review',
    submittedAt: isCorrection
      ? report.submittedAt || new Date().toISOString()
      : new Date().toISOString(),
  };

  if (!isCorrection && final.servicoId && final.serviceType) {
    await ensureReportsLoaded();
    const duplicatePending = getReportsSnapshot().find(
      (r) =>
        sameEntityId(r.servicoId, final.servicoId) &&
        r.serviceType === final.serviceType &&
        r.status === 'pending_review' &&
        (!final.id || !sameEntityId(r.id, final.id)),
    );
    if (duplicatePending) {
      if (!skipDuplicateToast) {
        showToast(
          'Este relatório já foi enviado para aprovação do RH.',
          'warning',
          7000,
        );
      }
      return { queued: false };
    }
  } else if (!isCorrection && final.jobId) {
    await ensureReportsLoaded();
    const duplicatePending = getReportsSnapshot().find(
      (r) =>
        sameEntityId(r.jobId, final.jobId) &&
        r.status === 'pending_review' &&
        (!final.id || !sameEntityId(r.id, final.id)),
    );
    if (duplicatePending) {
      if (!skipDuplicateToast) {
        showToast(
          'Este trabalho já tem um relatório à espera de aprovação do RH.',
          'warning',
          7000,
        );
      }
      return { queued: false };
    }
  }

  if (isCorrection && !final.id && report.jobId) {
    const existing = getReportForJob(report.jobId);
    if (existing?.id) final.id = existing.id;
  }

  let pendingId;
  try {
    pendingId = await addTrabalhoPendente({ report: final, tipo: 'submit' });
  } catch (err) {
    console.error('[ManuSilva] Guardar relatório local:', err);
    showToast('Não foi possível guardar o relatório no dispositivo.', 'error');
    return { queued: false };
  }

  mergeReportInCache(final);

  if (!canSyncToServer()) {
    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
    return { queued: true, pendingId };
  }

  try {
    await sincronizarTrabalhosOffline({ notify: false });

    if (!(await hasTrabalhoPendente(pendingId))) {
      const { reportDraftStorageKey } = await import('./report-local-storage.js');
      await removeLocalReportDraft(reportDraftStorageKey(final));
      const syncedReport =
        (final.servicoId && final.serviceType
          ? getReportsSnapshot().find(
              (r) =>
                sameEntityId(r.servicoId, final.servicoId) && r.serviceType === final.serviceType,
            )
          : null) ||
        getReportForJob(final.jobId) ||
        final;
      const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
      void upsertClienteEquipamentosFromReport(syncedReport);
      window.dispatchEvent(new CustomEvent('db-updated'));
      showToast(
        isCorrection
          ? 'Relatório concluído e reenviado para aprovação do RH.'
          : 'Relatório concluído e enviado para aprovação do RH.',
        'success',
      );
      return { queued: false, updated: isCorrection };
    }

    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    return { queued: true, pendingId };
  } catch (err) {
    console.error('[ManuSilva] submitReport:', err);
    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    return { queued: true, pendingId };
  }
}

/**
 * @param {string} reportId
 * @param {{ clientEmail?: string, skipClientEmail?: boolean }} [options]
 */
export async function approveReport(reportId, options = {}) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return null;
  }

  const client = getClient(report.clientId);
  const service = getServiceType(report.serviceType);
  const clientEmailInput = String(options.clientEmail ?? '').trim();
  const testClient = isTestClient(client);

  if (clientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (!isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido antes de aprovar.', 'error');
      return null;
    }
  }

  try {
    await ensureJobsLoaded(true);

    let job = report.jobId ? getJob(report.jobId) : null;
    let reportForPdf = report;

    if (!job) {
      job = await insertTrabalhoFromReport(report);
      if (!job?.id) {
        showToast('Não foi possível criar o trabalho para o relatório.', 'error');
        return null;
      }
      reportForPdf = { ...report, jobId: job.id };
      await upsertRelatorio(reportForPdf);
    }

    if (job.numeroOrdem == null && !testClient) {
      await ensureJobsLoaded(true);
      job = getJob(job.id) || job;
    }

    showToast('A gerar folha de intervenção em PDF...', 'info', 2500);

    let pdfEntries;
    try {
      pdfEntries = await generateAndUploadApprovedReportPdfs(reportForPdf, job, service);
    } catch (storageErr) {
      console.error('[ManuSilva] Upload PDF Storage:', storageErr);
      showToast(formatPdfStorageError(storageErr), 'error', 9000);
      return null;
    }
    if (!pdfEntries.length) {
      showToast('Não foi possível gerar os PDFs do relatório.', 'error');
      return null;
    }

    const publicPdfUrl = pdfEntries[0].publicUrl;
    const filename = pdfEntries[0].filename;
    const urlPdfs = pdfEntries.map((entry) => entry.publicUrl);
    const pdfFilenames = pdfEntries.map((entry) => entry.filename);

    const emailPdfPayload =
      pdfEntries.length > 1
        ? buildReportEmailPdfPayload(pdfEntries)
        : buildReportEmailPdfPayload([
            { ...pdfEntries[0], base64: await blobToBase64(pdfEntries[0].blob) },
          ]);

    const servicoId =
      resolveServicoIdForReport(reportForPdf) ||
      resolveServicoIdForReport(report) ||
      resolveServicoIdForVisitEmail(getReport(reportId));

    await updateRelatorio(reportId, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      pdfFilename: filename,
      faturacaoStatus: servicoId
        ? 'via_servico'
        : reportIsRhOrcamento(report)
          ? FATURACAO_AGUARDA_ACEITE_ORCAMENTO
          : 'pendente',
      data: {
        ...(report.data || {}),
        urlPdfs,
        pdfFilenames,
      },
    });

    if (servicoId) {
      const { markServicoPendingBillingIfReady } = await import('./servicos-billing-workflow.js');
      await markServicoPendingBillingIfReady(servicoId);
    }

    if (reportForPdf.jobId) {
      await patchTrabalho(reportForPdf.jobId, {
        status: 'completed',
        rejectionNote: null,
        urlPdf: publicPdfUrl,
      });
    }

    window.dispatchEvent(new CustomEvent('db-updated'));

    const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
    void upsertClienteEquipamentosFromReport(reportForPdf);

    const skipClientEmail = options.skipClientEmail === true;

    let emailSynced = false;
    if (clientEmailInput && report.clientId) {
      emailSynced = await syncClientEmailIfChanged(report.clientId, clientEmailInput);
    }

    const recipientEmail =
      clientEmailInput || client?.email || client?.['E-mail'] || '';

    const deferVisitEmail = servicoId && shouldDeferServicoVisitEmail({ ...report, servicoId, jobId: report.jobId || servicoId });

    if (emailSynced) {
      showToast(
        'Relatório aprovado e email do cliente atualizado na base de dados!',
        'success',
        6000,
      );
    } else if (servicoId && deferVisitEmail) {
      const {
        isServicoVisitFullyApproved,
        wasServicoVisitEmailSent,
        sendServicoVisitClientEmail,
      } = await import('./servicos-email-workflow.js');

      if (isServicoVisitFullyApproved(servicoId) && !wasServicoVisitEmailSent(servicoId)) {
        if (!recipientEmail) {
          showToast(
            'Todos os relatórios da visita aprovados, mas o cliente não tem e-mail registado.',
            'warning',
            8000,
          );
        } else {
          showToast(
            `Visita concluída — a enviar ${getServicoActiveReports(servicoId).length} relatório(s) num único e-mail para ${recipientEmail}...`,
            'success',
            7000,
          );
          sendServicoVisitClientEmail(servicoId, { clientEmail: recipientEmail }).catch((err) => {
            console.error('[Email] Envio visita:', err);
            showToast(
              `Relatórios aprovados, mas o e-mail da visita falhou. ${err?.message || ''}`.trim(),
              'warning',
              9000,
            );
          });
        }
      } else if (!isServicoVisitFullyApproved(servicoId)) {
        showToast(
          'Relatório aprovado. O e-mail ao cliente será enviado quando todos os relatórios da visita estiverem aprovados.',
          'success',
          7000,
        );
      } else {
        showToast('Relatório aprovado.', 'success', 5000);
      }
    } else if (recipientEmail && !skipClientEmail) {
      const pdfCount = pdfEntries.length;
      showToast(
        pdfCount > 1
          ? `Relatório aprovado! ${pdfCount} PDFs guardados. A enviar e-mail para ${recipientEmail}...`
          : `Relatório aprovado! PDF guardado no Storage. A enviar e-mail para ${recipientEmail}...`,
        'success',
        7000,
      );

      sendOfficialReportEmail({
        ...buildReportEmailMeta(report, {
          client,
          job,
          technicianName: getTechnician(report.technicianId)?.name || '',
        }),
        to: recipientEmail,
        ...emailPdfPayload,
      }).catch((err) => {
        console.error('[Email] Envio após aprovação falhou:', err);
        showToast(
          `Relatório aprovado, mas o e-mail para o cliente falhou. ${err?.message || ''}`.trim(),
          'warning',
          8000,
        );
      });
    } else if (!emailSynced) {
      showToast('Relatório aprovado, mas o cliente não tem e-mail registado.', 'warning');
    }

    const approvedReport = getReport(reportId) || reportForPdf;
    if (
      reportHasPedidoOrcamento(approvedReport) &&
      reportOrcamentoPorPreparar(approvedReport)
    ) {
      window.setTimeout(() => {
        showToast(
          'Há pedido de orçamento: abra a aba Orçamentos na barra lateral para preparar a proposta comercial.',
          'info',
          9000,
        );
      }, 2800);
    }

    return filename;
  } catch (err) {
    console.error('[PDF]', err);
    showToast('Erro ao gerar o PDF. Tente novamente.', 'error');
    return null;
  }
}

export async function rejectReport(reportId, note) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  try {
    await updateRelatorio(reportId, { status: 'rejected', rejectionNote: note });
    if (report.jobId) {
      await patchTrabalhoStatus(report.jobId, { status: 'rejected', rejectionNote: note });
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Relatório rejeitado. O técnico foi notificado.', 'error');
    return true;
  } catch (err) {
    console.error('[ManuSilva] rejectReport:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
    return false;
  }
}

export async function cancelPedidoOrcamentoReport(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }

  if (reportIsStandaloneOrcamento(report)) {
    const meta = report?.data?.orcamento;
    const client = getClient(report.clientId);
    const label = client?.name || client?.Nome || 'esta proposta';
    const ok = window.confirm(
      `Eliminar a proposta comercial de ${label}?\n\nSerá removida por completo (não há relatório técnico associado).`,
    );
    if (!ok) return false;
    return deleteStandaloneOrcamentoReport(reportId);
  }

  if (!reportHasPedidoOrcamento(report)) {
    showToast('Este relatório já não tem pedido de orçamento.', 'info');
    return false;
  }

  const meta = report?.data?.orcamento;
  if (meta?.enviadoEm) {
    showToast('A proposta comercial já foi enviada ao cliente. Não é possível eliminar o pedido.', 'warning', 8000);
    return false;
  }

  try {
    const values = {
      ...(report.data?.values || {}),
      pedido_orcamento: 'Não',
      detalhe_pedido_orcamento: '',
    };

    await updateRelatorio(reportId, {
      data: {
        ...(report.data || {}),
        values,
        orcamento: null,
        urlPdfOrcamento: null,
        orcamentoPdfFilename: null,
        urlDocxOrcamento: null,
        orcamentoDocxFilename: null,
      },
    });

    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Pedido de orçamento eliminado.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] cancelPedidoOrcamentoReport:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
    return false;
  }
}
