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

/** Permite dados demo (CLIENTS vazio, forklifts demo, etc.) */
export function isDevMockEnabled() {
  const host = readHostname();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return readSearch().includes('mock=1');
}

export function isProductionRuntime() {
  return !isDevMockEnabled();
}
