/**
 * Utilitários HTML partilhados (sem dependências de app.js).
 */

/** Escapa texto para inserção segura em HTML. */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
