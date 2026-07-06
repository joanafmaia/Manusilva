/**
 * Navegação para a página da proposta MS.015 (ecrã completo).
 */

const RETURN_KEY = 'orcamento_return_url';

export function buildOrcamentoPageUrl(reportId, { returnTo } = {}) {
  const id = encodeURIComponent(String(reportId || '').trim());
  const params = new URLSearchParams({ reportId: id });
  if (returnTo) params.set('return', returnTo);
  return `orcamento.html?${params.toString()}`;
}

export function rememberOrcamentoReturnUrl(url) {
  try {
    sessionStorage.setItem(RETURN_KEY, String(url || 'admin.html#orcamentos'));
  } catch {
    /* ignore */
  }
}

export function peekOrcamentoReturnUrl() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('return');
    if (fromQuery) return fromQuery;
    return sessionStorage.getItem(RETURN_KEY) || 'admin.html#orcamentos';
  } catch {
    return 'admin.html#orcamentos';
  }
}

export function consumeOrcamentoReturnUrl() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('return');
    if (fromQuery) return fromQuery;
    const stored = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return stored || 'admin.html#orcamentos';
  } catch {
    return 'admin.html#orcamentos';
  }
}

export function isOrcamentoDedicatedPage() {
  return /orcamento\.html$/i.test(String(window.location.pathname || ''));
}

/** Sai da página da proposta após envio — volta ao painel RH ou fecha separador. */
export function exitOrcamentoPageAfterSend({ returnUrl } = {}) {
  const target = returnUrl || window.__orcamentoReturnUrl || peekOrcamentoReturnUrl();

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.focus();
      const openerPath = String(window.opener.location.pathname || '');
      if (openerPath.includes('admin.html')) {
        window.opener.location.hash = 'orcamentos';
      }
      window.close();
      return;
    } catch {
      /* navegação no separador atual */
    }
  }

  window.location.replace(target);
}

/**
 * @param {object} report
 * @param {{ onUpdated?: (report: object) => void, returnTo?: string }} [options]
 */
export function openOrcamentoPage(report, { returnTo } = {}) {
  if (!report?.id) return;
  const back =
    returnTo ||
    `${window.location.pathname.split('/').pop() || 'admin.html'}${window.location.hash || '#orcamentos'}`;
  rememberOrcamentoReturnUrl(back);
  window.location.href = buildOrcamentoPageUrl(report.id, { returnTo: back });
}

/** @deprecated Abre a página dedicada (substitui o modal estreito). */
export function openOrcamentoModal(report, options = {}) {
  openOrcamentoPage(report, options);
}
