/**
 * Painel RH — propostas comerciais MS.015 (pedidos de orçamento).
 */

import {
  getClient,
  getJob,
  getReport,
  getReportsSnapshot,
  escapeHtml,
  showToast,
  cancelPedidoOrcamentoReport,
} from '../app.js';
import { getClientName } from '../client-display.js';
import { openOrcamentoModal } from '../orcamento-modal.js';
import { formatOrdemLabel } from '../report-review-ui.js';
import {
  getPedidoOrcamentoDetalhe,
  getReportOrcamentoPdfUrl,
  getReportTechnicalPdfUrl,
  isRhOrcamentoQueueReport,
  openOrcamentoStorageUrl,
  reportIsStandaloneOrcamento,
  reportOrcamentoPorPreparar,
} from '../pedido-orcamento.js';
import {
  openNovaPropostaModal,
  reportOrcamentoQueueLabel,
} from '../orcamento-standalone.js';
import { getReportOrcamentoMeta } from '../orcamento-linhas.js';
import {
  getReportReclamacaoGarantia,
} from '../orcamento-reclamacao-garantia.js';
import {
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  ORCAMENTO_TIPO_PROPOSTA_OPTIONS,
  resolveOrcamentoReferenceYear,
} from '../orcamento-tipo-proposta.js';
import { buildOrcamentoAuditSummary, downloadOrcamentoAuditCsv } from '../orcamento-audit.js';
import { dedupeReportsForDisplay } from '../relatorios-db.js';
import {
  formatOrcamentoRespostaDataLabel,
  orcamentoAguardaRespostaCliente,
  ORCAMENTO_RESPOSTA,
  resolveOrcamentoWorkflowClass,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  setOrcamentoRespostaCliente,
  todayLocalDateInputValue,
  toLocalDateInputValue,
} from '../orcamento-workflow.js';
import { ensureFolhasObraLoadedSafe } from '../folhas-obra-db.js';
import {
  bindFolhaObraRhSection,
  renderFolhaObraRhSection,
} from './folha-obra-rh.js';
import { reportIsFolhaObraOrcamento } from '../folha-obra-orcamento.js';
import {
  ORCAMENTO_ORIGEM_OPTIONS,
  reportMatchesOrcamentoOrigem,
  resolveOrcamentoOrigem,
} from '../orcamento-origem.js';
import {
  formatOrcamentoLoteNumeros,
  filterOrcamentoLoteReports,
  isOrcamentoLoteEnviado,
  isOrcamentoLotePendente,
  sendOrcamentoLoteForClient,
} from '../orcamento-email-lote.js';
import { getSession } from '../session.js';
import {
  captureAdminMainScroll,
  restoreAdminMainScroll,
  replaceSectionHtml,
} from '../admin-ui-stability.js';
import { msIconHtml } from '../ui-icons.js';

let mountRoot = null;
/** Fila principal: em_preparacao | enviada | aceite | recusada | todas */
let activeFilter = 'em_preparacao';
let tipoFilter = 'all';
let origemFilter = 'all';
let selectedClientId = null;
/** true quando a pasta de um cliente está aberta (inclui «Sem cliente» com id ''). */
let clientPastaOpen = false;
let searchQuery = '';
let exportYear = String(new Date().getFullYear());
let exportTipoFilter = 'all';
let exportEstadoFilter = 'all';
let highlightReportId = null;
let searchDebounce = null;

const EXPORT_ESTADO_OPTIONS = [
  { value: 'all', label: 'Todos os estados' },
  { value: 'por_preparar', label: 'Por preparar' },
  { value: 'guardada', label: 'Guardadas' },
  { value: 'enviada', label: 'Enviadas (aguardam resposta)' },
  { value: 'aceite', label: 'Aceites' },
  { value: 'recusada', label: 'Recusadas' },
];

function reportIsEmPreparacao(report) {
  if (reportOrcamentoPorPreparar(report)) return true;
  return resolveOrcamentoWorkflowStatus(report) === 'guardada';
}

function reportMatchesActiveQueue(report) {
  if (activeFilter === 'todas') return true;
  if (activeFilter === 'em_preparacao') return reportIsEmPreparacao(report);
  return resolveOrcamentoWorkflowStatus(report) === activeFilter;
}

function listOrcamentoReports() {
  return dedupeReportsForDisplay(
    getReportsSnapshot()
      .filter((report) => isRhOrcamentoQueueReport(report))
      .sort((a, b) => {
        const da = String(a.approvedAt || a.submittedAt || '');
        const db = String(b.approvedAt || b.submittedAt || '');
        return db.localeCompare(da);
      }),
  );
}

