/**
 * Captura centralizada de erros — consola + evento para UI opcional.
 */

const recentErrors = [];
const MAX_ERRORS = 40;

export function captureError(error, context = {}) {
  const entry = {
    ts: Date.now(),
    message: error?.message ? String(error.message) : String(error || 'Erro desconhecido'),
    stack: error?.stack ? String(error.stack) : '',
    context: { ...context },
  };

  recentErrors.push(entry);
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();

  console.error('[ManuSilva]', entry.message, context, error);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-error', { detail: entry }));
  }

  return entry;
}

export function getRecentErrors() {
  return [...recentErrors];
}

export function initErrorMonitoring() {
  if (typeof window === 'undefined' || window.__manusilvaErrorMonitor) return;
  window.__manusilvaErrorMonitor = true;

  window.addEventListener('error', (event) => {
    captureError(event.error || new Error(event.message || 'Erro de script'), {
      source: 'window.error',
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    captureError(reason instanceof Error ? reason : new Error(String(reason)), {
      source: 'unhandledrejection',
    });
  });
}
