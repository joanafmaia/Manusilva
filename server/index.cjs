/**
 * Servidor Node para Railway — PWA estática + rotas /api (handlers em pwa/api).
 *
 * Arranque: npm start
 * Build:   npm run build
 */
const path = require('path');
const express = require('express');

const enviarEmail = require('../pwa/api/enviar-email.js');
const avaliacao = require('../pwa/api/avaliacao.js');
const technicians = require('../pwa/api/technicians/index.js');
const clientsId = require('../pwa/api/clients/[id].js');
const uploadPdf = require('../pwa/api/upload-pdf.js');

const ROOT = path.join(__dirname, '..');
const PWA_ROOT = path.join(ROOT, 'pwa');
const PORT = Number(process.env.PORT || 3000);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

function noStore(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}

function wrapHandler(handler, { mapParamsToQuery } = {}) {
  return async (req, res, next) => {
    try {
      if (typeof mapParamsToQuery === 'function') {
        mapParamsToQuery(req);
      }
      await handler(req, res);
      if (!res.headersSent) {
        res.status(204).end();
      }
    } catch (err) {
      next(err);
    }
  };
}

app.get('/api/health', (_req, res) => {
  const email =
    typeof enviarEmail.getEmailProviderStatus === 'function'
      ? enviarEmail.getEmailProviderStatus()
      : null;
  res.status(200).json({
    ok: true,
    service: 'manusilva',
    uptime: process.uptime(),
    email,
  });
});

app.all('/api/enviar-email', wrapHandler(enviarEmail));
app.all('/api/avaliacao', wrapHandler(avaliacao));
app.all('/api/technicians', wrapHandler(technicians));
app.all('/api/upload-pdf', wrapHandler(uploadPdf));
app.all(
  '/api/clients/:id',
  wrapHandler(clientsId, {
    mapParamsToQuery(req) {
      req.query = { ...(req.query || {}), id: req.params.id };
    },
  }),
);

const CLEAN_HTML = new Set([
  'index',
  'admin',
  'dashboard',
  'avaliar',
  'warehouse',
  'orcamento',
]);

app.get('/', (req, res) => {
  noStore(res);
  res.sendFile(path.join(PWA_ROOT, 'index.html'));
});

CLEAN_HTML.forEach((name) => {
  app.get(`/${name}`, (req, res) => {
    noStore(res);
    res.sendFile(path.join(PWA_ROOT, `${name}.html`));
  });
});

app.use(
  express.static(PWA_ROOT, {
    index: false,
    extensions: ['html'],
    setHeaders(res, filePath) {
      const rel = path.relative(PWA_ROOT, filePath).replace(/\\/g, '/');
      if (
        rel.endsWith('.html') ||
        rel === 'sw.js' ||
        rel === 'js/build-version.js' ||
        rel === 'js/force-refresh-page.js' ||
        rel.startsWith('css/') ||
        rel.startsWith('js/')
      ) {
        noStore(res);
      }
    },
  }),
);

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: 'Pedido demasiado grande.',
      hint: 'Envie o PDF por URL do Storage em vez de base64.',
    });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Manusilva] a escutar em 0.0.0.0:${PORT}`);
  console.log(`[Manusilva] PWA: ${PWA_ROOT}`);
});
