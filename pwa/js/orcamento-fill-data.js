/**
 * Dados para preencher o template MS.015 (Proposta Comercial / Orçamentos).
 */

import { getJob } from './app.js';
import {
  computeOrcamentoTotals,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeOrcamentoLinhas,
  suggestOrcamentoLinhas,
} from './orcamento-linhas.js';
import { resolveOrcamentoCabecalho } from './orcamento-cabecalho.js';

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
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const year = new Date().getFullYear();
  const cabecalho = resolveOrcamentoCabecalho(report);

  const orcamentoMeta = getReportOrcamentoMeta(report);
  const orcamentoNumero =
    orcamentoMeta?.numeroFormatado ||
    (orcamentoMeta?.numeroSequencial && orcamentoMeta?.ano
      ? `${orcamentoMeta.numeroSequencial}.0/${orcamentoMeta.ano}`
      : resolvedJob?.numeroOrdem != null && Number.isFinite(Number(resolvedJob.numeroOrdem))
        ? `${resolvedJob.numeroOrdem}.0/${year}`
        : `…/${year}`);

  const linhas = normalizeOrcamentoLinhas(
    orcamentoMeta?.linhas?.length ? orcamentoMeta.linhas : suggestOrcamentoLinhas(report),
  );
  const taxaSaida = orcamentoMeta?.taxaSaida ?? '';
  const prazoEntrega = String(orcamentoMeta?.prazoEntrega || '').trim();
  const totals = computeOrcamentoTotals(linhas, taxaSaida);

  const dataExtenso = formatOrcamentoDateLong(
    values.data_de_conclusao || report?.submittedAt || report?.approvedAt,
  );

  const display = (value) => {
    const text = String(value ?? '').trim();
    return text || '—';
  };

  return {
    cliente_nome: display(cabecalho.clienteNome),
    cliente_ac: display(cabecalho.clienteAc),
    orcamento_numero: orcamentoNumero,
    data_extenso: dataExtenso,
    intro_servico: resolveOrcamentoIntro(report?.serviceType),
    maquina: display(cabecalho.maquina),
    matricula: display(cabecalho.matricula),
    marca: display(cabecalho.marca),
    modelo: display(cabecalho.modelo),
    tipo: display(cabecalho.tipo),
    numero_serie: display(cabecalho.numeroSerie),
    numero_interno: display(cabecalho.numeroInterno),
    taxa_saida: taxaSaida === '' ? '—' : formatEuro(taxaSaida),
    prazo_entrega: prazoEntrega || '—',
    forma_pagamento: display(cabecalho.formaPagamento),
    validade_orcamento: display(cabecalho.validadeOrcamento),
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total_geral: formatEuro(totals.total),
    linhas,
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
