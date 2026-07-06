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

/** Estados do checklist preventiva empilhadores (MS.061). */
export const EMPILHADORES_VERIFY_STATES = ['', 'OK', 'Não OK', 'N/A'];

/** Opções clicáveis na matriz (igual ao padrão DL50 — botões segmentados). */
export const EMPILHADORES_MATRIX_OPTIONS = ['OK', 'Não OK', 'N/A'];

/** Valor do atributo data-value (evita «N/A» no dataset, que falha em alguns browsers). */
export function empilhadoresMatrixOptionDataValue(opt) {
  if (opt === 'Não OK') return 'NOK';
  if (opt === 'N/A') return 'NA_OPTION';
  return String(opt || '');
}

/** Converte data-value do botão para o valor guardado no relatório. */
export function empilhadoresMatrixOptionFromDataValue(raw) {
  const value = String(raw ?? '').trim();
  if (value === 'NOK') return 'Não OK';
  if (value === 'NA_OPTION') return 'N/A';
  return value;
}

export function empilhadoresMatrixOptionDisplay(opt) {
  return String(opt || '');
}

export function empilhadoresMatrixOptionClass(opt) {
  if (opt === 'OK') return 'matrix-opt--b';
  if (opt === 'Não OK') return 'matrix-opt--d';
  if (opt === 'N/A') return 'matrix-opt--na';
  return '';
}

export function formatEmpilhadoresVerifyState(state) {
  const value = String(state ?? '').trim();
  if (!value) return '—';
  return value;
}

export function empilhadoresVerifyRowClass(state) {
  const value = String(state ?? '').trim();
  if (value === 'OK') return 'verification-card--ok';
  if (value === 'Não OK') return 'verification-card--fail';
  if (value === 'N/A') return 'verification-card--na';
  return 'verification-card--blank';
}

export function empilhadoresVerifyBadgeClass(state) {
  const value = String(state ?? '').trim();
  if (value === 'OK') return 'verification-badge--ok';
  if (value === 'Não OK') return 'verification-badge--fail';
  if (value === 'N/A') return 'verification-badge--na';
  return 'verification-badge--blank';
}
