/**
 * Formato da palavra-passe inicial da equipa: PrimeiraLetra + resto em minúsculas + .2026
 * Ex.: Hugo → Hugo.2026 · Tecnico → Tecnico.2026
 */

export const INITIAL_PASSWORD_SUFFIX = '.2026';

export function buildInitialPasswordHint(displayName) {
  const name = String(displayName || '').trim();
  if (!name) return 'Ex.: Tecnico.2026';
  const first = name.charAt(0).toUpperCase();
  const rest = name.slice(1).toLowerCase();
  return `${first}${rest}${INITIAL_PASSWORD_SUFFIX}`;
}

export function matchesInitialPasswordPattern(password, displayName) {
  const expected = buildInitialPasswordHint(displayName);
  return String(password || '').trim() === expected;
}
