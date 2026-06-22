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
} from './relatorios-db.js';
import { removeLocalReportDraft } from './report-local-storage.js';
import { maybeNotifyTechReportRejected } from './tech-notifications.js';
import { getJob } from './app.js';

let channel = null;

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

  // O rascunho local no tablet ficou órfão — sem isto, o trabalho eliminado
  // "ressuscitava" na aba Em Curso / Pendentes.
  try {
    await removeLocalReportDraft(jobId);
  } catch (err) {
    console.warn('[Técnico Realtime] Rascunho local do trabalho eliminado:', err);
  }

  notifyChange();
}

/** RH eliminou um relatório: remove do cache e o rascunho local associado. */
async function handleRelatorioDeleted(oldRow) {
  const reportId = oldRow?.id != null ? String(oldRow.id) : '';
  if (!reportId) return;

  const removed = removeReportFromCache(reportId);
  if (removed?.jobId) {
    try {
      await removeLocalReportDraft(removed.jobId);
    } catch {
      /* melhor esforço — o filtro de render também ignora rascunhos órfãos */
    }
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
      { event: 'INSERT', schema: 'public', table: 'trabalhos' },
      (payload) => {
        mergeJobFromRealtime(payload.new);
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
        const prevStatus = payload.old?.status;
        const report = mergeReportFromRealtime(payload.new);
        if (report?.status === 'rejected' && prevStatus !== 'rejected') {
          const job = report.jobId ? getJob(report.jobId) : null;
          maybeNotifyTechReportRejected(report, job);
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
        console.info('[Técnico Realtime] Subscrição ativa (trabalhos + relatórios).');
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
