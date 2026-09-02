/**
 * Selects explícitos + paginação PostgREST — reduz egress e picos de payload
 * (plano free: 5 GB egress / 500 MB BD).
 */

export const SUPABASE_PAGE_SIZE = 500;

export const TRABALHOS_SELECT = [
  'id',
  'numero_ordem',
  'servico_id',
  'tecnico_id',
  'cliente_id',
  'numero_serie',
  'tipo_servico',
  'data',
  'hora',
  'estado',
  'nota_rejeicao',
  'url_pdf',
  'foto_antes',
  'foto_depois',
].join(',');

/** Semana do técnico — sem fotos (evita re-descarregar base64 em cada poll). */
export const TRABALHOS_SEMANA_SELECT = [
  'id',
  'numero_ordem',
  'servico_id',
  'tecnico_id',
  'cliente_id',
  'numero_serie',
  'tipo_servico',
  'data',
  'hora',
  'estado',
  'nota_rejeicao',
  'url_pdf',
].join(',');

export const SERVICOS_SELECT = [
  'id',
  'numero_ordem',
  'cliente_id',
  'data',
  'hora',
  'tecnico_ids',
  'estado',
  'nota_rejeicao',
  'submetido_em',
  'aprovado_em',
  'aprovado_por',
  'faturado_por',
  'email_cliente_enviado_em',
  'faturacao_status',
  'numero_fatura',
  'data_fatura',
  'valor_faturado',
  'condicao_pagamento',
  'status_recebimento',
  'data_vencimento',
  'data_recebimento',
  'dados',
  'criado_em',
].join(',');

export const RELATORIOS_SELECT = [
  'id',
  'trabalho_id',
  'servico_id',
  'tecnico_id',
  'cliente_id',
  'numero_serie',
  'tipo_servico',
  'estado',
  'submetido_em',
  'aprovado_em',
  'aprovado_por',
  'faturado_por',
  'nome_pdf',
  'nota_rejeicao',
  'faturacao_status',
  'numero_fatura',
  'data_fatura',
  'valor_faturado',
  'condicao_pagamento',
  'prazo_pagamento',
  'status_recebimento',
  'pagamento_status',
  'data_vencimento',
  'data_recebimento',
  'numero_ordem',
  'dados',
  'atualizado_em',
].join(',');

export const CLIENTES_SELECT = [
  'id',
  'nome_empresa',
  'nif',
  'email',
  'morada',
  'codigo_postal',
  'localidade',
  'telemovel',
  'condicao_pagamento',
  'plus_code',
  'zona_rota',
  'eh_teste',
].join(',');

export const FOLHAS_OBRA_SELECT = [
  'id',
  'numero_ordem',
  'cliente_id',
  'tecnico_id',
  'tipo',
  'marca_modelo',
  'numero_serie',
  'etq',
  'data_rececao',
  'intervencoes',
  'maquina_concluida_em',
  'responsavel',
  'entregue_por',
  'tecnico_reparacao',
  'responsabilidade',
  'orcamento_report_id',
  'orcamento_aceite_em',
  'estado',
  'submetido_em',
  'faturacao_status',
  'numero_fatura',
  'data_fatura',
  'valor_faturado',
  'condicao_pagamento',
  'status_recebimento',
  'data_vencimento',
  'data_recebimento',
  'faturado_por',
  'observacoes',
  'diagnostico_tecnico',
  'criado_em',
  'atualizado_em',
].join(',');

export const FATURAS_MANUAIS_SELECT = [
  'id',
  'cliente_id',
  'numero_fatura',
  'data_fatura',
  'valor_faturado',
  'condicao_pagamento',
  'status_recebimento',
  'data_vencimento',
  'data_recebimento',
  'descricao',
  'criado_em',
  'registado_por',
].join(',');

export const CLIENTE_EQUIPAMENTOS_SELECT = [
  'id',
  'cliente_id',
  'categoria',
  'chave',
  'marca',
  'modelo',
  'numero_serie',
  'matricula',
  'maquina',
  'tipo',
  'n_interno',
  'data_fabrico',
  'tensao_v',
  'densidade',
  'horas',
  'ultimo_servico',
  'ultima_intervencao_em',
].join(',');

export const MSG_POSTGREST_UNAVAILABLE =
  'A base de dados está temporariamente indisponível. Os dados locais mantêm-se — tente novamente daqui a uns segundos.';

export const POSTGREST_RETRY_DELAYS_MS = [800, 2000];
const POSTGREST_CIRCUIT_MS = 10_000;
const MAX_CONCURRENT_REST_FETCHES = 2;

let circuitOpenUntil = 0;
let lastCircuitError = null;
let activeRestFetches = 0;
const restFetchWaiters = [];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Timeout, 5xx ou schema cache do PostgREST (PGRST002) — vale a pena repetir. */
export function isRetryablePostgrestError(err) {
  if (!err) return false;
  const nested = err.cause && typeof err.cause === 'object' ? err.cause : null;
  const code = String(err.code || nested?.code || '');
  const status = Number(err.status ?? err.statusCode ?? nested?.status ?? 0);
  if (code === 'PGRST002') return true;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(
    err.message || err.details || err.hint || nested?.message || '',
  ).toLowerCase();
  return /pgrst002|schema cache|could not query the database|service unavailable|temporariamente indisponível|(?:\b|http\s)(?:408|425|429|500|502|503|504)\b|gateway timeout|failed to fetch|networkerror|load failed/.test(
    msg,
  );
}

export function formatRetryablePostgrestMessage(err) {
  return isRetryablePostgrestError(err) ? MSG_POSTGREST_UNAVAILABLE : null;
}

