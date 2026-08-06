/**
 * Cadastros RH — clientes e técnicos (localStorage + catálogo/login).
 */

import { getAllTechnicians } from '../app.js';
import { syncTechniciansCatalog } from '../technicians-admin.js';
import {
  renderTechnicianFormSection,
  renderTechniciansList,
  mountTechnicianForm,
  bindTechniciansListEvents,
} from './rh-technician-form.js';

export { renderClientFormSection, mountClientForm } from './rh-client-form.js';
export { renderTechnicianFormSection, mountTechnicianForm } from './rh-technician-form.js';

/**
 * Painel Funcionários — formulário + lista dinâmica.
 */
function renderRhAdminTabs() {
  return `
    <nav class="rh-admin-tabs" role="tablist" aria-label="Secções de gestão de pessoal">
      <button type="button" class="rh-admin-tab is-active" data-rh-tab="funcionarios" role="tab" aria-selected="true">
        <span class="rh-admin-tab-icon" aria-hidden="true">👥</span>
        <span class="rh-admin-tab-label">Funcionários</span>
      </button>
      <button type="button" class="rh-admin-tab" data-rh-tab="horas" role="tab" aria-selected="false" disabled>
        <span class="rh-admin-tab-icon" aria-hidden="true">📅</span>
        <span class="rh-admin-tab-label">Horas / Pontos</span>
      </button>
      <button type="button" class="rh-admin-tab" data-rh-tab="documentos" role="tab" aria-selected="false" disabled>
        <span class="rh-admin-tab-icon" aria-hidden="true">📄</span>
        <span class="rh-admin-tab-label">Documentos</span>
      </button>
    </nav>
  `;
}

export function renderEmployeesPanel() {
  return `
    <div class="rh-employees-shell" data-rh-employees-shell>
      ${renderRhAdminTabs()}
      <div class="rh-admin-tab-panels">
        <div class="rh-admin-tab-panel is-active" data-rh-tab-panel="funcionarios" role="tabpanel">
          <div class="rh-employees-panel" data-rh-employees-panel>
            ${renderTechnicianFormSection()}
            <div class="rh-employees-list-wrap">
              <h3 class="ms-h2 faturacao-section-title">Equipa técnica</h3>
              <div class="form-group faturacao-filter-group faturacao-filter-search rh-employees-search-wrap">
                <label class="form-label" for="rh-technicians-search">Pesquisar</label>
                <input type="search" class="form-input" id="rh-technicians-search" placeholder="Nome, e-mail ou telemóvel…" autocomplete="off" spellcheck="false" />
              </div>
              <div id="rh-technicians-list" class="rh-employees-list"></div>
            </div>
          </div>
        </div>
        <div class="rh-admin-tab-panel" data-rh-tab-panel="horas" role="tabpanel" hidden>
          <p class="text-muted rh-admin-placeholder">Registo de horas e pontos — disponível em breve.</p>
        </div>
        <div class="rh-admin-tab-panel" data-rh-tab-panel="documentos" role="tabpanel" hidden>
          <p class="text-muted rh-admin-placeholder">Documentos de RH — disponível em breve.</p>
        </div>
      </div>
    </div>
  `;
}

function bindRhAdminTabs(root) {
  const shell = root?.querySelector('[data-rh-employees-shell]');
  if (!shell || shell.dataset.tabsBound === 'true') return;
  shell.dataset.tabsBound = 'true';

  shell.querySelectorAll('.rh-admin-tab:not([disabled])').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.rhTab;
      if (!id) return;

      shell.querySelectorAll('.rh-admin-tab').forEach((btn) => {
        const active = btn.dataset.rhTab === id;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      shell.querySelectorAll('[data-rh-tab-panel]').forEach((panel) => {
        const active = panel.dataset.rhTabPanel === id;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    });
  });
}

export function refreshTechniciansList(root, query) {
  const list = root?.querySelector('#rh-technicians-list');
  if (!list) return;
  const searchInput = root?.querySelector('#rh-technicians-search');
  const q = query != null ? query : searchInput?.value || '';
  list.innerHTML = renderTechniciansList(getAllTechnicians(), { query: q });
  bindTechniciansListEvents(list);
}

export function initEmployeesPanel(root) {
  if (!root) return;

  root.innerHTML = renderEmployeesPanel();
  bindRhAdminTabs(root);
  refreshTechniciansList(root);
  syncTechniciansCatalog({ silent: true })
    .then(() => refreshTechniciansList(root))
    .catch((err) => console.warn('[RH] Sync técnicos:', err));

  let searchTimer = null;
  root.querySelector('#rh-technicians-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshTechniciansList(root, e.target.value), 140);
  });

  mountTechnicianForm(root, {
    onSuccess: () => {
      refreshTechniciansList(root);
    },
  });
}
