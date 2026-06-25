/**
 * Notificações do painel do técnico (rejeição, aprovação, novo trabalho).
 */

import { getClient } from './app.js';
import { jobMatchesTechnician, reportMatchesTechnicianTeam } from './job-technician-utils.js';

const TECH_NOTIF_ASKED_KEY = 'tech_notif_permission_asked';
const TECH_NOTIF_SEEN_KEY = 'tech_notif_seen_v1';

function loadSeenSet() {
  try {
    const raw = sessionStorage.getItem(TECH_NOTIF_SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markSeen(tag) {
  if (!tag) return;
  const seen = loadSeenSet();
  seen.add(tag);
  if (seen.size > 80) {
    const trimmed = [...seen].slice(-60);
    sessionStorage.setItem(TECH_NOTIF_SEEN_KEY, JSON.stringify(trimmed));
    return;
  }
  sessionStorage.setItem(TECH_NOTIF_SEEN_KEY, JSON.stringify([...seen]));
}

function shouldNotify(tag) {
  if (!tag) return false;
  const seen = loadSeenSet();
  if (seen.has(tag)) return false;
  markSeen(tag);
  return true;
}

function postTechNotification(title, body, tag) {
  if (!shouldNotify(tag)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('[Técnico] Notificação:', err);
  }
}

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

function clientLabel(report, job) {
  const client = getClient(report?.clientId || job?.clientId);
  return client?.name || client?.Nome || 'Cliente';
}

export function maybeNotifyTechReportRejected(report, job) {
  if (!report || report.status !== 'rejected') return;

  const name = clientLabel(report, job);
  const note = String(report.rejectionNote || '').trim();
  const body = note
    ? `${name}: ${note.length > 120 ? `${note.slice(0, 120)}…` : note}`
    : `O relatório de ${name} foi rejeitado. Abra para corrigir.`;

  postTechNotification('Relatório rejeitado — Manusilva', body, `report-rejected-${report.id || report.jobId}`);
}

export function maybeNotifyTechReportApproved(report, job, techMatch) {
  if (!report || report.status !== 'approved' || !techMatch) return;
  if (!reportMatchesTechnicianTeam(report, job, techMatch)) return;

  const name = clientLabel(report, job);
  postTechNotification(
    'Relatório aprovado — Manusilva',
    `O relatório de ${name} foi aprovado pelo RH.`,
    `report-approved-${report.id || report.jobId}`,
  );
}

/**
 * Novo trabalho agendado para o técnico (INSERT realtime).
 * @param {object} job — trabalho normalizado
 * @param {{ techId?: string, techName?: string }} techMatch
 */
export function maybeNotifyTechJobScheduled(job, techMatch) {
  if (!job || !techMatch) return;
  if (!jobMatchesTechnician(job.technicianId, techMatch)) return;

  const date = String(job.date || '').split('T')[0];
  if (!date) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jobDay = new Date(`${date}T12:00:00`);
  if (Number.isNaN(jobDay.getTime())) return;

  const diffDays = Math.round((jobDay - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0 || diffDays > 14) return;

  const client = getClient(job.clientId);
  const name = client?.name || client?.Nome || 'Cliente';
  const when =
    diffDays === 0 ? 'hoje' : diffDays === 1 ? 'amanhã' : `em ${formatShortDate(date)}`;

  postTechNotification(
    'Novo trabalho — Manusilva',
    `${name} — agendado para ${when}.`,
    `job-scheduled-${job.id}`,
  );
}

function formatShortDate(iso) {
  const [y, m, d] = String(iso).split('-');
  if (!d || !m) return iso;
  return `${d}/${m}`;
}
