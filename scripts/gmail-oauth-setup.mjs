/**
 * Obtém GOOGLE_REFRESH_TOKEN para envio via Gmail API.
 *
 * Pré-requisitos (Google Cloud Console):
 * 1. Criar projeto → APIs & Services → Enable "Gmail API"
 * 2. OAuth consent screen (External) → Add test user: manusilva.lda@gmail.com
 * 3. Credentials → Create OAuth client ID → Application type: Desktop app
 * 4. Copiar Client ID e Client Secret
 *
 * Uso:
 *   set GOOGLE_CLIENT_ID=...
 *   set GOOGLE_CLIENT_SECRET=...
 *   node scripts/gmail-oauth-setup.mjs
 *
 * Depois cola Client ID, Secret e Refresh Token nas Variables da Railway.
 */
import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '')
  .trim()
  .replace(/^["']|["']$/g, '');
const PORT = Number(process.env.GMAIL_OAUTH_PORT || 53682);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Falta GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET.

PowerShell:
  $env:GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
  $env:GOOGLE_CLIENT_SECRET="GOCSPX-..."
  node scripts/gmail-oauth-setup.mjs
`);
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('include_granted_scopes', 'true');

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    if (reqUrl.pathname !== '/oauth2callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const err = reqUrl.searchParams.get('error');
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Erro OAuth</h1><pre>${err}</pre>`);
      server.close();
      process.exit(1);
    }

    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('code em falta');
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const payload = await tokenRes.json();
    if (!tokenRes.ok || !payload.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<h1>Falha ao obter tokens</h1><pre>${JSON.stringify(payload, null, 2)}</pre>
         <p>Se não veio refresh_token: revoga o acesso em
         <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
         e volta a correr o script (prompt=consent).</p>`,
      );
      console.error(payload);
      server.close();
      process.exit(1);
    }

    const html = `<!doctype html><html lang="pt"><body style="font-family:sans-serif;padding:2rem">
      <h1>OK — refresh token obtido</h1>
      <p>Copia estes valores para a Railway (Variables do serviço):</p>
      <pre style="background:#f4f4f5;padding:1rem;overflow:auto">GOOGLE_CLIENT_ID=${CLIENT_ID}
GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}
GOOGLE_REFRESH_TOKEN=${payload.refresh_token}
EMAIL_USER=manusilva.lda@gmail.com</pre>
      <p>Podes fechar esta janela.</p>
    </body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

    console.log('\n=== Railway Variables ===');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${payload.refresh_token}`);
    console.log('EMAIL_USER=manusilva.lda@gmail.com');
    console.log('=========================\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e?.message || e));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
1. Abre este URL no browser (conta manusilva.lda@gmail.com):
${authUrl.toString()}

2. Autoriza o acesso (scope: gmail.send).
3. Esta janela termina quando o Google redirecionar para ${REDIRECT_URI}
`);
});
