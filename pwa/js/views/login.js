import { AuthService, resolveLoginEmail } from '../auth.js';
import { ROLE_UI_TO_DB } from '../mock_data.js';
import { toggleTheme, themeToggleIcon } from '../theme.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 120_000;
const FAILED_COUNT_KEY = 'manusilva_login_failed_count';

function getFailedCount() {
  return Number(localStorage.getItem(FAILED_COUNT_KEY) || 0);
}

function setFailedCount(n) {
  localStorage.setItem(FAILED_COUNT_KEY, String(Math.max(0, n)));
}

function resetFailedCount() {
  localStorage.removeItem(FAILED_COUNT_KEY);
}

export const LoginView = {
  render() {
    return `
      <div id="login-container" class="login-shell" style="
        position: relative; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 20px;
      ">
        <div class="login-shell-top">
          <button type="button" id="theme-toggle" class="theme-toggle-btn theme-toggle-btn--inline btn-ghost btn-sm" aria-label="Alternar tema" title="Alternar tema">
            <span id="theme-icon" aria-hidden="true">${themeToggleIcon()}</span>
          </button>
        </div>

        <div id="login-card" style="
          background-color: var(--bg-card); color: var(--text-main);
          width: 100%; max-width: 420px; padding: 40px 30px;
          border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15);
          transition: transform 0.2s ease, background-color 0.3s ease;
        ">
          <div class="login-brand-block">
            <div class="brand-logo-slot login-brand-logo" data-brand-logo-lg aria-label="ManuSilva">MS</div>
            <h2 class="login-portal-title">Portal Interno</h2>
            <p class="login-portal-subtitle">Introduza os seus dados para aceder</p>
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
              <input type="text" id="identifier" class="form-input" required autocomplete="username" style="
                width: 100%; padding: 14px; border-radius: 8px; font-size: 16px; box-sizing: border-box; outline: none;
                background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main);
                transition: border-color 0.2s;
              " placeholder="Nome ou exemplo@empresa.com">
            </div>

            <div style="margin-bottom: 8px;">
              <label for="password" style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--text-muted);">Palavra-passe</label>
              <input type="password" id="password" class="form-input" required autocomplete="current-password" style="
                width: 100%; padding: 14px; border-radius: 8px; font-size: 16px; box-sizing: border-box; outline: none;
                background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main);
                transition: border-color 0.2s;
              " placeholder="">
            </div>

            <div id="login-error" style="
              color: #dc2626; background: rgba(220, 38, 38, 0.08); padding: 12px;
              border-radius: 8px; margin: 20px 0; font-size: 14px; display: none;
              border: 1px solid rgba(220, 38, 38, 0.2); text-align: center; font-weight: 500;
            "></div>

            <div id="login-info" style="
              color: #1d4ed8; background: rgba(37, 99, 235, 0.08); padding: 12px;
              border-radius: 8px; margin-bottom: 20px; font-size: 14px; display: none;
              border: 1px solid rgba(37, 99, 235, 0.2); text-align: center; font-weight: 500;
            "></div>

            <button type="submit" id="btn-submit" class="login-submit-btn">
              <span id="btn-text">Entrar no Sistema</span>
            </button>
          </form>
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
    const infoDiv = document.getElementById('login-info');
    const btnSubmit = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const card = document.getElementById('login-card');
    const roleButtons = document.querySelectorAll('.role-pick');
    const identifierInput = document.getElementById('identifier');
    const passwordInput = document.getElementById('password');

    let selectedUiRole = 'technician';
    let lockTimer = null;

    const loginDefaults = {
      technician: { identifier: 'Hugo' },
      admin: { identifier: 'Joana' },
    };

    function setLoginLocked(locked, message = '') {
      btnSubmit.disabled = locked;
      if (locked) {
        btnSubmit.style.background = '#94a3b8';
        btnSubmit.style.cursor = 'not-allowed';
        if (message) btnText.textContent = message;
      } else {
        btnSubmit.style.background = '#2563eb';
        btnSubmit.style.cursor = 'pointer';
        btnText.textContent = 'Entrar no Sistema';
      }
    }

    function showError(msg) {
      infoDiv.style.display = 'none';
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }

    function showInfo(msg) {
      errorDiv.style.display = 'none';
      infoDiv.textContent = msg;
      infoDiv.style.display = 'block';
    }

    function shakeCard() {
      card.style.transform = 'translateX(-8px)';
      setTimeout(() => {
        card.style.transform = 'translateX(8px)';
      }, 80);
      setTimeout(() => {
        card.style.transform = 'translateX(0)';
      }, 160);
    }

    async function triggerLockoutAndReset(email) {
      const msg =
        'Demasiadas tentativas incorretas. Enviámos um link de redefinição de palavra-passe para o teu email para segurança da tua conta.';
      showInfo(msg);

      if (email) {
        await AuthService.requestPasswordReset(email);
      }

      setLoginLocked(true, 'Login bloqueado temporariamente');
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        setLoginLocked(false);
      }, LOGIN_LOCK_MS);
    }

    themeToggle?.addEventListener('click', () => {
      const next = toggleTheme();
      themeIcon.textContent = themeToggleIcon(next);
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
        identifierInput.value = defaults.identifier;
        passwordInput.value = '';
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
      if (btnSubmit.disabled && getFailedCount() >= MAX_FAILED_ATTEMPTS) return;

      errorDiv.style.display = 'none';
      infoDiv.style.display = 'none';

      setLoginLocked(true);
      btnSubmit.style.background = '#1d4ed8';
      btnText.textContent = 'A verificar...';

      const identifier = identifierInput.value.trim();
      const password = passwordInput.value;
      const roleFiltro = ROLE_UI_TO_DB[selectedUiRole];

      const resultado = await AuthService.login(identifier, password, roleFiltro);

      if (resultado.success) {
        resetFailedCount();
        window.location.reload();
        return;
      }

      const email =
        resultado.email || resolveLoginEmail(identifier, roleFiltro) || identifier;
      const failures = getFailedCount() + 1;
      setFailedCount(failures);

      if (failures >= MAX_FAILED_ATTEMPTS) {
        await triggerLockoutAndReset(email);
        shakeCard();
        return;
      }

      setLoginLocked(false);
      const restantes = MAX_FAILED_ATTEMPTS - failures;
      showError(
        `${resultado.error} (${restantes} tentativa${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'}).`,
      );
      shakeCard();
    });
  },
};
