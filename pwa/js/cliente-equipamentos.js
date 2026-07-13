/**
 * Extrair e aplicar dados de equipamentos (máquinas / baterias) a partir de relatórios.
 */

import { GRANDES_BATTERY_FIELD_ID } from './views/relatorio-grandes.js';
import {
  EMPILHADORES_MAQUINAS_FIELD_ID,
  migrateLegacyEmpilhadoresMaquinas,
  normalizeEmpilhadoresMaquinaRow,
} from './views/relatorio-empilhadores-maquinas.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
} from './field-labels.js';

export const SERVICE_CATEGORIA = {
  manutencao_preventiva_empilhadores: 'empilhador',
  inspecao_dl50_2005: 'empilhador',
  folha_intervencao_avarias: 'empilhador',
  manutencao_corretiva_maquinas: 'empilhador',
  manutencao_preventiva_bateria: 'bateria',
  reparacao_avarias_bateria: 'bateria',
  reparacao_carregador: 'carregador',
};

const SERVICES_WITH_MACHINE_BLOCK = new Set([
  'inspecao_dl50_2005',
  'folha_intervencao_avarias',
  'manutencao_preventiva_empilhadores',
  'manutencao_corretiva_maquinas',
  'manutencao_preventiva_bateria',
  'reparacao_avarias_bateria',
  'reparacao_carregador',
]);

function norm(value) {
  return String(value ?? '').trim();
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return norm(value) === '';
}

function normKey(value) {
  return norm(value).toLowerCase();
}

function resolveNumeroSerie(data = {}) {
  return norm(data.numero_serie || data.numero_de_serie || data.num_serie);
}

function splitMarcaModelo(combined) {
  const s = norm(combined);
  if (!s) return { marca: '', modelo: '' };
  const slashParts = s.split(/\s*\/\s*/);
  if (slashParts.length >= 2) {
    return { marca: slashParts[0], modelo: slashParts.slice(1).join(' / ') };
  }
  const spaceIdx = s.indexOf(' ');
  if (spaceIdx > 0) {
    return { marca: s.slice(0, spaceIdx), modelo: s.slice(spaceIdx + 1).trim() };
  }
  return { marca: s, modelo: '' };
}

/**
 * Normaliza os 5 campos canónicos da BD a partir de qualquer relatório.
 * @returns {{ marca: string|null, modelo: string|null, tipo: string|null, numero_serie: string|null, n_interno: string|null }}
 */
export function normalizeEquipamentoIdentity(serviceType, values = {}) {
  const st = String(serviceType || '');
  let marca = norm(values.marca);
  let modelo = norm(values.modelo);
  let tipo = norm(values.tipo);
  let numeroSerie = resolveNumeroSerie(values);
  let nInterno = norm(values.n_interno);

  if (st === 'reparacao_carregador') {
    const combined = norm(values.marca_modelo);
    if (combined) {
      const split = splitMarcaModelo(combined);
      if (!marca) marca = split.marca;
      if (!modelo) modelo = split.modelo;
    }
    if (!nInterno) nInterno = norm(values.etiqueta);
    if (!tipo) tipo = 'Carregador';
  } else if (st === 'manutencao_baterias_grandes') {
    if (!marca) marca = norm(values.maquina);
    if (!nInterno) nInterno = norm(values.matricula);
  }

  return {
    marca: marca || null,
    modelo: modelo || null,
    tipo: tipo || null,
    numero_serie: numeroSerie || null,
    n_interno: nInterno || null,
  };
}

export function buildEquipamentoChave(categoria, data = {}) {
  const tipo = normKey(data.tipo);
  const marca = normKey(data.marca);
  const modelo = normKey(data.modelo);
  const serie = normKey(resolveNumeroSerie(data));
  const nInterno = normKey(data.n_interno);

  if (tipo || marca || modelo || serie || nInterno) {
    return `eq:${tipo}|${marca}|${modelo}|${serie}|${nInterno}`;
  }

  const matricula = normKey(data.matricula);
  if (matricula) return `mat:${matricula}`;

  const maquina = normKey(data.maquina);
  if (maquina) return `maq:${maquina}`;

  if (categoria === 'carregador') {
    const etiqueta = normKey(data.etiqueta);
    if (etiqueta) return `etq:${etiqueta}`;
  }

  return null;
}

