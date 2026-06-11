import { AuthService, resolveLoginEmail, userUsesNameOnlyLogin } from '../auth.js';
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
      <div id="login-container" class="login-shell">
        <div class="login-shell-top">
          <button type="button" id="theme-toggle" class="theme-toggle-btn theme-toggle-btn--inline btn-ghost btn-sm" aria-label="Alternar tema" title="Alternar tema">
            <span id="theme-icon" aria-hidden="true">${themeToggleIcon()}</span>
          </button>
        </div>

        <div id="login-card" class="login-card">
          <div class="login-brand-block">
            <div class="brand-logo-slot login-brand-logo" data-brand-logo-lg aria-label="ManuSilva">MS</div>
            <h2 class="login-portal-title">Portal Interno</h2>
            <p class="login-portal-subtitle">Introduza os seus dados para aceder</p>
          </div>

          <p class="login-role-label">Entrar como</p>
          <div id="role-selector" class="role-selector">
            <button type="button" class="role-pick is-selected" data-role="technician" aria-pressed="true">
              <strong class="role-pick-title">Técnico</strong>
              <span class="role-pick-hint">Campo · Mobile</span>
            </button>
            <button type="button" class="role-pick" data-role="admin" aria-pressed="false">
              <strong class="role-pick-title">Recursos Humanos</strong>
              <span class="role-pick-hint">Admin · Desktop</span>
            </button>
          </div>

          <form id="login-form" class="login-form" autocomplete="on">
            <div class="form-group">
              <label for="identifier" class="form-label">Nome de utilizador ou e-mail</label>
              <input type="text" id="identifier" class="form-input" required autocomplete="username" placeholder="Ex.: Filipa ou nome@empresa.com">
            </div>

            <div class="form-group form-group--compact">
              <label for="password" class="form-label">Palavra-passe</label>
              <input type="password" id="password" class="form-input" required autocomplete="current-password">
            </div>

            <div id="login-error" class="login-message login-message--error" role="alert"></div>
            <div id="login-info" class="login-message login-message--info" role="status"></div>

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
      btnSubmit.classList.toggle('is-loading', locked && !message);
      if (message) {
        btnText.textContent = message;
      } else if (!locked) {
        btnText.textContent = 'Entrar no Sistema';
      }
    }

    function hideMessages() {
      errorDiv.classList.remove('is-visible');
      infoDiv.classList.remove('is-visible');
    }

    function showError(msg) {
      infoDiv.classList.remove('is-visible');
      errorDiv.textContent = msg;
      errorDiv.classList.add('is-visible');
    }

    function showInfo(msg) {
      errorDiv.classList.remove('is-visible');
      infoDiv.textContent = msg;
      infoDiv.classList.add('is-visible');
    }

    function shakeCard() {
      card.classList.remove('is-shake');
      void card.offsetWidth;
      card.classList.add('is-shake');
      card.addEventListener(
        'animationend',
        () => {
          card.classList.remove('is-shake');
        },
        { once: true },
      );
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btnSubmit.disabled && getFailedCount() >= MAX_FAILED_ATTEMPTS) return;

      hideMessages();

      setLoginLocked(true);
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
        if (userUsesNameOnlyLogin(identifier, roleFiltro)) {
          showInfo(
            'Demasiadas tentativas incorretas. Contacte a administração para redefinir a palavra-passe.',
          );
          setLoginLocked(true, 'Login bloqueado temporariamente');
          clearTimeout(lockTimer);
          lockTimer = setTimeout(() => setLoginLocked(false), LOGIN_LOCK_MS);
        } else {
          await triggerLockoutAndReset(email);
        }
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