function filterOrcamentoReports(reports) {
  let rows = reports.filter(reportMatchesActiveQueue);

  if (tipoFilter && tipoFilter !== 'all') {
    rows = rows.filter((report) => getOrcamentoTipoProposta(report) === tipoFilter);
  }

  if (origemFilter && origemFilter !== 'all') {
    rows = rows.filter((report) => reportMatchesOrcamentoOrigem(report, origemFilter));
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((report) => {
    const client = getClient(report.clientId);
    const values = report?.data?.values || {};
    const job = report.jobId ? getJob(report.jobId) : null;
    const clientName = getClientName(client, values).toLowerCase();
    const op = formatOrdemLabel(job).toLowerCase();
    const numero = String(getReportOrcamentoMeta(report)?.numeroFormatado || '').toLowerCase();
    const tipo = formatOrcamentoTipoPropostaLabel(getOrcamentoTipoProposta(report)).toLowerCase();
    const origem = resolveOrcamentoOrigem(report).label.toLowerCase();
    return (
      clientName.includes(q) ||
      op.includes(q) ||
      numero.includes(q) ||
      tipo.includes(q) ||
      origem.includes(q)
    );
  });
}

/** Agrupa propostas filtradas por cliente (pasta). */
export function groupOrcamentoReportsByClient(reports = []) {
  const map = new Map();
  reports.forEach((report) => {
    const cid = String(report?.clientId || '').trim() || '__sem_cliente__';
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(report);
  });
  return [...map.entries()]
    .map(([clientId, rows]) => {
      const sample = rows[0];
      const client = clientId === '__sem_cliente__' ? null : getClient(clientId);
      const values = sample?.data?.values || {};
      const name =
        clientId === '__sem_cliente__'
          ? 'Sem cliente'
          : getClientName(client, values) || client?.name || client?.Nome || 'Cliente';
      const pendentes = rows.filter(isOrcamentoLotePendente);
      const enviadas = rows.filter(isOrcamentoLoteEnviado);
      return {
        clientId: clientId === '__sem_cliente__' ? '' : clientId,
        name,
        client,
        rows,
        pendentes,
        enviadas,
        email: String(client?.email || client?.['E-mail'] || '').trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

function countByWorkflow(reports) {
  const aceiteReports = reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'aceite');
  const emPreparacao = reports.filter(reportIsEmPreparacao).length;
  return {
    em_preparacao: emPreparacao,
    por_preparar: reports.filter(reportOrcamentoPorPreparar).length,
    guardada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'guardada').length,
    enviada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'enviada').length,
    aceite: aceiteReports.length,
    aceite_faturacao: aceiteReports.filter((r) => !reportIsFolhaObraOrcamento(r)).length,
    recusada: reports.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'recusada').length,
    todas: reports.length,
  };
}

function reportStatusLabel(report) {
  return reportOrcamentoQueueLabel(report);
}

function renderOrigemBadge(report) {
  const origem = resolveOrcamentoOrigem(report);
  const short =
    origem.id === 'rh' ? 'RH' : origem.id === 'folha' ? 'Oficina' : 'Pedido';
  return `<span class="faturacao-visit-badge orcamentos-origem orcamentos-origem--${escapeHtml(origem.id)}" title="${escapeHtml(origem.label)}">${escapeHtml(short)}</span>`;
}

function formatTipoShort(report) {
  const tipo = getOrcamentoTipoProposta(report);
  if (tipo === 'manutencao_maquina') return 'Manut. máquina';
  if (tipo === 'manutencao_bateria') return 'Manut. bateria';
  return 'Orçamento';
}

function resolveRespostaDateDefault(report) {
  const meta = getReportOrcamentoMeta(report);
  return toLocalDateInputValue(meta?.respostaClienteEm) || todayLocalDateInputValue();
}

function renderInlineRespostaControls(report) {
  const meta = getReportOrcamentoMeta(report);
  if (!meta?.enviadoEm) return '';
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const dateValue = resolveRespostaDateDefault(report);
  const aguarda = orcamentoAguardaRespostaCliente(report);
  if (!aguarda && workflow !== 'aceite' && workflow !== 'recusada') return '';
  /* Data editável só enquanto aguarda resposta — em Aceites/Recusadas a data já está na coluna Proposta. */
  const showDateInput = aguarda;
  return `
    <div class="orcamentos-inline-resposta" data-orc-inline-resposta="${escapeHtml(report.id)}">
      ${
        showDateInput
          ? `<input type="date" class="form-input form-input-sm orcamentos-inline-date" data-orc-resposta-date="${escapeHtml(report.id)}" value="${escapeHtml(dateValue)}" title="Data da resposta" aria-label="Data da resposta" />`
          : ''
      }
      ${
        aguarda || workflow !== 'aceite'
          ? `<button type="button" class="btn-success btn-sm rh-btn-compact faturacao-btn-compact" data-orc-aceite="${escapeHtml(report.id)}" title="Aceite">Aceite</button>`
          : ''
      }
      ${
        aguarda || workflow !== 'recusada'
          ? `<button type="button" class="btn-outline btn-sm rh-btn-compact faturacao-btn-compact orcamentos-btn-recusar" data-orc-recusada="${escapeHtml(report.id)}" title="Recusada">Recusar</button>`
          : ''
      }
    </div>`;
}

function readInlineRespostaDate(reportId) {
  const input = mountRoot?.querySelector(`[data-orc-resposta-date="${CSS.escape(reportId)}"]`);
  const fromInput = input?.value?.trim();
  if (fromInput) return fromInput;
  const report = getReport(reportId);
  const meta = getReportOrcamentoMeta(report);
  return toLocalDateInputValue(meta?.respostaClienteEm) || todayLocalDateInputValue();
}

async function applyInlineResposta(reportId, resposta) {
  const report = getReport(reportId);
  if (resposta === ORCAMENTO_RESPOSTA.ACEITE && report && !getReportReclamacaoGarantia(report)) {
    const ok = window.confirm(
      'A garantia de auditoria ainda não está indicada (Sim/Não).\n\nQuer marcar como aceite na mesma?',
    );
    if (!ok) return;
  }
  const saved = await setOrcamentoRespostaCliente(reportId, resposta, {
    respostaClienteEm: readInlineRespostaDate(reportId),
  });
  if (!saved) return;
  const msg =
    resposta === ORCAMENTO_RESPOSTA.ACEITE
      ? reportIsFolhaObraOrcamento(saved)
        ? 'Proposta aceite. Equipamento libertado para o Armazém.'
        : 'Proposta marcada como aceite. Adicionada à Faturação.'
      : 'Proposta marcada como recusada.';
  showToast(msg, resposta === ORCAMENTO_RESPOSTA.ACEITE ? 'success' : 'info');
  await refreshOrcamentosPanel({ soft: true });
}

function renderFilterHint(counts, total) {
  if (total <= 0) return '';

  const hints = [
    { id: 'em_preparacao', label: 'em preparação', count: counts.em_preparacao },
    { id: 'enviada', label: 'enviadas (aguardam resposta)', count: counts.enviada },
    { id: 'aceite', label: 'aceites', count: counts.aceite },
    { id: 'recusada', label: 'recusadas', count: counts.recusada },
  ].filter(({ id, count }) => id !== activeFilter && count > 0);

  if (!hints.length) return '';

  const chips = hints
    .map(
      ({ id, count, label }) =>
        `<button type="button" class="orcamentos-filter-hint__link" data-orc-filter="${escapeHtml(id)}">${count} ${escapeHtml(label)} — ver</button>`,
    )
    .join('<span class="orcamentos-filter-hint__sep" aria-hidden="true">·</span>');

  return `
    <p class="orcamentos-filter-hint text-muted">
      <span class="orcamentos-filter-hint__label">Neste filtro não há resultados.</span>
      ${chips}
    </p>`;
}

function renderEmptyState(counts, total) {
  if (total <= 0) {
    return `<p class="orcamentos-empty text-muted">Ainda não há propostas. Use <strong>Nova proposta</strong> para começar.</p>`;
  }
  return `
    <div class="orcamentos-empty-wrap">
      <p class="orcamentos-empty text-muted">Nenhuma proposta neste filtro.</p>
      ${renderFilterHint(counts, total)}
    </div>`;
}

function renderMetrics(counts) {
  return `
    <section class="faturacao-kpis rh-section" aria-label="Indicadores de propostas">
      <div class="dashboard-metrics-grid faturacao-kpis-grid faturacao-kpis-grid--3">
        <article class="dashboard-metric-card dashboard-metric-card--warning">
          <p class="dashboard-metric-value">${counts.em_preparacao}</p>
          <p class="dashboard-metric-label">Em preparação</p>
          <p class="faturacao-kpi-sub">Por preparar ou guardadas (lote)</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--primary">
          <p class="dashboard-metric-value">${counts.enviada}</p>
          <p class="dashboard-metric-label">Enviadas</p>
          <p class="faturacao-kpi-sub">Aguardam resposta do cliente</p>
        </article>
        <article class="dashboard-metric-card dashboard-metric-card--success">
          <p class="dashboard-metric-value">${counts.aceite_faturacao}</p>
          <p class="dashboard-metric-label">Aceites</p>
          <p class="faturacao-kpi-sub">Prontas para faturação${
            counts.aceite > counts.aceite_faturacao
              ? ` · ${counts.aceite - counts.aceite_faturacao} oficina`
              : ''
          }</p>
        </article>
      </div>
    </section>`;
}

function renderEstadoTabs(counts) {
  const chips = [
    { id: 'em_preparacao', label: 'Em preparação', count: counts.em_preparacao },
    { id: 'enviada', label: 'Enviadas', count: counts.enviada },
    { id: 'aceite', label: 'Aceites', count: counts.aceite },
    { id: 'recusada', label: 'Recusadas', count: counts.recusada },
    { id: 'todas', label: 'Todas', count: counts.todas },
  ];

  return `
    <div class="faturacao-invoices-tabs" role="tablist" aria-label="Filtrar pastas por estado">
      ${chips
        .map(
          ({ id, label, count }) => `
        <button
          type="button"
          class="faturacao-invoices-tab${activeFilter === id ? ' is-active' : ''}"
          data-orc-filter="${escapeHtml(id)}"
          role="tab"
          aria-selected="${activeFilter === id ? 'true' : 'false'}"
        >
          ${escapeHtml(label)} <span class="faturacao-invoices-tab-count">${count}</span>
        </button>`,
        )
        .join('')}
    </div>`;
}

/** Todas as propostas de um cliente (pasta), independentemente do filtro de fila. */
function listReportsForClient(clientId) {
  const cid = String(clientId || '').trim();
  return listOrcamentoReports().filter((report) => {
    const rc = String(report?.clientId || '').trim();
    return cid ? rc === cid : !rc;
  });
}

function buildClientGroupFromReports(clientId, reports) {
  const groups = groupOrcamentoReportsByClient(reports);
  if (!groups.length) return null;
  const cid = String(clientId || '').trim();
  return (
    groups.find((g) => String(g.clientId || '') === cid) ||
    groups[0] ||
    null
  );
}

function folderMetaParts(group) {
  const prep = group.rows.filter(reportIsEmPreparacao);
  const prontaEnviar = group.pendentes.length;
  const porPreparar = prep.filter(reportOrcamentoPorPreparar).length;
  const guardadas = prep.length - porPreparar;
  const enviadasAguarda = group.rows.filter(
    (r) => resolveOrcamentoWorkflowStatus(r) === 'enviada',
  ).length;
  const aceites = group.rows.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'aceite').length;
  const recusadas = group.rows.filter((r) => resolveOrcamentoWorkflowStatus(r) === 'recusada')
    .length;

  if (activeFilter === 'em_preparacao') {
    const parts = [];
    if (porPreparar) parts.push(`${porPreparar} por preparar`);
    if (guardadas) parts.push(`${guardadas} guardada${guardadas === 1 ? '' : 's'}`);
    if (prontaEnviar) parts.push(`${prontaEnviar} pronta${prontaEnviar === 1 ? '' : 's'} a enviar`);
    return parts.length ? parts.join(' · ') : `${prep.length} em preparação`;
  }
  if (activeFilter === 'enviada') {
    return `${enviadasAguarda || group.rows.length} enviada${(enviadasAguarda || group.rows.length) === 1 ? '' : 's'} · aguardam resposta`;
  }
  if (activeFilter === 'aceite') {
    return `${aceites || group.rows.length} aceite${(aceites || group.rows.length) === 1 ? '' : 's'}`;
  }
  if (activeFilter === 'recusada') {
    return `${recusadas || group.rows.length} recusada${(recusadas || group.rows.length) === 1 ? '' : 's'}`;
  }
  const parts = [];
  if (prep.length) parts.push(`${prep.length} em preparação`);
  if (enviadasAguarda) parts.push(`${enviadasAguarda} enviada${enviadasAguarda === 1 ? '' : 's'}`);
  if (aceites) parts.push(`${aceites} aceite${aceites === 1 ? '' : 's'}`);
  if (recusadas) parts.push(`${recusadas} recusada${recusadas === 1 ? '' : 's'}`);
  return parts.join(' · ') || `${group.rows.length} proposta${group.rows.length === 1 ? '' : 's'}`;
}

