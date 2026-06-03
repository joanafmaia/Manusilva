/**
 * Supabase Realtime — painel de administração (novos trabalhos / relatórios pendentes)
 */

import { getSupabaseClient } from './supabase-client.js';
import { mergeJobFromRealtime } from './trabalhos-db.js';
import { mergeReportFromRealtime } from './relatorios-db.js';

let channel = null;

function playNotificationBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => ctx.close();
  } catch (err) {
    console.warn('[Admin Realtime] Áudio indisponível:', err);
  }
}

/**
 * @param {{ onPendingReport?: (report: object) => void, onTrabalhoInserted?: (job: object) => void }} callbacks
 */
export async function initAdminRealtime(callbacks = {}) {
  if (channel) return channel;

  const supabase = await getSupabaseClient();

  channel = supabase
    .channel('admin-painel-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trabalhos' },
      (payload) => {
        const job = mergeJobFromRealtime(payload.new);
        if (job) callbacks.onTrabalhoInserted?.(job);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'relatorios' },
      (payload) => {
        const report = mergeReportFromRealtime(payload.new);
        if (report?.status === 'pending_review') {
          callbacks.onPendingReport?.(report, { playSound: true, showBanner: true });
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'relatorios' },
      (payload) => {
        const report = mergeReportFromRealtime(payload.new);
        if (report?.status === 'pending_review') {
          callbacks.onPendingReport?.(report, { playSound: true, showBanner: true });
        }
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.info('[Admin Realtime] Subscrição ativa (trabalhos + relatórios).');
      }
      if (status === 'CHANNEL_ERROR' || err) {
        console.error('[Admin Realtime] Erro na subscrição:', err || status);
      }
    });

  return channel;
}

export function teardownAdminRealtime() {
  if (!channel) return;
  channel.unsubscribe();
  channel = null;
}

export { playNotificationBeep };
