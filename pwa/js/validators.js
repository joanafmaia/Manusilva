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

/** Separa lista de e-mails (vírgula, ponto e vírgula ou quebra de linha). */
export function splitEmailList(raw) {
  return String(raw ?? '')
    .split(/[;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Lista única de e-mails normalizados. */
export function normalizeEmailList(raw) {
  const seen = new Set();
  const out = [];
  for (const part of splitEmailList(raw)) {
    const norm = normalizeEmail(part);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export function isValidEmailList(raw) {
  const parts = splitEmailList(raw);
  if (!parts.length) return false;
  return parts.every((part) => isValidEmail(part));
}

/** Formato estável para gravar no orçamento (vários destinatários). */
export function formatEmailListForStorage(emails) {
  if (Array.isArray(emails)) {
    return normalizeEmailList(emails.join('; ')).join('; ');
  }
  return normalizeEmailList(emails).join('; ');
}