function renderTableRow(report) {
  const client = getClient(report.clientId);
  const values = report?.data?.values || {};
  const job = report.jobId ? getJob(report.jobId) : null;
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const meta = getReportOrcamentoMeta(report);
  const detalhe = reportIsStandaloneOrcamento(report) ? '' : getPedidoOrcamentoDetalhe(report);
  const pdfUrl = getReportOrcamentoPdfUrl(report);
  const techPdfUrl = getReportTechnicalPdfUrl(report) || (job?.urlPdf ? String(job.urlPdf).trim() : '');
  const canApproveReport = !reportIsStandaloneOrcamento(report) && report.status === 'pending_review';
  const canCancelPedido = !meta?.enviadoEm;
  const canEditProposal = !meta?.enviadoEm;
  const canViewSentProposal = Boolean(meta?.enviadoEm);
  const isFolha = reportIsFolhaObraOrcamento(report);
  const eliminarTitle = reportIsStandaloneOrcamento(report)
    ? 'Eliminar proposta'
    : isFolha
      ? 'Eliminar orçamento da folha'
      : 'Eliminar pedido de orçamento';
  const highlighted = highlightReportId && report.id === highlightReportId;
  const clientName = getClientName(client, values) || '—';
  const tipoShort = formatTipoShort(report);
  const origemBadge = renderOrigemBadge(report);
  const garantiaKey = getReportReclamacaoGarantia(report);
  const garantiaBadge =
    garantiaKey === 'sim'
      ? `<span class="orcamentos-garantia orcamentos-garantia--sim" title="Avaria / reclamação em garantia">G</span>`
      : garantiaKey === 'nao'
        ? `<span class="orcamentos-garantia orcamentos-garantia--nao" title="Não é reclamação em garantia">—</span>`
        : meta?.enviadoEm || meta?.numeroFormatado
          ? `<span class="orcamentos-garantia orcamentos-garantia--pendente" title="Garantia não indicada">?</span>`
          : '';
  const respostaData = formatOrcamentoRespostaDataLabel(meta);
  const respostaDataBadge =
    respostaData && (workflow === 'aceite' || workflow === 'recusada')
      ? `<span class="orcamentos-resposta-data" title="${workflow === 'aceite' ? 'Data de aceite' : 'Data de recusa'}">${escapeHtml(respostaData)}</span>`
      : '';
  const ordemLabel = formatOrdemLabel(job);
  const showOrdem = ordemLabel && ordemLabel !== '—';
  const rowTitle = [detalhe, reportStatusLabel(report)].filter(Boolean).join(' · ');

  return `
    <tr class="rh-data-table-row orcamentos-row orcamentos-row--compact${highlighted ? ' orcamentos-row--highlight faturacao-row--highlight' : ''}" data-report-id="${escapeHtml(report.id)}" title="${escapeHtml(rowTitle)}">
      <td class="faturacao-cell-ordem">
        ${
          showOrdem
            ? `<code class="orcamentos-ordem rh-ordem-badge faturacao-ordem">${escapeHtml(ordemLabel)}</code>`
            : `<span class="orcamentos-ordem-empty text-muted">—</span>`
        }
      </td>
      <td class="faturacao-cell-client" title="${escapeHtml(clientName)}${detalhe ? ` — ${escapeHtml(detalhe)}` : ''}">
        <span class="faturacao-cell-client-name rh-cell-client-name">${escapeHtml(clientName)}</span>
        <span class="faturacao-row-meta orcamentos-row__meta">
          ${origemBadge}
          <span class="orcamentos-tipo-short">${escapeHtml(tipoShort)}</span>
        </span>
      </td>
      <td class="rh-cell-muted orcamentos-col-proposta">
        <div class="orcamentos-proposta-stack">
          <span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span>
          ${meta?.numeroFormatado ? `<span class="orcamentos-numero">nº ${escapeHtml(meta.numeroFormatado)}</span>` : ''}
          ${garantiaBadge}
          ${respostaDataBadge}
        </div>
      </td>
      <td class="faturacao-col-action">
        <div class="faturacao-billing-actions orcamentos-row-actions">
            ${
              canApproveReport
                ? `<button type="button" class="btn-success btn-sm rh-btn-compact faturacao-btn-compact" data-orc-approve-report="${escapeHtml(report.id)}" title="Aprovar relatório técnico">Aprovar</button>`
                : ''
            }
            ${
              canEditProposal
                ? `<button type="button" class="btn-primary btn-sm rh-btn-compact faturacao-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="${workflow === 'por_preparar' ? 'Preparar proposta' : 'Editar'}">
              ${workflow === 'por_preparar' ? 'Preparar' : 'Editar'}
            </button>`
                : canViewSentProposal
                  ? `<button type="button" class="btn-outline btn-sm rh-btn-compact faturacao-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="Ver proposta">Ver</button>`
                  : ''
            }
            ${
              pdfUrl
                ? `<button type="button" class="btn-outline btn-sm rh-btn-compact faturacao-btn-compact" data-orc-pdf="${escapeHtml(report.id)}" title="PDF da proposta">PDF</button>`
                : ''
            }
          ${renderInlineRespostaControls(report)}
            ${
              techPdfUrl && report.status === 'approved'
                ? `<button type="button" class="btn-ghost btn-sm rh-btn-compact faturacao-btn-compact" data-orc-tech-pdf="${escapeHtml(techPdfUrl)}" title="PDF do relatório técnico">Rel.</button>`
                : ''
            }
            ${
              canCancelPedido
                ? `<button type="button" class="btn-ghost btn-sm rh-btn-compact faturacao-btn-compact faturacao-btn-dismiss orcamentos-btn-eliminar" data-orc-cancel="${escapeHtml(report.id)}" title="${escapeHtml(eliminarTitle)}">×</button>`
                : ''
            }
        </div>
      </td>
    </tr>`;
}

function resolveExportYearOptions(reports) {
  const years = new Set([Number(exportYear) || new Date().getFullYear()]);
  for (const report of reports) {
    const y = resolveOrcamentoReferenceYear(report);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

function renderTipoFilterSelect(id, value, label) {
  const options = [
    `<option value="all"${value === 'all' ? ' selected' : ''}>Todos os tipos</option>`,
    ...ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
      ({ value: v, label: l }) =>
        `<option value="${escapeHtml(v)}"${value === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
    ),
  ].join('');
  return `
    <div class="form-group faturacao-filter-group">
      <label class="form-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select class="form-select" id="${escapeHtml(id)}">${options}</select>
    </div>`;
}

