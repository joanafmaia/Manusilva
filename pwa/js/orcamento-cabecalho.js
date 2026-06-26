/**
 * Cabeçalho editável da proposta MS.015 (valores por defeito do relatório técnico).
 */

import { getClient } from './app.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';

export const ORCAMENTO_FORMA_PAGAMENTO_DEFAULT = 'Pronto Pagamento';
export const ORCAMENTO_VALIDADE_DEFAULT = '10 Dias';

function readOrcamentoMeta(report) {
  const meta = report?.data?.orcamento;
  return meta && typeof meta === 'object' ? meta : {};
}

function buildDefaultsFromReport(report) {
  const values = report?.data?.values || {};
  const client = getClient(report?.clientId);

  const clienteAc =
    String(values.responsavel || client?.contact || client?.contacto || '').trim() ||
    'Exmos. Senhores';

  const maquinaParts = [values.marca, values.modelo, values.tipo]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const maquina = maquinaParts.join(' / ');

  const matricula = String(
    values.n_interno || values.numero_de_serie || report?.forkliftSerial || '',
  ).trim();

  let reparacaoNecessaria = getPedidoOrcamentoDetalhe(report);
  const obs = String(values.observacoes || '').trim();
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
      return String(meta[key]).trim();
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
