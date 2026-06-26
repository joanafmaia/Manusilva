const nodemailer = require('nodemailer');
const { isRhOrAdminAuthUser } = require('./lib/auth-roles');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://zhfbezrevosmbmcbyskw.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZmJlenJldm9zbWJtY2J5c2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTQxMTMsImV4cCI6MjA5NTk3MDExM30.eUXiUiBVxoULll4LICBLLmEtBWZ0zqBHuW_W7-nB4Wc';

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

function getBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : '';
}

async function getAuthenticatedUser(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function supabaseGet(path, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
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
    `/rest/v1/relatorios?id=eq.${id}${estadoFilter}&select=id,cliente_id,estado,aprovado_em`,
    token,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchApprovedReport(reportId, token) {
  return fetchReportForEmail(reportId, token, 'relatorio');
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

  if (!regNorm) return false;

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
    payload.dataConclusao ||
      payload.data ||
      payload.date ||
      new Date().toLocaleDateString('pt-PT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  );
  const tipoRelatorio = String(payload.tipoRelatorio || '').toLowerCase();
  const op = formatOpEmailLabel(payload.numeroOrdem);
  const opText = op ? `, ordem <strong>${escapeHtml(op)}</strong>` : '';

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
                <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">Proposta comercial MS.015</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#0f172a;">
                  Exmos. Senhores <strong>${company}</strong>,
                </p>
                ${numeroLine}
                <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
                  Vimos por este meio enviar a nossa proposta comercial referente à intervenção de <strong>${data}</strong>
                  (técnico: ${tecnico}).
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

  if (!EMAIL_USER || !EMAIL_PASS) {
    return res.status(500).json({ error: 'Variáveis SMTP não configuradas.' });
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

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    const reportId = String(payload.reportId || '').trim();
    if (!reportId) {
      return res.status(400).json({ error: 'reportId em falta.' });
    }

    const recipient = normalizeEmail(payload.to);
    if (!recipient) {
      return res.status(400).json({ error: 'Destinatário (to) em falta.' });
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

    if (!isRecipientAllowed(recipient, registeredEmail, clientDomains)) {
      return res.status(403).json({
        error:
          'Destinatário não autorizado. Só é permitido o e-mail do cliente no relatório aprovado ou outro endereço do mesmo domínio corporativo registado na base de clientes.',
      });
    }

    const pdfCheck = validatePdfAttachments(payload);
    if (!pdfCheck.ok) {
      return res.status(400).json({ error: pdfCheck.error });
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

    const attachments = pdfCheck.attachments || [];

    await transporter.sendMail({
      from: EMAIL_USER,
      to: recipient,
      subject: buildSubject(payload),
      html: buildHtmlBody(payload, {
        hasPdfAttachment: attachments.length > 0,
        attachmentCount: attachments.length,
      }),
      attachments: attachments.length ? attachments : undefined,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[API /enviar-email]', err);
    const responseCode = err?.responseCode || null;
    const code = err?.code || null;
    const response = typeof err?.response === 'string' ? err.response : '';

    let hint = null;
    if (responseCode === 552 && response.includes('BlockedMessage')) {
      hint = 'Gmail bloqueou o anexo/conteúdo (BlockedMessage).';
    } else if (responseCode === 535) {
      hint = 'Falha de autenticação SMTP (ver App Password / 2FA).';
    }

    return res.status(500).json({
      error: 'Falha ao enviar e-mail.',
      code,
      responseCode,
      hint,
    });
  }
};