/**
 * Evita duplicar equipamentos quando a chave muda mas o nº de série é o mesmo.
 * @param {object[]} extracted
 * @param {object[]} existing
 */
export function reconcileEquipamentoChaves(extracted = [], existing = []) {
  if (!existing.length) return extracted;
  return extracted.map((row) => {
    const serie = normKey(resolveNumeroSerie(row));
    if (!serie) return row;
    const match = existing.find(
      (e) =>
        e.categoria === row.categoria &&
        normKey(resolveNumeroSerie(e)) === serie &&
        e.chave !== row.chave,
    );
    return match ? { ...row, chave: match.chave } : row;
  });
}

export function formatEquipamentoLabel(equipamento = {}) {
  const parts = [
    norm(equipamento.tipo) ? `${LABEL_TIPO}: ${norm(equipamento.tipo)}` : '',
    norm(equipamento.marca) ? `${LABEL_MARCA}: ${norm(equipamento.marca)}` : '',
    norm(equipamento.modelo) ? `${LABEL_MODELO}: ${norm(equipamento.modelo)}` : '',
    norm(equipamento.numero_serie) ? `${LABEL_NUMERO_SERIE}: ${norm(equipamento.numero_serie)}` : '',
    norm(equipamento.n_interno) ? `${LABEL_N_INTERNO}: ${norm(equipamento.n_interno)}` : '',
  ].filter(Boolean);

  if (parts.length) return parts.join(' · ');

  return [
    norm(equipamento.maquina),
    norm(equipamento.matricula) ? `Mat. ${norm(equipamento.matricula)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function mapMachineRow(categoria, values = {}, serviceType = '') {
  const identity = normalizeEquipamentoIdentity(serviceType, values);
  const chave = buildEquipamentoChave(categoria, identity);
  if (!chave) return null;

  return {
    categoria,
    chave,
    marca: identity.marca,
    modelo: identity.modelo,
    numero_serie: identity.numero_serie,
    matricula: norm(values.matricula) || null,
    maquina: norm(values.maquina) || null,
    tipo: identity.tipo,
    n_interno: identity.n_interno,
    data_fabrico: norm(values.data_fabrico) || null,
    tensao_v: norm(values.tensao_v) || null,
    densidade: norm(values.densidade) || null,
    horas: values.horas != null && values.horas !== '' ? String(values.horas) : null,
  };
}

function mapBatteryRow(row = {}, serviceType = 'manutencao_baterias_grandes') {
  const identity = normalizeEquipamentoIdentity(serviceType, row);
  const chave = buildEquipamentoChave('bateria', identity);
  if (!chave) return null;
  return {
    categoria: 'bateria',
    chave,
    marca: identity.marca,
    modelo: identity.modelo,
    numero_serie: identity.numero_serie,
    matricula: norm(row.matricula) || null,
    maquina: norm(row.maquina) || null,
    tipo: identity.tipo,
    n_interno: identity.n_interno,
    data_fabrico: null,
    tensao_v: norm(row.tensao_v) || null,
    densidade: row.densidade != null && row.densidade !== '' ? String(row.densidade) : null,
    horas: null,
  };
}

/** @param {object} report */
export function extractEquipamentosFromReport(report) {
  const values = report?.data?.values || {};
  const serviceType = String(report?.serviceType || '');
  const categoria = SERVICE_CATEGORIA[serviceType] || 'empilhador';
  const rows = [];
  const seen = new Set();

  const pushRow = (row) => {
    if (!row?.chave) return;
    const dedupe = `${row.categoria}:${row.chave}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    rows.push(row);
  };

  if (SERVICES_WITH_MACHINE_BLOCK.has(serviceType)) {
    if (serviceType === 'manutencao_preventiva_empilhadores') {
      const machines = migrateLegacyEmpilhadoresMaquinas(values);
      machines.forEach((row) => pushRow(mapMachineRow(categoria, row, serviceType)));
    } else {
      pushRow(mapMachineRow(categoria, values, serviceType));
    }
  }

  if (serviceType === 'manutencao_baterias_grandes') {
    const batteries = values[GRANDES_BATTERY_FIELD_ID];
    if (Array.isArray(batteries)) {
      batteries.forEach((row) => pushRow(mapBatteryRow(row, serviceType)));
    }
  }

  return rows;
}

