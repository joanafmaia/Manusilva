/**
 * Dados para preencher o template MS.015 (Proposta Comercial / Orçamentos).
 */

import { getJob } from './app.js';
import {
  computeOrcamentoTotals,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeOrcamentoLinhas,
  resolveOrcamentoNumeroFormatado,
  suggestOrcamentoLinhas,
} from './orcamento-linhas.js';
import { resolveOrcamentoCabecalho, suggestOrcamentoMaquinas } from './orcamento-cabecalho.js';
import {
  formatOrcamentoMaquinasDocxText,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquinasList,
} from './orcamento-maquinas.js';

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

export function buildOrcamentoFillData(report, job = null) {
  const values = report?.data?.values || {};
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const year = new Date().getFullYear();
  const cabecalho = resolveOrcamentoCabecalho(report);
  const maquinas = normalizeOrcamentoMaquinasList(cabecalho.maquinas || suggestOrcamentoMaquinas(report)).filter(
    hasOrcamentoMaquinaData,
  );
  const maquinasForPdf = maquinas.length ? maquinas : normalizeOrcamentoMaquinasList(suggestOrcamentoMaquinas(report));
  const firstMachine = maquinasForPdf[0] || {};
  const legacyMaquina = [firstMachine.marca, firstMachine.modelo, firstMachine.tipo]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' / ');
  const legacyMatricula = firstMachine.numeroInterno || firstMachine.numeroSerie || '';
  const observacoesCliente = String(cabecalho.observacoesCliente || '').trim();

  const orcamentoMeta = getReportOrcamentoMeta(report);
  const orcamentoNumero = resolveOrcamentoNumeroFormatado(orcamentoMeta, {
    year,
    numeroOrdem: resolvedJob?.numeroOrdem ?? null,
  });

  const linhas = normalizeOrcamentoLinhas(
    orcamentoMeta?.linhas?.length ? orcamentoMeta.linhas : suggestOrcamentoLinhas(report),
    { machineCount: maquinasForPdf.length },
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
    texto_intro: display(cabecalho.textoIntro),
    intro_servico: display(cabecalho.textoIntro),
    maquina:
      maquinasForPdf.length > 1
        ? formatOrcamentoMaquinasDocxText(maquinasForPdf)
        : display(legacyMaquina || cabecalho.maquina),
    matricula: display(legacyMatricula || cabecalho.matricula),
    marca: display(firstMachine.marca || cabecalho.marca),
    modelo: display(firstMachine.modelo || cabecalho.modelo),
    tipo: display(firstMachine.tipo || cabecalho.tipo),
    numero_serie: display(firstMachine.numeroSerie || cabecalho.numeroSerie),
    numero_interno: display(firstMachine.numeroInterno || cabecalho.numeroInterno),
    maquinas: maquinasForPdf,
    maquinas_texto: formatOrcamentoMaquinasDocxText(maquinasForPdf),
    observacoes_cliente: observacoesCliente || '—',
    reparacao_necessaria: observacoesCliente || '—',
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