function renderOrigemFilterSelect(id, value, label) {
  const options = [
    `<option value="all"${value === 'all' ? ' selected' : ''}>Todas as origens</option>`,
    ...ORCAMENTO_ORIGEM_OPTIONS.map(
      ({ value: v, label: l }) =>
        `<option value="${escapeHtml(v)}"${value === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
    ),
  ].join('');
  return `
    <div class="form-group faturacao-filter-group">
      <label class="form-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select class="form-select" id="${escapeHtml(id)}">${options}</select>
    </div>`;
}

function renderCompactFilterSelect(id, value, label, optionsHtml) {
  return `
    <label class="faturacao-audit-year-label">
      <span class="form-label">${escapeHtml(label)}</span>
      <select class="form-select-sm" id="${escapeHtml(id)}">${optionsHtml}</select>
    </label>`;
}

function renderFiltersSection(all) {
  const yearOptions = resolveExportYearOptions(all);
  const exportTipoOptions = [
    `<option value="all"${exportTipoFilter === 'all' ? ' selected' : ''}>Todos</option>`,
    ...ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
      ({ value: v, label: l }) =>
        `<option value="${escapeHtml(v)}"${exportTipoFilter === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
    ),
  ].join('');
  const exportEstadoOptions = EXPORT_ESTADO_OPTIONS.map(
    ({ value: v, label: l }) =>
      `<option value="${escapeHtml(v)}"${exportEstadoFilter === v ? ' selected' : ''}>${escapeHtml(l)}</option>`,
  ).join('');

  return `
    <section class="faturacao-filters orcamentos-filters rh-section glass-card" aria-label="Filtros de propostas">
      <div class="faturacao-filters-grid">
        <div class="form-group faturacao-filter-group orcamentos-filter-search">
          <label class="form-label" for="orcamentos-search">Pesquisar</label>
          <input
            type="search"
            class="form-input"
            id="orcamentos-search"
            placeholder="Cliente, OP, tipo ou nº orçamento…"
            value="${escapeHtml(searchQuery)}"
            autocomplete="off"
          />
        </div>
        ${renderTipoFilterSelect('orcamentos-tipo-filter', tipoFilter, 'Tipo de proposta')}
        ${renderOrigemFilterSelect('orcamentos-origem-filter', origemFilter, 'Origem')}
      </div>
      <div class="faturacao-filter-actions">
        ${renderCompactFilterSelect(
          'orcamentos-export-year',
          exportYear,
          'Ano (exportação)',
          yearOptions
            .map(
              (y) =>
                `<option value="${y}"${String(exportYear) === String(y) ? ' selected' : ''}>${y}</option>`,
            )
            .join(''),
        )}
        ${renderCompactFilterSelect('orcamentos-export-tipo', exportTipoFilter, 'Tipo (export.)', exportTipoOptions)}
        ${renderCompactFilterSelect(
          'orcamentos-export-estado',
          exportEstadoFilter,
          'Estado (export.)',
          exportEstadoOptions,
        )}
        <button type="button" class="btn-outline btn-sm" id="orcamentos-export-csv">
          Exportar Excel (CSV)
        </button>
        <button type="button" class="btn-outline btn-sm" id="orcamentos-export-pdf">
          Exportar PDF
        </button>
      </div>
    </section>`;
}

function renderClientFolderCard(group) {
  const cid = escapeHtml(group.clientId || '');
  const meta = folderMetaParts(group);
  const ready = group.pendentes.length;
  return `
    <article class="rh-visita-folder orcamentos-client-folder" role="listitem">
      <header class="rh-visita-folder__header">
        <div class="rh-visita-folder__heading">
          ${msIconHtml('clipboard', 'rh-visita-folder__icon')}
          <div>
            <h3 class="rh-visita-folder__title">${escapeHtml(group.name)}</h3>
            <p class="rh-visita-folder__meta">${escapeHtml(meta)}</p>
            ${
              ready && activeFilter === 'em_preparacao'
                ? `<span class="rh-visita-folder__email-hint rh-visita-folder__email-hint--pending">${ready} pronta${ready === 1 ? '' : 's'} para envio em lote</span>`
                : ''
            }
          </div>
        </div>
        <div class="rh-visita-folder__actions">
          <button type="button" class="btn-primary btn-sm faturacao-btn-compact" data-orc-open-client="${cid}">
            Abrir pasta
          </button>
        </div>
      </header>
    </article>`;
}

function renderClientFolders(groups) {
  if (!groups.length) {
    return '<p class="text-muted orcamentos-client-empty">Nenhuma pasta com estes filtros.</p>';
  }
  return `
    <div class="orcamentos-client-folders" role="list" aria-label="Pastas por cliente">
      ${groups.map(renderClientFolderCard).join('')}
    </div>`;
}

function renderPastaProposalTable(rows, { showClient = false } = {}) {
  if (!rows.length) return '';
  return `
    <div class="rh-table-scroll faturacao-table-wrap">
      <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact orcamentos-table orcamentos-table--dense">
        <thead>
          <tr>
            <th scope="col">OP</th>
            ${showClient ? '<th scope="col">Cliente</th>' : '<th scope="col">Tipo</th>'}
            <th scope="col">Proposta</th>
            <th scope="col" class="faturacao-col-action">Ação</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((report) => (showClient ? renderTableRow(report) : renderPastaTableRow(report))).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPastaTableRow(report) {
  const job = report.jobId ? getJob(report.jobId) : null;
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const meta = getReportOrcamentoMeta(report);
  const detalhe = reportIsStandaloneOrcamento(report) ? '' : getPedidoOrcamentoDetalhe(report);
  const pdfUrl = getReportOrcamentoPdfUrl(report);
  const techPdfUrl = getReportTechnicalPdfUrl(report) || (job?.urlPdf ? String(job.urlPdf).trim() : '');
  const canApproveReport = !reportIsStandaloneOrcamento(report) && report.status === 'pending_review';
  const canCancelPedido = !meta?.enviadoEm;
  const canEditProposal = !meta?.enviadoEm;
  const canViewSentProposal = Boolean(meta?.enviadoEm);
  const isFolha = reportIsFolhaObraOrcamento(report);
  const eliminarTitle = reportIsStandaloneOrcamento(report)
    ? 'Eliminar proposta'
    : isFolha
      ? 'Eliminar orçamento da folha'
      : 'Eliminar pedido de orçamento';
  const highlighted = highlightReportId && report.id === highlightReportId;
  const tipoShort = formatTipoShort(report);
  const origemBadge = renderOrigemBadge(report);
  const garantiaKey = getReportReclamacaoGarantia(report);
  const garantiaBadge =
    garantiaKey === 'sim'
      ? `<span class="orcamentos-garantia orcamentos-garantia--sim" title="Avaria / reclamação em garantia">G</span>`
      : garantiaKey === 'nao'
        ? `<span class="orcamentos-garantia orcamentos-garantia--nao" title="Não é reclamação em garantia">—</span>`
        : meta?.enviadoEm || meta?.numeroFormatado
          ? `<span class="orcamentos-garantia orcamentos-garantia--pendente" title="Garantia não indicada">?</span>`
          : '';
  const respostaData = formatOrcamentoRespostaDataLabel(meta);
  const respostaDataBadge =
    respostaData && (workflow === 'aceite' || workflow === 'recusada')
      ? `<span class="orcamentos-resposta-data" title="${workflow === 'aceite' ? 'Data de aceite' : 'Data de recusa'}">${escapeHtml(respostaData)}</span>`
      : '';
  const ordemLabel = formatOrdemLabel(job);
  const showOrdem = ordemLabel && ordemLabel !== '—';
  const rowTitle = [detalhe, reportStatusLabel(report)].filter(Boolean).join(' · ');

  return `
    <tr class="rh-data-table-row orcamentos-row orcamentos-row--compact${highlighted ? ' orcamentos-row--highlight faturacao-row--highlight' : ''}" data-report-id="${escapeHtml(report.id)}" title="${escapeHtml(rowTitle)}">
      <td class="faturacao-cell-ordem">
        ${
          showOrdem
            ? `<code class="orcamentos-ordem rh-ordem-badge faturacao-ordem">${escapeHtml(ordemLabel)}</code>`
            : `<span class="orcamentos-ordem-empty text-muted">—</span>`
        }
      </td>
      <td class="faturacao-cell-client" title="${escapeHtml(detalhe || tipoShort)}">
        <span class="faturacao-cell-client-name rh-cell-client-name">${escapeHtml(tipoShort)}</span>
        <span class="faturacao-row-meta orcamentos-row__meta">${origemBadge}</span>
      </td>
      <td class="rh-cell-muted orcamentos-col-proposta">
        <div class="orcamentos-proposta-stack">
          <span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span>
          ${meta?.numeroFormatado ? `<span class="orcamentos-numero">nº ${escapeHtml(meta.numeroFormatado)}</span>` : ''}
          ${garantiaBadge}
          ${respostaDataBadge}
        </div>
      </td>
      <td class="faturacao-col-action">
        <div class="faturacao-billing-actions orcamentos-row-actions">
            ${
              canApproveReport
                ? `<button type="button" class="btn-success btn-sm rh-btn-compact faturacao-btn-compact" data-orc-approve-report="${escapeHtml(report.id)}" title="Aprovar relatório técnico">Aprovar</button>`
                : ''
            }
            ${
              canEditProposal
                ? `<button type="button" class="btn-primary btn-sm rh-btn-compact faturacao-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="${workflow === 'por_preparar' ? 'Preparar proposta' : 'Editar'}">
              ${workflow === 'por_preparar' ? 'Preparar' : 'Editar'}
            </button>`
                : canViewSentProposal
                  ? `<button type="button" class="btn-outline btn-sm rh-btn-compact faturacao-btn-compact" data-orc-open="${escapeHtml(report.id)}" title="Ver proposta">Ver</button>`
                  : ''
            }
            ${
              pdfUrl
                ? `<button type="button" class="btn-outline btn-sm rh-btn-compact faturacao-btn-compact" data-orc-pdf="${escapeHtml(report.id)}" title="PDF da proposta">PDF</button>`
                : ''
            }
          ${renderInlineRespostaControls(report)}
            ${
              techPdfUrl && report.status === 'approved'
                ? `<button type="button" class="btn-ghost btn-sm rh-btn-compact faturacao-btn-compact" data-orc-tech-pdf="${escapeHtml(techPdfUrl)}" title="PDF do relatório técnico">Rel.</button>`
                : ''
            }
            ${
              canCancelPedido
                ? `<button type="button" class="btn-ghost btn-sm rh-btn-compact faturacao-btn-compact faturacao-btn-dismiss orcamentos-btn-eliminar" data-orc-cancel="${escapeHtml(report.id)}" title="${escapeHtml(eliminarTitle)}">×</button>`
                : ''
            }
        </div>
      </td>
    </tr>`;
}

function renderClientPasta(group) {
  if (!group) {
    return '<p class="text-muted">Cliente não encontrado.</p>';
  }

  const allClientRows = group.rows;
  const emPreparacao = allClientRows.filter(reportIsEmPreparacao);
  const enviadas = allClientRows.filter(isOrcamentoLoteEnviado);
  const pendentes = filterOrcamentoLoteReports(allClientRows, group.clientId, { mode: 'pendentes' });
  const reenvio = filterOrcamentoLoteReports(allClientRows, group.clientId, { mode: 'reenvio' });
  const pendNumeros = formatOrcamentoLoteNumeros(pendentes);
  const defaultEmail = escapeHtml(group.email || '');
  const canNova = Boolean(group.clientId);

  return `
    <div class="orcamentos-client-pasta" data-orc-client-pasta="${escapeHtml(group.clientId || '')}">
      <div class="orcamentos-client-pasta__head">
        <button type="button" class="btn-outline btn-sm" data-orc-client-back>← Pastas</button>
        <div class="orcamentos-client-pasta__title-wrap">
          <h3 class="ms-h2 faturacao-section-title orcamentos-client-pasta__name">${escapeHtml(group.name)}</h3>
        </div>
        ${
          canNova
            ? `<button type="button" class="btn-primary btn-sm orcamentos-client-pasta__new" data-orc-new data-orc-new-client="${escapeHtml(group.clientId)}" data-orc-new-name="${escapeHtml(group.name)}">
                Nova proposta
              </button>`
            : ''
        }
      </div>

      <label class="review-orc-field orcamentos-client-pasta__email">
        <span>E-mail do cliente (lote)</span>
        <input
          type="text"
          class="form-input"
          data-orc-lote-email
          value="${defaultEmail}"
          placeholder="compras@empresa.pt"
          autocomplete="email"
        />
      </label>

      <section class="orcamentos-pasta-section orcamentos-pasta-section--prep" aria-label="Em preparação">
        <header class="orcamentos-pasta-section__head">
          <div>
            <h4 class="orcamentos-pasta-section__title">Em preparação <span class="badge-count">${emPreparacao.length}</span></h4>
            <p class="text-muted orcamentos-pasta-section__hint">Prepare, guarde e adicione mais propostas. Depois envie tudo num único e-mail.</p>
          </div>
          <button
            type="button"
            class="btn-success btn-sm"
            data-orc-lote-send
            data-orc-lote-mode="pendentes"
            ${pendentes.length ? '' : 'disabled'}
            title="${
              pendentes.length
                ? `Enviar ${pendentes.length} proposta(s): ${pendNumeros.join(', ')}`
                : 'Guarde pelo menos uma proposta preparada para enviar o lote'
            }"
          >
            Enviar lote${pendentes.length ? ` (${pendentes.length})` : ''}
          </button>
        </header>
        ${
          emPreparacao.length
            ? renderPastaProposalTable(emPreparacao)
            : '<p class="text-muted orcamentos-pasta-section__empty">Nada em preparação. Use <strong>Nova proposta</strong> para adicionar.</p>'
        }
      </section>

      <section class="orcamentos-pasta-section orcamentos-pasta-section--sent" aria-label="Já enviadas">
        <header class="orcamentos-pasta-section__head">
          <div>
            <h4 class="orcamentos-pasta-section__title">Já enviadas <span class="badge-count">${enviadas.length}</span></h4>
            <p class="text-muted orcamentos-pasta-section__hint">Aguardam resposta ou já foram respondidas.</p>
          </div>
          ${
            reenvio.length
              ? `<button
                  type="button"
                  class="btn-outline btn-sm"
                  data-orc-lote-send
                  data-orc-lote-mode="reenvio"
                  title="Reenviar ${reenvio.length} proposta(s) já enviadas"
                >
                  Reenviar (${reenvio.length})
                </button>`
              : ''
          }
        </header>
        ${
          enviadas.length
            ? renderPastaProposalTable(enviadas)
            : '<p class="text-muted orcamentos-pasta-section__empty">Ainda não há propostas enviadas neste cliente.</p>'
        }
      </section>
    </div>`;
}

function renderPropostasSection(rows, counts, totalAll) {
  const groups = groupOrcamentoReportsByClient(rows);
  const selectedGroup = clientPastaOpen
    ? buildClientGroupFromReports(selectedClientId, listReportsForClient(selectedClientId))
    : null;

  const body = clientPastaOpen
    ? renderClientPasta(selectedGroup)
    : groups.length || totalAll > 0
      ? renderClientFolders(groups)
      : renderEmptyState(counts, totalAll);

  const sectionTitle = selectedGroup ? selectedGroup.name : 'Pastas por cliente';
  const sectionCount = clientPastaOpen
    ? selectedGroup?.rows?.length || 0
    : groups.length;

  return `
    <section class="faturacao-invoices-section orcamentos-table-section rh-section glass-card" aria-label="Propostas comerciais">
      ${
        clientPastaOpen
          ? ''
          : `<div class="faturacao-invoices-head">
        <div class="orcamentos-section-head">
          <h3 class="ms-h2 faturacao-section-title">${escapeHtml(sectionTitle)} <span class="badge-count">${sectionCount}</span></h3>
        </div>
        ${renderEstadoTabs(counts)}
        <p class="text-muted orcamentos-kanban-lead">Abra a pasta do cliente: prepare → guarde → adicione outra → envie o lote.</p>
      </div>`
      }
      ${body}
    </section>`;
}

async function exportOrcamentoAuditPdf() {
  const all = listOrcamentoReports();
  const summary = buildOrcamentoAuditSummary(all, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });

  if (!summary.metrics.proposalCount) {
    showToast('Não há propostas guardadas para exportar com estes filtros.', 'info');
    return;
  }

  const btn = mountRoot?.querySelector('#orcamentos-export-pdf');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'A gerar PDF…';
  }

  try {
    const { generateOrcamentoAuditPdfBlob } = await import('../pdf-orcamento-audit.js');
    const { downloadPdfBlob } = await import('../pdf-preview.js');
    const { blob, filename } = await generateOrcamentoAuditPdfBlob({
      summary,
      rows: summary.rows,
      year: exportYear,
      tipoFilter: exportTipoFilter,
      estadoFilter: exportEstadoFilter,
    });
    downloadPdfBlob(blob, filename);
    showToast('PDF de propostas exportado.', 'success', 4000);
  } catch (err) {
    console.error('[Orçamentos] PDF anual:', err);
    showToast(err?.message || 'Não foi possível gerar o PDF.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Exportar PDF';
    }
  }
}

function exportOrcamentoAuditCsv() {
  const all = listOrcamentoReports();
  const summary = buildOrcamentoAuditSummary(all, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });

  if (!summary.metrics.proposalCount) {
    showToast('Não há propostas para exportar com estes filtros.', 'info');
    return;
  }

  downloadOrcamentoAuditCsv(summary.rows, {
    year: exportYear,
    tipoFilter: exportTipoFilter,
    estadoFilter: exportEstadoFilter,
  });
  showToast(
    `${summary.metrics.proposalCount} proposta(s) exportada(s) para Excel (CSV).`,
    'success',
    5000,
  );
}

function renderPanel() {
  const all = listOrcamentoReports();
  const counts = countByWorkflow(all);
  const rows = filterOrcamentoReports(all);

  return `
    <div class="orcamentos-panel faturacao-panel rh-admin-panel dashboard-panel-inner">
      ${renderFolhaObraRhSection()}
      <header class="faturacao-header orcamentos-header rh-section">
        <div class="orcamentos-header__top">
          <div>
            <h2 class="ms-h2">Orçamentos / Propostas comerciais</h2>
            <p class="text-muted faturacao-lead orcamentos-lead">
              Fluxo: abrir pasta do cliente → preparar / guardar propostas → enviar o lote num único e-mail. Separado do relatório de intervenção.
            </p>
          </div>
          <button type="button" class="btn-primary btn-touch orcamentos-new-btn" data-orc-new>
            Nova proposta
          </button>
        </div>
      </header>
      ${renderFiltersSection(all)}
      ${renderMetrics(counts)}
      ${renderPropostasSection(rows, counts, all.length)}
    </div>`;
}

function bindPanelEvents() {
  if (!mountRoot || mountRoot.dataset.orcBound === '1') return;
  mountRoot.dataset.orcBound = '1';

  mountRoot.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-orc-filter]');
    if (filterBtn) {
      activeFilter = filterBtn.dataset.orcFilter || 'todas';
      selectedClientId = null;
      clientPastaOpen = false;
      softRefreshOrcamentosPanel().catch(console.error);
      return;
    }

    const openClientBtn = e.target.closest('[data-orc-open-client]');
    if (openClientBtn) {
      selectedClientId = String(openClientBtn.getAttribute('data-orc-open-client') ?? '');
      clientPastaOpen = true;
      softRefreshOrcamentosPanel().catch(console.error);
      return;
    }

    const backClientBtn = e.target.closest('[data-orc-client-back]');
    if (backClientBtn) {
      selectedClientId = null;
      clientPastaOpen = false;
      softRefreshOrcamentosPanel().catch(console.error);
      return;
    }

    const loteSendBtn = e.target.closest('[data-orc-lote-send]');
    if (loteSendBtn) {
      if (loteSendBtn.disabled) return;
      const mode = loteSendBtn.dataset.orcLoteMode === 'reenvio' ? 'reenvio' : 'pendentes';
      const pasta = loteSendBtn.closest('[data-orc-client-pasta]');
      const clientId = pasta?.dataset?.orcClientPasta || selectedClientId;
      if (!clientId) {
        showToast('Cliente não identificado.', 'error');
        return;
      }
      const emailInput = pasta?.querySelector('[data-orc-lote-email]');
      const to = String(emailInput?.value || '').trim();
      const all = listOrcamentoReports();
      const lote = filterOrcamentoLoteReports(all, clientId, { mode });
      const numeros = formatOrcamentoLoteNumeros(lote);
      const ok = window.confirm(
        mode === 'reenvio'
          ? `Reenviar ${lote.length} proposta(s) para ${to || 'o e-mail do cliente'}?\n\n${numeros.join(', ') || '—'}`
          : `Enviar ${lote.length} proposta(s) para ${to || 'o e-mail do cliente'}?\n\n${numeros.join(', ') || '—'}`,
      );
      if (!ok) return;
      loteSendBtn.disabled = true;
      void sendOrcamentoLoteForClient(all, clientId, { to, mode })
        .then((result) => {
          if (result) softRefreshOrcamentosPanel().catch(console.error);
        })
        .catch((err) => {
          console.error('[Orçamentos] Lote e-mail:', err);
          showToast(err?.message || 'Falha ao enviar o lote de propostas.', 'error', 9000);
        })
        .finally(() => {
          loteSendBtn.disabled = false;
        });
      return;
    }

    const openBtn = e.target.closest('[data-orc-open]');
    if (openBtn) {
      const report = getReport(openBtn.dataset.orcOpen);
      if (!report) {
        showToast('Relatório não encontrado.', 'error');
        return;
      }
      openOrcamentoModal(report, {
        onUpdated: async (updated) => {
          const { syncFolhaObraFromOrcamentoReport } = await import('../folha-obra-orcamento.js');
          await syncFolhaObraFromOrcamentoReport(updated);
          refreshOrcamentosPanel().catch(console.error);
        },
      });
      return;
    }

    const approveReportBtn = e.target.closest('[data-orc-approve-report]');
    if (approveReportBtn) {
      const reportId = approveReportBtn.dataset.orcApproveReport;
      if (!reportId) return;
      void import('../report-review-rh-modal.js').then(({ openRhReviewModal }) =>
        openRhReviewModal(reportId, {
          onApproved: () => refreshOrcamentosPanel().catch(console.error),
          onRejected: () => refreshOrcamentosPanel().catch(console.error),
        }),
      );
      return;
    }

    const techPdfBtn = e.target.closest('[data-orc-tech-pdf]');
    if (techPdfBtn) {
      const url = techPdfBtn.dataset.orcTechPdf;
      if (url) openOrcamentoStorageUrl(url);
      else showToast('PDF do relatório técnico não disponível.', 'warning');
      return;
    }

    const cancelBtn = e.target.closest('[data-orc-cancel]');
    if (cancelBtn) {
      const reportId = cancelBtn.dataset.orcCancel;
      if (!reportId) return;
      const report = getReport(reportId);
      const client = report ? getClient(report.clientId) : null;
      const job = report?.jobId ? getJob(report.jobId) : null;
      const label = client?.name || client?.Nome || formatOrdemLabel(job) || 'este pedido';
      if (reportIsStandaloneOrcamento(report) || reportIsFolhaObraOrcamento(report)) {
        void cancelPedidoOrcamentoReport(reportId).then((done) => {
          if (done) refreshOrcamentosPanel().catch(console.error);
        });
        return;
      }
      const ok = window.confirm(
        `Eliminar o pedido de orçamento de ${label}?\n\nO relatório técnico mantém-se. A proposta comercial por preparar será removida.`,
      );
      if (!ok) return;
      void cancelPedidoOrcamentoReport(reportId).then((done) => {
        if (done) refreshOrcamentosPanel().catch(console.error);
      });
      return;
    }

    const newBtn = e.target.closest('[data-orc-new]');
    if (newBtn) {
      const presetClientId = newBtn.dataset.orcNewClient || selectedClientId || '';
      const presetNome = newBtn.dataset.orcNewName || '';
      openNovaPropostaModal({
        clientId: presetClientId,
        clienteNome: presetNome,
        onCreated: (report) => {
          highlightReportId = report?.id || null;
          if (report?.clientId) {
            selectedClientId = String(report.clientId);
            clientPastaOpen = true;
          }
          refreshOrcamentosPanel().catch(console.error);
        },
      });
      return;
    }

    const aceiteBtn = e.target.closest('[data-orc-aceite]');
    if (aceiteBtn) {
      const reportId = aceiteBtn.dataset.orcAceite;
      if (!reportId) return;
      void applyInlineResposta(reportId, ORCAMENTO_RESPOSTA.ACEITE).catch((err) =>
        showToast(err?.message || 'Erro ao guardar.', 'error'),
      );
      return;
    }

    const recusadaBtn = e.target.closest('[data-orc-recusada]');
    if (recusadaBtn) {
      const reportId = recusadaBtn.dataset.orcRecusada;
      if (!reportId) return;
      void applyInlineResposta(reportId, ORCAMENTO_RESPOSTA.RECUSADA).catch((err) =>
        showToast(err?.message || 'Erro ao guardar.', 'error'),
      );
      return;
    }

    const pdfBtn = e.target.closest('[data-orc-pdf]');
    if (pdfBtn) {
      const report = getReport(pdfBtn.dataset.orcPdf);
      const url = report ? getReportOrcamentoPdfUrl(report) : null;
      if (!url) {
        showToast('Gere e guarde a proposta antes de abrir o PDF.', 'warning');
        return;
      }
      openOrcamentoStorageUrl(url);
      return;
    }

    const exportBtn = e.target.closest('#orcamentos-export-pdf');
    if (exportBtn) {
      void exportOrcamentoAuditPdf();
      return;
    }

    const exportCsvBtn = e.target.closest('#orcamentos-export-csv');
    if (exportCsvBtn) {
      exportOrcamentoAuditCsv();
    }
  });

  mountRoot.addEventListener('input', (e) => {
    if (e.target.id !== 'orcamentos-search') return;
    searchQuery = e.target.value || '';
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      softRefreshOrcamentosPanel().catch(console.error);
    }, 280);
  });

  mountRoot.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'orcamentos-tipo-filter') {
      tipoFilter = target.value || 'all';
      softRefreshOrcamentosPanel().catch(console.error);
      return;
    }
    if (target.id === 'orcamentos-origem-filter') {
      origemFilter = target.value || 'all';
      softRefreshOrcamentosPanel().catch(console.error);
      return;
    }
    if (target.id === 'orcamentos-export-year') {
      exportYear = target.value || String(new Date().getFullYear());
      return;
    }
    if (target.id === 'orcamentos-export-tipo') {
      exportTipoFilter = target.value || 'all';
      return;
    }
    if (target.id === 'orcamentos-export-estado') {
      exportEstadoFilter = target.value || 'all';
    }
  });
}

function applyHighlight() {
  if (!mountRoot || !highlightReportId) return;
  const row = mountRoot.querySelector(`[data-report-id="${CSS.escape(highlightReportId)}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  window.setTimeout(() => {
    highlightReportId = null;
    row?.classList.remove('orcamentos-row--highlight');
  }, 4000);
}

