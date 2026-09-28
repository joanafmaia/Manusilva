/**
 * Web Push — avisos com a PWA fechada.
 * GET  /api/push          → chave VAPID pública
 * POST /api/push          { action: 'subscribe' | 'unsubscribe' | 'notify', ... }
 */

const webpush = require('web-push');
const { requireAuthenticatedUser } = require('../server-lib/supabase-auth');
const { isRhOrAdminAuthUser, normalizeDbRole } = require('../server-lib/auth-roles');
const { serviceGet, servicePost, serviceDelete, hasServiceRoleKey } = require('../server-lib/supabase-service');
const { subscriptionMatchesNotify } = require('../server-lib/push-audience');

function cleanEnvSecret(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

const VAPID_PUBLIC_KEY = cleanEnvSecret(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = cleanEnvSecret(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = String(
  process.env.VAPID_SUBJECT || process.env.EMAIL_USER || 'mailto:manusilva.lda@gmail.com',
).trim();

let vapidReady = false;

function hasVapidConfig() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function ensureVapid() {
  if (vapidReady) return;
  if (!hasVapidConfig()) {
    const err = new Error(
      'Web Push não configurado. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na Railway (npm run vapid:keys).',
    );
    err.status = 503;
    throw err;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT.startsWith('mailto:') ? VAPID_SUBJECT : `mailto:${VAPID_SUBJECT}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  vapidReady = true;
}

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function encodeEndpointParam(endpoint) {
  return encodeURIComponent(endpoint);
}

function userMeta(user) {
  const meta = user?.user_metadata || {};
  const role = normalizeDbRole(meta.role) || '';
  return {
    role,
    technicianId: String(meta.technician_id || meta.technicianId || '').trim(),
    technicianName: String(meta.nome || meta.name || '').trim(),
  };
}

async function upsertSubscription(user, subscription) {
  ensureVapid();
  if (!hasServiceRoleKey()) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY em falta no servidor.');
    err.status = 500;
    throw err;
  }
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const authSecret = String(subscription?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !authSecret) {
    const err = new Error('Subscrição push inválida.');
    err.status = 400;
    throw err;
  }

  const meta = userMeta(user);
  const row = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth_secret: authSecret,
    role: meta.role,
    technician_id: meta.technicianId,
    technician_name: meta.technicianName,
    user_agent: String(subscription.userAgent || '').slice(0, 240),
    atualizado_em: new Date().toISOString(),
  };

  await servicePost('/rest/v1/push_subscriptions?on_conflict=endpoint', row, 'resolution=merge-duplicates,return=minimal');
}

async function deleteSubscriptionByEndpoint(endpoint) {
  const ep = String(endpoint || '').trim();
  if (!ep) return;
  await serviceDelete(`/rest/v1/push_subscriptions?endpoint=eq.${encodeEndpointParam(ep)}`);
}

async function loadAllSubscriptions() {
  return serviceGet('/rest/v1/push_subscriptions?select=id,user_id,endpoint,p256dh,auth_secret,role,technician_id,technician_name');
}

function isGoneStatus(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

async function sendToRows(rows, payload) {
  ensureVapid();
  const title = String(payload.title || 'ManuSilva').trim();
  const body = String(payload.body || '').trim();
  const tag = String(payload.tag || '').trim();
  const url = String(payload.url || '/dashboard.html').trim();
  const jsonPayload = JSON.stringify({ title, body, tag, url });

  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_secret },
        },
        jsonPayload,
        { TTL: 60 * 60 * 24, urgency: 'high' },
      );
      sent += 1;
    } catch (err) {
      const statusCode = Number(err?.statusCode || 0);
      if (isGoneStatus(statusCode)) {
        await deleteSubscriptionByEndpoint(row.endpoint).catch(() => {});
      } else {
        console.warn('[Push] Falha a enviar:', statusCode || err?.message);
      }
    }
  }
  return sent;
}

function buildNotifyPayload(body) {
  const type = String(body.type || '').trim();
  if (type === 'job_assigned') {
    const names = Array.isArray(body.technicianNames) ? body.technicianNames : [];
    const ids = Array.isArray(body.technicianIds) ? body.technicianIds : [];
    const client = String(body.clientName || 'Cliente').trim();
    const when = String(body.dateLabel || body.date || '').trim();
    return {
      audience: 'technicians',
      technicianNames: names,
      technicianIds: ids,
      requireRh: true,
      payload: {
        title: 'Novo trabalho — MFS',
        body: when ? `${client} — ${when}` : client,
        tag: `job-${String(body.jobId || body.servicoId || Date.now())}`,
        url: '/dashboard.html',
      },
    };
  }
  if (type === 'job_rescheduled') {
    const names = Array.isArray(body.technicianNames) ? body.technicianNames : [];
    const client = String(body.clientName || 'Cliente').trim();
    const when = String(body.dateLabel || body.date || '').trim();
    return {
      audience: 'technicians',
      technicianNames: names,
      technicianIds: Array.isArray(body.technicianIds) ? body.technicianIds : [],
      requireRh: true,
      payload: {
        title: 'Trabalho reagendado — MFS',
        body: when ? `${client} — ${when}` : client,
        tag: `job-reschedule-${String(body.jobId || body.servicoId || Date.now())}`,
        url: '/dashboard.html',
      },
    };
  }
  if (type === 'report_pending' || type === 'visit_pending') {
    const tech = String(body.techName || 'Técnico').trim();
    const client = String(body.clientName || '').trim();
    const visit = type === 'visit_pending';
    return {
      audience: 'rh',
      technicianNames: [],
      technicianIds: [],
      requireRh: false,
      payload: {
        title: visit ? 'Nova visita pendente — MFS' : 'Novo relatório pendente — MFS',
        body: client ? `${tech} · ${client}` : `${tech} submeteu para aprovação.`,
        tag: visit
          ? `rh-pending-servico-${String(body.servicoId || '')}`
          : `rh-pending-${String(body.reportId || body.jobId || Date.now())}`,
        url: '/admin.html',
      },
    };
  }
  if (type === 'report_rejected') {
    return {
      audience: 'technicians',
      technicianNames: Array.isArray(body.technicianNames) ? body.technicianNames : [],
      technicianIds: Array.isArray(body.technicianIds) ? body.technicianIds : [],
      requireRh: true,
      payload: {
        title: 'Relatório rejeitado — MFS',
        body: String(body.body || 'Abra a app para corrigir.').trim(),
        tag: `report-rejected-${String(body.reportId || body.jobId || Date.now())}`,
        url: '/dashboard.html',
      },
    };
  }
  if (type === 'report_approved') {
    return {
      audience: 'technicians',
      technicianNames: Array.isArray(body.technicianNames) ? body.technicianNames : [],
      technicianIds: Array.isArray(body.technicianIds) ? body.technicianIds : [],
      requireRh: true,
      payload: {
        title: 'Relatório aprovado — MFS',
        body: String(body.body || 'O RH aprovou o relatório.').trim(),
        tag: `report-approved-${String(body.reportId || body.servicoId || Date.now())}`,
        url: '/dashboard.html',
      },
    };
  }

  const err = new Error('Tipo de aviso desconhecido.');
  err.status = 400;
  throw err;
}

async function handleNotify(req, res, user) {
  const body = parseBody(req);
  const planned = buildNotifyPayload(body);
  if (planned.requireRh && !isRhOrAdminAuthUser(user)) {
    json(res, 403, { error: 'Apenas RH pode enviar este aviso.' });
    return;
  }

  const rows = await loadAllSubscriptions();
  const list = Array.isArray(rows) ? rows : [];
  const targets = list.filter((row) =>
    subscriptionMatchesNotify(row, {
      audience: planned.audience,
      technicianNames: planned.technicianNames,
      technicianIds: planned.technicianIds,
    }),
  );

  const sent = await sendToRows(targets, planned.payload);
  json(res, 200, { ok: true, matched: targets.length, sent });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      json(res, 200, {
        configured: hasVapidConfig(),
        publicKey: hasVapidConfig() ? VAPID_PUBLIC_KEY : '',
      });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { error: 'Método não permitido.' });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || 'subscribe').trim();

    if (action === 'notify') {
      const auth = await requireAuthenticatedUser(req);
      if (auth.error) {
        json(res, auth.error.status, { error: auth.error.message });
        return;
      }
      if (!hasVapidConfig()) {
        json(res, 200, { ok: true, skipped: true, reason: 'push_unconfigured' });
        return;
      }
      await handleNotify(req, res, auth.user);
      return;
    }

    const auth = await requireAuthenticatedUser(req);
    if (auth.error) {
      json(res, auth.error.status, { error: auth.error.message });
      return;
    }

    if (action === 'unsubscribe') {
      await deleteSubscriptionByEndpoint(body.subscription?.endpoint || body.endpoint);
      json(res, 200, { ok: true });
      return;
    }

    if (!hasVapidConfig()) {
      json(res, 200, { ok: true, skipped: true, reason: 'push_unconfigured' });
      return;
    }

    await upsertSubscription(auth.user, body.subscription || body);
    json(res, 200, { ok: true });
  } catch (err) {
    console.error('[Push]', err);
    const status = Number(err.status) >= 400 ? Number(err.status) : 500;
    json(res, status, { error: err.message || 'Erro no Web Push.' });
  }
};

module.exports.hasVapidConfig = hasVapidConfig;
