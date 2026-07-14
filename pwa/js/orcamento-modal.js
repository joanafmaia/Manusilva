/**
 * Navegação para a página da proposta MS.015 (ecrã completo).
 */

const RETURN_KEY = 'orcamento_return_url';
const ADMIN_PENDING_TAB_KEY = 'admin_pending_tab';

function rememberAdminPendingTab(tab) {
  try {
    sessionStorage.setItem(ADMIN_PENDING_TAB_KEY, String(tab || 'orcamentos'));
  } catch {
    /* ignore */
  }
}

/** URL do painel admin com a aba Orçamentos activa (mesmo directório que orcamento.html). */
export function resolveOrcamentosAdminUrl(preferredReturn) {
  try {
    const raw = String(preferredReturn || 'admin.html#orcamentos').trim() || 'admin.html#orcamentos';
    const url = new URL(raw, window.location.href);
    if (!/\/admin\.html$/i.test(url.pathname)) {
      const dir = window.location.pathname.replace(/[^/]+$/, '');
      url.pathname = `${dir}admin.html`;
    }
    url.hash = 'orcamentos';
    url.search = '';
    return url.href;
  } catch {
    return 'admin.html#orcamentos';
  }
}

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
  if (document.body?.classList.contains('orcamento-page')) return true;
  const leaf = String(window.location.pathname || '')
    .split('/')
    .pop()
    .toLowerCase();
  return /^orcamento(?:\.html)?$/i.test(leaf);
}

export function consumeAdminPendingTab() {
  try {
    const tab = sessionStorage.getItem(ADMIN_PENDING_TAB_KEY);
    if (tab) sessionStorage.removeItem(ADMIN_PENDING_TAB_KEY);
    return tab || null;
  } catch {
    return null;
  }
}

/** Volta à lista de orçamentos no painel admin (aba Orçamentos). */
export function returnToOrcamentosMenu({ returnUrl } = {}) {
  const preferred = returnUrl || window.__orcamentoReturnUrl || peekOrcamentoReturnUrl();
  const target = resolveOrcamentosAdminUrl(preferred);
  rememberAdminPendingTab('orcamentos');

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.sessionStorage?.setItem(ADMIN_PENDING_TAB_KEY, 'orcamentos');
      window.opener.focus();
      const openerPath = String(window.opener.location.pathname || '');
      if (openerPath.includes('admin.html')) {
        window.opener.location.replace(target);
      } else {
        window.opener.location.href = target;
      }
      window.close();
      return;
    } catch {
      /* navegação no separador actual */
    }
  }

  window.location.replace(target);
}

/** @deprecated usar returnToOrcamentosMenu */
export function exitOrcamentoPageAfterSend(options = {}) {
  returnToOrcamentosMenu(options);
}

/**
 * @param {object} report
 * @param {{ onUpdated?: (report: object) => void, returnTo?: string }} [options]
 */
export function openOrcamentoPage(report, { returnTo } = {}) {
  if (!report?.id) return;
  const back = returnTo || resolveOrcamentosAdminUrl();
  rememberOrcamentoReturnUrl(back);
  window.location.href = buildOrcamentoPageUrl(report.id, { returnTo: back });
}

/** @deprecated Abre a página dedicada (substitui o modal estreito). */
export function openOrcamentoModal(report, options = {}) {
  openOrcamentoPage(report, options);
}
