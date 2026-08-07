/**
 * Navegação para a página da proposta MS.015 (ecrã completo).
 */

const RETURN_KEY = 'orcamento_return_url';
const ADMIN_PENDING_TAB_KEY = 'admin_pending_tab';
const ADMIN_PENDING_PASTA_KEY = 'orcamento_pending_pasta';
const ADMIN_PENDING_REPORT_KEY = 'orcamento_pending_report';

function rememberAdminPendingTab(tab) {
  try {
    sessionStorage.setItem(ADMIN_PENDING_TAB_KEY, String(tab || 'orcamentos'));
  } catch {
    /* ignore */
  }
}

/** Mantém a pasta do cliente ao voltar do ecrã da proposta. */
export function rememberOrcamentoPendingPasta(pastaKey) {
  try {
    const key = String(pastaKey || '').trim();
    if (key) sessionStorage.setItem(ADMIN_PENDING_PASTA_KEY, key);
    else sessionStorage.removeItem(ADMIN_PENDING_PASTA_KEY);
  } catch {
    /* ignore */
  }
}

export function clearOrcamentoPendingPasta() {
  try {
    sessionStorage.removeItem(ADMIN_PENDING_PASTA_KEY);
  } catch {
    /* ignore */
  }
}

/** Lê a pasta pendente sem consumir (para abrir já no 1.º render ao voltar do editor). */
export function peekOrcamentoPendingPasta() {
  try {
    return sessionStorage.getItem(ADMIN_PENDING_PASTA_KEY) || null;
  } catch {
    return null;
  }
}

export function consumeOrcamentoPendingPasta() {
  try {
    const key = sessionStorage.getItem(ADMIN_PENDING_PASTA_KEY);
    sessionStorage.removeItem(ADMIN_PENDING_PASTA_KEY);
    return key || null;
  } catch {
    return null;
  }
}

