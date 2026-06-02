const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSubject(payload = {}) {
  const company = payload.clienteNome || payload.nomeEmpresa || payload.clientName || 'Empresa';
  const tipoRelatorio = String(payload.tipoRelatorio || '').toLowerCase();

  if (tipoRelatorio === 'dl50-2005') {
    return `ManuSilva - Inspeção DL 50/2005 - ${company}`;
  }

  if (tipoRelatorio === 'baterias') {
    return `ManuSilva - Manutenção de Baterias - ${company}`;
  }

  return `ManuSilva - Relatório Técnico - ${company}`;
}

function buildHtmlBody(payload = {}) {
  const company = escapeHtml(payload.clienteNome || payload.nomeEmpresa || payload.clientName || 'Cliente');
  const tecnico = escapeHtml(payload.tecnico || payload.technician || 'Não informado');
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
  const serviceLabel =
    tipoRelatorio === 'dl50-2005'
      ? 'Inspeção DL 50/2005'
      : tipoRelatorio === 'baterias'
        ? 'Manutenção de Baterias'
        : 'Relatório Técnico';

  return `
<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;background:#ffffff;border:1px solid #dbe3ef;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:22px 26px;background:#0f172a;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:20px;font-weight:700;line-height:1.25;letter-spacing:0.2px;">
                      Relatório Técnico ManuSilva
                    </td>
                    <td align="right">
                      <span style="display:inline-block;background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
                        ${escapeHtml(serviceLabel)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <div style="margin:0 0 16px 0;padding:14px 16px;border:1px solid #dbe3ef;border-left:4px solid #0f172a;background:#f8fafc;border-radius:10px;">
                  <p style="margin:0;font-size:15px;line-height:1.6;color:#0f172a;">
                    <strong>Exmos. Senhores ${company},</strong>
                  </p>
                </div>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.75;color:#334155;">
                  Informamos que foi concluído e aprovado um relatório técnico da vossa operação.
                  Segue abaixo o resumo formal da intervenção executada pela nossa equipa.
                </p>
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.65;color:#0f172a;font-weight:600;">
                  Detalhes da intervenção
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #dbe3ef;border-radius:12px;overflow:hidden;background:#ffffff;">
                  <tr>
                    <td style="width:36%;padding:13px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">Técnico</td>
                    <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:500;">${tecnico}</td>
                  </tr>
                  <tr>
                    <td style="padding:13px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">Data</td>
                    <td style="padding:13px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:500;">${data}</td>
                  </tr>
                </table>

                <p style="margin:20px 0 0 0;font-size:14px;line-height:1.7;color:#334155;">
                  Permanecemos à disposição para qualquer esclarecimento técnico adicional.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#0f172a;font-weight:700;">
                  ManuSilva — Manutenção de Baterias e Empilhadores
                </p>
                <p style="margin:0 0 2px 0;font-size:12px;line-height:1.6;color:#475569;">
                  Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF
                </p>
                <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#475569;">
                  geral@manusilva.pt · +351 229 811 990 · www.manusilva.pt
                </p>
                <p style="margin:0;font-size:10px;line-height:1.55;color:#64748b;">
                  Nota de confidencialidade: esta comunicação e quaisquer anexos podem conter informação confidencial e legalmente protegida,
                  destinada exclusivamente ao destinatário identificado. Se recebeu este e-mail por engano, solicitamos a eliminação imediata
                  e a notificação ao remetente, sendo proibida a divulgação, cópia ou utilização do seu conteúdo sem autorização.
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

  const emailPass = String(EMAIL_PASS).replace(/\s+/g, '');

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

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

    const recipient = String(payload.to || '').trim() || EMAIL_USER;

    const attachments = [];
    if (payload.pdfBase64 && payload.pdfFilename) {
      const pdfBase64 = String(payload.pdfBase64);
      const pdfFilename = String(payload.pdfFilename);
      const content = Buffer.from(pdfBase64, 'base64');
      attachments.push({
        filename: pdfFilename,
        content,
        contentType: 'application/pdf',
      });
    }

    await transporter.sendMail({
      from: EMAIL_USER,
      to: recipient,
      subject: buildSubject(payload),
      html: buildHtmlBody(payload),
      attachments: attachments.length ? attachments : undefined,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[API /enviar-email]', err);
    return res.status(500).json({ error: 'Falha ao enviar e-mail.' });
  }
};