function equipamentoToFormFields(equipamento = {}) {
  const out = {};
  if (norm(equipamento.marca)) out.marca = equipamento.marca;
  if (norm(equipamento.modelo)) out.modelo = equipamento.modelo;
  if (norm(equipamento.numero_serie)) {
    out.numero_de_serie = equipamento.numero_serie;
    out.num_serie = equipamento.numero_serie;
  }
  if (norm(equipamento.n_interno)) out.n_interno = equipamento.n_interno;
  if (norm(equipamento.tipo)) out.tipo = equipamento.tipo;
  if (norm(equipamento.data_fabrico)) out.data_fabrico = equipamento.data_fabrico;
  if (equipamento.horas != null && equipamento.horas !== '') out.horas = equipamento.horas;
  return out;
}

function batteryRowFromEquipamento(equipamento = {}) {
  return {
    maquina: norm(equipamento.maquina),
    matricula: norm(equipamento.matricula),
    tipo: norm(equipamento.tipo),
    tensao_v: norm(equipamento.tensao_v),
    densidade: equipamento.densidade != null ? String(equipamento.densidade) : '',
    nivel_eletrolito: '',
    estado_cofre: '',
    curto_circuito: '',
  };
}

function findBestEquipamentoMatch(pool, hints = {}) {
  if (!pool.length) return null;

  const serie = normKey(resolveNumeroSerie(hints));
  if (serie) {
    const bySerie = pool.find((e) => normKey(e.numero_serie) === serie);
    if (bySerie) return bySerie;
  }

  const nInterno = normKey(hints.n_interno);
  if (nInterno) {
    const byInterno = pool.find((e) => normKey(e.n_interno) === nInterno);
    if (byInterno) return byInterno;
  }

  const targetChave = buildEquipamentoChave(hints.categoria || pool[0].categoria, hints);
  if (targetChave) {
    const byChave = pool.find((e) => e.chave === targetChave);
    if (byChave) return byChave;
  }

  return null;
}

/**
 * @param {object} service
 * @param {object} job
 * @param {object[]} equipamentos
 * @param {Record<string, unknown>} savedValues
 */
