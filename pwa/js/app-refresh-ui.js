/**
 * Faixa persistente «Nova versão disponível» + botão Atualizar.
 */

function ensureUpdateBannerStyles() {
  if (document.getElementById('ms-app-update-banner-style')) return;
  const style = document.createElement('style');
  style.id = 'ms-app-update-banner-style';
  style.textContent = `
    .ms-app-update-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 0.65rem 1rem;
      background: #1e3a5f;
      color: #f8fafc;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.2);
    }
    .ms-app-update-banner[hidden] { display: none !important; }
    .ms-app-update-banner__actions { display: flex; gap: 0.5rem; align-items: center; }
    .ms-app-update-banner__btn {
      border: 0;
      border-radius: 8px;
      padding: 0.45rem 0.85rem;
      font-weight: 700;
      cursor: pointer;
      background: #38bdf8;
      color: #0f172a;
    }
    .ms-app-update-banner__dismiss {
      background: transparent;
      color: #e2e8f0;
      border: 1px solid rgba(226, 232, 240, 0.45);
      border-radius: 8px;
      padding: 0.4rem 0.7rem;
      cursor: pointer;
      font-weight: 600;
    }
    body.ms-has-update-banner {
      padding-top: 3.25rem;
    }
  `;
  document.head.appendChild(style);
}

function ensureUpdateBanner() {
  ensureUpdateBannerStyles();
  let banner = document.getElementById('ms-app-update-banner');
  if (banner) return banner;

  banner = document.createElement('div');
  banner.id = 'ms-app-update-banner';
  banner.className = 'ms-app-update-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <span class="ms-app-update-banner__text">Nova versão da app disponível.</span>
    <div class="ms-app-update-banner__actions">
      <button type="button" class="ms-app-update-banner__btn" data-ms-update-refresh>Atualizar agora</button>
      <button type="button" class="ms-app-update-banner__dismiss" data-ms-update-dismiss>Mais tarde</button>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelector('[data-ms-update-refresh]')?.addEventListener('click', async (event) => {
    const refreshBtn = document.getElementById('btn-force-app-refresh');
    if (refreshBtn) {
      refreshBtn.click();
      return;
    }
    if (typeof globalThis.msForceAppRefresh === 'function') {
      globalThis.msForceAppRefresh(event);
      return;
    }
    const bust = `?_=${Date.now()}`;
    const { forceAppRefresh } = await import(`./app-version.js${bust}`);
    await forceAppRefresh();
  });

  banner.querySelector('[data-ms-update-dismiss]')?.addEventListener('click', () => {
    banner.hidden = true;
    document.body.classList.remove('ms-has-update-banner');
  });

  return banner;
}

export function showAppUpdateBanner(message) {
  const banner = ensureUpdateBanner();
  const text = banner.querySelector('.ms-app-update-banner__text');
  if (text && message) text.textContent = message;
  banner.hidden = false;
  document.body.classList.add('ms-has-update-banner');
}

/**
 * Botão e aviso de nova versão — partilhado entre painel RH e tablet.
 *
 * @param {string} [buttonId]
 * @param {{ updateHint?: string, notifyStyle?: 'toast' | 'button' | 'banner' }} [options]
 */
export function bindAppRefreshButton(buttonId = 'btn-force-app-refresh', options = {}) {
  const refreshBtn = document.getElementById(buttonId);
  if (!refreshBtn || refreshBtn.dataset.refreshBound === '1') return;
  refreshBtn.dataset.refreshBound = '1';

  const notifyStyle =
    options.notifyStyle === 'toast' || options.notifyStyle === 'button'
      ? options.notifyStyle
      : 'banner';
  let updateHintShown = false;

  refreshBtn.addEventListener('click', async (event) => {
    if (typeof globalThis.msForceAppRefresh === 'function') {
      globalThis.msForceAppRefresh(event);
      return;
    }
    refreshBtn.classList.remove('tech-refresh-btn--update-available');
    refreshBtn.disabled = true;
    const label = refreshBtn.querySelector('.sidebar-refresh-label, .tech-refresh-label');
    if (label) label.textContent = 'A atualizar…';
    else if (refreshBtn.classList.contains('tech-refresh-btn')) {
      const textLabel = refreshBtn.querySelector('.tech-refresh-label');
      if (textLabel) textLabel.textContent = 'A atualizar…';
      else refreshBtn.textContent = 'A atualizar…';
    } else refreshBtn.textContent = 'A atualizar…';

    const bust = `?_=${Date.now()}`;
    try {
      const { forceAppRefresh } = await import(`./app-version.js${bust}`);
      await forceAppRefresh();
    } catch (err) {
      console.error('[Manusilva] forceAppRefresh:', err);
      const { markForceModuleBust, purgeBrowserCaches, navigateToFreshApp } =
        await import(`./app-version.js${bust}`);
      markForceModuleBust();
      await purgeBrowserCaches();
      await navigateToFreshApp();
    }
  });

  const hint =
    options.updateHint ||
    'Nova versão disponível — clique em «Atualizar app».';

  const onUpdateAvailable = () => {
    if (updateHintShown) return;
    updateHintShown = true;

    refreshBtn.classList.add('tech-refresh-btn--update-available');
    refreshBtn.title = hint;
    refreshBtn.setAttribute('aria-label', hint);

    if (notifyStyle === 'banner') {
      showAppUpdateBanner(hint);
      return;
    }

    if (notifyStyle === 'button') return;

    void import(`./toast-modal.js?_=${Date.now()}`).then(({ showToast }) => {
      showToast(hint, 'info', 12000);
    });
  };

  window.addEventListener('manusilva-app-update-available', onUpdateAvailable);
}
