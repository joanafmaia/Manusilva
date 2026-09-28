/**
 * Índice de pesquisa global do painel RH (clientes, OP, faturas, propostas, técnicos).
 */

import { getProductionClientsCatalog } from './clients-catalog.js';
import { getAllTechnicians, getClient, getServiceType } from './entity-lookups.js';
import { getReportsSnapshot } from './relatorios-db.js';
import { getServicosSnapshot } from './servicos-db.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import { getManualInvoicesSnapshot } from './faturas-manuais-db.js';
import { getFolhasObraSnapshot } from './folhas-obra-db.js';
import { formatOpLabel } from './report-review-ui.js';
import { reportIsRhOrcamento } from './pedido-orcamento.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';

function clientName(clientId) {
  const client = getClient(clientId);
  return client?.name || client?.Nome || '';
}

function pushItem(list, item) {
  if (!item?.id || !item.title) return;
  list.push(item);
}

export function buildAdminSearchIndex() {
  const items = [];

  for (const row of getProductionClientsCatalog({ warn: false })) {
    const nome = row.Nome || row.name || '';
    const nif = row.NIF || row.nif || '';
    const email = row['E-mail'] || row.email || '';
    pushItem(items, {
      kind: 'client',
      id: String(row.id),
      title: nome,
      subtitle: [nif, email].filter(Boolean).join(' · '),
      haystack: [nome, nif, email, row.Telemovel, row.telemovel, row.Localidade].filter(Boolean).join(' '),
      action: { type: 'client', clientId: String(row.id) },
    });
  }

  for (const tech of getAllTechnicians()) {
    pushItem(items, {
      kind: 'technician',
      id: String(tech.id),
      title: tech.name || '',
      subtitle: 'Técnico',
      haystack: [tech.name, tech.email, tech.phone].filter(Boolean).join(' '),
      action: { type: 'tab', tab: 'funcionarios' },
    });
  }

  for (const report of getReportsSnapshot()) {
    const nome = clientName(report.clientId);
    const op = formatOpLabel(report.numeroOrdem);
    const service = getServiceType(report.serviceType)?.label || '';
    if (op) {
      pushItem(items, {
        kind: 'report',
        id: String(report.id),
        title: op,
        subtitle: [nome, service].filter(Boolean).join(' · '),
        haystack: [op, nome, service, report.id, report.numeroFatura].filter(Boolean).join(' '),
        action: { type: 'report', reportId: String(report.id), status: report.status },
      });
    }
    if (reportIsRhOrcamento(report)) {
      const meta = getReportOrcamentoMeta(report);
      const title = meta?.numeroFormatado ? `Proposta ${meta.numeroFormatado}` : 'Proposta MS.015';
      pushItem(items, {
        kind: 'orcamento',
        id: `orc-${report.id}`,
        title,
        subtitle: nome,
        haystack: [title, nome, meta?.numeroFormatado, report.id].filter(Boolean).join(' '),
        action: { type: 'orcamento', reportId: String(report.id) },
      });
    }
    if (report.numeroFatura && !report.servicoId) {
      pushItem(items, {
        kind: 'invoice',
        id: `ft-r-${report.id}`,
        title: String(report.numeroFatura),
        subtitle: nome,
        haystack: [report.numeroFatura, nome, op].filter(Boolean).join(' '),
        action: {
          type: 'invoice',
          clientId: String(report.clientId || ''),
          clientNome: nome,
          query: String(report.numeroFatura),
        },
      });
    }
  }

  for (const servico of getServicosSnapshot()) {
    const nome = clientName(servico.clientId);
    const op = formatOpLabel(servico.numeroOrdem);
    pushItem(items, {
      kind: 'servico',
      id: String(servico.id),
      title: op || `Visita ${servico.date || ''}`.trim(),
      subtitle: nome,
      haystack: [op, nome, servico.technicianIds, servico.numeroFatura, servico.date].filter(Boolean).join(' '),
      action: {
        type: 'calendar',
        jobId: String(servico.id),
        visitDate: servico.date || '',
        clientName: nome,
      },
    });
    if (servico.numeroFatura) {
      pushItem(items, {
        kind: 'invoice',
        id: `ft-s-${servico.id}`,
        title: String(servico.numeroFatura),
        subtitle: nome,
        haystack: [servico.numeroFatura, nome, op].filter(Boolean).join(' '),
        action: {
          type: 'invoice',
          clientId: String(servico.clientId || ''),
          clientNome: nome,
          query: String(servico.numeroFatura),
        },
      });
    }
  }

  for (const job of getJobsSnapshot()) {
    if (job.servicoId) continue;
    const nome = clientName(job.clientId);
    const op = formatOpLabel(job.numeroOrdem);
    if (!op && !nome) continue;
    pushItem(items, {
      kind: 'job',
      id: String(job.id),
      title: op || getServiceType(job.serviceType)?.label || 'Trabalho',
      subtitle: nome,
      haystack: [op, nome, job.technicianId, job.serviceType].filter(Boolean).join(' '),
      action: {
        type: 'calendar',
        jobId: String(job.id),
        visitDate: job.date || '',
        clientName: nome,
      },
    });
  }

  for (const invoice of getManualInvoicesSnapshot()) {
    const nome = clientName(invoice.clientId);
    if (!invoice.numeroFatura) continue;
    pushItem(items, {
      kind: 'invoice',
      id: `ft-m-${invoice.id}`,
      title: String(invoice.numeroFatura),
      subtitle: nome || invoice.descricao || 'Fatura avulsa',
      haystack: [invoice.numeroFatura, nome, invoice.descricao].filter(Boolean).join(' '),
      action: {
        type: 'invoice',
        clientId: String(invoice.clientId || ''),
        clientNome: nome,
        query: String(invoice.numeroFatura),
      },
    });
  }

  for (const folha of getFolhasObraSnapshot()) {
    const nome = clientName(folha.clientId);
    if (folha.numeroFatura) {
      pushItem(items, {
        kind: 'invoice',
        id: `ft-f-${folha.id}`,
        title: String(folha.numeroFatura),
        subtitle: nome,
        haystack: [folha.numeroFatura, nome, folha.etq].filter(Boolean).join(' '),
        action: {
          type: 'invoice',
          clientId: String(folha.clientId || ''),
          clientNome: nome,
          query: String(folha.numeroFatura),
        },
      });
    }
    if (folha.etq) {
      pushItem(items, {
        kind: 'folha',
        id: String(folha.id),
        title: `ETQ ${folha.etq}`,
        subtitle: nome,
        haystack: [folha.etq, nome, folha.numeroSerie].filter(Boolean).join(' '),
        action: { type: 'client', clientId: String(folha.clientId || ''), tab: 'visitas' },
      });
    }
  }

  return items;
}
