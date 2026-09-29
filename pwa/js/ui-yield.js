/**
 * Cedência ao browser — deixa o teclado pintar antes de trabalho pesado (IndexedDB, listas).
 */

export function isReportFormOpen() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.getElementById('form-overlay')?.classList.contains('show'));
}

export function yieldToPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function scheduleIdle(fn, timeoutMs = 2000) {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(() => {
      void fn();
    }, { timeout: timeoutMs });
  }
  return setTimeout(() => {
    void fn();
  }, 48);
}
