/**
 * Cadastros RH — clientes e técnicos (localStorage + catálogo/login).
 */

import { getAllTechnicians } from '../app.js';
import { renderClientFormSection, mountClientForm } from './rh-client-form.js';
import {
  renderTechnicianFormSection,
  renderTechniciansList,
  mountTechnicianForm,
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
export function renderEmployeesPanel() {
  return `
    <div class="rh-employees-panel" data-rh-employees-panel>
      ${renderTechnicianFormSection()}
      <div class="rh-employees-list-wrap">
        <h3 class="dashboard-section-title">Equipa técnica</h3>
        <div id="rh-technicians-list" class="rh-employees-list"></div>
      </div>
    </div>
  `;
}

export function refreshTechniciansList(root) {
  const list = root?.querySelector('#rh-technicians-list');
  if (!list) return;
  list.innerHTML = renderTechniciansList(getAllTechnicians());
}

export function initEmployeesPanel(root) {
  if (!root) return;

  root.innerHTML = renderEmployeesPanel();
  refreshTechniciansList(root);

  mountTechnicianForm(root, {
    onSuccess: () => {
      refreshTechniciansList(root);
    },
  });
}
