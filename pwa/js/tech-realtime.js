/**
 * Supabase Realtime — dashboard do técnico
 *
 * Mantém os caches locais (trabalhos + relatórios) sincronizados quando o RH
 * cria, altera ou ELIMINA registos no painel de administração, removendo os
 * elementos da interface instantaneamente, sem refresh manual do técnico.
 */

import { getAuthenticatedSupabaseClient } from './supabase-client.js';
import { mergeJobFromRealtime, removeJobFromCache } from './trabalhos-db.js';
import {
  mergeReportFromRealtime,
  removeReportFromCache,
  removeReportsForJobFromCache,
  removeReportsForServicoFromCache,
} from './relatorios-db.js';
import { mergeServicoFromRealtime, removeServicoFromCache } from './servicos-db.js';
import {
  removeAllLocalDraftsForJob,
  removeAllLocalDraftsForReport,
  removeAllLocalDraftsForServico,
} from './report-local-storage.js';
import { clearReportLocallyDeleted, markReportLocallyDeleted } from './report-deleted-local.js';
import { removePendingSubmissionsForServico } from './trabalhos-offline.js';
import {
  maybeNotifyTechJobScheduled,
  maybeNotifyTechReportApproved,
  maybeNotifyTechReportRejected,
} from './tech-notifications.js';
import { getJob, getTechnician } from './app.js';
import { getReportsForServico, servicoToCalendarItem } from './servicos-panel-utils.js';
import { getSession } from './session.js';

let channel = null;

function currentTechMatch() {
  const session = getSession();
  if (!session?.technicianId) return null;
  const tech = getTechnician(session.technicianId);
  return { techId: session.technicianId, techName: tech?.name };
}

/** Re-renderiza a aba ativa da dashboard (mesmo fluxo do evento db-updated). */
function notifyChange() {
  window.dispatchEvent(new CustomEvent('db-updated'));
}

/** RH eliminou um trabalho: limpa cache, rascunho local e interface. */
async function handleTrabalhoDeleted(oldRow) {
  const jobId = oldRow?.id != null ? String(oldRow.id) : '';
  if (!jobId) return;

  removeJobFromCache(jobId);
  removeReportsForJobFromCache(jobId);

  try {
    await removeAllLocalDraftsForJob(jobId);
  } catch (err) {
    console.warn('[Técnico Realtime] Rascunhos do trabalho eliminado:', err);
  }

  notifyChange();
}

/** RH eliminou um relatório: remove do cache e o rascunho local associado. */
async function handleRelatorioDeleted(oldRow) {
  const reportId = oldRow?.id != null ? String(oldRow.id) : '';
  if (!reportId) return;

  const removed = removeReportFromCache(reportId);
  if (removed) {
    try {
      await removeAllLocalDraftsForReport(removed);
      clearReportLocallyDeleted(reportId);
    } catch {
      /* melhor esforço — o filtro de render também ignora rascunhos órfãos */
    }
  }

  notifyChange();
}

async function handleServicoDeleted(oldRow) {
  const servicoId = oldRow?.id != null ? String(oldRow.id) : '';
  if (!servicoId) return;

  const reports = getReportsForServico(servicoId);

  removeServicoFromCache(servicoId);
  removeReportsForServicoFromCache(servicoId);

  try {
    for (const report of reports) {
      if (report?.id) {
        markReportLocallyDeleted(report);
      }
      await removeAllLocalDraftsForReport(report);
    }
    await removeAllLocalDraftsForServico(servicoId);
    await removePendingSubmissionsForServico(servicoId);
  } catch (err) {
    console.warn('[Técnico Realtime] Rascunhos da visita eliminada:', err);
  }

  notifyChange();
}

export async function initTechRealtime() {
  if (channel) return channel;

  const supabase = await getAuthenticatedSupabaseClient();

  channel = supabase
    .channel('tech-dashboard-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'servicos' },
      (payload) => {
        const servico = mergeServicoFromRealtime(payload.new);
        const match = currentTechMatch();
        if (servico && match) maybeNotifyTechJobScheduled(servicoToCalendarItem(servico), match);
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'servicos' },
      (payload) => {
        mergeServicoFromRealtime(payload.new);
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'servicos' },
      (payload) => {
        handleServicoDeleted(payload.old).catch(console.error);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trabalhos' },
      (payload) => {
        const job = mergeJobFromRealtime(payload.new);
        const match = currentTechMatch();
        if (job && match) maybeNotifyTechJobScheduled(job, match);
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trabalhos' },
      (payload) => {
        mergeJobFromRealtime(payload.new);
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'trabalhos' },
      (payload) => {
        handleTrabalhoDeleted(payload.old).catch(console.error);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'relatorios' },
      (payload) => {
        mergeReportFromRealtime(payload.new);
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'relatorios' },
      (payload) => {
        const prevStatus = payload.old?.estado ?? payload.old?.status;
        const report = mergeReportFromRealtime(payload.new);
        const job = report?.jobId ? getJob(report.jobId) : null;
        const match = currentTechMatch();
        if (report?.status === 'rejected' && prevStatus !== 'rejected') {
          removeAllLocalDraftsForReport(report).catch((err) => {
            console.warn('[Técnico Realtime] Limpar rascunho após reprovação:', err);
          });
          maybeNotifyTechReportRejected(report, job);
        }
        if (report?.status === 'approved' && prevStatus !== 'approved' && match) {
          maybeNotifyTechReportApproved(report, job, match);
        }
        notifyChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'relatorios' },
      (payload) => {
        handleRelatorioDeleted(payload.old).catch(console.error);
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.info('[Técnico Realtime] Subscrição ativa (serviços, trabalhos + relatórios).');
      }
      if (status === 'CHANNEL_ERROR' || err) {
        console.error('[Técnico Realtime] Erro na subscrição:', err || status);
      }
    });

  return channel;
}

export function teardownTechRealtime() {
  if (!channel) return;
  channel.unsubscribe();
  channel = null;
}
