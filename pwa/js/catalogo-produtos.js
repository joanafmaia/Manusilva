/**
 * Catálogo de produtos/serviços — importado de Listagem Produtos.xlsx
 */

const CATALOG_URL = 'data/catalogo-produtos.json';
const MAX_RESULTS = 12;

let cache = null;
let loadPromise = null;

function norm(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return norm(value).toLowerCase();
}

export function parseCatalogPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((row) => ({
      tipo: norm(row.tipo) || '—',
      codigo: norm(row.codigo),
      descricao: norm(row.descricao) || norm(row.codigo),
      unidade: norm(row.unidade) || 'un',
      precoVenda:
        row.precoVenda != null && Number.isFinite(Number(row.precoVenda))
          ? Number(row.precoVenda)
          : null,
    }))
    .filter((row) => row.descricao || row.codigo);
}

/** @returns {Promise<{ items: object[], updatedAt: string|null, itemCount: number }>} */
export async function loadCatalogoProdutos({ force = false } = {}) {
  if (!force && cache) return cache;
  if (!force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const items = parseCatalogPayload(payload);
      cache = {
        items,
        updatedAt: payload.updatedAt || null,
        itemCount: items.length,
        source: payload.source || null,
      };
      return cache;
    } catch (err) {
      console.warn('[Catálogo] Falha ao carregar produtos:', err);
      cache = { items: [], updatedAt: null, itemCount: 0, source: null };
      return cache;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function formatCatalogoPreco(precoVenda) {
  if (precoVenda == null || !Number.isFinite(precoVenda)) return '';
  return precoVenda.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Texto da linha de orçamento (descrição mostrada ao cliente). */
export function catalogoItemToLinhaDescricao(item) {
  const descricao = norm(item?.descricao);
  const codigo = norm(item?.codigo);
  if (descricao && codigo && !descricao.toLowerCase().includes(codigo.toLowerCase())) {
    return `${descricao} (${codigo})`;
  }
  return descricao || codigo;
}

/**
 * @param {string} query
 * @param {object[]} [pool]
 */
export function searchCatalogoProdutos(query, pool = null) {
  const items = pool ?? cache?.items ?? [];
  const q = normKey(query);
  if (!q) return [];

  const scored = [];
  for (const item of items) {
    const desc = normKey(item.descricao);
    const code = normKey(item.codigo);
    const tipo = normKey(item.tipo);
    let score = -1;
    if (code === q || desc === q) score = 100;
    else if (code.startsWith(q) || desc.startsWith(q)) score = 80;
    else if (code.includes(q) || desc.includes(q)) score = 60;
    else if (tipo.includes(q)) score = 40;
    if (score < 0) continue;
    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.descricao.localeCompare(b.item.descricao, 'pt');
  });

  return scored.slice(0, MAX_RESULTS).map((entry) => entry.item);
}

export function invalidateCatalogoProdutosCache() {
  cache = null;
  loadPromise = null;
}
