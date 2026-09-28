/**
 * Actividade do cliente para a ficha-hub (visitas, propostas, faturas, avaliações).
 */

import { sameEntityId } from './entity-id.js';
import { getReportsSnapshot } from './relatorios-db.js';
import { getServicosSnapshot } from './servicos-db.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import { getManualInvoicesSnapshot } from './faturas-manuais-db.js';
import { getFolhasObraSnapshot } from './folhas-obra-db.js';
import { getServiceType } from './entity-lookups.js';
import { formatOpLabel } from './report-review-ui.js';
import { reportIsRhOrcamento } from './pedido-orcamento.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { resolveOrcamentoWorkflowLabel, resolveOrcamentoWorkflowStatus } from './orcamento-workflow.js';
import { describeInvoicePayment } from './faturacao-pagamento.js';
import { fetchAvaliacoesByServicoIds } from './avaliacoes-db.js';

function formatEur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function isoDate(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function belongsToClient(entity, clientId) {
  return sameEntityId(entity?.clientId, clientId);
}

function reportStatusLabel(status) {
  if (status === 'approved') return 'Aprovado';
  if (status === 'pending_review') return 'Pendente';
  if (status === 'rejected') return 'Rejeitado';
  if (status === 'draft') return 'Rascunho';
  return status || '—';
}

function servicoStatusLabel(servico, reports) {
  if (reports.some((r) => r.status === 'rejected')) return 'Rejeitado';
  if (reports.some((r) => r.status === 'pending_review')) return 'Pendente';
  if (reports.length && reports.every((r) => r.status === 'approved')) return 'Aprovado';
  if (servico?.status === 'completed') return 'Concluído';
  return 'Agendado';
}

/**
 * @param {string} clientId
 */
export function collectClientHub(clientId) {
  const reports = getReportsSnapshot().filter((r) => belongsToClient(r, clientId));
  const servicos = getServicosSnapshot().filter((s) => belongsToClient(s, clientId));
  const jobs = getJobsSnapshot().filter((j) => belongsToClient(j, clientId) && !j.servicoId);
  const manuais = getManualInvoicesSnapshot().filter((m) => belongsToClient(m, clientId));
  const folhas = getFolhasObraSnapshot().filter((f) => belongsToClient(f, clientId));

  const visitas = [
    ...servicos.map((servico) => {
      const linked = reports.filter((r) => sameEntityId(r.servicoId, servico.id));
      return {
        kind: 'servico',
        id: servico.id,
        date: isoDate(servico.date),
        title: formatOpLabel(servico.numeroOrdem) || 'Visita',
        subtitle: servico.technicianIds || '',
        status: servicoStatusLabel(servico, linked),
      };
    }),
    ...jobs.map((job) => ({
      kind: 'job',
      id: job.id,
      date: isoDate(job.date),
      title: formatOpLabel(job.numeroOrdem) || getServiceType(job.serviceType)?.label || 'Trabalho',
      subtitle: job.technicianId || '',
      status: reportStatusLabel(job.status),
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const propostas = reports
    .filter((r) => reportIsRhOrcamento(r))
    .map((report) => {
      const meta = getReportOrcamentoMeta(report);
      return {
        kind: 'orcamento',
        id: report.id,
        date: isoDate(report.submittedAt || report.approvedAt),
        title: meta?.numeroFormatado ? `Proposta ${meta.numeroFormatado}` : 'Proposta MS.015',
        subtitle: getServiceType(report.serviceType)?.label || '',
        status: resolveOrcamentoWorkflowLabel(resolveOrcamentoWorkflowStatus(report)),
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const invoiceRows = [];
  for (const servico of servicos) {
    if (!servico.numeroFatura) continue;
    const pay = describeInvoicePayment(servico);
    invoiceRows.push({
      kind: 'servico',
      id: servico.id,
      date: isoDate(servico.dataFatura),
      title: servico.numeroFatura,
      subtitle: formatEur(servico.valorFaturado),
      status: pay.statusLabel || '—',
    });
  }
  for (const report of reports) {
    if (!report.numeroFatura || report.servicoId) continue;
    const pay = describeInvoicePayment(report);
    invoiceRows.push({
      kind: 'report',
      id: report.id,
      date: isoDate(report.dataFatura),
      title: report.numeroFatura,
      subtitle: formatEur(report.valorFaturado),
      status: pay.statusLabel || '—',
    });
  }
  for (const invoice of manuais) {
    if (!invoice.numeroFatura) continue;
    const pay = describeInvoicePayment(invoice);
    invoiceRows.push({
      kind: 'manual',
      id: invoice.id,
      date: isoDate(invoice.dataFatura),
      title: invoice.numeroFatura,
      subtitle: invoice.descricao || formatEur(invoice.valorFaturado),
      status: pay.statusLabel || '—',
    });
  }
  for (const folha of folhas) {
    if (!folha.numeroFatura) continue;
    const pay = describeInvoicePayment(folha);
    invoiceRows.push({
      kind: 'folha_obra',
      id: folha.id,
      date: isoDate(folha.dataFatura),
      title: folha.numeroFatura,
      subtitle: formatEur(folha.valorFaturado),
      status: pay.statusLabel || '—',
    });
  }
  invoiceRows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return {
    visitas,
    propostas,
    faturas: invoiceRows,
    avaliacoes: [],
    counts: {
      visitas: visitas.length,
      propostas: propostas.length,
      faturas: invoiceRows.length,
      avaliacoes: 0,
    },
  };
}

/**
 * @param {string} clientId
 */
export async function loadClientHub(clientId) {
  const hub = collectClientHub(clientId);
  const servicoIds = hub.visitas.filter((item) => item.kind === 'servico').map((item) => item.id);
  try {
    const map = await fetchAvaliacoesByServicoIds(servicoIds);
    hub.avaliacoes = [...map.values()]
      .map((row) => ({
        kind: 'avaliacao',
        id: row.id,
        date: isoDate(row.servicoDate || row.criadoEm),
        title: `${row.emoji} ${row.label}`,
        subtitle: row.comentario || formatOpLabel(row.numeroOrdem) || '',
        status: row.label,
        score: row.score,
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    hub.counts.avaliacoes = hub.avaliacoes.length;
  } catch (err) {
    console.warn('[ClientHub] Avaliações:', err);
  }
  return hub;
}
