/**
 * Estado de rede — partilhado entre auth, sync e dashboard.
 */

import { isOffline as isManualOfflineMode } from './offline-mode.js';

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Sem rede ou modo offline manual no tablet. */
export function isEffectivelyOffline() {
  return isBrowserOffline() || isManualOfflineMode();
}

export function canUseSupabaseNetwork() {
  return !isEffectivelyOffline();
}
