/**
 * Campo «Deslocação» (Km) — definição única para todos os relatórios técnicos oficiais.
 */

/** IDs dos 8 relatórios técnicos com deslocação no bloco intro */
export const OFFICIAL_REPORT_SERVICE_IDS = new Set([
  'folha_intervencao_avarias',
  'manutencao_baterias_grandes',
  'manutencao_corretiva_maquinas',
  'inspecao_dl50_2005',
  'manutencao_preventiva_empilhadores',
  'reparacao_carregador',
  'reparacao_avarias_bateria',
]);

export const VISITAS_FIELD_ID = 'visitas_realizadas';
export const VISIT_DATES_FIELD_ID = 'datas_visitas';
export const DESLOCACAO_BASE_FIELD_ID = 'deslocacao_base_km';

export const STANDARD_VISITAS_FIELD = {
  type: 'number',
  id: VISITAS_FIELD_ID,
  label: 'Visitas realizadas',
  min: 1,
  step: 1,
  placeholder: '1',
};

export const STANDARD_DESLOCACAO_FIELD = {
  type: 'number',
  id: 'deslocacao',
  label: 'Deslocação',
  min: 0,
  step: 0.1,
  unit: 'Km',
  placeholder: '0',
};

export function isDeslocacaoField(field) {
  return field?.id === 'deslocacao';
}

export function isVisitasField(field) {
  return field?.id === VISITAS_FIELD_ID;
}

export function isDeslocacaoMetaField(field) {
  return field?.id === DESLOCACAO_BASE_FIELD_ID;
}

/** Relatórios com Nr de Visitas + Horas na secção dedicada (não no intro) */
export const SERVICES_WITH_SECTION_VISITAS = new Set([
  'manutencao_preventiva_bateria',
  'reparacao_avarias_bateria',
  'folha_intervencao_avarias',
]);

/** Campo Deslocação removido de todos os formulários e PDFs */
export function reportIncludesDeslocacao(_service) {
  return false;
}
