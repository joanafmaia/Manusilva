/**
 * Extrair e aplicar dados de equipamentos (máquinas / baterias) a partir de relatórios.
 */

import { GRANDES_BATTERY_FIELD_ID } from './views/relatorio-grandes.js';
import {
  EMPILHADORES_MAQUINAS_FIELD_ID,
  migrateLegacyEmpilhadoresMaquinas,
  normalizeEmpilhadoresMaquinaRow,
} from './views/relatorio-empilhadores-maquinas.js';

const MACHINE_VALUE_KEYS = [
  'marca',
  'modelo',
  'numero_de_serie',
  'num_serie',
  'n_interno',
  'horas',
  'tipo',
  'data_fabrico',
];

const SERVICE_CATEGORIA = {
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

/** @param {Record<string, unknown>} data */
export function buildEquipamentoChave(categoria, data = {}) {
  const serie = norm(data.numero_serie || data.num_serie);
  if (serie) return `serie:${serie.toLowerCase()}`;

  const matricula = norm(data.matricula);
  if (matricula) return `mat:${matricula.toLowerCase()}`;

  const maquina = norm(data.maquina);
  if (maquina) return `maq:${maquina.toLowerCase()}`;

  if (categoria === 'carregador') {
    const etiqueta = norm(data.etiqueta);
    if (etiqueta) return `etq:${etiqueta.toLowerCase()}`;
  }

  const marcaModelo = `${norm(data.marca).toLowerCase()}|${norm(data.modelo).toLowerCase()}`;
  if (marcaModelo !== '|') return `mm:${marcaModelo}`;

  return null;
}

function mapMachineRow(categoria, values = {}) {
  const chave = buildEquipamentoChave(categoria, values);
  if (!chave) return null;

  const numeroSerie = norm(values.numero_de_serie || values.num_serie) || null;

  return {
    categoria,
    chave,
    marca: norm(values.marca) || null,
    modelo: norm(values.modelo) || null,
    numero_serie: numeroSerie,
    matricula: norm(values.matricula) || null,
    maquina: norm(values.maquina) || null,
    tipo: norm(values.tipo) || null,
    n_interno: norm(values.n_interno) || null,
    data_fabrico: norm(values.data_fabrico) || null,
    tensao_v: norm(values.tensao_v) || null,
    densidade: norm(values.densidade) || null,
    horas: values.horas != null && values.horas !== '' ? String(values.horas) : null,
  };
}

function mapBatteryRow(row = {}) {
  const chave = buildEquipamentoChave('bateria', row);
  if (!chave) return null;
  return {
    categoria: 'bateria',
    chave,
    marca: null,
    modelo: null,
    numero_serie: null,
    matricula: norm(row.matricula) || null,
    maquina: norm(row.maquina) || null,
    tipo: norm(row.tipo) || null,
    n_interno: null,
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
      machines.forEach((row) => pushRow(mapMachineRow(categoria, row)));
    } else {
      pushRow(mapMachineRow(categoria, values));
    }
  }

  if (serviceType === 'manutencao_baterias_grandes') {
    const batteries = values[GRANDES_BATTERY_FIELD_ID];
    if (Array.isArray(batteries)) {
      batteries.forEach((row) => pushRow(mapBatteryRow(row)));
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
    curto_circuito: 'Não',
  };
}

/**
 * Pré-preenche campos vazios com equipamentos já registados do cliente.
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
  let match =
    (serialHint &&
      pool.find((e) => norm(e.numero_serie).toLowerCase() === serialHint.toLowerCase())) ||
    pool[0];

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

export function renderEquipamentoPicker(equipamentos = [], service = null) {
  if (!equipamentos.length || !service) return '';

  const categoria = SERVICE_CATEGORIA[service.id];
  const pool = categoria
    ? equipamentos.filter((e) => e.categoria === categoria)
    : equipamentos;
  if (!pool.length) return '';

  const options = pool
    .map((e, index) => {
      const label = [
        e.numero_serie ? `Série ${e.numero_serie}` : '',
        e.maquina ? e.maquina : '',
        e.matricula ? `Mat. ${e.matricula}` : '',
        [e.marca, e.modelo].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(' · ');
      return `<option value="${index}">${escapeHtml(label || `Equipamento ${index + 1}`)}</option>`;
    })
    .join('');

  return `
    <div class="equipamento-picker form-section-card">
      <label class="form-label" for="equipamento-picker-select">Equipamento registado</label>
      <p class="field-hint equipamento-picker-hint">Selecione um equipamento deste cliente para preencher os campos automaticamente.</p>
      <select id="equipamento-picker-select" class="form-select equipamento-picker-select" data-equipamento-picker>
        <option value="">— Escolher equipamento —</option>
        ${options}
      </select>
    </div>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Liga o seletor de equipamentos ao formulário aberto. */
export function bindEquipamentoPicker(overlay, equipamentos = [], service = null) {
  const select = overlay.querySelector('[data-equipamento-picker]');
  if (!select || select.dataset.bound === '1') return;
  select.dataset.bound = '1';

  const categoria = SERVICE_CATEGORIA[service?.id];
  const pool = categoria
    ? equipamentos.filter((e) => e.categoria === categoria)
    : equipamentos;

  select.addEventListener('change', () => {
    const index = Number(select.value);
    if (!Number.isFinite(index) || index < 0 || index >= pool.length) return;
    const equipamento = pool[index];
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
  });
}

/** datalist com sugestões por campo de máquina. */
export function attachEquipamentoDatalists(overlay, equipamentos = []) {
  if (!equipamentos.length) return;

  const suggestions = {
    marca: new Set(),
    modelo: new Set(),
    numero_de_serie: new Set(),
    num_serie: new Set(),
    matricula: new Set(),
    maquina: new Set(),
    tipo: new Set(),
  };

  equipamentos.forEach((e) => {
    if (norm(e.marca)) suggestions.marca.add(e.marca);
    if (norm(e.modelo)) suggestions.modelo.add(e.modelo);
    if (norm(e.numero_serie)) {
      suggestions.numero_de_serie.add(e.numero_serie);
      suggestions.num_serie.add(e.numero_serie);
    }
    if (norm(e.matricula)) suggestions.matricula.add(e.matricula);
    if (norm(e.maquina)) suggestions.maquina.add(e.maquina);
    if (norm(e.tipo)) suggestions.tipo.add(e.tipo);
  });

  Object.entries(suggestions).forEach(([fieldId, values]) => {
    if (!values.size) return;
    const listId = `equip-datalist-${fieldId}`;
    let datalist = overlay.querySelector(`#${listId}`);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = listId;
      overlay.appendChild(datalist);
    }
    datalist.innerHTML = [...values]
      .map((v) => `<option value="${escapeHtml(v)}"></option>`)
      .join('');

    overlay.querySelectorAll(`[data-field-id="${fieldId}"]`).forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.setAttribute('list', listId);
      }
    });

    overlay.querySelectorAll(`[data-col="${fieldId}"]`).forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.setAttribute('list', listId);
      }
    });
  });
}
