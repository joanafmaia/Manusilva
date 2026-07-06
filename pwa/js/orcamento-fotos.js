/**
 * Fotos opcionais na proposta MS.015 (PDF) — até 2, carregadas pelo RH.
 */

export const MAX_ORCAMENTO_FOTOS = 2;

export const ORCAMENTO_FOTOS_POSICOES = [
  { id: 'ao_lado_equipamento', label: 'Ao lado do equipamento (modelo antigo)' },
  { id: 'antes_tabela', label: 'Antes da tabela de artigos' },
];

/** @param {unknown} meta */
export function fotoSlotsFromMeta(meta) {
  const list = Array.isArray(meta?.fotos) ? meta.fotos : [];
  return Array.from({ length: MAX_ORCAMENTO_FOTOS }, (_, index) => {
    const row = list[index];
    return row?.dataUrl?.startsWith('data:image') ? row : null;
  });
}

/** @param {unknown} meta */
export function normalizeOrcamentoFotos(meta) {
  const rawPos = String(meta?.fotosPosicao || '').trim();
  const fotosPosicao =
    rawPos === 'antes_tabela'
      ? 'antes_tabela'
      : rawPos === 'apos_equipamento' || rawPos === 'ao_lado_equipamento' || !rawPos
        ? 'ao_lado_equipamento'
        : 'ao_lado_equipamento';
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
  return value === 'antes_tabela' ? 'antes_tabela' : 'ao_lado_equipamento';
}