/** Atualiza KPIs + pastas/pasta + oficina sem destruir filtros (preserva foco e scroll). */
async function softRefreshOrcamentosPanel() {
  if (!mountRoot) return;
  if (!mountRoot.querySelector('.orcamentos-panel')) {
    await refreshOrcamentosPanel({ soft: false });
    return;
  }

  const scrollY = captureAdminMainScroll();
  const all = listOrcamentoReports();
  const counts = countByWorkflow(all);
  const rows = filterOrcamentoReports(all);

  replaceSectionHtml(mountRoot, '.folha-obra-rh-section', renderFolhaObraRhSection());
  replaceSectionHtml(mountRoot, '.faturacao-kpis', renderMetrics(counts));
  replaceSectionHtml(
    mountRoot,
    '.orcamentos-table-section',
    renderPropostasSection(rows, counts, all.length),
  );
  restoreAdminMainScroll(scrollY);
  applyHighlight();
}

export async function refreshOrcamentosPanel(options = {}) {
  if (!mountRoot) return;
  const { soft = true } = options;

  if (soft && mountRoot.querySelector('.orcamentos-panel')) {
    await softRefreshOrcamentosPanel();
    return;
  }

  const scrollY = captureAdminMainScroll();
  mountRoot.innerHTML = renderPanel();
  restoreAdminMainScroll(scrollY);
  applyHighlight();
}

export function queueOrcamentoReportFocus(reportId) {
  highlightReportId = reportId || null;
}

export async function initOrcamentosPanel(root) {
  mountRoot = root;
  try {
    const { clearStuckUiOverlays } = await import('../toast-modal.js');
    clearStuckUiOverlays();
  } catch {
    /* ignore */
  }
  bindPanelEvents();
  await ensureFolhasObraLoadedSafe(true);
  bindFolhaObraRhSection(root, {
    session: getSession(),
    onRefresh: () => refreshOrcamentosPanel().catch(console.error),
  });
  return refreshOrcamentosPanel({ soft: false });
}

export function countOrcamentosPorPreparar() {
  return listOrcamentoReports().filter(reportIsEmPreparacao).length;
}
