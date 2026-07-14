/**
 * Dados agregados de propostas comerciais — exportação PDF anual.
 */

import { getClient, getJob, getTechnician } from './entity-lookups.js';
import { formatOrdemLabel } from './report-review-ui.js';
import { getReportOrcamentoMeta, parseOrcamentoNumber } from './orcamento-linhas.js';
import { getPedidoOrcamentoDetalhe } from './pedido-orcamento.js';
import { reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import { reportIsFolhaObraOrcamento } from './folha-obra-orcamento.js';
import {
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  ORCAMENTO_TIPO_PROPOSTA_OPTIONS,
  reportHasOrcamentoContent,
  resolveOrcamentoReferenceDate,
  resolveOrcamentoReferenceYear,
} from './orcamento-tipo-proposta.js';
import {
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
} from './orcamento-workflow.js';

function safeClientName(report) {
  const client = getClient(report?.clientId);
  return String(client?.name || client?.Nome || '—').trim() || '—';
}

function filterByYear(reports, year) {
  if (!year || String(year) === 'all') return reports;
  const y = Number(year);
  if (!Number.isFinite(y)) return reports;
  return reports.filter((report) => resolveOrcamentoReferenceYear(report) === y);
}

function filterByTipo(reports, tipoFilter) {
  if (!tipoFilter || tipoFilter === 'all') return reports;
  return reports.filter((report) => getOrcamentoTipoProposta(report) === tipoFilter);
}

function filterByEstado(reports, estadoFilter) {
  if (!estadoFilter || estadoFilter === 'all') return reports;
  return reports.filter((report) => resolveOrcamentoWorkflowStatus(report) === estadoFilter);
}

function resolveOrigemLabel(report) {
  if (reportIsStandaloneOrcamento(report)) return 'Proposta RH';
  if (reportIsFolhaObraOrcamento(report)) return 'Folha de obra R.C';
  return 'Pedido técnico';
}

function resolveRespostaCliente(meta, workflowStatus) {
  const raw = String(meta?.respostaCliente || '').trim().toLowerCase();
  if (raw === 'aceite') return 'Aceite';
  if (raw === 'recusada') return 'Recusada';
  if (meta?.enviadoEm && workflowStatus === 'enviada') return 'Pendente';
  return '—';
}

export function buildOrcamentoAuditRows(
  reports,
  { year = 'all', tipoFilter = 'all', estadoFilter = 'all' } = {},
) {
  let list = reports.filter(reportHasOrcamentoContent);
  list = filterByYear(list, year);
  list = filterByTipo(list, tipoFilter);
  list = filterByEstado(list, estadoFilter);

  return list
    .map((report) => {
      const meta = getReportOrcamentoMeta(report) || {};
      const job = report.jobId ? getJob(report.jobId) : null;
      const client = getClient(report.clientId);
      const tech = getTechnician(report.technicianId);
      const tipo = getOrcamentoTipoProposta(report);
      const total = parseOrcamentoNumber(meta.total);
      const workflowStatus = resolveOrcamentoWorkflowStatus(report);
      const workflowLabel = resolveOrcamentoWorkflowLabel(workflowStatus);
      const refDate = resolveOrcamentoReferenceDate(report);
      return {
        reportId: report.id,
        date: refDate,
        year: refDate ? refDate.slice(0, 4) : '',
        tipo,
        tipoLabel: formatOrcamentoTipoPropostaLabel(tipo),
        cliente: safeClientName(report),
        nif: String(client?.nif || client?.NIF || '').trim() || '—',
        numeroOrcamento: String(meta.numeroFormatado || '—'),
        op: formatOrdemLabel(job) || '—',
        estado: workflowLabel,
        estadoKey: workflowStatus,
        respostaCliente: resolveRespostaCliente(meta, workflowStatus),
        respostaClienteEm: meta.respostaClienteEm ? String(meta.respostaClienteEm).slice(0, 10) : '—',
        total: Number.isFinite(total) && total > 0 ? total : null,
        enviadoEm: meta.enviadoEm ? String(meta.enviadoEm).slice(0, 10) : '—',
        emailDestinatario: String(meta.emailDestinatario || '').trim() || '—',
        tecnico: String(tech?.name || report.technicianId || '—').trim() || '—',
        pedido: String(getPedidoOrcamentoDetalhe(report) || '').trim() || '—',
        origem: resolveOrigemLabel(report),
      };
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function buildOrcamentoAuditSummary(
  reports,
  { year = 'all', tipoFilter = 'all', estadoFilter = 'all' } = {},
) {
  const rows = buildOrcamentoAuditRows(reports, { year, tipoFilter, estadoFilter });
  const byTipo = new Map(
    ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(({ value, label }) => [
      value,
      { tipo: label, count: 0, valor: 0 },
    ]),
  );

  let totalValor = 0;
  let enviadas = 0;
  let aceites = 0;

  for (const row of rows) {
    const bucket = byTipo.get(row.tipo);
    if (bucket) {
      bucket.count += 1;
      if (row.total != null) {
        bucket.valor += row.total;
        totalValor += row.total;
      }
    }
    if (row.enviadoEm && row.enviadoEm !== '—') enviadas += 1;
    if (row.estado === 'Aceite') aceites += 1;
  }

  const yearLabel =
    !year || String(year) === 'all' ? 'Todos os anos' : String(year);
  const tipoLabel =
    !tipoFilter || tipoFilter === 'all'
      ? 'Todos os tipos'
      : formatOrcamentoTipoPropostaLabel(tipoFilter);
  const estadoLabel =
    !estadoFilter || estadoFilter === 'all'
      ? 'Todos os estados'
      : resolveOrcamentoWorkflowLabel(estadoFilter);

  return {
    year,
    yearLabel,
    tipoFilter,
    tipoLabel,
    estadoFilter,
    estadoLabel,
    metrics: {
      proposalCount: rows.length,
      enviadas,
      aceites,
      totalValor,
    },
    byTipo: [...byTipo.values()].filter((row) => row.count > 0),
    rows,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildOrcamentoAuditCsvFilename({ year = 'all', tipoFilter = 'all', estadoFilter = 'all' } = {}) {
  const yearKey = String(year) === 'all' ? 'todos-anos' : String(year);
  const tipoKey = !tipoFilter || tipoFilter === 'all' ? 'todos-tipos' : String(tipoFilter).replace(/_/g, '-');
  const estadoKey =
    !estadoFilter || estadoFilter === 'all' ? 'todos-estados' : String(estadoFilter).replace(/_/g, '-');
  return `Manusilva-Propostas-${yearKey}-${tipoKey}-${estadoKey}.csv`;
}

/** CSV com separador «;» e BOM UTF-8 — abre correctamente no Excel (PT). */
export function buildOrcamentoAuditCsv(rows = []) {
  const header = [
    'Data referência',
    'Ano',
    'Tipo proposta',
    'Cliente',
    'NIF',
    'Nº orçamento',
    'OP',
    'Estado proposta',
    'Resposta cliente',
    'Data resposta',
    'Data envio',
    'Valor total (EUR)',
    'E-mail destinatário',
    'Técnico',
    'Origem',
    'Pedido / observações',
  ];
  const lines = [header.join(';')];

  for (const row of rows) {
    lines.push(
      [
        row.date || '',
        row.year || '',
        row.tipoLabel || '',
        row.cliente || '',
        row.nif || '',
        row.numeroOrcamento || '',
        row.op || '',
        row.estado || '',
        row.respostaCliente || '',
        row.respostaClienteEm || '',
        row.enviadoEm || '',
        row.total != null ? String(row.total).replace('.', ',') : '',
        row.emailDestinatario || '',
        row.tecnico || '',
        row.origem || '',
        row.pedido || '',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }

  return `\uFEFF${lines.join('\n')}`;
}

export function downloadOrcamentoAuditCsv(rows, options = {}) {
  const content = buildOrcamentoAuditCsv(rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildOrcamentoAuditCsvFilename(options);
  link.click();
  URL.revokeObjectURL(url);
}
