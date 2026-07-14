/**
 * Dados para preencher o template MS.015 (Proposta Comercial / Orçamentos).
 */

import { getJob } from './app.js';
import {
  computeOrcamentoTotals,
  formatEuro,
  getReportOrcamentoMeta,
  normalizeOrcamentoLinhas,
  normalizeTaxasSaida,
  resolveOrcamentoNumeroFormatado,
  suggestOrcamentoLinhas,
} from './orcamento-linhas.js';
import { resolveOrcamentoCabecalho, suggestOrcamentoMaquinas } from './orcamento-cabecalho.js';
import {
  formatOrcamentoMaquinasDocxText,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquinasList,
} from './orcamento-maquinas.js';
import { normalizeEquipamentoCampos, suggestEquipamentoCampos } from './orcamento-equipamento-campos.js';
import {
  MANUTENCAO_BATERIA_INTRO,
  MANUTENCAO_BATERIA_PDF_SUBTITULO,
  MANUTENCAO_MAQUINA_INTRO,
  MANUTENCAO_MAQUINA_PDF_SUBTITULO,
  applyManutencaoBateriaTemplateMeta,
  applyManutencaoMaquinaTemplateMeta,
  isManutencaoBateriaOrcamento,
  isManutencaoMaquinaOrcamento,
  resolveIncluirInspecaoDl50,
  resolveManutencaoMaquinaIntro,
} from './orcamento-templates.js';
import { hasTemplateMaquinaIdentData } from './orcamento-template-equipamentos.js';
import { getOrcamentoTipoProposta } from './orcamento-tipo-proposta.js';

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

/**
 * Data do documento da proposta — dia em que a proposta é (ou foi) enviada ao cliente.
 * Não usa a data da intervenção técnica.
 */
export function resolveOrcamentoDocumentDate(report) {
  const enviadoEm = getReportOrcamentoMeta(report)?.enviadoEm;
  if (enviadoEm) return String(enviadoEm).trim();
  return new Date().toISOString();
}

