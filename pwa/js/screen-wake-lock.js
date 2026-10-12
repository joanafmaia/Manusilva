/**
 * Mantém o ecrã ligado enquanto o técnico preenche o relatório.
 * Sem isto, o Android trata a PWA como «página web» e apaga o ecrã
 * (depois pede a passe do tablet) — apps nativas costumam evitar isso.
 */

let sentinel = null;
let desired = false;
let reacquireBound = false;

function isSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.wakeLock?.request);
}

async function requestLock() {
  if (!desired || !isSupported()) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  try {
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        /* ignore */
      }
      sentinel = null;
    }
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (desired && document.visibilityState === 'visible') {
        void requestLock();
      }
    });
  } catch (err) {
    /* Bateria fraca / poupança de energia / browser sem permissão — não bloquear a app. */
    console.warn('[WakeLock] Não foi possível manter o ecrã ligado:', err?.message || err);
    sentinel = null;
  }
}

function bindReacquire() {
  if (reacquireBound || typeof document === 'undefined') return;
  reacquireBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!desired) return;
    if (document.visibilityState === 'visible') {
      void requestLock();
    }
  });
}

/** Ativa enquanto o formulário de relatório está aberto. */
export async function acquireFormScreenWakeLock() {
  desired = true;
  bindReacquire();
  await requestLock();
}

/** Liberta ao fechar o formulário. */
export async function releaseFormScreenWakeLock() {
  desired = false;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    /* ignore */
  }
  sentinel = null;
}

export function isFormScreenWakeLockActive() {
  return Boolean(sentinel) && desired;
}
