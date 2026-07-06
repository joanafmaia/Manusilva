/**
 * Fotos opcionais na proposta MS.015 (PDF) — até 2, carregadas pelo RH.
 */

export const MAX_ORCAMENTO_FOTOS = 2;

export const ORCAMENTO_FOTOS_POSICOES = [
  { id: 'apos_equipamento', label: 'Depois dos equipamentos' },
  { id: 'antes_tabela', label: 'Antes da tabela de artigos' },
];

/** @param {unknown} meta */
export function normalizeOrcamentoFotos(meta) {
  const rawPos = String(meta?.fotosPosicao || '').trim();
  const fotosPosicao = rawPos === 'apos_equipamento' ? 'apos_equipamento' : 'antes_tabela';
  const list = Array.isArray(meta?.fotos) ? meta.fotos : [];
  const fotos = list
    .filter((row) => row && String(row.dataUrl || '').startsWith('data:image'))
    .slice(0, MAX_ORCAMENTO_FOTOS)
    .map((row) => ({
      legenda: String(row.legenda || '').trim(),
      dataUrl: String(row.dataUrl),
    }));
  return { fotos, fotosPosicao };
}

/** @param {ParentNode | null | undefined} root */
export function readOrcamentoFotosPosicaoFromDom(root) {
  const value = root?.querySelector('[data-orc-field="fotosPosicao"]')?.value;
  return value === 'apos_equipamento' ? 'apos_equipamento' : 'antes_tabela';
}
