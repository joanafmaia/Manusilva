/**
 * Cadastros RH — clientes e técnicos (localStorage + catálogo/login).
 */

import { getAllTechnicians } from '../app.js';
import { renderClientFormSection, mountClientForm } from './rh-client-form.js';
import {
  renderTechnicianFormSection,
  renderTechniciansList,
  mountTechnicianForm,
  bindTechniciansListEvents,
} from './rh-technician-form.js';

export { renderClientFormSection, mountClientForm } from './rh-client-form.js';
export { renderTechnicianFormSection, mountTechnicianForm } from './rh-technician-form.js';

/**
 * Secção de cadastro de cliente (painel Clientes).
 */
export function renderClientRegistryBlock() {
  return `<div data-rh-client-registry>${renderClientFormSection()}</div>`;
}

export function mountClientRegistry(root, callbacks = {}) {
  const block = root?.querySelector('[data-rh-client-registry]');
  if (!block) return;
  mountClientForm(block, {
    onSuccess: (record) => {
      callbacks.onClientAdded?.(record);
    },
  });
}

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
              <h3 class="dashboard-section-title">Equipa técnica</h3>
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

export function refreshTechniciansList(root) {
  const list = root?.querySelector('#rh-technicians-list');
  if (!list) return;
  list.innerHTML = renderTechniciansList(getAllTechnicians());
  bindTechniciansListEvents(list);
}

export function initEmployeesPanel(root) {
  if (!root) return;

  root.innerHTML = renderEmployeesPanel();
  bindRhAdminTabs(root);
  refreshTechniciansList(root);

  mountTechnicianForm(root, {
    onSuccess: () => {
      refreshTechniciansList(root);
    },
  });
}
