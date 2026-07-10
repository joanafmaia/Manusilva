const nodemailer = require('nodemailer');
const { isRhOrAdminAuthUser } = require('./lib/auth-roles');
const { createAvaliacaoToken, getAppBaseUrl } = require('./lib/avaliacao-token');
const { serviceGet, hasServiceRoleKey } = require('./lib/supabase-service');
const {
  formatInterventionDatePt,
  resolveReportInterventionDatePt,
} = require('./lib/report-intervention-date');
const { getBearerToken, getAuthenticatedUser } = require('./lib/supabase-auth');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

/** Tamanho máximo do PDF decodificado (evita timeouts na Vercel). */
const MAX_PDF_BYTES = 3 * 1024 * 1024;
/** Limite conservador do string base64 (~4/3 do binário + padding). */
const MAX_PDF_BASE64_LEN = Math.ceil((MAX_PDF_BYTES / 3) * 4) + 8;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.pt',
  'live.com',
  'live.pt',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'sapo.pt',
  'mail.ru',
  'protonmail.com',
  'proton.me',
  'aol.com',
]);

/** Rodapé dos e-mails (alinhado com COMPANY em mock_data.js / PDFs) */
const CONTACT_EMAIL =
  process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'manusilva.lda@gmail.com';
const CONTACT_PHONE = process.env.COMPANY_PHONE || '+351 229 811 990';
const CONTACT_WEBSITE = process.env.COMPANY_WEBSITE || 'www.manusilva.pt';

