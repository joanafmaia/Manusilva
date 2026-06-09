/**
 * Palavra-passe inicial da equipa — alinhado com pwa/js/auth-password.js
 * Formato: PrimeiraLetra + resto em minúsculas + .2026 (ex.: Hugo → Hugo.2026)
 */

const INITIAL_PASSWORD_SUFFIX = '.2026';

function buildInitialPassword(displayName) {
  const name = String(displayName || '').trim();
  if (!name) return `Tecnico${INITIAL_PASSWORD_SUFFIX}`;
  const first = name.charAt(0).toUpperCase();
  const rest = name.slice(1).toLowerCase();
  return `${first}${rest}${INITIAL_PASSWORD_SUFFIX}`;
}

module.exports = {
  INITIAL_PASSWORD_SUFFIX,
  buildInitialPassword,
};
