/**
 * Arranque partilhado — evita cache antigo de build-version.js e módulos ES.
 */

import {
  applyBuildAssetVersions,
  clearModuleRecoveryFlag,
  consumeModuleCacheBustQuery,
  ensureFreshAppBuild,
  fetchAppBuildId,
  recoverFromModuleLoadFailure,
  registerAppServiceWorker,
  startBuildIdWatch,
} from './app-version.js';
import { getSession } from './session.js';

async function bootEntry(entry, moduleQ) {
  const { applyBrandLogo } = await import(`./brand-ui.js${moduleQ}`);
  applyBrandLogo();

  if (entry === 'warehouse') {
    const { initLocalDatabase } = await import(`./tech-app-core.js${moduleQ}`);
    const { initLogoutButton } = await import(`./auth.js${moduleQ}`);
    initLogoutButton();
    initLocalDatabase();
    const { initWarehouseDashboard } = await import(`./warehouse-dashboard.js${moduleQ}`);
    await initWarehouseDashboard();
    return;
  }
  if (entry === 'tech') {
    const { initLocalDatabase } = await import(`./tech-app-core.js${moduleQ}`);
    const { initLogoutButton } = await import(`./auth.js${moduleQ}`);
    const session = getSession();
    initLogoutButton();
    initLocalDatabase();
    if (session?.role === 'warehouse') {
      window.location.replace('warehouse.html');
      return;
    }
    const { initTechDashboard } = await import(`./tech-dashboard.js${moduleQ}`);
    await initTechDashboard();
    return;
  }
  if (entry === 'admin') {
    const { initLocalDatabase } = await import(`./app.js${moduleQ}`);
    const { initAdminDashboard } = await import(`./admin-dashboard.js${moduleQ}`);
    initLocalDatabase();
    await initAdminDashboard();
    return;
  }
  if (entry === 'login') {
    const { bootstrapApp } = await import(`./app.js${moduleQ}`);
    bootstrapApp('app');
  }
}

/**
 * @param {'tech'|'warehouse'|'admin'|'login'} entry
 * @param {object} [options]
 * @param {boolean} [options.registerServiceWorker]
 * @param {(remoteBuildId: string) => void} [options.onRemoteBuild]
 */
export async function runManusilvaEntry(entry, options = {}) {
  const v = (await fetchAppBuildId()) || 'dev';
  applyBuildAssetVersions(v);

  if (await ensureFreshAppBuild(v)) return;

  if (options.registerServiceWorker) await registerAppServiceWorker(v);

  const moduleQ = consumeModuleCacheBustQuery(v);
  globalThis.__MS_MODULE_Q = moduleQ;

  await bootEntry(entry, moduleQ);
  clearModuleRecoveryFlag();

  if (options.onRemoteBuild) startBuildIdWatch(options.onRemoteBuild);
}

/**
 * @param {object} options
 * @param {(buildId: string, moduleQ: string) => Promise<void>} options.onReady
 * @param {boolean} [options.registerServiceWorker]
 * @param {(remoteBuildId: string) => void} [options.onRemoteBuild]
 */
export async function bootstrapManusilvaApp({ onReady, registerServiceWorker = false, onRemoteBuild }) {
  const v = (await fetchAppBuildId()) || 'dev';
  applyBuildAssetVersions(v);

  if (await ensureFreshAppBuild(v)) return;

  if (registerServiceWorker) await registerAppServiceWorker(v);

  const moduleQ = consumeModuleCacheBustQuery(v);
  globalThis.__MS_MODULE_Q = moduleQ;
  await onReady(v, moduleQ);
  clearModuleRecoveryFlag();

  if (onRemoteBuild) startBuildIdWatch(onRemoteBuild);
}

export async function handleBootstrapFailure(err) {
  console.error('[Manusilva] Falha ao carregar:', err);
  const bust = Date.now();
  const { recoverFromModuleLoadFailure } = await import(`./app-version.js?_=${bust}`);
  return recoverFromModuleLoadFailure();
}
