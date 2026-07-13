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
import { isTestClient } from './client-test-utils.js';
import { canReachServer } from './offline-mode.js';
import { isDraftSafelySynced } from './report-draft-sync.js';
import { sendOfficialReportEmail } from './report-email-api.js';
import { resolveAuditActor } from './audit-actor.js';
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
  reserveRelatorioNumeroOrdem,
} from './relatorios-db.js';
import { reportHasPedidoOrcamento, reportOrcamentoPorPreparar } from './pedido-orcamento.js';
import { deleteStandaloneOrcamentoReport, reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { getServicoActiveReports, resolveServicoIdForVisitEmail, shouldDeferServicoVisitEmail } from './servicos-email-workflow.js';
import { resolveServicoIdForReport, resolveReportTechnicianLabel, buildJobContextForServicoReport } from './servicos-panel-utils.js';
import { ensureServicosLoadedSafe, getServico } from './servicos-db.js';

/** Evita aprovações concorrentes do mesmo relatório (duplo clique → 2 OPs / 2 e-mails). */
const approvalPromises = new Map();

function reportClientEmailAlreadySent(report) {
  return Boolean(report?.data?.visitClienteEmailSentAt);
}

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
    if (saved && isDraftSafelySynced(draft, saved)) {
      await removeLocalReportDraft(reportDraftStorageKey(draft));
    } else if (saved) {
      console.warn(
        '[ManuSilva] Cópia local do rascunho mantida — confirmação incompleta do servidor.',
        reportDraftStorageKey(draft),
      );
    }
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
  const { isCorrection = false, skipDuplicateToast = false, silent = false, fromServicoVisitSubmit = false } = options;
  const servicoId = report.servicoId || resolveServicoIdForReport(report);
  if (servicoId && !fromServicoVisitSubmit) {
    return saveReportDraft(
      {
        ...report,
        servicoId,
        status: 'draft',
        data: {
          ...(report.data || {}),
          technicianCompleted: true,
        },
      },
      { silent },
    );
  }

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

  if (!isCorrection && final.id) {
    await ensureReportsLoaded();
    const duplicatePending = getReportsSnapshot().find(
      (r) => sameEntityId(r.id, final.id) && r.status === 'pending_review',
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
        (final.id
          ? getReportsSnapshot().find((r) => sameEntityId(r.id, final.id))
          : null) ||
        getReportForJob(final.jobId) ||
        final;
      const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
      void upsertClienteEquipamentosFromReport(syncedReport);
      window.dispatchEvent(new CustomEvent('db-updated'));
      if (!silent) {
        showToast(
          isCorrection
            ? 'Relatório concluído e reenviado para aprovação do RH.'
            : 'Relatório concluído e enviado para aprovação do RH.',
          'success',
        );
      }
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
  const key = String(reportId || '');
  if (!key) {
    showToast('Relatório não encontrado.', 'error');
    return null;
  }

  const inFlight = approvalPromises.get(key);
  if (inFlight) return inFlight;

  const run = approveReportOnce(key, options).finally(() => {
    approvalPromises.delete(key);
  });
  approvalPromises.set(key, run);
  return run;
}

async function approveReportOnce(reportId, options = {}) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return null;
  }

  if (report.status !== 'pending_review') {
    if (report.status === 'approved') {
      showToast('Este relatório já foi aprovado.', 'info', 5000);
    } else {
      showToast('Este relatório não está pendente de aprovação.', 'warning', 5000);
    }
    return null;
  }

  const client = getClient(report.clientId);
  const service = getServiceType(report.serviceType);
  const clientEmailInput = String(options.clientEmail ?? '').trim();
  const extraClientEmailInput = String(options.extraClientEmail ?? '').trim();
  const testClient = isTestClient(client);

  const buildRecipientList = (primaryEmail, extraEmail) => {
    const seen = new Set();
    return [primaryEmail, extraEmail]
      .map((value) => String(value || '').trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  if (clientEmailInput || extraClientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (clientEmailInput && !isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido antes de aprovar.', 'error');
      return null;
    }
    if (extraClientEmailInput && !isValidEmail(extraClientEmailInput)) {
      showToast('Introduza um e-mail adicional válido antes de aprovar.', 'error');
      return null;
    }
  }

  try {
    await ensureJobsLoaded();

    let reportForPdf = getReport(reportId) || report;
    let job = reportForPdf.jobId ? getJob(reportForPdf.jobId) : null;
    let createdTrabalhoId = null;

    const linkedServicoId =
      resolveServicoIdForReport(reportForPdf) || resolveServicoIdForReport(report);

    if (!testClient) {
      try {
        const reservedOp = await reserveRelatorioNumeroOrdem(reportForPdf, { testClient });
        if (reservedOp != null) {
          reportForPdf = { ...reportForPdf, numeroOrdem: reservedOp };
        }
      } catch (reserveErr) {
        console.error('[ManuSilva] Reservar OP:', reserveErr);
        showToast(reserveErr?.message || 'Não foi possível atribuir número OP.', 'error', 9000);
        return null;
      }
    }

    if (!job && linkedServicoId) {
      await ensureServicosLoadedSafe();
      const refreshed = getReport(reportId);
      if (refreshed?.jobId) {
        reportForPdf = { ...reportForPdf, ...refreshed };
        job = getJob(refreshed.jobId);
      }
    }

    if (!job && linkedServicoId) {
      const servico = getServico(linkedServicoId);
      job = buildJobContextForServicoReport(servico, reportForPdf);
    } else if (!job) {
      job = await insertTrabalhoFromReport(reportForPdf);
      if (!job?.id) {
        showToast('Não foi possível criar o trabalho para o relatório.', 'error');
        return null;
      }
      createdTrabalhoId = job.id;
      reportForPdf = { ...reportForPdf, jobId: job.id };
      if (job.numeroOrdem != null) {
        reportForPdf = { ...reportForPdf, numeroOrdem: job.numeroOrdem };
      }
      await upsertRelatorio(reportForPdf);
    }

    if (reportForPdf.numeroOrdem != null) {
      job = { ...job, numeroOrdem: reportForPdf.numeroOrdem };
    } else if (job.numeroOrdem == null && !testClient && createdTrabalhoId) {
      await ensureJobsLoaded(true);
      job = getJob(createdTrabalhoId) || job;
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
      approvedBy: resolveAuditActor(),
      pdfFilename: filename,
      numeroOrdem: reportForPdf.numeroOrdem ?? undefined,
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

    if (createdTrabalhoId) {
      await patchTrabalho(createdTrabalhoId, {
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
    if ((clientEmailInput || extraClientEmailInput) && report.clientId) {
      emailSynced = await syncClientEmailIfChanged(
        report.clientId,
        clientEmailInput || extraClientEmailInput,
      );
    }

    const primaryRecipient = clientEmailInput || client?.email || client?.['E-mail'] || '';
    const recipients = buildRecipientList(primaryRecipient, extraClientEmailInput);
    const recipientsLabel = recipients.join(', ');

    const deferVisitEmail =
      servicoId &&
      shouldDeferServicoVisitEmail({
        ...reportForPdf,
        servicoId,
        jobId: reportForPdf.jobId || servicoId,
      });

    const sendVisitEmailIfReady = async ({ quiet = false } = {}) => {
      if (!servicoId || !deferVisitEmail) return false;

      const {
        isServicoVisitFullyApproved,
        wasServicoVisitEmailSent,
        sendServicoVisitClientEmail,
      } = await import('./servicos-email-workflow.js');

      if (!isServicoVisitFullyApproved(servicoId)) return false;

      if (wasServicoVisitEmailSent(servicoId)) {
        if (!quiet) {
          const count = getServicoActiveReports(servicoId).length;
          showToast(
            count > 1
              ? `Visita concluída — ${count} relatórios aprovados.`
              : 'Relatório aprovado.',
            'success',
            5000,
          );
        }
        return false;
      }

      if (!recipients.length) {
        showToast(
          'Todos os relatórios da visita aprovados, mas o cliente não tem e-mail registado.',
          'warning',
          8000,
        );
        return false;
      }

      if (!quiet) {
        showToast(
          `Visita concluída — a enviar ${getServicoActiveReports(servicoId).length} relatório(s) num único e-mail para ${recipientsLabel}...`,
          'success',
          7000,
        );
      }

      try {
        const visitEmailOk = await sendServicoVisitClientEmail(servicoId, {
          clientEmail: primaryRecipient || undefined,
          extraClientEmail: extraClientEmailInput || undefined,
        });
        if (!visitEmailOk) {
          showToast(
            'Relatórios aprovados, mas o e-mail da visita não foi enviado (já enviado ou PDFs em falta). Use «Reenviar e-mail da visita» se necessário.',
            'warning',
            9000,
          );
        }
        return visitEmailOk;
      } catch (err) {
        console.error('[Email] Envio visita:', err);
        showToast(
          `Relatórios aprovados, mas o e-mail da visita falhou. ${err?.message || ''}`.trim(),
          'warning',
          9000,
        );
        return false;
      }
    };

    if (emailSynced) {
      showToast(
        'Relatório aprovado e email do cliente atualizado na base de dados!',
        'success',
        6000,
      );
      await sendVisitEmailIfReady({ quiet: true });
    } else if (servicoId && deferVisitEmail) {
      await sendVisitEmailIfReady();
    } else if (recipients.length && !skipClientEmail) {
      const latestForEmail = getReport(reportId) || reportForPdf;
      if (reportClientEmailAlreadySent(latestForEmail)) {
        showToast('Relatório aprovado. O e-mail ao cliente já tinha sido enviado.', 'success', 5000);
      } else {
        const pdfCount = pdfEntries.length;
        showToast(
          pdfCount > 1
            ? `Relatório aprovado! ${pdfCount} PDFs guardados. A enviar e-mail para ${recipientsLabel}...`
            : `Relatório aprovado! PDF guardado no Storage. A enviar e-mail para ${recipientsLabel}...`,
          'success',
          7000,
        );

        sendOfficialReportEmail({
          ...buildReportEmailMeta(reportForPdf, {
            client,
            job,
            technicianName: resolveReportTechnicianLabel(reportForPdf, job),
          }),
          to: recipients,
          servicoId: servicoId || null,
          includeRatingLinks: Boolean(servicoId),
          ...emailPdfPayload,
        })
          .then(async () => {
            await updateRelatorio(reportId, {
              data: { visitClienteEmailSentAt: new Date().toISOString() },
            });
          })
          .catch((err) => {
            console.error('[Email] Envio após aprovação falhou:', err);
            showToast(
              `Relatório aprovado, mas o e-mail para o cliente falhou. ${err?.message || ''}`.trim(),
              'warning',
              8000,
            );
          });
      }
    } else if (!emailSynced) {
      showToast('Relatório aprovado, mas o cliente não tem e-mail registado.', 'warning');
    }

    const approvedReport = getReport(reportId) || reportForPdf;
    if (
      testClient &&
      reportHasPedidoOrcamento(approvedReport) &&
      reportOrcamentoPorPreparar(approvedReport)
    ) {
      try {
        const { navigateToOrcamentoReport } = await import('./admin-dashboard.js');
        await navigateToOrcamentoReport(reportId);
      } catch {
        window.setTimeout(() => {
          showToast(
            'Cliente teste com pedido de orçamento — abra a aba Orçamentos para preparar a proposta.',
            'info',
            9000,
          );
        }, 1200);
      }
    } else if (
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
