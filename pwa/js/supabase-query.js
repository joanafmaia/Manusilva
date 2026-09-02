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

/**
 * Percorre a tabela em páginas (limite PostgREST ~1000).
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} buildQuery
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function fetchAllPaged(buildQuery, pageSize = SUPABASE_PAGE_SIZE) {
  const size = Math.min(Math.max(Number(pageSize) || SUPABASE_PAGE_SIZE, 1), 1000);
  const rows = [];
  let from = 0;

  for (;;) {
    const to = from + size - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) return { data: null, error };
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < size) break;
    from += size;
  }

  return { data: rows, error: null };
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
