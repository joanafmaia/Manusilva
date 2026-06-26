/**
 * Preferências de login locais (último perfil e identificador por função).
 * Não guarda palavra-passe — isso fica a cargo do gestor de palavras-passe do browser.
 */

const LOGIN_PREFS_KEY = 'manusilva_login_prefs';

function emptyPrefs() {
  return { role: 'technician', identifiers: {} };
}

export function loadLoginPrefs() {
  try {
    const raw = localStorage.getItem(LOGIN_PREFS_KEY);
    if (!raw) return emptyPrefs();
    const parsed = JSON.parse(raw);
    return {
      role: parsed.role === 'admin' ? 'admin' : 'technician',
      identifiers:
        parsed.identifiers && typeof parsed.identifiers === 'object'
          ? { ...parsed.identifiers }
          : {},
    };
  } catch {
    return emptyPrefs();
  }
}

/** @param {'technician'|'admin'} role */
export function getSavedLoginIdentifier(role) {
  const id = loadLoginPrefs().identifiers[role];
  return id && String(id).trim() ? String(id).trim() : '';
}

/**
 * @param {{ role: 'technician'|'admin', identifier: string }} prefs
 */
export function saveLoginPrefs({ role, identifier }) {
  const current = loadLoginPrefs();
  const trimmed = String(identifier || '').trim();
  const next = {
    role: role === 'admin' ? 'admin' : 'technician',
    identifiers: { ...current.identifiers },
  };
  if (trimmed) next.identifiers[next.role] = trimmed;
  localStorage.setItem(LOGIN_PREFS_KEY, JSON.stringify(next));
}
