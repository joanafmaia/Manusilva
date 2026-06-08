/**
 * Validações partilhadas (e-mail, etc.)
 */

/** E-mail válido para gravação / aprovação (formato simples). */
export function isValidEmail(email) {
  const v = String(email ?? '').trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v);
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}
