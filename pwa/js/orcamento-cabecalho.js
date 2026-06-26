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

/** Máquina e matrícula/n.º interno a partir do relatório técnico (por tipo de serviço). */
export function resolveReportEquipamentoDefaults(report) {
  const values = report?.data?.values || {};
  const serviceType = String(report?.serviceType || '');
  const job = report?.jobId ? getJob(report.jobId) : null;
  const serial = String(
    values.numero_de_serie ||
      values.n_interno ||
      report?.forkliftSerial ||
      job?.forkliftSerial ||
      '',
  ).trim();
  const forklift =
    serial && report?.clientId ? getForklift(report.clientId, serial) : null;

  let maquina = '';
  let matricula = '';

  if (serviceType === 'manutencao_baterias_grandes') {
    const row = firstGrandesBatteryRow(values);
    if (row) {
      maquina = joinParts([row.maquina, row.tipo]);
      matricula = String(row.matricula || '').trim();
    }
  } else if (serviceType === 'reparacao_carregador') {
    maquina = String(values.marca_modelo || '').trim();
    matricula = joinParts([values.numero_de_serie, values.etiqueta], ' · ');
  } else if (values.marca || values.modelo || values.tipo) {
    maquina = joinParts([values.marca, values.modelo, values.tipo]);
    matricula = String(values.n_interno || values.numero_de_serie || '').trim();
  } else if (values.marca_modelo) {
    maquina = String(values.marca_modelo).trim();
    matricula = String(values.numero_de_serie || values.n_interno || '').trim();
  }

  if (!matricula) {
    matricula = String(report?.forkliftSerial || job?.forkliftSerial || serial || '').trim();
  }

  if (!maquina && forklift?.model) {
    maquina = String(forklift.model).trim();
  }

  if (!maquina && /bateria/i.test(serviceType)) {
    maquina = forklift?.model ? joinParts(['Bateria', forklift.model]) : 'Bateria';
  }

  if (!maquina) {
    const service = getServiceType(serviceType);
    const label = String(service?.label || '').trim();
    if (label) {
      maquina = label
        .replace(/^relat[oó]rio\s+(de\s+)?/i, '')
        .replace(/^folha\s+(de\s+)?/i, '')
        .replace(/^formul[aá]rio\s+/i, '')
        .trim();
    }
  }

  return { maquina, matricula };
}

function buildDefaultsFromReport(report) {
  const values = report?.data?.values || {};
  const client = getClient(report?.clientId);

  const clienteAc =
    String(values.responsavel || client?.contact || client?.contacto || '').trim() ||
    'Exmos. Senhores';

  const { maquina, matricula } = resolveReportEquipamentoDefaults(report);

  let reparacaoNecessaria = getPedidoOrcamentoDetalhe(report);
  const obs = String(values.observacoes || values.observacao || '').trim();
  if (obs) {
    reparacaoNecessaria = reparacaoNecessaria
      ? `${reparacaoNecessaria}\n\nObservações: ${obs}`
      : obs;
  }

  return {
    clienteAc,
    maquina,
    matricula,
    reparacaoNecessaria: String(reparacaoNecessaria || '').trim(),
    formaPagamento: ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: ORCAMENTO_VALIDADE_DEFAULT,
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

  const pick = (key) => {
    if (Object.prototype.hasOwnProperty.call(meta, key) && meta[key] != null) {
      const saved = String(meta[key]).trim();
      if (saved) return saved;
    }
    return String(defaults[key] ?? '').trim();
  };

  return {
    clienteNome: resolveOrcamentoClienteNome(report),
    clienteAc: pick('clienteAc') || 'Exmos. Senhores',
    maquina: pick('maquina'),
    matricula: pick('matricula'),
    reparacaoNecessaria: pick('reparacaoNecessaria'),
    formaPagamento: pick('formaPagamento') || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: pick('validadeOrcamento') || ORCAMENTO_VALIDADE_DEFAULT,
  };
}

export function readOrcamentoCabecalhoFromDom(root, report) {
  const read = (field) => root?.querySelector(`[data-orc-field="${field}"]`)?.value?.trim() || '';
  return {
    clienteNome: resolveOrcamentoClienteNome(report),
    clienteAc: read('clienteAc') || 'Exmos. Senhores',
    maquina: read('maquina'),
    matricula: read('matricula'),
    reparacaoNecessaria: read('reparacaoNecessaria'),
    formaPagamento: read('formaPagamento') || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: read('validadeOrcamento') || ORCAMENTO_VALIDADE_DEFAULT,
  };
}
