/**
 * Deteta novo deploy e força recarregamento limpo (SW + cache do browser).
 */

import { APP_BUILD_ID } from './build-version.js';

const STORAGE_KEY = 'manusilva_app_build_id';
const RECOVERY_KEY = 'manusilva_module_recovery';

async function purgeBrowserCaches() {
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

/** @returns {boolean} true se a página vai recarregar */
export async function ensureFreshAppBuild() {
  try {
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous && previous !== APP_BUILD_ID) {
      localStorage.setItem(STORAGE_KEY, APP_BUILD_ID);
      await purgeBrowserCaches();
      location.reload();
      return true;
    }
    if (!previous) {
      localStorage.setItem(STORAGE_KEY, APP_BUILD_ID);
    }
  } catch {
    /* ignore */
  }
  return false;
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
