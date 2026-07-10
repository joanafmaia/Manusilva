/**
 * Avaliações do cliente por visita (serviço).
 */

const SCORE_LABELS = {
  1: { emoji: '😞', label: 'Insatisfeito' },
  2: { emoji: '😐', label: 'Regular' },
  3: { emoji: '😊', label: 'Satisfeito' },
};

function mapRow(row) {
  if (!row) return null;
  const score = Number(row.score);
  const meta = SCORE_LABELS[score] || { emoji: '❓', label: '—' };
  return {
    id: row.id,
    servicoId: row.servico_id ? String(row.servico_id) : '',
    clienteId: row.cliente_id != null ? String(row.cliente_id) : '',
    score,
    emoji: meta.emoji,
    label: meta.label,
    comentario: row.comentario || '',
    criadoEm: row.criado_em || null,
  };
}

/**
 * @param {string[]} servicoIds
 */
export async function fetchAvaliacoesByServicoIds(servicoIds = []) {
  const unique = [...new Set(servicoIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length) return new Map();

  const { getAuthenticatedSupabaseClient } = await import('./supabase-client.js');
  const supabase = await getAuthenticatedSupabaseClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from('avaliacoes_servico')
    .select('id,servico_id,cliente_id,score,comentario,criado_em')
    .in('servico_id', unique);

  if (error) {
    console.warn('[avaliacoes-db] fetch:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    const mapped = mapRow(row);
    if (mapped?.servicoId) map.set(mapped.servicoId, mapped);
  }
  return map;
}

export async function fetchAvaliacaoForServico(servicoId) {
  if (!servicoId) return null;
  const map = await fetchAvaliacoesByServicoIds([servicoId]);
  return map.get(String(servicoId)) || null;
}

export function formatAvaliacaoBadge(avaliacao) {
  if (!avaliacao) return '';
  return `${avaliacao.emoji} ${avaliacao.label}`;
}
