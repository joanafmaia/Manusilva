import { AuthService } from '../auth.js';
import { ROLE_UI_TO_DB } from '../mock_data.js';
import { toggleTheme, themeToggleLabel, getStoredTheme } from '../theme.js';

export const LoginView = {
  render() {
    const isDark = getStoredTheme() === 'dark';

    return `
      <div id="login-container" style="
        position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: 20px;
      ">
        <button type="button" id="theme-toggle" class="theme-toggle-btn" aria-label="Alternar tema">
          <span id="theme-icon">${isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro'}</span>
        </button>

        <div id="login-card" style="
          background-color: var(--bg-card); color: var(--text-main);
          width: 100%; max-width: 420px; padding: 40px 30px;
          border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15);
          transition: transform 0.2s ease, background-color 0.3s ease;
        ">
          <div style="text-align: center; margin-bottom: 28px;">
            <div class="brand-logo-slot" data-brand-logo-lg aria-label="ManuSilva">MS</div>
            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Gestão de Frota</h2>
            <p style="color: var(--text-muted); margin: 0; font-size: 15px; font-weight: 500;">Introduza os seus dados para aceder</p>
          </div>

          <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: var(--text-muted);">Entrar como</p>
          <div id="role-selector" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px;">
            <button type="button" class="role-pick is-selected" data-role="technician" aria-pressed="true">
              <strong style="display:block;font-size:14px;">Técnico</strong>
              <span class="role-pick-hint">Campo · Mobile</span>
            </button>
            <button type="button" class="role-pick" data-role="admin" aria-pressed="false">
              <strong style="display:block;font-size:14px;">Recursos Humanos</strong>
              <span class="role-pick-hint">Admin · Desktop</span>
            </button>
          </div>

          <form id="login-form" autocomplete="on">
            <div style="margin-bottom: 20px;">
              <label for="identifier" style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--text-muted);">Nome ou e-mail</label>
              <input type="text" id="identifier" class="form-input" required value="Hugo" autocomplete="username" style="
                width: 100%; padding: 14px; border-radius: 8px; font-size: 16px; box-sizing: border-box; outline: none;
                background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main);
                transition: border-color 0.2s;
              " placeholder="Nome ou exemplo@empresa.com">
            </div>

            <div style="margin-bottom: 24px;">
              <label for="password" style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--text-muted);">Palavra-passe</label>
              <input type="password" id="password" class="form-input" required value="12345" autocomplete="current-password" style="
                width: 100%; padding: 14px; border-radius: 8px; font-size: 16px; box-sizing: border-box; outline: none;
                background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main);
                transition: border-color 0.2s;
              " placeholder="••••••••">
            </div>

            <div id="login-error" style="
              color: #dc2626; background: rgba(220, 38, 38, 0.08); padding: 12px;
              border-radius: 8px; margin-bottom: 20px; font-size: 14px; display: none;
              border: 1px solid rgba(220, 38, 38, 0.2); text-align: center; font-weight: 500;
            "></div>

            <button type="submit" id="btn-submit" style="
              width: 100%; padding: 14px; background: #2563eb; color: #ffffff;
              border: none; border-radius: 8px; font-size: 16px; font-weight: 600;
              cursor: pointer; transition: background 0.2s; display: flex; justify-content: center; align-items: center;
              box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
            ">
              <span id="btn-text">Entrar no Sistema</span>
            </button>
          </form>

          <p style="color: var(--text-muted); text-align: center; margin: 20px 0 0; font-size: 12px;">
            Demo: nome ou e-mail + palavra-passe <code>12345</code>
          </p>
        </div>
      </div>
    `;
  },

  init() {
    import('../brand-ui.js').then(({ applyBrandLogo }) => applyBrandLogo());

    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const card = document.getElementById('login-card');
    const roleButtons = document.querySelectorAll('.role-pick');

    let selectedUiRole = 'technician';

    const loginDefaults = {
      technician: { identifier: 'Hugo', password: '12345' },
      admin: { identifier: 'Joana', password: '12345' },
    };

    themeToggle?.addEventListener('click', () => {
      const next = toggleTheme();
      themeIcon.textContent = themeToggleLabel(next);
    });

    roleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedUiRole = btn.dataset.role;
        roleButtons.forEach((b) => {
          const selected = b === btn;
          b.classList.toggle('is-selected', selected);
          b.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        const defaults = loginDefaults[selectedUiRole] || loginDefaults.technician;
        document.getElementById('identifier').value = defaults.identifier;
        document.getElementById('password').value = defaults.password;
      });
    });

    form.querySelectorAll('#identifier, #password').forEach((input) => {
      input.addEventListener('focus', () => {
        input.style.borderColor = '#2563eb';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '';
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';

      btnSubmit.disabled = true;
      btnSubmit.style.background = '#1d4ed8';
      btnText.textContent = 'A verificar...';

      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;
      const roleFiltro = ROLE_UI_TO_DB[selectedUiRole];

      const resultado = await AuthService.login(identifier, password, roleFiltro);

      if (resultado.success) {
        window.location.reload();
        return;
      }

      btnSubmit.disabled = false;
      btnSubmit.style.background = '#2563eb';
      btnText.textContent = 'Entrar no Sistema';
      errorDiv.textContent = resultado.error;
      errorDiv.style.display = 'block';

      card.style.transform = 'translateX(-8px)';
      setTimeout(() => {
        card.style.transform = 'translateX(8px)';
      }, 80);
      setTimeout(() => {
        card.style.transform = 'translateX(0)';
      }, 160);
    });
  },
};
