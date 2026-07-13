/**
 * Etiquetas auxiliares nos cartões da lista RH (equipamento, faturação).
 */

import { normalizeEquipamentoIdentity } from './cliente-equipamentos.js';
import { isPendingBilling } from './billing-workflow.js';
import { isPendingOrcamentoBilling } from './orcamento-billing-workflow.js';
import { isServicoPendingBilling } from './servicos-billing-workflow.js';
import { resolveServicoIdForReport } from './servicos-panel-utils.js';
import { getServico } from './servicos-db.js';
import { escapeHtml } from './html-utils.js';

function norm(value) {
  return String(value ?? '').trim();
}

/** Texto curto para distinguir máquinas/baterias no cartão RH. */
export function formatReportEquipmentHint(report) {
  if (!report) return '';
  const values = report.data?.values || {};
  const identity = normalizeEquipamentoIdentity(report.serviceType, values);
  const parts = [];

  if (norm(identity.numero_serie)) parts.push(`Série ${identity.numero_serie}`);
  if (norm(identity.tipo)) parts.push(identity.tipo);
  else if (norm(identity.marca) || norm(identity.modelo)) {
    parts.push([identity.marca, identity.modelo].filter(Boolean).join(' '));
  }
  if (norm(identity.n_interno)) parts.push(`Nº int. ${identity.n_interno}`);

  if (!parts.length && norm(values.maquina)) parts.push(values.maquina);
  if (!parts.length && norm(values.matricula)) parts.push(`Mat. ${values.matricula}`);

  return parts.join(' · ');
}

export function renderRhReportEquipmentHint(report) {
  const hint = formatReportEquipmentHint(report);
  if (!hint) return '';
  return `<span class="rh-list-item__equip-hint" title="${escapeHtml(hint)}">${escapeHtml(hint)}</span>`;
}

export function reportShowsPendingBillingBadge(report) {
  if (!report || report.status !== 'approved') return false;

  const servicoId = resolveServicoIdForReport(report);
  if (servicoId) {
    const servico = getServico(servicoId);
    return Boolean(servico && isServicoPendingBilling(servico));
  }

  return isPendingBilling(report) || isPendingOrcamentoBilling(report);
}

export function renderRhReportBillingBadge(report) {
  if (!reportShowsPendingBillingBadge(report)) return '';

  const orcamento = isPendingOrcamentoBilling(report);
  const cls = orcamento
    ? 'rh-list-item__billing-badge rh-list-item__billing-badge--orcamento'
    : 'rh-list-item__billing-badge';
  const label = orcamento ? 'Orçamento por faturar' : 'Por faturar';
  return `<span class="${cls}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}
