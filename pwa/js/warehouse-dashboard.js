/**
 * Dashboard Armazém — layout desktop para PC na oficina.
 */

import { requireAuth, warmOperacoes, showToast } from './tech-app-core.js';
import { initLogoutButton, renderUserGreeting } from './auth.js';
import { bindAppRefreshButton } from './app-refresh-ui.js';
import { openFolhaObraEditor, mountFolhasObraTab } from './views/folhas-obra.js';

async function renderWarehouseHome(session) {
  const mount = document.getElementById('warehouse-app-mount');
  if (!mount) return;

  await mountFolhasObraTab(mount, {
    session,
    layout: 'desktop',
    audience: 'warehouse',
    showCreateButton: false,
    onCreateRequest: () =>
      openFolhaObraEditor(null, session, { onClose: () => renderWarehouseHome(session).catch(console.error) }),
    onRefresh: () => renderWarehouseHome(session).catch(console.error),
  });
}

export async function initWarehouseDashboard() {
  const session = requireAuth('warehouse');
  if (!session) return;

  initLogoutButton();
  renderUserGreeting('user-name');
  bindAppRefreshButton('btn-force-app-refresh', {
    notifyStyle: 'button',
    updateHint: 'Nova versão disponível — clique em Atualizar.',
  });

  document.getElementById('warehouse-create-folha-btn')?.addEventListener('click', () => {
    openFolhaObraEditor(null, session, { onClose: () => renderWarehouseHome(session).catch(console.error) });
  });

  try {
    await warmOperacoes();
  } catch (err) {
    console.warn('[Armazém] Warm inicial:', err);
    showToast('Alguns dados podem não estar atualizados.', 'warning', 5000, { force: true });
  }

  await renderWarehouseHome(session);
}