export function rememberOrcamentoPendingReport(reportId) {
  try {
    const id = String(reportId || '').trim();
    if (id) sessionStorage.setItem(ADMIN_PENDING_REPORT_KEY, id);
    else sessionStorage.removeItem(ADMIN_PENDING_REPORT_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeOrcamentoPendingReport() {
  try {
    const id = sessionStorage.getItem(ADMIN_PENDING_REPORT_KEY);
    sessionStorage.removeItem(ADMIN_PENDING_REPORT_KEY);
    return id || null;
  } catch {
    return null;
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

/** Painel RH admin.html — permite abrir a proposta sem sair da SPA. */
export function isAdminDashboardPage() {
  if (document.body?.classList.contains('admin-rh-page') && !isOrcamentoDedicatedPage()) {
    return Boolean(document.querySelector('.admin-app, #orcamentos-panel-root'));
  }
  const leaf = String(window.location.pathname || '')
    .split('/')
    .pop()
    .toLowerCase();
  return /^admin(?:\.html)?$/i.test(leaf);
}

export function isOrcamentoAdminShellOpen() {
  return Boolean(document.getElementById('orcamento-admin-shell'));
}

/**
 * Fecha o editor in-page e refresca Orçamentos (soft) na pasta guardada.
 * @param {{ refresh?: boolean }} [options]
 */
export async function closeOrcamentoAdminShell({ refresh = true } = {}) {
  document.getElementById('orcamento-admin-shell')?.remove();
  document.body.classList.remove('orcamento-admin-shell-open');
  if (!refresh) return;
  try {
    const { refreshOrcamentosPanel } = await import('./views/orcamentos.js');
    await refreshOrcamentosPanel({ soft: true });
  } catch (err) {
    console.warn('[Orçamento] soft refresh após fechar shell:', err);
  }
}

/**
 * Editor MS.015 em ecrã completo sobre o admin — sem location.href / reload.
 * @param {object} report
 * @param {{ pastaKey?: string }} [options]
 */
export async function openOrcamentoInAdminShell(report, { pastaKey } = {}) {
  if (!report?.id) return;

  const { resolveOrcamentoPastaKey } = await import('./orcamento-cabecalho.js');
  const key = String(pastaKey || '').trim() || resolveOrcamentoPastaKey(report);
  if (key) rememberOrcamentoPendingPasta(key);
  rememberOrcamentoPendingReport(report.id);
  rememberAdminPendingTab('orcamentos');

  document.getElementById('orcamento-admin-shell')?.remove();

  const shell = document.createElement('div');
  shell.id = 'orcamento-admin-shell';
  shell.className = 'orcamento-admin-shell';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', 'Proposta comercial');
  shell.innerHTML = `
    <div class="orcamento-page-app orcamento-admin-shell__app">
      <header class="orcamento-page-header glass-card">
        <div class="orcamento-page-header__start">
          <button type="button" class="btn-outline btn-sm orcamento-page-back" data-orc-admin-back>
            ← Voltar aos orçamentos
          </button>
          <div class="orcamento-page-title-wrap">
            <h1 class="orcamento-page-title">Proposta Comercial</h1>
            <span class="orcamento-page-title-num" data-orc-admin-title-num hidden></span>
          </div>
        </div>
      </header>
      <main class="orcamento-page-main glass-card" data-orc-admin-main aria-live="polite">
        <p class="text-muted">A carregar proposta…</p>
      </main>
    </div>`;
  document.body.appendChild(shell);
  document.body.classList.add('orcamento-admin-shell-open');

  const main = shell.querySelector('[data-orc-admin-main]');
  const titleNum = shell.querySelector('[data-orc-admin-title-num]');
  const backBtn = shell.querySelector('[data-orc-admin-back]');
  let closing = false;

  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.orc-resposta-date-overlay, .modal-overlay.show')) return;
    e.preventDefault();
    void finishToPasta(report);
  };

  const finishToPasta = async (saved) => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKeyDown, true);
    if (saved?.id) {
      rememberOrcamentoPendingPasta(resolveOrcamentoPastaKey(saved));
      rememberOrcamentoPendingReport(saved.id);
    }
    await closeOrcamentoAdminShell({ refresh: true });
  };

  backBtn?.addEventListener('click', () => {
    void finishToPasta(report);
  });
  document.addEventListener('keydown', onKeyDown, true);

  const { mountOrcamentoEditorView, resolveOrcamentoTitleNumero } = await import(
    './orcamento-view.js'
  );

  const syncTitle = (r) => {
    const num = resolveOrcamentoTitleNumero(r);
    if (!titleNum) return;
    if (num) {
      titleNum.textContent = num;
      titleNum.hidden = false;
    } else {
      titleNum.hidden = true;
    }
  };

  syncTitle(report);
  mountOrcamentoEditorView(main, report, {
    onUpdated: (updated) => {
      syncTitle(updated);
      void import('./folha-obra-orcamento.js')
        .then(({ syncFolhaObraFromOrcamentoReport }) => syncFolhaObraFromOrcamentoReport(updated))
        .catch((err) => console.warn('[Orçamento] sync folha:', err));
    },
    onNumeroChange: (num) => {
      if (!titleNum) return;
      titleNum.textContent = num;
      titleNum.hidden = !num;
    },
    onSaved: (saved) => {
      void finishToPasta(saved);
    },
    onSent: (saved) => {
      void finishToPasta(saved);
    },
  });

  requestAnimationFrame(() => {
    shell.querySelector('[data-orc-admin-main]')?.scrollTo?.(0, 0);
    backBtn?.focus();
  });
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
 * @param {{ onUpdated?: (report: object) => void, returnTo?: string, pastaKey?: string }} [options]
 */
export function openOrcamentoPage(report, { returnTo, pastaKey } = {}) {
  if (!report?.id) return;

  // No painel RH: editor in-page (sem reload de admin.html).
  if (isAdminDashboardPage()) {
    void openOrcamentoInAdminShell(report, { pastaKey });
    return;
  }

  const back = returnTo || resolveOrcamentosAdminUrl();
  rememberOrcamentoReturnUrl(back);
  if (pastaKey) rememberOrcamentoPendingPasta(pastaKey);
  rememberOrcamentoPendingReport(report.id);
  rememberAdminPendingTab('orcamentos');
  window.location.href = buildOrcamentoPageUrl(report.id, { returnTo: back });
}

/** @deprecated Abre a página dedicada (substitui o modal estreito). */
export function openOrcamentoModal(report, options = {}) {
  openOrcamentoPage(report, options);
}
