/**
 * Web Push no cliente — subscrição e envio de avisos (app fechada).
 */

import { getSession } from './session.js';
import { splitTechnicianStoredValue } from './job-technician-utils.js';
import { getClientName } from './client-display.js';
import { getClient } from './entity-lookups.js';
import { formatDateLong } from './date-utils.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function apiPush(body, method = 'POST') {
  const session = getSession();
  if (!session?.token) return null;
  const res = await fetch('/api/push', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function fetchVapidPublicKey() {
  const res = await fetch('/api/push', { method: 'GET', headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!data?.configured || !data.publicKey) return '';
  return String(data.publicKey);
}

export async function ensureWebPushSubscription() {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') return false;

  try {
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return false;
    const ready = await navigator.serviceWorker.ready;
    let subscription = await ready.pushManager.getSubscription();
    if (!subscription) {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const payload = subscription.toJSON();
    payload.userAgent = String(navigator.userAgent || '').slice(0, 240);
    await apiPush({ action: 'subscribe', subscription: payload });
    return true;
  } catch (err) {
    console.warn('[Push] Subscrição:', err);
    return false;
  }
}

export async function notifyPushEvent(payload) {
  try {
    const session = getSession();
    if (!session?.token) return;
    await apiPush({ action: 'notify', ...payload });
  } catch (err) {
    console.warn('[Push] Envio:', err);
  }
}

export function notifyTechniciansAssigned({ technicianStored, clientId, date, jobId, servicoId, rescheduled = false }) {
  try {
    const names = splitTechnicianStoredValue(technicianStored);
    if (!names.length) return;
    const client = getClient(clientId);
    const clientName = getClientName(client) || 'Cliente';
    const dateLabel = date ? formatDateLong(String(date).split('T')[0]) : '';
    void notifyPushEvent({
      type: rescheduled ? 'job_rescheduled' : 'job_assigned',
      technicianNames: names,
      clientName,
      date,
      dateLabel,
      jobId: jobId || '',
      servicoId: servicoId || '',
    });
  } catch (err) {
    console.warn('[Push] Destinatários:', err);
  }
}

export function notifyRhPending({ techName, clientId, reportId, jobId, servicoId, visit = false }) {
  try {
    const client = clientId ? getClient(clientId) : null;
    void notifyPushEvent({
      type: visit ? 'visit_pending' : 'report_pending',
      techName: techName || getSession()?.name || 'Técnico',
      clientName: getClientName(client),
      reportId: reportId || '',
      jobId: jobId || '',
      servicoId: servicoId || '',
    });
  } catch (err) {
    console.warn('[Push] RH pendente:', err);
  }
}

export function notifyTechnicianReportStatus({ technicianStored, report, rejected, note }) {
  try {
    const names = splitTechnicianStoredValue(technicianStored || report?.technicianId);
    if (!names.length) return;
    const client = getClient(report?.clientId);
    const clientName = getClientName(client) || 'Cliente';
    const body = rejected
      ? note
        ? `${clientName}: ${String(note).slice(0, 120)}`
        : `${clientName} — abra a app para corrigir.`
      : `O relatório de ${clientName} foi aprovado.`;
    void notifyPushEvent({
      type: rejected ? 'report_rejected' : 'report_approved',
      technicianNames: names,
      reportId: report?.id || '',
      jobId: report?.jobId || '',
      servicoId: report?.servicoId || '',
      body,
    });
  } catch (err) {
    console.warn('[Push] Estado relatório:', err);
  }
}
