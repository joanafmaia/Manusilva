const nodemailer = require('nodemailer');
const { isRhOrAdminAuthUser } = require('../server-lib/auth-roles');
const {
  extractEmailDomain,
  isFreeEmailDomain,
  isRecipientAllowed,
  isValidEmailAddress,
  normalizeEmail,
} = require('../server-lib/email-recipient-policy');
const { createAvaliacaoToken, getAppBaseUrl } = require('../server-lib/avaliacao-token');
const { serviceGet, hasServiceRoleKey } = require('../server-lib/supabase-service');
const {
  formatInterventionDatePt,
  resolveReportInterventionDatePt,
} = require('../server-lib/report-intervention-date');
const { getBearerToken, getAuthenticatedUser } = require('../server-lib/supabase-auth');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

function cleanEnvSecret(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
}

/** Gmail API (OAuth2) — envio por HTTPS; fica nos Enviados do Gmail. */
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = cleanEnvSecret(process.env.GOOGLE_CLIENT_SECRET);
const GOOGLE_REFRESH_TOKEN = String(process.env.GOOGLE_REFRESH_TOKEN || '')
  .trim()
  .replace(/^["']|["']$/g, '');
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();
const EMAIL_REPLY_TO = String(process.env.EMAIL_REPLY_TO || EMAIL_USER || '').trim();
/** Cópia oculta (só relevante sem Gmail API). Desligar: EMAIL_BCC=off */
const EMAIL_BCC_RAW = process.env.EMAIL_BCC;

const SMTP_TIMEOUTS = {
  connectionTimeout: 20000,
  greetingTimeout: 15000,
  socketTimeout: 45000,
};

function hasGmailApiConfig() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN && EMAIL_USER);
}

function hasHttpsEmailConfig() {
  return hasGmailApiConfig();
}

function hasSmtpConfig() {
  return Boolean(EMAIL_USER && EMAIL_PASS);
}

/** Estado do fornecedor de e-mail (sem expor segredos) — útil em /api/health. */
function getEmailProviderStatus() {
  return {
    gmailApi: hasGmailApiConfig(),
    smtp: hasSmtpConfig(),
    emailUser: Boolean(String(EMAIL_USER || '').trim()),
    active: hasGmailApiConfig() ? 'gmail_api' : hasSmtpConfig() ? 'smtp' : 'none',
  };
}

function resolveFromAddress() {
  if (EMAIL_FROM) return EMAIL_FROM;
  return EMAIL_USER || 'ManuSilva <manusilva.lda@gmail.com>';
}

function parseFromAddress(fromRaw) {
  const raw = String(fromRaw || '').trim();
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2].trim() };
  }
  return { name: 'ManuSilva', email: raw };
}

function isGmailAccount() {
  const user = String(EMAIL_USER || '');
  const host = String(SMTP_HOST || '').toLowerCase();
  return /@gmail\.com$/i.test(user) || /@googlemail\.com$/i.test(user) || host.includes('gmail');
}

function isSmtpNetworkError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return /ECONNREFUSED|ETIMEDOUT|ESOCKET|ECONNECTION|ENOTFOUND/i.test(code || msg);
}

/**
 * Gmail/Google: forçar IPv4 + STARTTLS (587). Em hosts cloud o IPv6/465 costuma dar ETIMEDOUT.
 */
function buildGmailTransportOptions(port) {
  const emailPass = String(EMAIL_PASS || '').replace(/\s+/g, '');
  const use465 = Number(port) === 465;
  return {
    host: 'smtp.gmail.com',
    port: use465 ? 465 : 587,
    secure: use465,
    requireTLS: !use465,
    auth: {
      user: EMAIL_USER,
      pass: emailPass,
    },
    tls: { minVersion: 'TLSv1.2', servername: 'smtp.gmail.com' },
    // Evita timeout IPv6 em alguns ambientes Railway/Docker.
    family: 4,
    ...SMTP_TIMEOUTS,
  };
}

function buildCustomSmtpTransportOptions() {
  const emailPass = String(EMAIL_PASS || '').replace(/\s+/g, '');
  const port = Number(SMTP_PORT) || 465;
  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: EMAIL_USER,
      pass: emailPass,
    },
    family: 4,
    ...SMTP_TIMEOUTS,
  };
}

function createMailTransport(options) {
  return nodemailer.createTransport(options);
}

