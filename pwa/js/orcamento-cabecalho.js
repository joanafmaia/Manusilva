/**
 * Cabeçalho editável da proposta MS.015 (valores por defeito do relatório técnico).
 */

import { getClient, getForklift, getJob, getServiceType } from './app.js';
import { migrateLegacyEmpilhadoresMaquinas } from './views/relatorio-empilhadores-maquinas.js';
import { getPedidoOrcamentoDetalhe, reportHasPedidoOrcamento } from './pedido-orcamento.js';
import {
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquina,
  normalizeOrcamentoMaquinasList,
  readOrcamentoMaquinasFromDom,
  readOrcamentoEquipamentoCamposFromDom,
  syncLegacyMaquinaFieldsFromList,
} from './orcamento-maquinas.js';
import { suggestEquipamentoCampos } from './orcamento-equipamento-campos.js';

export const ORCAMENTO_FORMA_PAGAMENTO_DEFAULT = 'Pronto Pagamento';
export const ORCAMENTO_VALIDADE_DEFAULT = '10 Dias';
export const ORCAMENTO_TEXTO_INTRO_SINGULAR =
  'Vimos por este meio enviar o nosso orçamento para a seguinte máquina:';
export const ORCAMENTO_TEXTO_INTRO_PLURAL =
  'Vimos por este meio enviar o nosso orçamento para as seguintes máquinas:';

function readOrcamentoMeta(report) {
  const meta = report?.data?.orcamento;
  return meta && typeof meta === 'object' ? meta : {};
}

function joinParts(parts, separator = ' / ') {
  return parts
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(separator);
}

function firstGrandesBatteryRow(values) {
  const rows = values?.identificacao_baterias;
  if (!Array.isArray(rows) || !rows.length) return null;
  const withData = rows.find((row) => {
    if (!row || typeof row !== 'object') return false;
    return Boolean(joinParts([row.maquina, row.tipo, row.matricula]));
  });
  return withData || rows[0] || null;
}

