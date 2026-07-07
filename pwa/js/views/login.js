import { AuthService, resolveLoginEmail, userUsesNameOnlyLogin } from '../auth.js';
import { ROLE_UI_TO_DB } from '../mock_data.js';
import { getSavedLoginIdentifier, loadLoginPrefs, saveLoginPrefs } from '../login-prefs.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 120_000;
const FAILED_COUNT_KEY_PREFIX = 'manusilva_login_failed_count:';

function normalizeIdentifierKey(role, identifier) {
  return `${role}:${String(identifier || '').trim().toLowerCase()}`;
}

function failedCountKey(role, identifier) {
  return `${FAILED_COUNT_KEY_PREFIX}${normalizeIdentifierKey(role, identifier)}`;
}

function getFailedCount(role, identifier) {
  return Number(localStorage.getItem(failedCountKey(role, identifier)) || 0);
}

function setFailedCount(role, identifier, n) {
  localStorage.setItem(failedCountKey(role, identifier), String(Math.max(0, n)));
}

function resetFailedCount(role, identifier) {
  localStorage.removeItem(failedCountKey(role, identifier));
}

function selectLoginRole(roleButtons, role) {
  roleButtons.forEach((btn) => {
    const selected = btn.dataset.role === role;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

export const LoginView = {
  render() {
    return `
      <div id="login-container" class="login-shell">
        <aside class="login-hero" aria-label="Manusilva">
          <div class="login-hero__inner">
            <div class="brand-logo-slot login-hero__logo" data-brand-logo-lg aria-label="Manusilva"></div>
            <h1 class="login-wordmark" data-hide-if-logo>Manusilva</h1>
            <p class="login-hero__tagline">Gestão de empilhadores, manutenção e baterias</p>
            <p class="login-hero__lead">Portal interno para equipa técnica e administração.</p>
          </div>
        </aside>

        <div class="login-panel">
          <div class="login-stack">
            <div class="login-brand-block login-brand-block--stacked" aria-label="Manusilva">
              <div class="brand-logo-slot login-brand-logo" data-brand-logo-lg aria-label="Manusilva"></div>
              <p class="login-brand-tagline">Gestão de empilhadores, manutenção e baterias</p>
            </div>

          <div id="login-card" class="login-card">
            <header class="login-panel__header">
              <h2 class="login-portal-title">Entrar</h2>
              <p class="login-portal-subtitle">Introduza os seus dados de acesso</p>
            </header>

          <p class="login-role-label">Perfil</p>
          <div id="role-selector" class="role-selector">
            <button type="button" class="role-pick is-selected" data-role="technician" aria-pressed="true">
              <strong class="role-pick-title">Técnico</strong>
              <span class="role-pick-hint">Campo · Mobile</span>
            </button>
            <button type="button" class="role-pick" data-role="warehouse" aria-pressed="false">
              <strong class="role-pick-title">Armazém</strong>
              <span class="role-pick-hint">Conta partilhada · Oficina</span>
            </button>
            <button type="button" class="role-pick" data-role="admin" aria-pressed="false">
              <strong class="role-pick-title">Recursos Humanos</strong>
              <span class="role-pick-hint">Admin · Desktop</span>
            </button>
          </div>

          <form id="login-form" class="login-form" method="post" action="./index.html" autocomplete="on">
            <div class="form-group">
              <label for="identifier" class="form-label">Nome de utilizador ou e-mail</label>
              <input
                type="text"
                id="identifier"
                name="username"
                class="form-input"
                required
                autocomplete="username"
                placeholder="Ex.: Armazém, Joana ou nome@empresa.com"
              >
            </div>

            <div class="form-group form-group--compact">
              <label for="password" class="form-label">Palavra-passe</label>
              <input
                type="password"
                id="password"
                name="password"
                class="form-input"
                required
                autocomplete="current-password"
              >
            </div>

            <div id="login-error" class="login-message login-message--error" role="alert"></div>
            <div id="login-info" class="login-message login-message--info" role="status"></div>

            <button type="submit" id="btn-submit" class="login-submit-btn">
              <span id="btn-text">Entrar</span>
            </button>
          </form>
          </div>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    import('../brand-ui.js').then(({ applyBrandLogo }) => applyBrandLogo());

    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    const infoDiv = document.getElementById('login-info');
    const btnSubmit = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const card = document.getElementById('login-card');
    const roleButtons = document.querySelectorAll('.role-pick');
    const identifierInput = document.getElementById('identifier');
    const passwordInput = document.getElementById('password');

    const savedPrefs = loadLoginPrefs();
    let selectedUiRole = savedPrefs.role;
    let lockTimer = null;

    function applyIdentifierForRole(role, { onlyIfEmpty = false } = {}) {
      const saved = getSavedLoginIdentifier(role);
      if (!saved) return;
      if (onlyIfEmpty && String(identifierInput.value || '').trim()) return;
      identifierInput.value = saved;
    }

    function setLoginLocked(locked, message = '') {
      btnSubmit.disabled = locked;
      btnSubmit.classList.toggle('is-loading', locked && !message);
      if (message) {
        btnText.textContent = message;
      } else if (!locked) {
        btnText.textContent = 'Entrar';
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

    selectLoginRole(roleButtons, selectedUiRole);
    applyIdentifierForRole(selectedUiRole);

    roleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedUiRole = btn.dataset.role;
        selectLoginRole(roleButtons, selectedUiRole);
        applyIdentifierForRole(selectedUiRole);
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = identifierInput.value.trim();
      const loginKeyRole = selectedUiRole;
      if (btnSubmit.disabled && getFailedCount(loginKeyRole, identifier) >= MAX_FAILED_ATTEMPTS) return;

      hideMessages();

      setLoginLocked(true);
      btnText.textContent = 'A verificar...';

      const password = passwordInput.value;
      const roleFiltro = ROLE_UI_TO_DB[selectedUiRole];

      const resultado = await AuthService.login(identifier, password, roleFiltro);

      if (resultado.success) {
        resetFailedCount(loginKeyRole, identifier);
        saveLoginPrefs({ role: selectedUiRole, identifier });
        window.location.reload();
        return;
      }

      const email =
        resultado.email || resolveLoginEmail(identifier, roleFiltro) || identifier;
      const failures = getFailedCount(loginKeyRole, identifier) + 1;
      setFailedCount(loginKeyRole, identifier, failures);

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
