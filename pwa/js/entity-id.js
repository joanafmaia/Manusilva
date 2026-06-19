/**
 * Comparação normalizada de identificadores (trabalhos, relatórios, clientes).
 */

export function normalizeEntityId(id) {
  if (id == null) return '';
  return String(id).trim();
}

export function sameEntityId(a, b) {
  if (a == null || b == null) return a === b;
  return normalizeEntityId(a) === normalizeEntityId(b);
}