function normalizeToList(to) {
  if (Array.isArray(to)) return to.map((v) => String(v).trim()).filter(Boolean);
  return String(to || '')
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * BCC de arquivo: por omissão EMAIL_USER (vê-se na Entrada do Gmail).
 * EMAIL_BCC=off|false|0 → desliga; EMAIL_BCC=a@x.com,b@y.com → lista custom.
 * Com Gmail API o e-mail já fica em Enviados — por omissão não duplica BCC para EMAIL_USER.
 */
function resolveArchiveBcc(toList, { allowDefault = true } = {}) {
  const raw =
    EMAIL_BCC_RAW === undefined || EMAIL_BCC_RAW === null
      ? allowDefault
        ? String(EMAIL_USER || '')
        : ''
      : String(EMAIL_BCC_RAW);
  const trimmed = raw.trim();
  if (!trimmed || /^(0|false|off|no|none)$/i.test(trimmed)) return [];

  const toSet = new Set(
    normalizeToList(toList)
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
  );

  return normalizeToList(trimmed)
    .map((e) => normalizeEmail(e))
    .filter((email) => email && isValidEmailAddress(email) && !toSet.has(email));
}

function encodeRfc2047Utf8(text) {
  const raw = String(text || '');
  if (!/[^\x20-\x7E]/.test(raw)) return raw;
  return `=?UTF-8?B?${Buffer.from(raw, 'utf8').toString('base64')}?=`;
}

function encodeHeaderAddress(name, email) {
  const safeEmail = String(email || '').trim();
  const safeName = String(name || '').trim();
  if (!safeName) return safeEmail;
  return `${encodeRfc2047Utf8(safeName)} <${safeEmail}>`;
}

function wrapBase64(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  return clean.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

function buildMimeMessage(mailOptions) {
  const toList = normalizeToList(mailOptions.to);
  const bccList = normalizeToList(mailOptions.bcc);
  const fromParsed = parseFromAddress(mailOptions.from || resolveFromAddress());
  // Gmail exige From = conta autenticada (EMAIL_USER).
  const fromEmail = normalizeEmail(EMAIL_USER) || fromParsed.email;
  const fromName = fromParsed.name || 'ManuSilva';
  const replyTo =
    EMAIL_REPLY_TO && isValidEmailAddress(normalizeEmail(EMAIL_REPLY_TO))
      ? normalizeEmail(EMAIL_REPLY_TO)
      : null;

  const boundary = `manusilva_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const parts = [
    `From: ${encodeHeaderAddress(fromName, fromEmail)}`,
    `To: ${toList.join(', ')}`,
  ];
  if (bccList.length) parts.push(`Bcc: ${bccList.join(', ')}`);
  if (replyTo) parts.push(`Reply-To: ${replyTo}`);
  parts.push(
    `Subject: ${encodeRfc2047Utf8(String(mailOptions.subject || 'ManuSilva'))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(String(mailOptions.html || ''), 'utf8').toString('base64')),
  );

  const attachments = Array.isArray(mailOptions.attachments) ? mailOptions.attachments : [];
  for (const att of attachments) {
    const filename = String(att.filename || 'anexo.pdf').replace(/[\r\n"]/g, '_').slice(0, 180);
    let contentB64 = att.content;
    if (Buffer.isBuffer(contentB64)) contentB64 = contentB64.toString('base64');
    else if (typeof contentB64 !== 'string' || !contentB64) continue;
    parts.push(
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      wrapBase64(contentB64),
    );
  }

  parts.push('', `--${boundary}--`, '');
  return Buffer.from(parts.join('\r\n'), 'utf8');
}

async function getGmailAccessToken() {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.access_token) {
    const err = new Error(
      payload?.error_description || payload?.error || `Google OAuth HTTP ${res.status}`,
    );
    err.code = 'EGMAIL';
    err.responseCode = res.status;
    err.detail = typeof payload === 'object' ? JSON.stringify(payload).slice(0, 400) : '';
    throw err;
  }
  return payload.access_token;
}

/** Envio via Gmail API (upload media) — evita JSON gigante que provoca 502/OOM na Railway. */
async function sendMailViaGmailApi(mailOptions) {
  const toList = normalizeToList(mailOptions.to);
  if (!toList.length) {
    const err = new Error('Destinatário em falta para Gmail API.');
    err.code = 'EGMAIL';
    throw err;
  }
  if (!EMAIL_USER || !isValidEmailAddress(normalizeEmail(EMAIL_USER))) {
    const err = new Error('EMAIL_USER em falta ou inválido para Gmail API.');
    err.code = 'EGMAIL';
    throw err;
  }

  const accessToken = await getGmailAccessToken();
  const mimeBuf = buildMimeMessage(mailOptions);
  // Gmail ~25 MB; deixamos margem sob MAX_GMAIL_MIME_BYTES.
  if (mimeBuf.length > MAX_GMAIL_MIME_BYTES) {
    const err = new Error(
      `Mensagem demasiado grande para envio (${Math.round(mimeBuf.length / (1024 * 1024))} MB). Máx. ~${Math.round(MAX_GMAIL_MIME_BYTES / (1024 * 1024))} MB.`,
    );
    err.code = 'EGMAIL';
    throw err;
  }

  console.info(
    '[API /enviar-email] Gmail upload:',
    `${Math.round(mimeBuf.length / 1024)} KB`,
    'to=',
    toList.join(','),
  );

  const res = await fetch(
    'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'message/rfc822',
        'Content-Length': String(mimeBuf.length),
      },
      body: mimeBuf,
      signal: AbortSignal.timeout(120000),
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      payload?.error?.message || payload?.message || `Gmail API HTTP ${res.status}`,
    );
    err.code = 'EGMAIL';
    err.responseCode = res.status;
    err.detail = typeof payload === 'object' ? JSON.stringify(payload).slice(0, 400) : '';
    throw err;
  }

  return { messageId: payload?.id || null, provider: 'gmail_api' };
}

