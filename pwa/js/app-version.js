/**
 * Deteta novo deploy e força recarregamento limpo (SW + cache do browser).
 */

const STORAGE_KEY = 'manusilva_app_build_id';
const RECOVERY_KEY = 'manusilva_module_recovery';
const FORCE_BUST_KEY = 'manusilva_force_bust';

/** Extrai APP_BUILD_ID do ficheiro gerado no deploy. */
export function parseBuildIdFromSource(source) {
  const m = String(source || '').match(/APP_BUILD_ID\s*=\s*["']([^"']+)["']/);
  return m?.[1] || '';
}

/** Lê a versão atual do servidor sem cache do browser. */
export async function fetchAppBuildId() {
  try {
    const res = await fetch(`./js/build-version.js?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return '';
    return parseBuildIdFromSource(await res.text());
  } catch {
    return '';
  }
}

export async function clearCacheStorage() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

export async function purgeBrowserCaches() {
  await clearCacheStorage();
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
}

/** Query string para import() de módulos — bust forçado após «Atualizar app». */
export function consumeModuleCacheBustQuery(buildId) {
  try {
    const params = new URLSearchParams(location.search);
    const urlBust = params.get('_bust') || params.get('_ms');
    if (urlBust) {
      return `?_=${encodeURIComponent(urlBust)}`;
    }
    const force = sessionStorage.getItem(FORCE_BUST_KEY);
    if (force) {
      sessionStorage.removeItem(FORCE_BUST_KEY);
      return `?_=${encodeURIComponent(force)}`;
    }
  } catch {
    /* ignore */
  }
  if (buildId && buildId !== 'dev') {
    return `?v=${encodeURIComponent(buildId)}`;
  }
  return `?_=${Date.now()}`;
}

export function markForceModuleBust() {
  try {
    sessionStorage.setItem(FORCE_BUST_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Navegação que evita bfcache e cache de HTML (reload simples não basta). */
export async function navigateToFreshApp() {
  const bust = String(Date.now());
  const url = new URL(location.href);
  url.searchParams.set('_ms', bust);
  url.searchParams.set('_bust', bust);
  url.hash = '';

  try {
    await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
    });
  } catch {
    /* ignore */
  }

  window.location.assign(url.toString());
}

/** Atualiza query string de CSS estático para o build atual. */
export function applyBuildAssetVersions(buildId) {
  if (!buildId) return;
  document.querySelectorAll('link[rel="stylesheet"][href*="app.css"]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const base = href.split('?')[0] || 'css/app.css';
    link.setAttribute('href', `${base}?v=${encodeURIComponent(buildId)}`);
  });
}

/**
 * @param {string} [buildId] — se omitido, obtém do servidor
 * @returns {Promise<boolean>} true se a página vai recarregar
 */
export async function ensureFreshAppBuild(buildId) {
  try {
    const current = buildId || (await fetchAppBuildId());
    if (!current) return false;

    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous && previous !== current) {
      localStorage.setItem(STORAGE_KEY, current);
      await purgeBrowserCaches();
      await navigateToFreshApp();
      return true;
    }
    if (!previous) {
      localStorage.setItem(STORAGE_KEY, current);
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Força atualização manual (botão «Atualizar app»). */
export async function forceAppRefresh() {
  const remote = await fetchAppBuildId();
  markForceModuleBust();
  try {
    if (remote) {
      localStorage.setItem(STORAGE_KEY, remote);
    }
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }

  await purgeBrowserCaches();

  await navigateToFreshApp();
}

/** Uma tentativa de recuperação após SyntaxError / módulo em cache antigo */
export async function recoverFromModuleLoadFailure() {
  try {
    if (sessionStorage.getItem(RECOVERY_KEY)) return false;
    sessionStorage.setItem(RECOVERY_KEY, '1');
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  await purgeBrowserCaches();
  await navigateToFreshApp();
  return true;
}

export function clearModuleRecoveryFlag() {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
    sessionStorage.removeItem('manusilva_bfcache_bust');
  } catch {
    /* ignore */
  }
}

let buildWatchStarted = false;
let buildUpdateNotified = false;
let bfcacheGuardBound = false;

function bindBfcacheGuard() {
  if (bfcacheGuardBound || typeof window === 'undefined') return;
  bfcacheGuardBound = true;
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    try {
      if (sessionStorage.getItem('manusilva_bfcache_bust')) return;
      sessionStorage.setItem('manusilva_bfcache_bust', '1');
    } catch {
      return;
    }
    void navigateToFreshApp();
  });
}

bindBfcacheGuard();

/**
 * Avisa quando há deploy novo com a app aberta (sessões longas).
 * @param {(remoteId: string) => void} onUpdate
 */
export function startBuildIdWatch(onUpdate) {
  if (buildWatchStarted || typeof onUpdate !== 'function') return;
  buildWatchStarted = true;

  const check = async () => {
    const remote = await fetchAppBuildId();
    const local = localStorage.getItem(STORAGE_KEY);
    if (remote && local && remote !== local && !buildUpdateNotified) {
      buildUpdateNotified = true;
      onUpdate(remote);
    }
  };

  window.setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

export async function registerAppServiceWorker(buildId) {
  if (!buildId || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(buildId)}`);
    await navigator.serviceWorker.ready;
  } catch {
    /* ignore */
  }
}