/** Apoio à faturação RH — «O que é necessário» quando há pedido de orçamento; senão observações do relatório. */
export function resolveReportObservacoesTecnico(report) {
  if (reportHasPedidoOrcamento(report)) {
    return getPedidoOrcamentoDetalhe(report);
  }

  const values = report?.data?.values || {};
  if (String(report?.serviceType || '') === 'manutencao_preventiva_empilhadores') {
    const maquinas = migrateLegacyEmpilhadoresMaquinas(values);
    const parts = maquinas
      .map((row, index) => {
        const text = String(row.observacoes || '').trim();
        if (!text) return '';
        if (maquinas.length <= 1) return text;
        const label = [row.marca, row.modelo].filter(Boolean).join(' ') || `Máquina ${index + 1}`;
        return `${label}: ${text}`;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  return String(values.observacoes || values.observacao || '').trim();
}

/** Sugere máquinas a partir do relatório técnico ou meta RH guardada. */
export function suggestOrcamentoMaquinas(report) {
  const meta = readOrcamentoMeta(report);
  const saved = normalizeOrcamentoMaquinasList(meta.maquinas);
  if (saved.some(hasOrcamentoMaquinaData)) return saved;

  const serviceType = String(report?.serviceType || '');
  const values = report?.data?.values || {};

  if (serviceType === 'manutencao_preventiva_empilhadores') {
    const fromReport = migrateLegacyEmpilhadoresMaquinas(values)
      .map((row) =>
        normalizeOrcamentoMaquina({
          marca: row.marca,
          modelo: row.modelo,
          numeroSerie: row.numero_de_serie,
          numeroInterno: row.n_interno,
        }),
      )
      .filter(hasOrcamentoMaquinaData);
    if (fromReport.length) return fromReport;
  }

  if (serviceType === 'manutencao_baterias_grandes') {
    const rows = values?.identificacao_baterias;
    if (Array.isArray(rows)) {
      const fromBaterias = rows
        .map((row) =>
          normalizeOrcamentoMaquina({
            marca: row?.maquina,
            tipo: row?.tipo,
            numeroInterno: row?.matricula,
          }),
        )
        .filter(hasOrcamentoMaquinaData);
      if (fromBaterias.length) return fromBaterias;
    }
  }

  const equip = resolveReportEquipamentoFields(report);
  return [
    normalizeOrcamentoMaquina({
      marca: equip.marca,
      modelo: equip.modelo,
      tipo: equip.tipo,
      numeroSerie: equip.numeroSerie,
      numeroInterno: equip.numeroInterno,
    }),
  ];
}

/** Marca, modelo, tipo e números a partir do relatório técnico (por tipo de serviço). */
export function resolveReportEquipamentoFields(report) {
  const values = report?.data?.values || {};
  const serviceType = String(report?.serviceType || '');
  const job = report?.jobId ? getJob(report.jobId) : null;
  const forkliftSerial = String(report?.forkliftSerial || job?.forkliftSerial || '').trim();

  let marca = '';
  let modelo = '';
  let tipo = '';
  let numeroSerie = '';
  let numeroInterno = '';

  if (serviceType === 'manutencao_baterias_grandes') {
    const row = firstGrandesBatteryRow(values);
    if (row) {
      marca = String(row.maquina || '').trim();
      tipo = String(row.tipo || '').trim();
      numeroInterno = String(row.matricula || '').trim();
    }
  } else if (serviceType === 'reparacao_carregador') {
    marca = String(values.marca_modelo || '').trim();
    numeroSerie = String(values.numero_de_serie || '').trim();
    numeroInterno = String(values.etiqueta || '').trim();
  } else if (serviceType === 'manutencao_preventiva_empilhadores') {
    const maquinas = migrateLegacyEmpilhadoresMaquinas(values);
    const row =
      maquinas.find((m) => [m.marca, m.modelo, m.numero_de_serie, m.n_interno].some((v) => String(v || '').trim())) ||
      maquinas[0] ||
      {};
    marca = String(row.marca || '').trim();
    modelo = String(row.modelo || '').trim();
    numeroSerie = String(row.numero_de_serie || '').trim();
    numeroInterno = String(row.n_interno || '').trim();
  } else {
    marca = String(values.marca || '').trim();
    modelo = String(values.modelo || '').trim();
    tipo = String(values.tipo || '').trim();
    numeroSerie = String(values.numero_de_serie || '').trim();
    numeroInterno = String(values.n_interno || '').trim();
  }

  if (!numeroSerie && !numeroInterno) {
    numeroSerie = String(values.numero_de_serie || forkliftSerial || '').trim();
  }

  if (!marca && !modelo && forkliftSerial && report?.clientId) {
    const forklift = getForklift(report.clientId, forkliftSerial);
    if (forklift?.model) {
      if (/bateria/i.test(serviceType)) {
        marca = 'Bateria';
        modelo = String(forklift.model).trim();
      } else {
        modelo = String(forklift.model).trim();
      }
    }
  }

  if (!marca && !modelo && !tipo && /bateria/i.test(serviceType)) {
    marca = 'Bateria';
  }

  if (!marca && !modelo && !tipo) {
    const service = getServiceType(serviceType);
    const label = String(service?.label || '').trim();
    if (label) {
      tipo = label
        .replace(/^relat[oó]rio\s+(de\s+)?/i, '')
        .replace(/^folha\s+(de\s+)?/i, '')
        .replace(/^formul[aá]rio\s+/i, '')
        .trim();
    }
  }

  const maquina = joinParts([marca, modelo, tipo]);
  const matricula = numeroInterno || numeroSerie || forkliftSerial;

  return { marca, modelo, tipo, numeroSerie, numeroInterno, maquina, matricula };
}

/** Texto introdutório do PDF — editável pelo RH; plural com várias máquinas. */
export function suggestOrcamentoTextoIntro(report, machineCount = null) {
  const meta = readOrcamentoMeta(report);
  const saved = String(meta.textoIntro || '').trim();
  if (saved) return saved;

  const maquinas = normalizeOrcamentoMaquinasList(meta.maquinas || suggestOrcamentoMaquinas(report)).filter(
    hasOrcamentoMaquinaData,
  );
  const count =
    machineCount ??
    Math.max(1, maquinas.length || normalizeOrcamentoMaquinasList(suggestOrcamentoMaquinas(report)).length);
  return count > 1 ? ORCAMENTO_TEXTO_INTRO_PLURAL : ORCAMENTO_TEXTO_INTRO_SINGULAR;
}

/** @deprecated usar resolveReportEquipamentoFields */
export function resolveReportEquipamentoDefaults(report) {
  const fields = resolveReportEquipamentoFields(report);
  return { maquina: fields.maquina, matricula: fields.matricula };
}

function buildDefaultsFromReport(report) {
  const values = report?.data?.values || {};
  const client = getClient(report?.clientId);

  const clienteAc =
    String(values.responsavel || client?.contact || client?.contacto || '').trim() ||
    'Exmos. Senhores';

  const equipamento = resolveReportEquipamentoFields(report);

  return {
    clienteAc,
    marca: equipamento.marca,
    modelo: equipamento.modelo,
    tipo: equipamento.tipo,
    numeroSerie: equipamento.numeroSerie,
    numeroInterno: equipamento.numeroInterno,
    maquina: equipamento.maquina,
    matricula: equipamento.matricula,
    observacoesTecnico: resolveReportObservacoesTecnico(report),
    observacoesCliente: '',
    textoIntro: suggestOrcamentoTextoIntro(report),
    formaPagamento: ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: ORCAMENTO_VALIDADE_DEFAULT,
  };
}

const CABECALHO_FIELD_KEYS = [
  'clienteAc',
  'marca',
  'modelo',
  'tipo',
  'numeroSerie',
  'numeroInterno',
  'maquina',
  'matricula',
  'observacoesTecnico',
  'observacoesCliente',
  'textoIntro',
  'formaPagamento',
  'validadeOrcamento',
];

function pickCabecalhoField(meta, defaults, key) {
  if (Object.prototype.hasOwnProperty.call(meta, key) && meta[key] != null) {
    const saved = String(meta[key]).trim();
    if (saved) return saved;
  }
  return String(defaults[key] ?? '').trim();
}

function syncDerivedEquipamento(cabecalho, maquinas = []) {
  const fromList = syncLegacyMaquinaFieldsFromList(maquinas);
  const maquina = joinParts([cabecalho.marca, cabecalho.modelo, cabecalho.tipo]) || fromList.maquina;
  const matricula = cabecalho.numeroInterno || cabecalho.numeroSerie || fromList.matricula;
  return {
    ...cabecalho,
    maquina: maquina || cabecalho.maquina,
    matricula: matricula || cabecalho.matricula,
  };
}

/** Nome «PARA» — sempre o cliente do relatório (não editável na proposta). */
export function resolveOrcamentoClienteNome(report) {
  const values = report?.data?.values || {};
  const client = getClient(report?.clientId);
  return (
    String(values.nome_empresa || values.cliente || client?.name || client?.Nome || '').trim() ||
    '—'
  );
}

/** Valores do cabeçalho — meta RH sobrepõe o relatório técnico (exceto cliente). */
export function resolveOrcamentoCabecalho(report) {
  const meta = readOrcamentoMeta(report);
  const defaults = buildDefaultsFromReport(report);

  const picked = Object.fromEntries(
    CABECALHO_FIELD_KEYS.map((key) => [key, pickCabecalhoField(meta, defaults, key)]),
  );
  const maquinas = suggestOrcamentoMaquinas(report);
  const equipamentoCampos = suggestEquipamentoCampos(report);
  const legacy = syncLegacyMaquinaFieldsFromList(maquinas, equipamentoCampos);

  const cabecalho = syncDerivedEquipamento(
    {
      clienteNome: resolveOrcamentoClienteNome(report),
      clienteAc: picked.clienteAc || 'Exmos. Senhores',
      ...picked,
      marca: picked.marca || legacy.marca,
      modelo: picked.modelo || legacy.modelo,
      tipo: picked.tipo || legacy.tipo,
      numeroSerie: picked.numeroSerie || legacy.numeroSerie,
      numeroInterno: picked.numeroInterno || legacy.numeroInterno,
      formaPagamento: picked.formaPagamento || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
      validadeOrcamento: picked.validadeOrcamento || ORCAMENTO_VALIDADE_DEFAULT,
    },
    maquinas,
  );

  return { ...cabecalho, maquinas, equipamentoCampos };
}

export function readOrcamentoCabecalhoFromDom(root, report) {
  const read = (field) => root?.querySelector(`[data-orc-field="${field}"]`)?.value?.trim() || '';
  const equipamentoCampos = readOrcamentoEquipamentoCamposFromDom(root);
  const maquinas = readOrcamentoMaquinasFromDom(root, equipamentoCampos);
  const legacy = syncLegacyMaquinaFieldsFromList(maquinas, equipamentoCampos);
  const cabecalho = syncDerivedEquipamento(
    {
      clienteNome: resolveOrcamentoClienteNome(report),
      clienteAc: read('clienteAc') || 'Exmos. Senhores',
      marca: legacy.marca,
      modelo: legacy.modelo,
      tipo: legacy.tipo,
      numeroSerie: legacy.numeroSerie,
      numeroInterno: legacy.numeroInterno,
      observacoesTecnico: read('observacoesTecnico'),
      observacoesCliente: read('observacoesCliente'),
      textoIntro: read('textoIntro') || suggestOrcamentoTextoIntro(report, maquinas.length || 1),
      formaPagamento: read('formaPagamento') || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
      validadeOrcamento: read('validadeOrcamento') || ORCAMENTO_VALIDADE_DEFAULT,
    },
    maquinas,
  );
  return { ...cabecalho, maquinas, equipamentoCampos };
}
