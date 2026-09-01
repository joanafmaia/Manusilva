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
