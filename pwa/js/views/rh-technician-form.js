/**
 * Formulário RH — novo técnico (equipa + login)
 */

import { addTechnician, escapeHtml } from '../app.js';

export function renderTechnicianFormSection() {
  return `
    <section class="rh-register rh-section" data-rh-tech-form aria-labelledby="rh-tech-form-title">
      <h3 id="rh-tech-form-title" class="dashboard-section-title">Novo técnico</h3>
      <p class="rh-register-hint text-muted">
        O técnico passa a aparecer no calendário, nas atribuições e no ecrã de login (perfil Técnico).
      </p>
      <form id="rh-tech-form" class="rh-register-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="rh-tech-nome">Nome completo *</label>
          <input type="text" class="form-input" id="rh-tech-nome" required autocomplete="name">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="rh-tech-email">E-mail (login) *</label>
            <input type="email" class="form-input" id="rh-tech-email" required autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" for="rh-tech-phone">Telemóvel *</label>
            <input type="tel" class="form-input" id="rh-tech-phone" required autocomplete="tel">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="rh-tech-nif">NIF</label>
            <input type="text" class="form-input" id="rh-tech-nif" inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label" for="rh-tech-password">Palavra-passe inicial</label>
            <input type="text" class="form-input" id="rh-tech-password" value="12345" autocomplete="new-password">
          </div>
        </div>
        <button type="submit" class="btn-primary rh-register-submit">Adicionar técnico</button>
      </form>
    </section>
  `;
}

function technicianInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
}

function renderTechnicianCards(technicians) {
  return technicians
    .map(
      (t) => `
    <div class="employee-card" data-tech-id="${escapeHtml(t.id)}">
      <div class="employee-avatar" style="background:${t.color}20;color:${t.color}">${escapeHtml(
        technicianInitials(t.name),
      )}</div>
      <div class="employee-info">
        <h4>${escapeHtml(t.name)}</h4>
        <p class="text-muted">${escapeHtml(t.email)}</p>
        <p class="text-muted">${escapeHtml(t.phone || '—')}</p>
      </div>
      <div class="employee-status online-dot">Ativo</div>
    </div>
  `,
    )
    .join('');
}

function renderTechniciansTable(technicians) {
  return `
    <div class="rh-table-scroll">
      <table class="rh-data-table rh-employees-table">
        <thead>
          <tr>
            <th scope="col">Técnico</th>
            <th scope="col">E-mail</th>
            <th scope="col">Telemóvel</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${technicians
            .map(
              (t) => `
            <tr class="rh-data-table-row" data-tech-id="${escapeHtml(t.id)}" tabindex="0" role="button" aria-label="Perfil de ${escapeHtml(t.name)}">
              <td>
                <div class="rh-table-tech-cell">
                  <div class="employee-avatar" style="background:${t.color}20;color:${t.color}">${escapeHtml(
                    technicianInitials(t.name),
                  )}</div>
                  <span class="rh-table-tech-name">${escapeHtml(t.name)}</span>
                </div>
              </td>
              <td data-col-label="E-mail">${escapeHtml(t.email)}</td>
              <td data-col-label="Telemóvel">${escapeHtml(t.phone || '—')}</td>
              <td data-col-label="Estado"><span class="employee-status online-dot">Ativo</span></td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderTechniciansList(technicians) {
  if (!technicians.length) {
    return '<p class="text-muted empty-inline">Sem técnicos registados.</p>';
  }

  return `
    <div class="rh-employees-cards">${renderTechnicianCards(technicians)}</div>
    <div class="rh-employees-table-wrap">${renderTechniciansTable(technicians)}</div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {{ onSuccess?: () => void }} [callbacks]
 */
export function mountTechnicianForm(root, callbacks = {}) {
  const form = root?.querySelector('#rh-tech-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const btn = form.querySelector('.rh-register-submit');
    btn.disabled = true;

    const tech = addTechnician({
      nome: form.querySelector('#rh-tech-nome')?.value,
      email: form.querySelector('#rh-tech-email')?.value,
      telemovel: form.querySelector('#rh-tech-phone')?.value,
      nif: form.querySelector('#rh-tech-nif')?.value,
      password: form.querySelector('#rh-tech-password')?.value,
    });

    btn.disabled = false;

    if (tech) {
      form.reset();
      const pwd = form.querySelector('#rh-tech-password');
      if (pwd) pwd.value = '12345';
      callbacks.onSuccess?.();
    }
  });
}
