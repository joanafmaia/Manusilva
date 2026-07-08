/**
 * Ambiente de execução — mock/demo só em desenvolvimento local.
 */

function readHostname() {
  if (typeof window === 'undefined' || !window.location) return '';
  return String(window.location.hostname || '').toLowerCase();
}

function readSearch() {
  if (typeof window === 'undefined' || !window.location) return '';
  return String(window.location.search || '');
}

function isLocalDevHost(host) {
  return host === 'localhost' || host === '127.0.0.1';
}

/** Permite dados demo (CLIENTS vazio, forklifts demo, etc.) */
export function isDevMockEnabled() {
  const host = readHostname();
  if (!isLocalDevHost(host)) return false;
  const search = readSearch();
  return !search || search.includes('mock=1');
}

export function isProductionRuntime() {
  return !isDevMockEnabled();
}
