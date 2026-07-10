/**
 * GET /api/avaliacao?token=...&score=1|2|3
 * Regista avaliação do cliente (link no e-mail) e devolve página HTML.
 */

const { verifyAvaliacaoToken, getAppBaseUrl } = require('./lib/avaliacao-token');
const { serviceGet, servicePost, hasServiceRoleKey } = require('./lib/supabase-service');

const SCORE_META = {
  1: { emoji: '😞', label: 'Insatisfeito', color: '#dc2626' },
  2: { emoji: '😐', label: 'Regular', color: '#ca8a04' },
  3: { emoji: '😊', label: 'Satisfeito', color: '#16a34a' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage({ title, message, emoji, accent = '#0f172a', extraHtml = '' }) {
  const html = `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — ManuSilva</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family:Segoe UI, system-ui, sans-serif; background:#f8fafc; color:#0f172a; padding:24px; }
    .card { max-width:420px; width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:12px;
      padding:32px 28px; text-align:center; box-shadow:0 4px 24px rgba(15,23,42,.06); }
    .emoji { font-size:48px; line-height:1; margin:0 0 16px; }
    h1 { margin:0 0 12px; font-size:22px; color:${escapeHtml(accent)}; }
    p { margin:0; font-size:15px; line-height:1.6; color:#475569; }
    .brand { margin-top:24px; font-size:12px; color:#94a3b8; }
    .faces { display:flex; gap:12px; justify-content:center; margin-top:20px; }
    .faces a { font-size:36px; text-decoration:none; padding:10px 14px; border-radius:10px;
      border:2px solid #e2e8f0; background:#fff; }
    .faces a:hover { border-color:#94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    ${emoji ? `<div class="emoji" aria-hidden="true">${emoji}</div>` : ''}
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
    ${extraHtml}
    <p class="brand">ManuSilva — Manutenção de Empilhadores</p>
  </div>
</body>
</html>`;
  return html;
}

function parseScore(raw) {
  const n = Number(String(raw || '').trim());
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

async function fetchExistingAvaliacao(servicoId) {
  const id = encodeURIComponent(String(servicoId));
  const rows = await serviceGet(
    `/rest/v1/avaliacoes_servico?servico_id=eq.${id}&select=score,criado_em&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertAvaliacao({ servicoId, clienteId, score, emailDestino }) {
  const row = {
    servico_id: servicoId,
    cliente_id: clienteId != null && clienteId !== '' ? Number(clienteId) : null,
    score,
    email_destino: emailDestino || null,
  };
  if (row.cliente_id != null && !Number.isFinite(row.cliente_id)) {
    delete row.cliente_id;
  }
  return servicePost('/rest/v1/avaliacoes_servico', row, 'return=representation');
}

function renderChooseScorePage(token, baseUrl) {
  const faces = [3, 2, 1]
    .map((score) => {
      const meta = SCORE_META[score];
      const href = `${baseUrl}/api/avaliacao?token=${encodeURIComponent(token)}&score=${score}`;
      return `<a href="${escapeHtml(href)}" title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}">${meta.emoji}</a>`;
    })
    .join('');
  return renderPage({
    title: 'Como avalia o nosso serviço?',
    message: 'Escolha uma opção — demora apenas um clique.',
    emoji: '',
    extraHtml: `<div class="faces" role="group" aria-label="Avaliação">${faces}</div>`,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).send('Método não permitido.');
  }

  const token = String(req.query?.token || '').trim();
  if (!token) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(
      renderPage({
        title: 'Link inválido',
        message: 'O link de avaliação está incompleto ou expirou.',
        emoji: '⚠️',
        accent: '#dc2626',
      }),
    );
  }

  const verified = verifyAvaliacaoToken(token);
  if (!verified) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(
      renderPage({
        title: 'Link expirado',
        message: 'Este link de avaliação já não é válido. Contacte-nos se precisar de ajuda.',
        emoji: '⏱️',
        accent: '#dc2626',
      }),
    );
  }

  const baseUrl = getAppBaseUrl();
  const score = parseScore(req.query?.score);

  if (!score) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderChooseScorePage(token, baseUrl));
  }

  if (!hasServiceRoleKey()) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(
      renderPage({
        title: 'Serviço indisponível',
        message: 'Não foi possível registar a avaliação neste momento. Tente novamente mais tarde.',
        emoji: '⚠️',
        accent: '#dc2626',
      }),
    );
  }

  try {
    const existing = await fetchExistingAvaliacao(verified.servicoId);
    if (existing) {
      const prev = SCORE_META[existing.score] || SCORE_META[2];
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(
        renderPage({
          title: 'Avaliação já registada',
          message: `Já recebemos a sua avaliação desta visita (${prev.emoji} ${prev.label}). Obrigado!`,
          emoji: prev.emoji,
          accent: prev.color,
        }),
      );
    }

    await insertAvaliacao({
      servicoId: verified.servicoId,
      clienteId: verified.clienteId,
      score,
    });

    const meta = SCORE_META[score];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(
      renderPage({
        title: 'Obrigado!',
        message: `A sua avaliação (${meta.label}) foi registada com sucesso. Agradecemos o seu feedback.`,
        emoji: meta.emoji,
        accent: meta.color,
      }),
    );
  } catch (err) {
    const conflict =
      err.status === 409 ||
      String(err.responseText || err.message || '').includes('avaliacoes_servico_servico_unique');

    if (conflict) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(
        renderPage({
          title: 'Avaliação já registada',
          message: 'Já recebemos a sua avaliação desta visita. Obrigado!',
          emoji: '🙏',
        }),
      );
    }

    console.error('[avaliacao]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(
      renderPage({
        title: 'Erro',
        message: 'Não foi possível registar a avaliação. Tente novamente mais tarde.',
        emoji: '⚠️',
        accent: '#dc2626',
      }),
    );
  }
};
