/**
 * Cabeçalho editável da proposta MS.015 (valores por defeito do relatório técnico).
 */

import { getClient, getForklift, getJob, getServiceType } from './app.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';

export const ORCAMENTO_FORMA_PAGAMENTO_DEFAULT = 'Pronto Pagamento';
export const ORCAMENTO_VALIDADE_DEFAULT = '10 Dias';

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

/** Observações do técnico no relatório (apoio à faturação RH). */
export function resolveReportObservacoesTecnico(report) {
  const values = report?.data?.values || {};
  return String(values.observacoes || values.observacao || '').trim();
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
    reparacaoNecessaria: String(getPedidoOrcamentoDetalhe(report) || '').trim(),
    observacoesTecnico: resolveReportObservacoesTecnico(report),
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
  'reparacaoNecessaria',
  'observacoesTecnico',
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

function syncDerivedEquipamento(cabecalho) {
  const maquina = joinParts([cabecalho.marca, cabecalho.modelo, cabecalho.tipo]);
  const matricula = cabecalho.numeroInterno || cabecalho.numeroSerie;
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

  const cabecalho = syncDerivedEquipamento({
    clienteNome: resolveOrcamentoClienteNome(report),
    clienteAc: picked.clienteAc || 'Exmos. Senhores',
    ...picked,
    formaPagamento: picked.formaPagamento || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: picked.validadeOrcamento || ORCAMENTO_VALIDADE_DEFAULT,
  });

  return cabecalho;
}

export function readOrcamentoCabecalhoFromDom(root, report) {
  const read = (field) => root?.querySelector(`[data-orc-field="${field}"]`)?.value?.trim() || '';
  const cabecalho = syncDerivedEquipamento({
    clienteNome: resolveOrcamentoClienteNome(report),
    clienteAc: read('clienteAc') || 'Exmos. Senhores',
    marca: read('marca'),
    modelo: read('modelo'),
    tipo: read('tipo'),
    numeroSerie: read('numeroSerie'),
    numeroInterno: read('numeroInterno'),
    maquina: read('maquina'),
    matricula: read('matricula'),
    reparacaoNecessaria: read('reparacaoNecessaria'),
    observacoesTecnico: read('observacoesTecnico'),
    formaPagamento: read('formaPagamento') || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: read('validadeOrcamento') || ORCAMENTO_VALIDADE_DEFAULT,
  });
  return cabecalho;
}
