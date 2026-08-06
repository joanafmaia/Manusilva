/**
 * Estado da proposta comercial MS.015 (fila RH).
 */

import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import {
  markOrcamentoAceitePendingBilling,
  clearOrcamentoBillingOnClienteRecusa,
} from './orcamento-billing-workflow.js';
import { reportOrcamentoGuardado, reportOrcamentoPorPreparar } from './pedido-orcamento.js';
import { formatInterventionDatePt } from './report-intervention-date.js';

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

/** Data local AAAA-MM-DD para inputs type=date. */
export function todayLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte ISO / AAAA-MM-DD / DD/MM/AAAA → AAAA-MM-DD para o input. */
export function toLocalDateInputValue(raw) {
  const pure = String(raw ?? '').trim();
  if (!pure) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(pure)) return pure.slice(0, 10);
  const parts = pure.split(/[/-]/);
  if (parts.length === 3 && parts[0].length !== 4) {
    const [d, m, y] = parts;
    if (y?.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  const parsed = Date.parse(pure);
  if (!Number.isNaN(parsed)) return todayLocalDateInputValue(new Date(parsed));
  return '';
}

/**
 * Normaliza data de aceite/recusa para ISO.
 * @param {unknown} value
 * @param {{ fallbackNow?: boolean }} [options]
 */
export function normalizeRespostaClienteEm(value, { fallbackNow = true } = {}) {
  const pure = String(value ?? '').trim();
  if (!pure) return fallbackNow ? new Date().toISOString() : null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(pure)) {
    const [y, m, d] = pure.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(pure) && !Number.isNaN(Date.parse(pure))) {
    return new Date(pure).toISOString();
  }

  const input = toLocalDateInputValue(pure);
  if (input) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toISOString();
  }

  return fallbackNow ? new Date().toISOString() : null;
}

export function formatOrcamentoRespostaDataLabel(reportOrMeta, { empty = '' } = {}) {
  const meta =
    reportOrMeta?.data?.orcamento && typeof reportOrMeta.data.orcamento === 'object'
      ? reportOrMeta.data.orcamento
      : reportOrMeta;
  const formatted = formatInterventionDatePt(meta?.respostaClienteEm);
  return formatted || empty;
}

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
 * Diálogo leve para escolher a data de aceite/recusa (lista RH).
 * @returns {Promise<string|null>} AAAA-MM-DD ou null se cancelar
 */
export function promptOrcamentoRespostaData({
  resposta = 'aceite',
  defaultDate = todayLocalDateInputValue(),
} = {}) {
  const isAceite = String(resposta).toLowerCase() === ORCAMENTO_RESPOSTA.ACEITE;
  const title = isAceite ? 'Data de aceite' : 'Data de recusa';
  const confirmLabel = isAceite ? 'Marcar aceite' : 'Marcar recusada';

  return new Promise((resolve) => {
    const existing = document.querySelector('.orc-resposta-date-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'orc-resposta-date-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
      <div class="orc-resposta-date-dialog glass-card">
        <h3 class="orc-resposta-date-dialog__title">${title}</h3>
        <p class="orc-resposta-date-dialog__hint text-muted">
          Indique a data em que o cliente ${isAceite ? 'aceitou' : 'recusou'} a proposta.
        </p>
        <label class="orc-resposta-date-dialog__field">
          <span>Data</span>
          <input type="date" class="review-orc-input" data-orc-resposta-date value="${defaultDate}" required />
        </label>
        <div class="orc-resposta-date-dialog__actions">
          <button type="button" class="btn-outline btn-sm" data-orc-resposta-cancel>Cancelar</button>
          <button type="button" class="btn-${isAceite ? 'success' : 'danger'} btn-sm" data-orc-resposta-confirm>${confirmLabel}</button>
        </div>
      </div>`;

    const finish = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    overlay.querySelector('[data-orc-resposta-cancel]')?.addEventListener('click', () => finish(null));
    overlay.querySelector('[data-orc-resposta-confirm]')?.addEventListener('click', () => {
      const input = overlay.querySelector('[data-orc-resposta-date]');
      const value = String(input?.value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        input?.focus();
        return;
      }
      finish(value);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    queueMicrotask(() => overlay.querySelector('[data-orc-resposta-date]')?.focus());
  });
}

/**
 * @param {string} reportId
 * @param {'aceite' | 'recusada' | '' | null} resposta
 * @param {{ respostaClienteEm?: string | Date | null }} [options]
 */
export async function setOrcamentoRespostaCliente(reportId, resposta, options = {}) {
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

  const respostaClienteEm = valid
    ? normalizeRespostaClienteEm(
        options.respostaClienteEm ?? options.date ?? meta.respostaClienteEm,
        { fallbackNow: true },
      )
    : null;

  const saved = await updateRelatorio(reportId, {
    data: {
      orcamento: {
        ...meta,
        respostaCliente: valid,
        respostaClienteEm,
      },
    },
  });

  if (saved) mergeReportInCache(saved);

  if (valid === ORCAMENTO_RESPOSTA.ACEITE) {
    const { reportIsFolhaObraOrcamento, handleOrcamentoRespostaForFolhaObra } =
      await import('./folha-obra-orcamento.js');
    if (reportIsFolhaObraOrcamento(saved)) {
      await handleOrcamentoRespostaForFolhaObra(saved);
    } else {
      await markOrcamentoAceitePendingBilling(reportId);
    }
  } else if (valid === ORCAMENTO_RESPOSTA.RECUSADA || !valid) {
    await clearOrcamentoBillingOnClienteRecusa(reportId);
  }

  return saved;
}

export { reportOrcamentoPorPreparar };
