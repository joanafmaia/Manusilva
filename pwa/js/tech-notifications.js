/**
 * Notificações do painel do técnico (rejeição de relatório pelo RH).
 */

import { getClient } from './app.js';

const TECH_NOTIF_ASKED_KEY = 'tech_notif_permission_asked';

export async function requestTechNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  if (localStorage.getItem(TECH_NOTIF_ASKED_KEY) === '1') return 'default';

  localStorage.setItem(TECH_NOTIF_ASKED_KEY, '1');
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

export function maybeNotifyTechReportRejected(report, job) {
  if (!report || report.status !== 'rejected') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const client = getClient(report.clientId || job?.clientId);
  const clientName = client?.name || client?.Nome || 'Cliente';
  const note = String(report.rejectionNote || '').trim();
  const body = note
    ? `${clientName}: ${note.length > 120 ? `${note.slice(0, 120)}…` : note}`
    : `O relatório de ${clientName} foi rejeitado. Abra para corrigir.`;

  try {
    const n = new Notification('Relatório rejeitado — Manusilva', {
      body,
      tag: `report-rejected-${report.id || report.jobId || 'unknown'}`,
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('[Técnico] Notificação:', err);
  }
}
