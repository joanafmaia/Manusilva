/**
 * Título da coluna de artigos na proposta ORÇAMENTOS (reparação / venda / outro).
 */

import { escapeHtml } from './html-utils.js';

export const TITULO_COLUNA_ARTIGOS_REPARACAO = 'Na reparação precisa';
export const TITULO_COLUNA_ARTIGOS_VENDA = 'Proposta de venda';

export const TITULO_COLUNA_ARTIGOS_PRESET = {
  REPARACAO: 'reparacao',
  VENDA: 'venda',
  OUTRO: 'outro',
};

export const TITULO_COLUNA_ARTIGOS_OPTIONS = [
  { value: TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO, label: TITULO_COLUNA_ARTIGOS_REPARACAO },
  { value: TITULO_COLUNA_ARTIGOS_PRESET.VENDA, label: TITULO_COLUNA_ARTIGOS_VENDA },
  { value: TITULO_COLUNA_ARTIGOS_PRESET.OUTRO, label: 'Outro…' },
];

export const TITULO_COLUNA_ARTIGOS_DEFAULT = TITULO_COLUNA_ARTIGOS_REPARACAO;
export const TITULO_COLUNA_ARTIGOS_PRESET_DEFAULT = TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO;

export function normalizeTituloColunaArtigosPreset(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === TITULO_COLUNA_ARTIGOS_PRESET.VENDA) return TITULO_COLUNA_ARTIGOS_PRESET.VENDA;
  if (value === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO) return TITULO_COLUNA_ARTIGOS_PRESET.OUTRO;
  if (value === TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO) return TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO;
  return '';
}

/** Infere o preset a partir de um título já guardado (propostas antigas / só texto). */
export function inferTituloColunaArtigosPreset(titulo = '') {
  const text = String(titulo || '').trim();
  if (!text || text === TITULO_COLUNA_ARTIGOS_REPARACAO) {
    return TITULO_COLUNA_ARTIGOS_PRESET.REPARACAO;
  }
  if (text === TITULO_COLUNA_ARTIGOS_VENDA) {
    return TITULO_COLUNA_ARTIGOS_PRESET.VENDA;
  }
  return TITULO_COLUNA_ARTIGOS_PRESET.OUTRO;
}

export function tituloColunaArtigosForPreset(preset) {
  const normalized = normalizeTituloColunaArtigosPreset(preset) || TITULO_COLUNA_ARTIGOS_PRESET_DEFAULT;
  if (normalized === TITULO_COLUNA_ARTIGOS_PRESET.VENDA) return TITULO_COLUNA_ARTIGOS_VENDA;
  if (normalized === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO) return '';
  return TITULO_COLUNA_ARTIGOS_REPARACAO;
}

/**
 * Resolve preset + texto final a partir da meta do orçamento (ou objeto parcial).
 * @returns {{ preset: string, titulo: string }}
 */
export function resolveTituloColunaArtigosState(meta = {}) {
  const savedTitulo = String(meta?.tituloColunaArtigos ?? '').trim();
  let preset = normalizeTituloColunaArtigosPreset(meta?.tituloColunaArtigosPreset);

  if (!preset) {
    preset = inferTituloColunaArtigosPreset(savedTitulo);
  }

  if (preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO) {
    return {
      preset,
      titulo: savedTitulo || TITULO_COLUNA_ARTIGOS_DEFAULT,
    };
  }

  return {
    preset,
    titulo: tituloColunaArtigosForPreset(preset),
  };
}

/** Texto seguro para UI / PDF / DOCX. */
export function resolveTituloColunaArtigos(meta = {}) {
  return resolveTituloColunaArtigosState(meta).titulo || TITULO_COLUNA_ARTIGOS_DEFAULT;
}

export function readTituloColunaArtigosFromDom(root) {
  const presetRaw =
    root?.querySelector('[data-orc-field="tituloColunaArtigosPreset"]')?.value?.trim() || '';
  const custom =
    root?.querySelector('[data-orc-field="tituloColunaArtigos"]')?.value?.trim() || '';
  const preset = normalizeTituloColunaArtigosPreset(presetRaw) || TITULO_COLUNA_ARTIGOS_PRESET_DEFAULT;

  if (preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO) {
    return {
      tituloColunaArtigosPreset: preset,
      tituloColunaArtigos: custom || TITULO_COLUNA_ARTIGOS_DEFAULT,
    };
  }

  return {
    tituloColunaArtigosPreset: preset,
    tituloColunaArtigos: tituloColunaArtigosForPreset(preset),
  };
}

/** Controlo do editor RH — select + campo «Outro». */
export function renderTituloColunaArtigosControl(meta = {}) {
  const state = resolveTituloColunaArtigosState(meta);
  const options = TITULO_COLUNA_ARTIGOS_OPTIONS.map(
    (opt) =>
      `<option value="${escapeHtml(opt.value)}"${opt.value === state.preset ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`,
  ).join('');
  const customValue =
    state.preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO
      ? String(meta?.tituloColunaArtigos || '').trim()
      : '';
  const customHidden = state.preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO ? '' : ' hidden';

  return `
    <div class="review-orc-titulo-coluna" data-orc-titulo-coluna>
      <label class="review-orc-field review-orc-titulo-coluna__preset">
        <span>Título da coluna de artigos</span>
        <select class="review-orc-input" data-orc-field="tituloColunaArtigosPreset" aria-label="Título da coluna de artigos">
          ${options}
        </select>
      </label>
      <label class="review-orc-field review-orc-titulo-coluna__custom" data-orc-titulo-coluna-custom${customHidden}>
        <span>Texto personalizado</span>
        <input
          type="text"
          class="review-orc-input"
          data-orc-field="tituloColunaArtigos"
          value="${escapeHtml(customValue)}"
          placeholder="Ex.: Material necessário"
          ${state.preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO ? '' : 'disabled '}
        />
      </label>
      <span class="review-orc-field-hint text-muted">Aparece no cabeçalho da tabela no PDF.</span>
    </div>`;
}
