/**
 * Formulário RH — novo técnico (equipa + login)
 */

import { addTechnician, escapeHtml } from '../app.js';

export function renderTechnicianFormSection() {
  return `
    <section class="rh-register glass-card" data-rh-tech-form aria-labelledby="rh-tech-form-title">
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

export function renderTechniciansList(technicians) {
  if (!technicians.length) {
    return '<p class="text-muted empty-inline">Sem técnicos registados.</p>';
  }

  return technicians
    .map(
      (t) => `
    <div class="employee-card glass-card" data-tech-id="${escapeHtml(t.id)}">
      <div class="employee-avatar" style="background:${t.color}20;color:${t.color}">${escapeHtml(
        t.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2),
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