export function buildEquipmentFormPrefill(service, job, equipamentos = [], savedValues = {}) {
  if (!equipamentos.length || !service) return {};

  const serviceType = service.id;
  const categoria = SERVICE_CATEGORIA[serviceType] || 'empilhador';
  const prefill = {};

  const serialHint = norm(
    job?.forkliftSerial || savedValues.numero_de_serie || savedValues.num_serie,
  );

  const pool = equipamentos.filter((e) => e.categoria === categoria);
  const match = findBestEquipamentoMatch(pool, {
    categoria,
    numero_de_serie: serialHint,
    numero_serie: serialHint,
    n_interno: savedValues.n_interno,
    marca: savedValues.marca,
    modelo: savedValues.modelo,
    tipo: savedValues.tipo,
  });

  if (!match) return prefill;

  if (SERVICES_WITH_MACHINE_BLOCK.has(serviceType)) {
    const fields = equipamentoToFormFields(match);
    if (serviceType === 'manutencao_preventiva_empilhadores') {
      const machines = migrateLegacyEmpilhadoresMaquinas(savedValues);
      const merged = machines.map((row) => normalizeEmpilhadoresMaquinaRow(row));
      if (merged.length) {
        const first = { ...merged[0] };
        Object.entries(fields).forEach(([key, val]) => {
          if (isEmptyValue(first[key])) first[key] = val;
        });
        merged[0] = first;
      } else {
        merged.push(normalizeEmpilhadoresMaquinaRow(fields));
      }
      prefill[EMPILHADORES_MAQUINAS_FIELD_ID] = merged;
    } else {
      Object.entries(fields).forEach(([key, val]) => {
        if (isEmptyValue(savedValues[key])) prefill[key] = val;
      });
    }
  }

  if (serviceType === 'manutencao_baterias_grandes') {
    const batteries = Array.isArray(savedValues[GRANDES_BATTERY_FIELD_ID])
      ? savedValues[GRANDES_BATTERY_FIELD_ID]
      : [];
    const batteryPool = equipamentos.filter((e) => e.categoria === 'bateria');
    if (!batteryPool.length) return prefill;

    const merged = batteries.map((row) => ({ ...row }));
    const hasFilledRow = merged.some(
      (row) => norm(row.maquina) || norm(row.matricula) || norm(row.tipo),
    );

    if (!hasFilledRow && merged.length) {
      const first = batteryRowFromEquipamento(batteryPool[0]);
      merged[0] = { ...first, ...merged[0] };
      Object.keys(first).forEach((key) => {
        if (isEmptyValue(merged[0][key]) && !isEmptyValue(first[key])) {
          merged[0][key] = first[key];
        }
      });
    }

    prefill[GRANDES_BATTERY_FIELD_ID] = merged;
  }

  return prefill;
}

/** Converte linhas da BD para o formato `forklifts` da ficha cliente. */
export function equipamentosToForklifts(equipamentos = []) {
  return equipamentos
    .filter((e) => e.categoria === 'empilhador' && norm(e.numero_serie || e.maquina))
    .map((e) => ({
      serial: e.numero_serie || e.maquina,
      brand: e.marca || '',
      model: e.modelo || '',
    }));
}

export function applyEquipamentoToForm(overlay, equipamento, service = null) {
  const fields = equipamentoToFormFields(equipamento);

  Object.entries(fields).forEach(([fieldId, value]) => {
    const input = overlay.querySelector(`[data-field-id="${fieldId}"]`);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (service?.id === 'manutencao_baterias_grandes') {
    const row = batteryRowFromEquipamento(equipamento);
    const table = overlay.querySelector('.grandes-battery-table');
    const firstRow = table?.querySelector('tbody tr');
    if (firstRow) {
      Object.entries(row).forEach(([key, value]) => {
        const cell = firstRow.querySelector(`[data-col="${key}"]`);
        if (cell && isEmptyValue(cell.value)) {
          cell.value = value;
          cell.dispatchEvent(new Event('input', { bubbles: true }));
          cell.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }

  if (service?.id === 'manutencao_preventiva_empilhadores') {
    const table = overlay.querySelector('.empilhadores-maquinas-table');
    const firstRow = table?.querySelector('tbody tr');
    if (firstRow) {
      Object.entries(fields).forEach(([key, value]) => {
        const colKey = key === 'num_serie' ? 'numero_de_serie' : key;
        const cell = firstRow.querySelector(`[data-col="${colKey}"]`);
        if (cell && isEmptyValue(cell.value)) {
          cell.value = value;
          cell.dispatchEvent(new Event('input', { bubbles: true }));
          cell.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }
}

/** @deprecated Dropdown substituído por autocomplete nos campos de máquina */
export function renderEquipamentoPicker() {
  return '';
}

/** @deprecated Usar bindEquipamentoFieldComboboxes */
export function bindEquipamentoPicker() {}

/** @deprecated Usar bindEquipamentoFieldComboboxes */
export function attachEquipamentoDatalists() {}
