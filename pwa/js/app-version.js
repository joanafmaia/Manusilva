/**
 * Deteta novo deploy e força recarregamento limpo (SW + cache do browser).
 */

const STORAGE_KEY = 'manusilva_app_build_id';
const RECOVERY_KEY = 'manusilva_module_recovery';

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

export async function purgeBrowserCaches() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
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
      location.reload();
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

/** Força atualização manual (botão no painel RH). */
export async function forceAppRefresh() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  await purgeBrowserCaches();
  location.reload();
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
  location.reload();
  return true;
}

export function clearModuleRecoveryFlag() {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

let buildWatchStarted = false;

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
    if (remote && local && remote !== local) onUpdate(remote);
  };

  window.setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

export function registerAppServiceWorker(buildId) {
  if (!buildId || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(buildId)}`).catch(() => {});
}