async function sendMailWithSmtpFallback(mailOptions) {
  if (isGmailAccount()) {
    // 587 STARTTLS primeiro — mais fiável na Railway do que 465/SMTPS.
    const attempts = [587, 465];
    let lastErr = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const port = attempts[i];
      try {
        const transporter = createMailTransport(buildGmailTransportOptions(port));
        const info = await transporter.sendMail(mailOptions);
        if (i > 0) {
          console.warn(`[API /enviar-email] Gmail OK na porta ${port} (fallback após falha).`);
        }
        return info;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[API /enviar-email] Gmail porta ${port} falhou:`,
          err?.code || err?.message || err,
        );
        if (!isSmtpNetworkError(err) || i === attempts.length - 1) throw err;
      }
    }
    throw lastErr;
  }

  if (!SMTP_HOST) {
    const err = new Error('SMTP_HOST em falta (conta não-Gmail).');
    err.code = 'ESMTPCONFIG';
    throw err;
  }

  const transporter = createMailTransport(buildCustomSmtpTransportOptions());
  return transporter.sendMail(mailOptions);
}

/** Gmail API na Railway; SMTP só em local/dev se não houver OAuth. */
async function sendMail(mailOptions) {
  const from = resolveFromAddress();
  const toList = normalizeToList(mailOptions.to);
  const useGmail = hasGmailApiConfig();
  // Com Gmail API o envio já fica em Enviados — não BCC automático para EMAIL_USER.
  const bccList = resolveArchiveBcc(toList, { allowDefault: !useGmail });
  const options = { ...mailOptions, from };
  if (bccList.length) options.bcc = bccList.join(', ');
  const status = getEmailProviderStatus();
  console.info('[API /enviar-email] fornecedor:', status.active, status, bccList.length ? { bcc: bccList } : '');

  if (useGmail) {
    return sendMailViaGmailApi(options);
  }

  if (!hasSmtpConfig()) {
    const err = new Error(
      'E-mail não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN na Railway.',
    );
    err.code = 'EEMAILCONFIG';
    throw err;
  }

  console.warn(
    '[API /enviar-email] Sem Gmail API OAuth — a usar SMTP (pode falhar na Railway).',
  );
  return sendMailWithSmtpFallback(options);
}

/** Rodapé dos e-mails (alinhado com COMPANY em mock_data.js / PDFs) */
const CONTACT_EMAIL =
  process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'manusilva.lda@gmail.com';
const CONTACT_PHONE = process.env.COMPANY_PHONE || '+351 229 811 990';
const CONTACT_WEBSITE = process.env.COMPANY_WEBSITE || 'www.manusilva.pt';

/** Tamanho máximo do PDF decodificado (evita timeouts no servidor). */
const MAX_PDF_BYTES = 3 * 1024 * 1024;
/** Limite conservador do string base64 (~4/3 do binário + padding). */
const MAX_PDF_BASE64_LEN = Math.ceil((MAX_PDF_BYTES / 3) * 4) + 8;
/**
 * Tamanho máximo combinado dos PDFs em binário.
 * Gmail aceita ~25 MB na mensagem; com base64 MIME fica ~4/3 — manter folga sob 24 MB MIME.
 */
const MAX_TOTAL_PDF_BYTES = 20 * 1024 * 1024;
/** Limite da mensagem MIME enviada pela Gmail API. */
const MAX_GMAIL_MIME_BYTES = 24 * 1024 * 1024;
/** Com muitos PDFs, 1 ZIP com todos os ficheiros é mais fiável do que dezenas de anexos. */
const ZIP_WHEN_PDF_COUNT_GT = 8;
const PDF_FETCH_CONCURRENCY = 8;

async function supabaseGet(path, token) {
  const { getSupabaseUrl, getSupabaseAnonKey } = require('../server-lib/supabase-env');
  const res = await fetch(`${getSupabaseUrl()}${path}`, {
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Supabase ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchReportForEmail(reportId, token, tipoRelatorio) {
  const id = encodeURIComponent(String(reportId).trim());
  const tipo = String(tipoRelatorio || '').toLowerCase();
  const isOrcamento = tipo === 'orcamento' || tipo === 'orcamento_lote';
  const estadoFilter = isOrcamento ? '' : '&estado=eq.approved';
  const rows = await supabaseGet(
    `/rest/v1/relatorios?id=eq.${id}${estadoFilter}&select=id,cliente_id,estado,aprovado_em,submetido_em,dados,trabalho_id,servico_id`,
    token,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchTrabalhoDate(trabalhoId, token) {
  if (trabalhoId == null || trabalhoId === '') return null;
  const id = encodeURIComponent(String(trabalhoId));
  const rows = await supabaseGet(`/rest/v1/trabalhos?id=eq.${id}&select=data`, token);
  return Array.isArray(rows) ? rows[0]?.data || null : null;
}

async function fetchClienteEmail(clienteId, token) {
  if (clienteId == null || clienteId === '') return null;
  const id = encodeURIComponent(String(clienteId));
  const rows = await supabaseGet(
    `/rest/v1/clientes?id=eq.${id}&select=id,email`,
    token,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.email ? normalizeEmail(row.email) : null;
}

async function fetchClientEmailDomains(token) {
  const rows = await supabaseGet('/rest/v1/clientes?select=email&email=not.is.null', token);
  const domains = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const domain = extractEmailDomain(row.email);
    if (domain && !isFreeEmailDomain(domain)) {
      domains.add(domain);
    }
  }
  return domains;
}

function parseEmailRecipients(raw) {
  const items = Array.isArray(raw) ? raw : String(raw ?? '').split(/[;,\n]+/);
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const norm = normalizeEmail(item);
    if (!norm || !isValidEmailAddress(norm) || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function validatePdfAttachment(pdfBase64, pdfFilename) {
  if (!pdfBase64 && !pdfFilename) return { ok: true, content: null, filename: null };

  if (!pdfBase64 || !pdfFilename) {
    return { ok: false, error: 'Anexo PDF incompleto (pdfBase64 e pdfFilename são obrigatórios juntos).' };
  }

  const encoded = String(pdfBase64);
  if (encoded.length > MAX_PDF_BASE64_LEN) {
    return {
      ok: false,
      error: `PDF demasiado grande (máx. ${MAX_PDF_BYTES / (1024 * 1024)}MB). Use apenas o link no e-mail.`,
    };
  }

  const content = Buffer.from(encoded, 'base64');
  if (!content.length) {
    return { ok: false, error: 'Conteúdo PDF inválido.' };
  }
  if (content.length > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `PDF demasiado grande (máx. ${MAX_PDF_BYTES / (1024 * 1024)}MB). Use apenas o link no e-mail.`,
    };
  }

  const filename = String(pdfFilename).replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Nome do ficheiro PDF inválido.' };
  }

  return { ok: true, content, filename };
}

function validatePdfAttachments(payload = {}) {
  const rawList = Array.isArray(payload.pdfAttachments) ? payload.pdfAttachments : [];
  if (rawList.length) {
    const attachments = [];
    let totalBytes = 0;
    for (const item of rawList) {
      const check = validatePdfAttachment(item?.pdfBase64, item?.pdfFilename);
      if (!check.ok) return check;
      if (!check.content) continue;
      totalBytes += check.content.length;
      if (totalBytes > MAX_TOTAL_PDF_BYTES) {
        return {
          ok: false,
          error: `PDFs em anexo excedem o tamanho máximo (${MAX_TOTAL_PDF_BYTES / (1024 * 1024)}MB). Use os links no e-mail.`,
        };
      }
      attachments.push({
        filename: check.filename,
        content: check.content,
        contentType: 'application/pdf',
      });
    }
    return { ok: true, attachments };
  }

  const single = validatePdfAttachment(payload.pdfBase64, payload.pdfFilename);
  if (!single.ok) return single;
  return {
    ok: true,
    attachments: single.content
      ? [{ filename: single.filename, content: single.content, contentType: 'application/pdf' }]
      : [],
  };
}

function normalizePdfUrlEntries(payload = {}) {
  const list = [];
  if (Array.isArray(payload.pdfUrls)) {
    for (const entry of payload.pdfUrls) {
      if (typeof entry === 'string' && isSafeHttpUrl(entry)) {
        list.push({ url: entry.trim(), filename: '', label: '' });
        continue;
      }
      const url = String(entry?.url || '').trim();
      if (!isSafeHttpUrl(url)) continue;
      list.push({
        url,
        filename: String(entry?.filename || '').trim(),
        label: String(entry?.label || '').trim(),
      });
    }
  }
  if (!list.length && isSafeHttpUrl(payload.pdfUrl)) {
    list.push({
      url: String(payload.pdfUrl).trim(),
      filename: String(payload.pdfFilename || '').trim(),
      label: '',
    });
  }
  return list;
}

function sanitizePdfAttachmentFilename(filename, index) {
  let safe = String(filename || '')
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 180);
  if (!safe.toLowerCase().endsWith('.pdf')) {
    safe = `relatorio_${index + 1}.pdf`;
  }
  return safe;
}

async function fetchPdfAttachmentsFromUrls(urlEntries = []) {
  const PDF_FETCH_TIMEOUT_MS = 25000;
  const results = new Array(urlEntries.length).fill(null);
  let cursor = 0;

  async function fetchOne(index) {
    const entry = urlEntries[index];
    const url = String(entry?.url || '').trim();
    if (!isSafeHttpUrl(url)) return;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        console.warn('[API /enviar-email] PDF indisponível:', url, res.status);
        return;
      }
      const content = Buffer.from(await res.arrayBuffer());
      if (!content.length || content.length > MAX_PDF_BYTES) {
        console.warn(
          '[API /enviar-email] PDF ignorado (vazio ou >3MB):',
          url,
          content.length,
        );
        return;
      }

      let filename = String(entry.filename || '').trim();
      if (!filename.toLowerCase().endsWith('.pdf')) {
        const fromUrl = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
        filename = fromUrl.toLowerCase().endsWith('.pdf') ? fromUrl : '';
      }

      results[index] = {
        filename: sanitizePdfAttachmentFilename(filename, index),
        content,
        contentType: 'application/pdf',
      };
    } catch (err) {
      console.warn('[API /enviar-email] fetch PDF:', url, err?.message || err);
    }
  }

  async function worker() {
    while (cursor < urlEntries.length) {
      const index = cursor;
      cursor += 1;
      await fetchOne(index);
    }
  }

  const workers = Math.min(PDF_FETCH_CONCURRENCY, Math.max(1, urlEntries.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return results.filter(Boolean);
}

function tryRequireJSZip() {
  try {
    return require('jszip');
  } catch {
    try {
      return require('../../node_modules/jszip');
    } catch {
      return null;
    }
  }
}

function uniqueZipEntryName(rawName, used) {
  let base = String(rawName || 'relatorio.pdf').replace(/[\\/]+/g, '_');
  if (!base.toLowerCase().endsWith('.pdf')) base = `${base}.pdf`;
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '.pdf';
  let n = 2;
  let candidate = `${stem}_${n}${ext}`;
  while (used.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${stem}_${n}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Empacota vários PDFs num único ZIP (o cliente recebe todos os ficheiros).
 * @returns {Promise<{ attachments: object[], zipped: boolean, originalCount: number } | null>}
 */
async function packPdfAttachmentsAsZip(attachments = []) {
  if (attachments.length < 2) return null;
  const JSZip = tryRequireJSZip();
  if (!JSZip) {
    console.warn('[API /enviar-email] jszip indisponível — a anexar PDFs individuais.');
    return null;
  }

  const zip = new JSZip();
  const used = new Set();
  for (const att of attachments) {
    const name = uniqueZipEntryName(att.filename, used);
    zip.file(name, att.content);
  }

  const content = Buffer.from(
    await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
  );

  if (!content.length || content.length > MAX_TOTAL_PDF_BYTES) {
    console.warn(
      '[API /enviar-email] ZIP demasiado grande:',
      content.length,
      'máx=',
      MAX_TOTAL_PDF_BYTES,
    );
    return null;
  }

  return {
    attachments: [
      {
        filename: `relatorios_manusilva_${attachments.length}_pdfs.zip`,
        content,
        contentType: 'application/zip',
      },
    ],
    zipped: true,
    originalCount: attachments.length,
  };
}

function totalAttachmentBytes(attachments = []) {
  return attachments.reduce((sum, att) => sum + (att?.content?.length || 0), 0);
}

async function finalizeMultiPdfAttachments(fetched, expectedCount) {
  if (!fetched.length) {
    return {
      ok: false,
      error: 'Não foi possível obter os PDFs do Storage para anexar ao e-mail.',
    };
  }

  if (fetched.length < expectedCount) {
    console.warn(
      `[API /enviar-email] Anexos incompletos (${fetched.length}/${expectedCount}); fallback para links.`,
    );
    return { ok: true, attachments: [], linkOnly: true };
  }

  const totalBytes = totalAttachmentBytes(fetched);
  const shouldZip =
    fetched.length > ZIP_WHEN_PDF_COUNT_GT || totalBytes > 10 * 1024 * 1024;

  if (shouldZip) {
    const zipped = await packPdfAttachmentsAsZip(fetched);
    if (zipped) {
      console.info(
        `[API /enviar-email] ${fetched.length} PDFs empacotados em ZIP (${Math.round(zipped.attachments[0].content.length / 1024)} KB).`,
      );
      return { ok: true, ...zipped };
    }
  }

  if (totalBytes > MAX_TOTAL_PDF_BYTES) {
    const zipped = await packPdfAttachmentsAsZip(fetched);
    if (zipped) return { ok: true, ...zipped };
    console.warn(
      `[API /enviar-email] ${fetched.length} PDFs = ${Math.round(totalBytes / (1024 * 1024))} MB > limite; fallback para links.`,
    );
    return { ok: true, attachments: [], linkOnly: true };
  }

  return { ok: true, attachments: fetched, zipped: false, originalCount: fetched.length };
}

async function resolveEmailPdfAttachments(payload = {}) {
  const fromPayload = validatePdfAttachments(payload);
  if (fromPayload.ok && fromPayload.attachments?.length) {
    const list = fromPayload.attachments;
    if (list.length > ZIP_WHEN_PDF_COUNT_GT) {
      const finalized = await finalizeMultiPdfAttachments(list, list.length);
      return finalized;
    }
    return fromPayload;
  }

  const urlEntries = normalizePdfUrlEntries(payload);

  if (urlEntries.length > 1) {
    const fetched = await fetchPdfAttachmentsFromUrls(urlEntries);
    return finalizeMultiPdfAttachments(fetched, urlEntries.length);
  }

  const pdfCheck = validatePdfAttachments(payload);
  if (!pdfCheck.ok) return pdfCheck;

  let attachments = pdfCheck.attachments || [];
  if (!attachments.length && urlEntries.length === 1) {
    attachments = await fetchPdfAttachmentsFromUrls(urlEntries);
    if (!attachments.length) {
      return {
        ok: false,
        error:
          'Não foi possível obter o PDF do Storage para anexar ao e-mail. Tente reenviar.',
      };
    }
  }

  return { ok: true, attachments };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatOpEmailLabel(numeroOrdem) {
  if (numeroOrdem == null || numeroOrdem === '') return '';
  const n = Number(numeroOrdem);
  if (!Number.isFinite(n)) return '';
  return `OP-2026-${String(n).padStart(2, '0')}`;
}

async function fetchExistingAvaliacaoForServico(servicoId) {
  if (!servicoId || !hasServiceRoleKey()) return null;
  const id = encodeURIComponent(String(servicoId));
  const rows = await serviceGet(
    `/rest/v1/avaliacoes_servico?servico_id=eq.${id}&select=id&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function resolveServicoIdForEmail(report, payload = {}) {
  const fromPayload = String(payload.servicoId || '').trim();
  if (fromPayload) return fromPayload;

  const fromReport = report?.servico_id ? String(report.servico_id).trim() : '';
  if (fromReport) return fromReport;

  const trabalhoId = report?.trabalho_id ? String(report.trabalho_id).trim() : '';
  if (!trabalhoId || !hasServiceRoleKey()) return '';

  const rows = await serviceGet(
    `/rest/v1/servicos?id=eq.${encodeURIComponent(trabalhoId)}&select=id&limit=1`,
  );
  return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : '';
}

function buildRatingBlockHtml(ratingToken) {
  if (!ratingToken) return '';

  const baseUrl = getAppBaseUrl();
  const faces = [
    { score: 3, emoji: '😊', label: 'Satisfeito' },
    { score: 2, emoji: '😐', label: 'Regular' },
    { score: 1, emoji: '😞', label: 'Insatisfeito' },
  ];

  const cells = faces
    .map((face) => {
      const href = `${baseUrl}/api/avaliacao?token=${encodeURIComponent(ratingToken)}&score=${face.score}`;
      return `<td style="padding:0 8px;">
        <a href="${escapeHtml(href)}" title="${escapeHtml(face.label)}" aria-label="${escapeHtml(face.label)}" style="display:inline-block;font-size:34px;line-height:1;text-decoration:none;padding:10px 14px;border-radius:12px;border:2px solid #e2e8f0;background:#ffffff;">
          ${face.emoji}
        </a>
      </td>`;
    })
    .join('');

  return `
                <div style="margin:22px 0 0 0;padding:18px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;text-align:center;">
                  <p style="margin:0 0 14px 0;font-size:14px;font-weight:600;color:#0f172a;">Como avalia o nosso serviço?</p>
                  <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
                    <tr>${cells}</tr>
                  </table>
                  <p style="margin:10px 0 0 0;font-size:11px;line-height:1.45;color:#94a3b8;">Um clique — demora 2 segundos</p>
                </div>`;
}

function buildSubject(payload = {}) {
  const company = payload.clienteNome || payload.nomeEmpresa || payload.clientName || 'Empresa';
  const tipoRelatorio = String(payload.tipoRelatorio || '').toLowerCase();
  const op = formatOpEmailLabel(payload.numeroOrdem);
  const opSuffix = op ? ` - ${op}` : '';

  if (tipoRelatorio === 'orcamento' || tipoRelatorio === 'orcamento_lote') {
    const numeros = Array.isArray(payload.orcamentoNumeros)
      ? payload.orcamentoNumeros.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    const count = Number(payload.propostaCount) || numeros.length || 0;
    const numeroUnico = String(payload.orcamentoNumero || numeros[0] || '').trim();
    if (count > 1 || numeros.length > 1) {
      const lista = numeros.join(', ');
      return lista
        ? `ManuSilva - Propostas ${lista} - ${company}`
        : `ManuSilva - Propostas comerciais - ${company}`;
    }
    const numSuffix = numeroUnico ? ` nº ${numeroUnico}` : '';
    return `ManuSilva - Proposta Comercial${numSuffix} - ${company}`;
  }

  if (tipoRelatorio === 'dl50-2005') {
    return `ManuSilva - Inspeção DL 50/2005 - ${company}${opSuffix}`;
  }

  if (tipoRelatorio === 'baterias') {
    return `ManuSilva - Manutenção de Baterias - ${company}${opSuffix}`;
  }

  if (tipoRelatorio === 'visita') {
    return `ManuSilva - Relatórios da Visita - ${company}${opSuffix}`;
  }

  return `ManuSilva - Relatório Técnico - ${company}${opSuffix}`;
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    const host = url.hostname.toLowerCase();
    try {
      const { getSupabaseUrl } = require('../server-lib/supabase-env');
      const projectHost = new URL(getSupabaseUrl()).hostname.toLowerCase();
      if (host === projectHost) return true;
    } catch {
      /* SUPABASE_URL não configurado — validar só domínio storage */
    }

    return host.endsWith('.supabase.co') && url.pathname.includes('/storage/');
  } catch {
    return false;
  }
}

function buildHtmlBody(payload = {}, options = {}) {
  const company = escapeHtml(payload.clienteNome || payload.nomeEmpresa || payload.clientName || 'Cliente');
  const tecnico = escapeHtml(payload.tecnico || payload.technician || 'Não informado');
  const pdfUrl = isSafeHttpUrl(payload.pdfUrl) ? String(payload.pdfUrl).trim() : '';
  const hasAttachment = Boolean(options.hasPdfAttachment);
  const data = escapeHtml(
    formatInterventionDatePt(payload.dataConclusao) ||
      formatInterventionDatePt(payload.data) ||
      formatInterventionDatePt(payload.date) ||
      '—',
  );
  const tipoRelatorio = String(payload.tipoRelatorio || '').toLowerCase();
  const op = formatOpEmailLabel(payload.numeroOrdem);
  const opText = op ? `, ordem <strong>${escapeHtml(op)}</strong>` : '';
  const ratingBlock = options.ratingBlockHtml || '';

  const pdfLinks = (() => {
    const fromList = Array.isArray(payload.pdfUrls)
      ? payload.pdfUrls
          .map((entry) => {
            if (!entry) return null;
            if (typeof entry === 'string') {
              return isSafeHttpUrl(entry) ? { url: entry.trim(), label: '' } : null;
            }
            const url = String(entry.url || '').trim();
            if (!isSafeHttpUrl(url)) return null;
            return {
              url,
              label: String(entry.label || entry.filename || '').trim(),
            };
          })
          .filter(Boolean)
      : [];
    if (fromList.length) return fromList;
    if (pdfUrl) return [{ url: pdfUrl, label: '' }];
    return [];
  })();

  const pdfBlock =
    !hasAttachment && pdfLinks.length
      ? `<div style="margin:18px 0 0 0;">
        ${pdfLinks
          .map((item, index) => {
            const label = escapeHtml(
              item.label ||
                (pdfLinks.length > 1
                  ? `${tipoRelatorio === 'orcamento' ? 'Proposta' : 'Relatório'} ${index + 1}`
                  : tipoRelatorio === 'orcamento'
                    ? 'Ver proposta PDF'
                    : 'Ver relatório PDF'),
            );
            return `<p style="margin:${index ? '8px' : '0'} 0 0 0;">
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">
          ${label}
        </a>
      </p>`;
          })
          .join('')}
      </div>`
      : '';

  const attachmentCount = Number(options.attachmentCount) || (hasAttachment ? 1 : 0);
  const zippedCount = Number(options.zippedOriginalCount) || 0;
  const isOrcamentoTipo = tipoRelatorio === 'orcamento' || tipoRelatorio === 'orcamento_lote';
  const attachmentNote = attachmentCount > 0
    ? `<p style="margin:12px 0 0 0;font-size:13px;line-height:1.5;color:#64748b;">
        ${
          zippedCount > 1
            ? `Os ${zippedCount} relatórios em PDF estão no ficheiro ZIP em anexo — extraia o ZIP para os abrir todos.`
            : attachmentCount > 1
            ? isOrcamentoTipo
              ? `As ${attachmentCount} propostas comerciais encontram-se em anexo a este e-mail.`
              : `Os ${attachmentCount} relatórios encontram-se em anexo a este e-mail.`
            : 'O documento encontra-se em anexo a este e-mail.'
        }
      </p>`
    : '';

  if (isOrcamentoTipo) {
    const numeros = Array.isArray(payload.orcamentoNumeros)
      ? payload.orcamentoNumeros.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    const count = Number(payload.propostaCount) || numeros.length || attachmentCount || 1;
    const isLote = count > 1 || numeros.length > 1;
    const numero = escapeHtml(String(payload.orcamentoNumero || numeros[0] || '').trim());
    const numerosLine = isLote && numeros.length
      ? `<p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#334155;">
          Propostas: <strong>${escapeHtml(numeros.join(', '))}</strong>.
        </p>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#64748b;">
          Cada proposta tem o seu número — pode aceitar uma e recusar outra.
        </p>`
      : numero
        ? `<p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#334155;">
          Proposta comercial <strong>${numero}</strong>.
        </p>`
      : '';

    return `
<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px 16px 24px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">ManuSilva</p>
                <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">${isLote ? 'Propostas comerciais' : 'Proposta comercial'}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#0f172a;">
                  Exmos. Senhores <strong>${company}</strong>,
                </p>
                ${numerosLine}
                <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
                  ${
                    isLote
                      ? 'Vimos por este meio enviar as nossas propostas comerciais.'
                      : 'Vimos por este meio enviar a nossa proposta comercial.'
                  }
                </p>
                ${pdfBlock}
                ${attachmentNote}
                <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#334155;">
                  Com os melhores cumprimentos,<br>
                  <strong>ManuSilva</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 4px 0;font-size:11px;line-height:1.5;color:#64748b;">
                  Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF
                </p>
                <p style="margin:0 0 8px 0;font-size:11px;line-height:1.5;color:#64748b;">
                  ${escapeHtml(CONTACT_EMAIL)} · ${escapeHtml(CONTACT_PHONE)} · ${escapeHtml(CONTACT_WEBSITE)}
                </p>
                <p style="margin:0;font-size:10px;line-height:1.45;color:#94a3b8;">
                  Informação confidencial destinada ao destinatário. Se recebeu este e-mail por engano, elimine-o e avise o remetente.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  const serviceLabel =
    tipoRelatorio === 'dl50-2005'
      ? 'inspeção DL 50/2005'
      : tipoRelatorio === 'baterias'
        ? 'manutenção de baterias'
        : tipoRelatorio === 'visita'
          ? 'visita técnica (vários relatórios)'
          : 'intervenção técnica';

  return `
<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px 16px 24px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">ManuSilva</p>
                <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">Relatório técnico</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#0f172a;">
                  Exmos. Senhores <strong>${company}</strong>,
                </p>
                <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
                  Segue o relatório de ${escapeHtml(serviceLabel)} referente à intervenção de <strong>${data}</strong>
                  (técnico: ${tecnico}${opText}).
                </p>
                ${pdfBlock}
                ${attachmentNote}
                ${ratingBlock}
                <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#334155;">
                  Com os melhores cumprimentos,<br>
                  <strong>ManuSilva</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 4px 0;font-size:11px;line-height:1.5;color:#64748b;">
                  Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF
                </p>
                <p style="margin:0 0 8px 0;font-size:11px;line-height:1.5;color:#64748b;">
                  ${escapeHtml(CONTACT_EMAIL)} · ${escapeHtml(CONTACT_PHONE)} · ${escapeHtml(CONTACT_WEBSITE)}
                </p>
                <p style="margin:0;font-size:10px;line-height:1.45;color:#94a3b8;">
                  Informação confidencial destinada ao destinatário. Se recebeu este e-mail por engano, elimine-o e avise o remetente.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    if (!hasHttpsEmailConfig() && !hasSmtpConfig()) {
      return res.status(500).json({
        error: 'E-mail não configurado.',
        hint:
          'Na Railway: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (Gmail API). SMTP Gmail costuma dar ETIMEDOUT.',
        emailProvider: getEmailProviderStatus(),
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Autenticação obrigatória (Authorization: Bearer <JWT>).' });
    }

    const authUser = await getAuthenticatedUser(token);
    if (!authUser) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
    if (!isRhOrAdminAuthUser(authUser)) {
      return res.status(403).json({ error: 'Acesso reservado a Recursos Humanos ou Admin autenticados.' });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    const reportId = String(payload.reportId || '').trim();
    if (!reportId) {
      return res.status(400).json({ error: 'reportId em falta.' });
    }

    const recipients = parseEmailRecipients(payload.to);
    if (!recipients.length) {
      return res.status(400).json({ error: 'Destinatário (to) em falta ou inválido.' });
    }

    const tipoRelatorio = String(payload.tipoRelatorio || 'outro').toLowerCase();
    const report = await fetchReportForEmail(reportId, token, tipoRelatorio);
    if (!report) {
      const msg =
        tipoRelatorio === 'orcamento' || tipoRelatorio === 'orcamento_lote'
          ? 'Relatório não encontrado.'
          : 'Relatório aprovado não encontrado.';
      return res.status(404).json({ error: msg });
    }

    const registeredEmail = await fetchClienteEmail(report.cliente_id, token);
    const recipientsNeedDomainCheck = recipients.some(
      (recipient) => !registeredEmail || recipient !== registeredEmail,
    );
    const clientDomains = recipientsNeedDomainCheck
      ? await fetchClientEmailDomains(token)
      : new Set();
    const allowManualRecipients =
      tipoRelatorio === 'orcamento' || tipoRelatorio === 'orcamento_lote';
    for (const recipient of recipients) {
      if (!isRecipientAllowed(recipient, registeredEmail, clientDomains, { allowManualRecipients })) {
        return res.status(403).json({
          error: allowManualRecipients
            ? `Destinatário inválido: ${recipient}.`
            : registeredEmail
              ? `Destinatário não autorizado: ${recipient}. Use o e-mail do cliente ou outro endereço do mesmo domínio corporativo registado na base de clientes.`
              : `Destinatário não autorizado: ${recipient}.`,
        });
      }
    }

    const pdfResolved = await resolveEmailPdfAttachments(payload);
    if (!pdfResolved.ok) {
      return res.status(400).json({ error: pdfResolved.error });
    }

    const jobDate = report.trabalho_id ? await fetchTrabalhoDate(report.trabalho_id, token) : null;
    const interventionDate = resolveReportInterventionDatePt(report, jobDate);
    const emailPayload = {
      ...payload,
      dataConclusao:
        interventionDate ||
        formatInterventionDatePt(payload.dataConclusao) ||
        formatInterventionDatePt(payload.data) ||
        '',
    };

    const attachments = pdfResolved.attachments || [];
    const zippedOriginalCount = Number(pdfResolved.originalCount) || 0;
    const zipped = Boolean(pdfResolved.zipped);

    let ratingBlockHtml = '';
    const skipRatingLink = Boolean(payload.skipRatingLink);
    const includeRatingLinks =
      !skipRatingLink &&
      tipoRelatorio !== 'orcamento' &&
      tipoRelatorio !== 'orcamento_lote' &&
      payload.includeRatingLinks !== false;

    if (includeRatingLinks) {
      try {
        const servicoId = await resolveServicoIdForEmail(report, payload);
        if (servicoId) {
          const alreadyRated = await fetchExistingAvaliacaoForServico(servicoId);
          if (!alreadyRated) {
            const ratingToken = createAvaliacaoToken({
              servicoId,
              clienteId: report.cliente_id,
            });
            ratingBlockHtml = buildRatingBlockHtml(ratingToken);
          }
        }
      } catch (ratingErr) {
        console.warn('[API /enviar-email] Bloco de avaliação omitido:', ratingErr?.message || ratingErr);
      }
    }

    await sendMail({
      to: recipients.join(', '),
      subject: buildSubject(emailPayload),
      html: buildHtmlBody(emailPayload, {
        hasPdfAttachment: attachments.length > 0,
        attachmentCount: attachments.length,
        zippedOriginalCount: zipped ? zippedOriginalCount : 0,
        ratingBlockHtml,
      }),
      attachments: attachments.length ? attachments : undefined,
    });

    return res.status(200).json({
      ok: true,
      linkOnly: Boolean(pdfResolved.linkOnly) || attachments.length === 0,
      attachmentCount: attachments.length,
      zipped,
      originalPdfCount: zipped ? zippedOriginalCount : attachments.length,
    });
  } catch (err) {
    console.error('[API /enviar-email]', err);
    const responseCode = err?.responseCode || null;
    const code = err?.code || null;
    const response = typeof err?.response === 'string' ? err.response : '';
    const detail = String(err?.message || err?.detail || '').trim();

    let hint = null;
    if (responseCode === 552 && response.includes('BlockedMessage')) {
      hint = 'Gmail bloqueou o anexo/conteúdo (BlockedMessage).';
    } else if (responseCode === 535) {
      hint = 'Falha de autenticação SMTP (ver App Password / 2FA na conta EMAIL_USER).';
    } else if (/SUPABASE_URL|SUPABASE_ANON_KEY/i.test(detail)) {
      hint = 'Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente do servidor.';
    } else if (code === 'EGMAIL') {
      hint =
        'Erro na Gmail API. Confirme GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN (npm run gmail:oauth) e que EMAIL_USER é a conta autorizada. Ver RAILWAY.md.';
    } else if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|ECONNECTION/i.test(code || detail || '')) {
      hint =
        'SMTP bloqueado na Railway (ETIMEDOUT). Use Gmail API (GOOGLE_*). Ver RAILWAY.md.';
    } else if (code === 'ESMTPCONFIG' || code === 'EEMAILCONFIG') {
      hint = detail || 'Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN.';
    }

    const error =
      detail &&
      (/em falta|não configurad|Gmail|Google|OAuth/i.test(detail) || /SUPABASE_|SMTP/i.test(detail))
        ? detail
        : 'Falha ao enviar e-mail.';

    return res.status(500).json({
      error,
      detail: detail && detail !== error ? detail : undefined,
      code,
      responseCode,
      hint,
      emailProvider: getEmailProviderStatus(),
    });
  }
};

module.exports = handler;
module.exports.getEmailProviderStatus = getEmailProviderStatus;
