/**
 * Botão e aviso de nova versão — partilhado entre painel RH e tablet.
 */

import { showToast } from './toast-modal.js';
import { forceAppRefresh } from './app-version.js';

/**
 * @param {string} [buttonId]
 * @param {{ updateHint?: string }} [options]
 */
export function bindAppRefreshButton(buttonId = 'btn-force-app-refresh', options = {}) {
  const refreshBtn = document.getElementById(buttonId);
  if (!refreshBtn || refreshBtn.dataset.refreshBound === '1') return;
  refreshBtn.dataset.refreshBound = '1';

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    const label = refreshBtn.querySelector('.sidebar-refresh-label, .tech-refresh-label');
    if (label) label.textContent = 'A atualizar…';
    else refreshBtn.textContent = 'A atualizar…';
    await forceAppRefresh();
  });

  const hint =
    options.updateHint ||
    'Nova versão disponível — clique em «Atualizar app».';
  window.addEventListener('manusilva-app-update-available', () => {
    showToast(hint, 'info', 12000);
  });
}
