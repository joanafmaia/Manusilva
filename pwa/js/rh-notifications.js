/**
 * Notificações do sistema (Windows/macOS) — painel RH.
 * Requer o separador admin aberto (ou PWA instalada); não substitui push com browser fechado.
 */

const RH_NOTIF_ASKED_KEY = 'rh_notif_permission_asked';
const RH_NOTIF_SEEN_KEY = 'rh_notif_seen_v1';

function loadSeenSet() {
  try {
    const raw = sessionStorage.getItem(RH_NOTIF_SEEN_KEY);
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
    sessionStorage.setItem(RH_NOTIF_SEEN_KEY, JSON.stringify(trimmed));
    return;
  }
  sessionStorage.setItem(RH_NOTIF_SEEN_KEY, JSON.stringify([...seen]));
}

function shouldNotify(tag) {
  if (!tag) return false;
  const seen = loadSeenSet();
  if (seen.has(tag)) return false;
  markSeen(tag);
  return true;
}

function postRhNotification(title, body, tag) {
  if (!shouldNotify(tag)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('[RH] Notificação:', err);
  }
}

export async function requestRhNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  if (localStorage.getItem(RH_NOTIF_ASKED_KEY) === '1') return 'default';

  localStorage.setItem(RH_NOTIF_ASKED_KEY, '1');
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

export function bindRhNotificationPermissionOnGesture() {
  const ask = () => {
    requestRhNotificationPermission().catch(() => {});
  };
  document.addEventListener('click', ask, { once: true, passive: true });
}

/**
 * @param {object} report
 * @param {{ techName?: string, ordem?: string, clientName?: string }} meta
 */
export function maybeNotifyRhPendingReport(report, meta = {}) {
  if (!report || report.status !== 'pending_review') return;

  const tech = meta.techName || 'Técnico';
  const ordem = meta.ordem || 'relatório';
  const client = meta.clientName ? ` (${meta.clientName})` : '';

  postRhNotification(
    'Novo relatório pendente — Manusilva',
    `${tech} submeteu ${ordem}${client}.`,
    `rh-pending-${report.id || report.jobId || report.servicoId}`,
  );
}
