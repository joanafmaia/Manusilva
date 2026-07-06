/**
 * Botão e aviso de nova versão — partilhado entre painel RH e tablet.
 */

/**
 * @param {string} [buttonId]
 * @param {{ updateHint?: string, notifyStyle?: 'toast' | 'button' }} [options]
 *   notifyStyle — tablet: 'button' (destaca o botão, sem toast); RH: 'toast' (predefinido)
 */
export function bindAppRefreshButton(buttonId = 'btn-force-app-refresh', options = {}) {
  const refreshBtn = document.getElementById(buttonId);
  if (!refreshBtn || refreshBtn.dataset.refreshBound === '1') return;
  refreshBtn.dataset.refreshBound = '1';

  const notifyStyle = options.notifyStyle === 'button' ? 'button' : 'toast';
  let updateHintShown = false;

  refreshBtn.addEventListener('click', async () => {
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
      const { markForceModuleBust, purgeBrowserCaches, navigateToFreshApp } = await import(
        `./app-version.js${bust}`,
      );
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

    if (notifyStyle === 'button') {
      refreshBtn.classList.add('tech-refresh-btn--update-available');
      refreshBtn.title = hint;
      refreshBtn.setAttribute('aria-label', hint);
      return;
    }

    void import(`./toast-modal.js?_=${Date.now()}`).then(({ showToast }) => {
      showToast(hint, 'info', 12000);
    });
  };

  window.addEventListener('manusilva-app-update-available', onUpdateAvailable);
}
