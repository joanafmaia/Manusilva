/** Checklists — Manutenção Preventiva Empilhadores MS. 061 */
export const VERIFICACOES_EXTERNAS_ITEMS = [
  'Chassis',
  'Mastro',
  'Correntes',
  'Rolamentos',
  'Tubos Hidráulicos',
  'Macacos',
  'Garfos',
  'Deslocamento',
  'Chumaceiras',
  'Alavancas/Joystick',
  'Pedais',
  'Guiador',
  'Banco',
  'Display',
  'Pneus Frente',
  'Pneus Traseira',
  'Eixo Traseiro',
  'Luzes',
  'Pirilampo',
  'Blue Spot',
  'Buzina',
  'Besouro',
  'Sinaléticas',
];

export const VERIFICACOES_INTERNAS_ITEMS = [
  'Cablagem',
  'Conectores',
  'Fusíveis',
  'Módulos/Placas',
  'Botão de Emergência',
  'Micros',
  'Escovas de Motor',
  'Sensores',
  'Potenciómetros',
  'Bloco das Alavancas',
  'Velas',
  'Tubos Hidráulicos Internos',
  'Alternadores',
  'Baterias',
  'Motor de Arranque',
  'Radiador',
  'Tubos',
  'Escape',
];

/** Valor guardado no relatório para «não aplicável» (legado: também N.A. / NA). */
export const EMPILHADORES_NA_STORED = 'N/A';

/** Rótulo mostrado no formulário e PDF. */
export const EMPILHADORES_NA_DISPLAY = 'N.A.';

/** Estados do checklist preventiva empilhadores (MS.061). */
export const EMPILHADORES_VERIFY_STATES = ['', 'OK', 'Não OK', EMPILHADORES_NA_STORED];

/** Opções clicáveis na matriz (igual ao padrão DL50 — botões segmentados). */
export const EMPILHADORES_MATRIX_OPTIONS = ['OK', 'Não OK', EMPILHADORES_NA_STORED];

/** Legenda para formulário e PDF (cliente) — mostra N.A. */
export const EMPILHADORES_MATRIX_LEGEND = [
  { code: 'OK', label: 'Conforme', display: 'OK' },
  { code: 'Não OK', label: 'Não conforme', display: 'Não OK' },
  { code: EMPILHADORES_NA_STORED, label: 'Não aplicável', display: EMPILHADORES_NA_DISPLAY },
];

export function isEmpilhadoresNaState(state) {
  const value = String(state ?? '').trim();
  return value === 'N/A' || value === 'N.A.' || value === 'NA';
}

export function normalizeEmpilhadoresVerifyState(state) {
  const value = String(state ?? '').trim();
  if (isEmpilhadoresNaState(value)) return EMPILHADORES_NA_STORED;
  return value;
}

export function formatEmpilhadoresMatrixLegendText(separator = '  ·  ') {
  return EMPILHADORES_MATRIX_LEGEND.map(
    ({ display, label }) => `${display} = ${label}`,
  ).join(separator);
}

export function empilhadoresMatrixLegendLabel(opt) {
  const normalized = normalizeEmpilhadoresVerifyState(opt);
  const found = EMPILHADORES_MATRIX_LEGEND.find((entry) => entry.code === normalized);
  return found?.label || String(opt || '');
}

/** Valor do atributo data-value (evita «N/A» no dataset, que falha em alguns browsers). */
export function empilhadoresMatrixOptionDataValue(opt) {
  const normalized = normalizeEmpilhadoresVerifyState(opt);
  if (normalized === 'Não OK') return 'NOK';
  if (normalized === EMPILHADORES_NA_STORED) return 'NA_OPTION';
  return String(normalized || '');
}

/** Converte data-value do botão para o valor guardado no relatório. */
export function empilhadoresMatrixOptionFromDataValue(raw) {
  const value = String(raw ?? '').trim();
  if (value === 'NOK') return 'Não OK';
  if (value === 'NA_OPTION' || isEmpilhadoresNaState(value)) return EMPILHADORES_NA_STORED;
  return value;
}

export function empilhadoresMatrixOptionDisplay(opt) {
  const normalized = normalizeEmpilhadoresVerifyState(opt);
  if (!normalized) return '';
  if (normalized === EMPILHADORES_NA_STORED) return EMPILHADORES_NA_DISPLAY;
  return normalized;
}

export function empilhadoresMatrixOptionClass(opt) {
  const normalized = normalizeEmpilhadoresVerifyState(opt);
  if (normalized === 'OK') return 'matrix-opt--b';
  if (normalized === 'Não OK') return 'matrix-opt--d';
  if (normalized === EMPILHADORES_NA_STORED) return 'matrix-opt--na';
  return '';
}

export function formatEmpilhadoresVerifyState(state) {
  const normalized = normalizeEmpilhadoresVerifyState(state);
  if (!normalized) return '—';
  return empilhadoresMatrixOptionDisplay(normalized);
}

export function empilhadoresVerifyRowClass(state) {
  const normalized = normalizeEmpilhadoresVerifyState(state);
  if (normalized === 'OK') return 'verification-card--ok';
  if (normalized === 'Não OK') return 'verification-card--fail';
  if (normalized === EMPILHADORES_NA_STORED) return 'verification-card--na';
  return 'verification-card--blank';
}

export function empilhadoresVerifyBadgeClass(state) {
  const normalized = normalizeEmpilhadoresVerifyState(state);
  if (normalized === 'OK') return 'verification-badge--ok';
  if (normalized === 'Não OK') return 'verification-badge--fail';
  if (normalized === EMPILHADORES_NA_STORED) return 'verification-badge--na';
  return 'verification-badge--blank';
}
