/**
 * Aplica o tema antes do paint (incluir como primeiro script no <body>).
 */
(function applyInitialTheme() {
  const theme = localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark';
  document.body.classList.add(`${theme}-mode`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0f172a');
  }
})();