async function supabaseGet(path, token) {
  const { getSupabaseUrl, getSupabaseAnonKey } = require('./lib/supabase-env');
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

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function isValidEmailAddress(email) {
  const v = normalizeEmail(email);
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function extractEmailDomain(email) {
  const norm = normalizeEmail(email);
  const at = norm.lastIndexOf('@');
  return at >= 0 ? norm.slice(at + 1) : '';
}

function isFreeEmailDomain(domain) {
  return FREE_EMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

async function fetchReportForEmail(reportId, token, tipoRelatorio) {
  const id = encodeURIComponent(String(reportId).trim());
  const isOrcamento = String(tipoRelatorio || '').toLowerCase() === 'orcamento';
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

/**
 * Destinatário permitido se:
 * - coincide com o e-mail registado no cliente do relatório aprovado, ou
 * - pertence ao mesmo domínio corporativo desse cliente e o domínio existe na base de clientes.
 */
function isRecipientAllowed(to, registeredEmail, clientDomains) {
  const toNorm = normalizeEmail(to);
  if (!isValidEmailAddress(toNorm)) return false;

  const regNorm = normalizeEmail(registeredEmail);
  if (regNorm && toNorm === regNorm) return true;

  if (!regNorm) return true;

  const toDomain = extractEmailDomain(toNorm);
  const regDomain = extractEmailDomain(regNorm);
  if (!toDomain || !regDomain || toDomain !== regDomain) return false;
  if (isFreeEmailDomain(toDomain)) return false;

  return clientDomains.has(toDomain);
}

/** Tamanho máximo combinado de todos os anexos PDF (evita timeouts na Vercel). */
const MAX_TOTAL_PDF_BYTES = 8 * 1024 * 1024;

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
  const attachments = [];
  let totalBytes = 0;

  for (let index = 0; index < urlEntries.length; index += 1) {
    const entry = urlEntries[index];
    const url = String(entry?.url || '').trim();
    if (!isSafeHttpUrl(url)) continue;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('[API /enviar-email] PDF indisponível:', url, res.status);
        continue;
      }
      const content = Buffer.from(await res.arrayBuffer());
      if (!content.length || content.length > MAX_PDF_BYTES) continue;
      if (totalBytes + content.length > MAX_TOTAL_PDF_BYTES) break;

      let filename = String(entry.filename || '').trim();
      if (!filename.toLowerCase().endsWith('.pdf')) {
        const fromUrl = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
        filename = fromUrl.toLowerCase().endsWith('.pdf') ? fromUrl : '';
      }

      attachments.push({
        filename: sanitizePdfAttachmentFilename(filename, index),
        content,
        contentType: 'application/pdf',
      });
      totalBytes += content.length;
    } catch (err) {
      console.warn('[API /enviar-email] fetch PDF:', url, err?.message || err);
    }
  }

  return attachments;
}

async function resolveEmailPdfAttachments(payload = {}) {
  const urlEntries = normalizePdfUrlEntries(payload);

  if (urlEntries.length > 1) {
    const fetched = await fetchPdfAttachmentsFromUrls(urlEntries);
    if (fetched.length) return { ok: true, attachments: fetched };
    return {
      ok: false,
      error: 'Não foi possível obter os PDFs do Storage para anexar ao e-mail.',
    };
  }

  const pdfCheck = validatePdfAttachments(payload);
  if (!pdfCheck.ok) return pdfCheck;

  let attachments = pdfCheck.attachments || [];
  if (!attachments.length && urlEntries.length === 1) {
    attachments = await fetchPdfAttachmentsFromUrls(urlEntries);
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

  if (tipoRelatorio === 'orcamento') {
    const numero = String(payload.orcamentoNumero || '').trim();
    const numSuffix = numero ? ` nº ${numero}` : '';
    return `ManuSilva - Proposta Comercial${numSuffix} - ${company}${opSuffix}`;
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
    return url.protocol === 'https:' || url.protocol === 'http:';
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

  const pdfBlock = pdfLinks.length
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
  const attachmentNote = attachmentCount > 0
    ? `<p style="margin:12px 0 0 0;font-size:13px;line-height:1.5;color:#64748b;">
        ${
          attachmentCount > 1
            ? `Os ${attachmentCount} relatórios encontram-se em anexo a este e-mail.`
            : 'O documento encontra-se também em anexo a este e-mail.'
        }
      </p>`
    : '';

  if (tipoRelatorio === 'orcamento') {
    const numero = escapeHtml(String(payload.orcamentoNumero || '').trim());
    const numeroLine = numero
      ? `<p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#334155;">
          Proposta comercial <strong>${numero}</strong>${opText}.
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
                <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">Proposta comercial</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#0f172a;">
                  Exmos. Senhores <strong>${company}</strong>,
                </p>
                ${numeroLine}
                <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
                  Vimos por este meio enviar a nossa proposta comercial.
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    if (!EMAIL_USER || !EMAIL_PASS) {
      return res.status(500).json({
        error: 'Variáveis SMTP não configuradas.',
        hint: 'Configure EMAIL_USER e EMAIL_PASS na Vercel (Gmail: use App Password com 2FA).',
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

    const emailPass = String(EMAIL_PASS).replace(/\s+/g, '');
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
        tipoRelatorio === 'orcamento'
          ? 'Relatório não encontrado.'
          : 'Relatório aprovado não encontrado.';
      return res.status(404).json({ error: msg });
    }

    const registeredEmail = await fetchClienteEmail(report.cliente_id, token);
    const clientDomains = await fetchClientEmailDomains(token);

    for (const recipient of recipients) {
      if (!isRecipientAllowed(recipient, registeredEmail, clientDomains)) {
        return res.status(403).json({
          error: registeredEmail
            ? `Destinatário não autorizado: ${recipient}. Use o e-mail do cliente ou outro endereço do mesmo domínio corporativo registado na base de clientes.`
            : `Destinatário não autorizado: ${recipient}.`,
        });
      }
    }

    const pdfResolved = await resolveEmailPdfAttachments(payload);
    if (!pdfResolved.ok) {
      return res.status(400).json({ error: pdfResolved.error });
    }

    const isGmail =
      /@gmail\.com$/i.test(EMAIL_USER) ||
      String(SMTP_HOST || '').toLowerCase().includes('gmail');

    const transporter = isGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: EMAIL_USER,
            pass: emailPass,
          },
        })
      : nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: {
            user: EMAIL_USER,
            pass: emailPass,
          },
        });

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

    let ratingBlockHtml = '';
    const skipRatingLink = Boolean(payload.skipRatingLink);
    const includeRatingLinks =
      !skipRatingLink &&
      tipoRelatorio !== 'orcamento' &&
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

    await transporter.sendMail({
      from: EMAIL_USER,
      to: recipients.join(', '),
      subject: buildSubject(emailPayload),
      html: buildHtmlBody(emailPayload, {
        hasPdfAttachment: attachments.length > 0,
        attachmentCount: attachments.length,
        ratingBlockHtml,
      }),
      attachments: attachments.length ? attachments : undefined,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[API /enviar-email]', err);
    const responseCode = err?.responseCode || null;
    const code = err?.code || null;
    const response = typeof err?.response === 'string' ? err.response : '';
    const detail = String(err?.message || '').trim();

    let hint = null;
    if (responseCode === 552 && response.includes('BlockedMessage')) {
      hint = 'Gmail bloqueou o anexo/conteúdo (BlockedMessage).';
    } else if (responseCode === 535) {
      hint = 'Falha de autenticação SMTP (ver App Password / 2FA).';
    } else if (/SUPABASE_URL|SUPABASE_ANON_KEY/i.test(detail)) {
      hint = 'Configure SUPABASE_URL e SUPABASE_ANON_KEY na Vercel (Settings → Environment Variables).';
    } else if (/ECONNREFUSED|ETIMEDOUT|ESOCKET/i.test(code || '')) {
      hint = 'Servidor SMTP inacessível. Verifique SMTP_HOST e SMTP_PORT na Vercel.';
    }

    const error =
      detail && (/em falta|não configurad/i.test(detail) || /SUPABASE_|SMTP/i.test(detail))
        ? detail
        : 'Falha ao enviar e-mail.';

    return res.status(500).json({
      error,
      detail: detail && detail !== error ? detail : undefined,
      code,
      responseCode,
      hint,
    });
  }
};
