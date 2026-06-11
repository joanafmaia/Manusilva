/**
 * Formulário RH — novo cliente / empresa
 */

import { addClient } from '../app.js';

/**
 * @param {{ modal?: boolean }} [options] — em modal omite o título (o modal já o tem).
 */
export function renderClientFormSection(options = {}) {
  const heading = options.modal
    ? ''
    : `
      <h3 id="rh-client-form-title" class="dashboard-section-title">Novo cliente / empresa</h3>
      <p class="rh-register-hint text-muted">O registo fica disponível de imediato na pesquisa e ao atribuir trabalho.</p>
    `;

  return `
    <section class="rh-register${options.modal ? ' rh-register--modal' : ' rh-section'}" data-rh-client-form aria-labelledby="rh-client-form-title">
      ${heading}
      <form id="rh-client-form" class="rh-register-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="rh-client-nome">Nome / Empresa *</label>
          <input type="text" class="form-input" id="rh-client-nome" required autocomplete="organization">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="rh-client-nif">NIF</label>
            <input type="text" class="form-input" id="rh-client-nif" inputmode="numeric" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" for="rh-client-email">E-mail</label>
            <input type="email" class="form-input" id="rh-client-email" autocomplete="off">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="rh-client-telemovel">Telemóvel / Contacto</label>
          <input type="tel" class="form-input" id="rh-client-telemovel" autocomplete="tel">
        </div>
        <div class="form-group">
          <label class="form-label" for="rh-client-morada">Morada</label>
          <input type="text" class="form-input" id="rh-client-morada" autocomplete="street-address">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="rh-client-cp">Código postal</label>
            <input type="text" class="form-input" id="rh-client-cp" autocomplete="postal-code">
          </div>
          <div class="form-group">
            <label class="form-label" for="rh-client-localidade">Localidade</label>
            <input type="text" class="form-input" id="rh-client-localidade" autocomplete="address-level2">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="rh-client-pais">País / Região</label>
          <input type="text" class="form-input" id="rh-client-pais" value="Portugal" autocomplete="country-name">
        </div>
        <button type="submit" class="btn-primary rh-register-submit">Adicionar cliente</button>
      </form>
    </section>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {{ onSuccess?: (record: object) => void }} [callbacks]
 */
export function mountClientForm(root, callbacks = {}) {
  const form = root?.querySelector('#rh-client-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('.rh-register-submit');
    const btnLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'A gravar…';
    }

    try {
      const record = await addClient({
        Nome: form.querySelector('#rh-client-nome')?.value,
        NIF: form.querySelector('#rh-client-nif')?.value,
        'E-mail': form.querySelector('#rh-client-email')?.value,
        telemovel: form.querySelector('#rh-client-telemovel')?.value,
        Morada: form.querySelector('#rh-client-morada')?.value,
        'Código postal': form.querySelector('#rh-client-cp')?.value,
        Localidade: form.querySelector('#rh-client-localidade')?.value,
        'País/Região': form.querySelector('#rh-client-pais')?.value,
      });

      if (record) {
        form.reset();
        const pais = form.querySelector('#rh-client-pais');
        if (pais) pais.value = 'Portugal';
        callbacks.onSuccess?.(record);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btnLabel || 'Adicionar cliente';
      }
    }
  });
}
