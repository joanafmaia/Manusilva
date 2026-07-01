/**
 * Estado da proposta comercial MS.015 (fila RH).
 */

import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { reportOrcamentoGuardado, reportOrcamentoPorPreparar } from './pedido-orcamento.js';

export const ORCAMENTO_RESPOSTA = {
  ACEITE: 'aceite',
  RECUSADA: 'recusada',
};

const WORKFLOW_LABELS = {
  por_preparar: 'Por preparar',
  guardada: 'Guardada',
  enviada: 'Enviada',
  aceite: 'Aceite',
  recusada: 'Recusada',
};

const WORKFLOW_CLASSES = {
  por_preparar: 'orcamentos-status--pending',
  guardada: 'orcamentos-status--saved',
  enviada: 'orcamentos-status--ok',
  aceite: 'orcamentos-status--aceite',
  recusada: 'orcamentos-status--recusada',
};

/** @param {object | null | undefined} report */
export function resolveOrcamentoWorkflowStatus(report) {
  const meta = getReportOrcamentoMeta(report);
  const resposta = String(meta?.respostaCliente || '').trim().toLowerCase();
  if (resposta === ORCAMENTO_RESPOSTA.ACEITE) return 'aceite';
  if (resposta === ORCAMENTO_RESPOSTA.RECUSADA) return 'recusada';
  if (meta?.enviadoEm) return 'enviada';
  if (reportOrcamentoGuardado(report)) return 'guardada';
  return 'por_preparar';
}

export function resolveOrcamentoWorkflowLabel(status) {
  return WORKFLOW_LABELS[status] || WORKFLOW_LABELS.por_preparar;
}

export function resolveOrcamentoWorkflowClass(status) {
  return WORKFLOW_CLASSES[status] || WORKFLOW_CLASSES.por_preparar;
}

/** Proposta já enviada ao cliente e ainda sem decisão registada. */
export function orcamentoAguardaRespostaCliente(report) {
  const meta = getReportOrcamentoMeta(report);
  if (!meta?.enviadoEm) return false;
  const resposta = String(meta?.respostaCliente || '').trim();
  return !resposta;
}

/**
 * @param {string} reportId
 * @param {'aceite' | 'recusada' | '' | null} resposta
 */
export async function setOrcamentoRespostaCliente(reportId, resposta) {
  const { getReport } = await import('./app.js');
  const { updateRelatorio, mergeReportInCache } = await import('./relatorios-db.js');

  const report = getReport(reportId);
  if (!report) return null;

  const meta = getReportOrcamentoMeta(report) || {};
  if (!meta.enviadoEm && resposta) {
    throw new Error('Só pode marcar aceite ou recusada depois de enviar a proposta.');
  }

  const normalized = String(resposta || '').trim().toLowerCase();
  const valid =
    normalized === ORCAMENTO_RESPOSTA.ACEITE || normalized === ORCAMENTO_RESPOSTA.RECUSADA
      ? normalized
      : null;

  const saved = await updateRelatorio(reportId, {
    data: {
      orcamento: {
        ...meta,
        respostaCliente: valid,
        respostaClienteEm: valid ? new Date().toISOString() : null,
      },
    },
  });

  if (saved) mergeReportInCache(saved);
  return saved;
}

export { reportOrcamentoPorPreparar };
