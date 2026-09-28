/**
 * Pesquisa global (Ctrl+K) — ranking e índice, sem DOM.
 */

export function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function scoreSearchHaystack(haystack, query) {
  const hay = normalizeSearchText(haystack);
  const q = normalizeSearchText(query);
  if (!q || !hay) return 0;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 88;
  const compactHay = hay.replace(/\s/g, '');
  const compactQ = q.replace(/\s/g, '');
  if (compactQ.length >= 2 && compactHay.startsWith(compactQ)) return 82;
  if (compactQ.length >= 2 && compactHay.includes(compactQ)) return 68;
  if (hay.includes(q)) return 55;
  const parts = q.split(' ').filter(Boolean);
  if (parts.length > 1 && parts.every((part) => hay.includes(part))) return 48;
  return 0;
}

/**
 * @param {{ haystack: string, title?: string, subtitle?: string, kind?: string }} item
 * @param {string} query
 */
export function scoreSearchItem(item, query) {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const titleScore = scoreSearchHaystack(item.title || '', q);
  const hayScore = scoreSearchHaystack(item.haystack || '', q);
  const subScore = scoreSearchHaystack(item.subtitle || '', q);
  const kindBoost = item.kind === 'client' && titleScore >= 55 ? 6 : 0;
  return Math.max(titleScore, hayScore, subScore * 0.9) + kindBoost;
}

/**
 * @param {Array<{ id: string, kind: string, title: string, subtitle?: string, haystack: string }>} items
 * @param {string} query
 * @param {{ limit?: number }} [options]
 */
export function searchAdminIndex(items, query, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 24;
  const q = String(query || '').trim();
  if (!q) return [];

  return [...items]
    .map((item) => ({ ...item, score: scoreSearchItem(item, q) }))
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), 'pt'))
    .slice(0, limit);
}