export function buildOrcamentoFillData(report, job = null) {
  const resolvedJob = job || (report?.jobId ? getJob(report.jobId) : null);
  const year = new Date().getFullYear();
  const orcamentoMetaRaw = getReportOrcamentoMeta(report);
  const isBateriaTemplate = isManutencaoBateriaOrcamento(report);
  const isMaquinaTemplate = isManutencaoMaquinaOrcamento(report);
  const isTemplate = isBateriaTemplate || isMaquinaTemplate;
  const orcamentoMeta = isBateriaTemplate
    ? applyManutencaoBateriaTemplateMeta(orcamentoMetaRaw || {}, report)
    : isMaquinaTemplate
      ? applyManutencaoMaquinaTemplateMeta(orcamentoMetaRaw || {}, report)
      : orcamentoMetaRaw;
  const cabecalho = resolveOrcamentoCabecalho(report);
  const equipamentoCampos = normalizeEquipamentoCampos(
    orcamentoMeta?.equipamentoCampos ??
      cabecalho.equipamentoCampos ??
      suggestEquipamentoCampos(report),
  );
  const maquinasRaw =
    Array.isArray(orcamentoMeta?.maquinas) && orcamentoMeta.maquinas.length
      ? orcamentoMeta.maquinas
      : cabecalho.maquinas || suggestOrcamentoMaquinas(report);
  const maquinasNormalized = normalizeOrcamentoMaquinasList(maquinasRaw, equipamentoCampos);
  const maquinasWithData = isMaquinaTemplate
    ? maquinasNormalized.filter((row) => hasTemplateMaquinaIdentData(row))
    : maquinasNormalized.filter((row) => hasOrcamentoMaquinaData(row, equipamentoCampos));
  const maquinasForPdf = maquinasWithData.length ? maquinasWithData : maquinasNormalized;
  const firstMachine = maquinasForPdf[0] || {};
  const legacyMaquina = isMaquinaTemplate
    ? String(firstMachine.maquinaManutencaoNome || orcamentoMeta?.maquinaManutencaoNome || '').trim()
    : [firstMachine.marca, firstMachine.modelo, firstMachine.tipo]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ');
  const legacyMatricula = firstMachine.numeroInterno || firstMachine.numeroSerie || '';
  const observacoesCliente = String(cabecalho.observacoesCliente || '').trim();

  const orcamentoNumero = resolveOrcamentoNumeroFormatado(orcamentoMeta, {
    year,
    numeroOrdem: resolvedJob?.numeroOrdem ?? null,
  });

  const linhas = normalizeOrcamentoLinhas(
    isTemplate
      ? orcamentoMeta.linhas
      : orcamentoMeta?.linhas?.length
        ? orcamentoMeta.linhas
        : suggestOrcamentoLinhas(report),
    { machineCount: maquinasForPdf.length },
  );
  const taxasSaidaLista = isTemplate ? [] : normalizeTaxasSaida(orcamentoMeta);
  const prazoEntrega = isBateriaTemplate ? '' : String(orcamentoMeta?.prazoEntrega || '').trim();
  const totals = computeOrcamentoTotals(linhas, orcamentoMeta);

  const dataExtenso = formatOrcamentoDateLong(resolveOrcamentoDocumentDate(report));

  const display = (value) => {
    const text = String(value ?? '').trim();
    return text || '—';
  };

  return {
    cliente_nome: display(cabecalho.clienteNome),
    cliente_ac: display(cabecalho.clienteAc),
    orcamento_numero: orcamentoNumero,
    data_extenso: dataExtenso,
    proposta_subtitulo: isBateriaTemplate
      ? MANUTENCAO_BATERIA_PDF_SUBTITULO
      : isMaquinaTemplate
        ? MANUTENCAO_MAQUINA_PDF_SUBTITULO
        : 'ORÇAMENTOS',
    texto_intro: isBateriaTemplate
      ? MANUTENCAO_BATERIA_INTRO
      : isMaquinaTemplate
        ? orcamentoMeta?.textoIntro ||
          resolveManutencaoMaquinaIntro(orcamentoMeta, cabecalho)
        : display(cabecalho.textoIntro),
    intro_servico: isBateriaTemplate
      ? MANUTENCAO_BATERIA_INTRO
      : isMaquinaTemplate
        ? orcamentoMeta?.textoIntro ||
          resolveManutencaoMaquinaIntro(orcamentoMeta, cabecalho)
        : display(cabecalho.textoIntro),
    valor_manutencao_visita: orcamentoMeta?.valorManutencaoVisita || '',
    periodicidade_manutencao: orcamentoMeta?.periodicidadeManutencao || '',
    maquina_manutencao_nome: orcamentoMeta?.maquinaManutencaoNome || '',
    valor_manutencao_geral: orcamentoMeta?.valorManutencaoGeral || '',
    incluir_inspecao_dl50: resolveIncluirInspecaoDl50(orcamentoMeta),
    valor_inspecao_dl50: orcamentoMeta?.valorInspecaoDl50 || '',
    valor_deslocacao: orcamentoMeta?.valorDeslocacao || '',
    tipo_proposta: getOrcamentoTipoProposta(report),
    maquina:
      maquinasForPdf.length > 1
        ? formatOrcamentoMaquinasDocxText(maquinasForPdf, equipamentoCampos)
        : display(legacyMaquina || cabecalho.maquina),
    matricula: display(legacyMatricula || cabecalho.matricula),
    marca: display(firstMachine.marca || cabecalho.marca),
    modelo: display(firstMachine.modelo || cabecalho.modelo),
    tipo: display(firstMachine.tipo || cabecalho.tipo),
    numero_serie: display(firstMachine.numeroSerie || cabecalho.numeroSerie),
    numero_interno: display(firstMachine.numeroInterno || cabecalho.numeroInterno),
    maquinas: maquinasForPdf,
    equipamento_campos: equipamentoCampos,
    maquinas_texto: formatOrcamentoMaquinasDocxText(maquinasForPdf, equipamentoCampos),
    observacoes_cliente: observacoesCliente || '—',
    reparacao_necessaria: observacoesCliente || '—',
    taxas_saida: taxasSaidaLista.map((value) => formatEuro(value)),
    taxa_saida:
      taxasSaidaLista.length === 0
        ? '—'
        : taxasSaidaLista.length === 1
          ? formatEuro(taxasSaidaLista[0])
          : taxasSaidaLista.map((value) => formatEuro(value)).join(' + '),
    prazo_entrega: prazoEntrega || '—',
    forma_pagamento: display(
      isTemplate ? orcamentoMeta?.formaPagamento : cabecalho.formaPagamento,
    ),
    validade_orcamento: display(
      isTemplate ? orcamentoMeta?.validadeOrcamento : cabecalho.validadeOrcamento,
    ),
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
