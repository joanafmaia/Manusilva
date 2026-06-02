/**
 * Tema global claro / escuro (localStorage `app_theme`).
 */

export function getStoredTheme() {
  return localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark';
}

export function applyThemeToDocument(theme = getStoredTheme()) {
  document.body.classList.remove('dark-mode', 'light-mode');
  document.body.classList.add(`${theme}-mode`);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0f172a');
  }

  document.getElementById('login-page-wrapper')?.classList.remove('dark-mode', 'light-mode');
  document.getElementById('login-page-wrapper')?.classList.add(`${theme}-mode`);

  return theme;
}

export function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('app_theme', next);
  applyThemeToDocument(next);
  return next;
}

export function themeToggleLabel(theme = getStoredTheme()) {
  return theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
}
