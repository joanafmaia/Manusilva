/**
 * Dados para preencher o template MS.015 (Proposta Comercial / Orçamentos).
 */

import { getClient, getJob, getServiceType } from './app.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function formatOrcamentoDateLong(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    const now = new Date();
    return `${now.getDate()} de ${MESES_PT[now.getMonth()]} ${now.getFullYear()}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const day = Number(iso[3]);
    const month = Number(iso[2]) - 1;
    const year = Number(iso[1]);
    if (month >= 0 && month < 12) {
      return `${day} de ${MESES_PT[month]} ${year}`;
    }
  }
  return text;
}

export function resolveOrcamentoIntro(serviceType) {
  const id = String(serviceType || '');
  if (/bateria/i.test(id)) {
    return 'a reparação das seguintes baterias:';
  }
  if (/inspecao|dl50|empilhador|maquina|avaria|corretiva/i.test(id)) {
    return 'a reparação / manutenção do seguinte equipamento:';
  }
  const service = getServiceType(id);
  if (service?.label) {
    return `a intervenção de ${String(service.label).toLowerCase()}:`;
  }
  return 'a reparação / manutenção do seguinte equipamento:';
}

export function buildOrcamentoFillData(report, job = null) {
  const values = report?.data?.values || {};
  const client = getClient(report?.clientId);
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const year = new Date().getFullYear();

  const clienteNome =
    String(values.nome_empresa || values.cliente || client?.name || client?.Nome || '').trim() ||
    '—';

  const clienteAc =
    String(values.responsavel || client?.contact || client?.contacto || '').trim() || 'Exmos. Senhores';

  const orcamentoNumero =
    resolvedJob?.numeroOrdem != null && Number.isFinite(Number(resolvedJob.numeroOrdem))
      ? `${resolvedJob.numeroOrdem}.0/${year}`
      : `…/${year}`;

  const dataExtenso = formatOrcamentoDateLong(
    values.data_de_conclusao || report?.submittedAt || report?.approvedAt,
  );

  const maquinaParts = [values.marca, values.modelo, values.tipo].map((v) => String(v || '').trim()).filter(Boolean);
  const maquina = maquinaParts.join(' / ') || '—';

  const matricula =
    String(values.n_interno || values.numero_de_serie || report?.forkliftSerial || '').trim() || '—';

  let reparacao = getPedidoOrcamentoDetalhe(report);
  const obs = String(values.observacoes || '').trim();
  if (obs) {
    reparacao = reparacao ? `${reparacao}\n\nObservações: ${obs}` : obs;
  }
  if (!reparacao) reparacao = '—';

  return {
    cliente_nome: clienteNome,
    cliente_ac: clienteAc,
    orcamento_numero: orcamentoNumero,
    data_extenso: dataExtenso,
    intro_servico: resolveOrcamentoIntro(report?.serviceType),
    maquina,
    matricula,
    reparacao_necessaria: reparacao,
  };
}

export function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
