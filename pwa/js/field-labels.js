/** Rótulos uniformes — identificação de equipamento (formulários, PDF, admin, autocomplete) */

export const LABEL_MARCA = 'Marca';
export const LABEL_MODELO = 'Modelo';
export const LABEL_TIPO = 'Tipo';
export const LABEL_NUMERO_SERIE = 'Nº Série';
export const LABEL_N_INTERNO = 'Nº Interno';
export const LABEL_HORAS = 'Horas';
export const LABEL_HORAS_GASTAS = 'Horas Gastas';
export const LABEL_DATA_FABRICO = 'Data de Fabrico';
export const LABEL_MARCA_MODELO = 'Marca/Modelo';
export const LABEL_MODELO_TIPO = 'Modelo / Tipo';
export const LABEL_ETIQUETA = 'Etiqueta';
export const LABEL_MATRICULA = 'Matrícula';
export const LABEL_MAQUINA = 'Máquina';
export const LABEL_DATA_RECECAO = 'Data de Receção';
export const LABEL_ESTADO_MAQUINA = 'Estado da Máquina';

/** «Marca: Toyota» — PDF e listas inline */
export function labelWithValue(label, value) {
  return `${label}: ${value}`;
}
