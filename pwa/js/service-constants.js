/**
 * IDs de serviço / relatório — fonte única para comparações no cliente.
 */

export const SERVICE_IDS = Object.freeze({
  FOLHA_INTERVENCAO_AVARIAS: 'folha_intervencao_avarias',
  MANUTENCAO_BATERIAS_GRANDES: 'manutencao_baterias_grandes',
  MANUTENCAO_CORRETIVA_MAQUINAS: 'manutencao_corretiva_maquinas',
  MANUTENCAO_PREVENTIVA_BATERIA: 'manutencao_preventiva_bateria',
  MANUTENCAO_PREVENTIVA_EMPILHADORES: 'manutencao_preventiva_empilhadores',
  INSPECAO_DL50_2005: 'inspecao_dl50_2005',
  REPARACAO_AVARIAS_BATERIA: 'reparacao_avarias_bateria',
  REPARACAO_CARREGADOR: 'reparacao_carregador',
  MOVIMENTO_MATERIAL_CLIENTE: 'movimento_material_cliente',
});

/** @deprecated preferir SERVICE_IDS.MANUTENCAO_PREVENTIVA_EMPILHADORES */
export const EMPILHADORES_SERVICE_ID = SERVICE_IDS.MANUTENCAO_PREVENTIVA_EMPILHADORES;

export const BATTERY_SERVICE_IDS = new Set([
  SERVICE_IDS.REPARACAO_AVARIAS_BATERIA,
  SERVICE_IDS.MANUTENCAO_PREVENTIVA_BATERIA,
]);

export const REPORT_SECTIONS = Object.freeze({
  MACHINE: 'Informações da Máquina',
  BATTERY: 'Informações da Bateria',
  PEDIDO_ORCAMENTO: 'Pedido de Orçamento',
  DATAS_INTERVENCAO: 'Datas de Intervenção',
});

function resolveServiceId(serviceOrId) {
  if (typeof serviceOrId === 'string') return serviceOrId;
  return serviceOrId?.id || '';
}

export function isBatteryService(serviceOrId) {
  return BATTERY_SERVICE_IDS.has(resolveServiceId(serviceOrId));
}

export function isEmpilhadoresService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.MANUTENCAO_PREVENTIVA_EMPILHADORES;
}

export function isDl50Service(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.INSPECAO_DL50_2005;
}

export function isCarregadorService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.REPARACAO_CARREGADOR;
}

export function isGrandesBateriasService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.MANUTENCAO_BATERIAS_GRANDES;
}

export function isFolhaAvariasService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.FOLHA_INTERVENCAO_AVARIAS;
}

export function isCorretivaService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.MANUTENCAO_CORRETIVA_MAQUINAS;
}

export function isMovimentoMaterialClienteService(serviceOrId) {
  return resolveServiceId(serviceOrId) === SERVICE_IDS.MOVIMENTO_MATERIAL_CLIENTE;
}