export function resetPostgrestCircuit() {
  circuitOpenUntil = 0;
  lastCircuitError = null;
}

export function isPostgrestCircuitOpen() {
  return Date.now() < circuitOpenUntil && Boolean(lastCircuitError);
}

function peekCircuitError() {
  if (Date.now() < circuitOpenUntil && lastCircuitError) return lastCircuitError;
  return null;
}

function openCircuit(error, ms = POSTGREST_CIRCUIT_MS) {
  lastCircuitError = error;
  circuitOpenUntil = Math.max(circuitOpenUntil, Date.now() + ms);
}

function closeCircuit() {
  circuitOpenUntil = 0;
  lastCircuitError = null;
}

async function withRestConcurrency(fn) {
  if (activeRestFetches >= MAX_CONCURRENT_REST_FETCHES) {
    await new Promise((resolve) => {
      restFetchWaiters.push(resolve);
    });
  }
  activeRestFetches += 1;
  try {
    return await fn();
  } finally {
    activeRestFetches -= 1;
    const next = restFetchWaiters.shift();
    if (next) next();
  }
}

/**
 * Percorre a tabela em páginas (limite PostgREST ~1000).
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} buildQuery
 * @param {number} [pageSize]
 * @param {{ retryDelaysMs?: number[] }} [options]
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function fetchAllPaged(buildQuery, pageSize = SUPABASE_PAGE_SIZE, options = {}) {
  const size = Math.min(Math.max(Number(pageSize) || SUPABASE_PAGE_SIZE, 1), 1000);
  const retryDelays = Array.isArray(options.retryDelaysMs)
    ? options.retryDelaysMs
    : POSTGREST_RETRY_DELAYS_MS;

  const blocked = peekCircuitError();
  if (blocked) return { data: null, error: blocked };

  return withRestConcurrency(async () => {
    const blockedInner = peekCircuitError();
    if (blockedInner) return { data: null, error: blockedInner };

    const rows = [];
    let from = 0;

    for (;;) {
      const to = from + size - 1;
      let batch = null;
      let lastError = null;

      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        const { data, error } = await buildQuery().range(from, to);
        if (!error) {
          closeCircuit();
          batch = Array.isArray(data) ? data : [];
          lastError = null;
          break;
        }
        lastError = error;
        if (!isRetryablePostgrestError(error) || attempt >= retryDelays.length) {
          break;
        }
        await delay(retryDelays[attempt]);
      }

      if (lastError) {
        if (isRetryablePostgrestError(lastError)) openCircuit(lastError);
        return { data: null, error: lastError };
      }

      rows.push(...batch);
      if (batch.length < size) break;
      from += size;
    }

    return { data: rows, error: null };
  });
}

/** TTL para refetch parcial (semana do técnico, IDs já pedidos). */
export const PARTIAL_FETCH_TTL_MS = 120_000;

/**
 * Impede refetch da mesma chave enquanto corre, e durante `ttlMs` após sucesso.
 * @param {number} [ttlMs]
 */
export function createKeyedFetchGate(ttlMs = PARTIAL_FETCH_TTL_MS) {
  const inFlight = new Map();
  const lastOk = new Map();

  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T>} fn
     * @param {{ force?: boolean }} [options]
     * @returns {Promise<{ skipped: boolean, value: T|undefined }>}
     */
    async run(key, fn, options = {}) {
      const force = options.force === true;
      if (!force) {
        const ts = lastOk.get(key);
        if (ts != null && Date.now() - ts < ttlMs) {
          return { skipped: true, value: undefined };
        }
        const pending = inFlight.get(key);
        if (pending) return pending;
      }

      const pending = (async () => {
        const value = await fn();
        lastOk.set(key, Date.now());
        return { skipped: false, value };
      })().finally(() => {
        inFlight.delete(key);
      });

      inFlight.set(key, pending);
      return pending;
    },

    invalidate(key) {
      if (key == null) {
        lastOk.clear();
        return;
      }
      lastOk.delete(String(key));
    },
  };
}

/**
 * Marca IDs como recentemente pedidos — evita repetir o mesmo IN/OR em loop.
 * @param {number} [ttlMs]
 */
export function createIdTtlCache(ttlMs = PARTIAL_FETCH_TTL_MS) {
  const at = new Map();

  return {
    isFresh(id) {
      const ts = at.get(String(id));
      return ts != null && Date.now() - ts < ttlMs;
    },
    mark(ids = []) {
      const now = Date.now();
      for (const id of ids) {
        if (id == null || id === '') continue;
        at.set(String(id), now);
      }
    },
    clear() {
      at.clear();
    },
  };
}

/**
 * Junta pedidos concorrentes com os mesmos IDs numa só ronda de fetch.
 * @param {(ids: string[]) => Promise<unknown>} fetchIds
 * @param {ReturnType<typeof createIdTtlCache>} ttlCache
 */
export function createCoalescedIdFetcher(fetchIds, ttlCache) {
  let queue = [];
  let inflight = null;

  return async function ensureIds(ids = [], options = {}) {
    const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    const force = options.force === true;
    const needed = force ? unique : unique.filter((id) => !ttlCache.isFresh(id));
    if (!needed.length) return;

    queue.push(...needed);
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        while (queue.length) {
          const batch = [...new Set(queue)];
          queue = [];
          const stale = force ? batch : batch.filter((id) => !ttlCache.isFresh(id));
          if (!stale.length) continue;
          await fetchIds(stale);
          ttlCache.mark(stale);
        }
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  };
}
