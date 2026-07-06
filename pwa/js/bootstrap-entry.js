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

/**
 * @param {object} options
 * @param {(buildId: string) => Promise<void>} options.onReady
 * @param {boolean} [options.registerServiceWorker]
 * @param {(remoteBuildId: string) => void} [options.onRemoteBuild]
 */
export async function bootstrapManusilvaApp({ onReady, registerServiceWorker = false, onRemoteBuild }) {
  const v = (await fetchAppBuildId()) || 'dev';
  applyBuildAssetVersions(v);

  if (await ensureFreshAppBuild(v)) return;

  if (registerServiceWorker) await registerAppServiceWorker(v);

  const moduleQ = consumeModuleCacheBustQuery(v);
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
