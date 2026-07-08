/**
 * Atualização forçada — script clássico (não ES module) para não ficar preso em cache de módulos.
 */
(function () {
  function purgeStaleCaches() {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) {
            r.unregister();
          });
        });
      }
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) {
            caches.delete(k);
          });
        });
      }
    } catch {
      /* ignore */
    }
  }

  function needsEarlyPurge() {
    try {
      if (/[?&](_ms|_bust)=/.test(location.search)) return true;
      return !!sessionStorage.getItem('manusilva_force_bust');
    } catch {
      return /[?&](_ms|_bust)=/.test(location.search);
    }
  }

  if (needsEarlyPurge()) purgeStaleCaches();

  window.msForceAppRefresh = function (event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    var bust = String(Date.now());
    try {
      sessionStorage.setItem('manusilva_force_bust', bust);
    } catch {
      /* ignore */
    }
    purgeStaleCaches();
    var btn = document.getElementById('btn-force-app-refresh');
    if (btn) {
      btn.classList.remove('tech-refresh-btn--update-available');
      btn.disabled = true;
      var lab = btn.querySelector('.tech-refresh-label, .sidebar-refresh-label');
      if (lab) lab.textContent = 'A atualizar…';
    }
    var url = new URL(location.href);
    url.searchParams.set('_ms', bust);
    url.searchParams.set('_bust', bust);
    url.hash = '';
    location.assign(url.toString());
    return false;
  };
})();
