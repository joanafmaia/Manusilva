/**
 * Conflito de dados local vs servidor ao abrir formulário no tablet.
 */

import { getLocalReportDraft, removeLocalReportDraft } from './report-local-storage.js';
import { openModal, closeModal, escapeHtml, formatDate } from './app.js';

function parseTs(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function reportsDifferMeaningfully(local, server) {
  const localSig = JSON.stringify(local?.data?.values || local?.data || {});
  const serverSig = JSON.stringify(server?.data?.values || server?.data || {});
  return localSig !== serverSig;
}

/**
 * Deteta se há conflito entre rascunho local e relatório no servidor.
 * @returns {null | { local, server, reason: string }}
 */
export async function detectReportDataConflict(jobId, serverReport, options = {}) {
  if (!serverReport || options.viewOnly) return null;

  const local = await getLocalReportDraft(jobId);
  if (!local) return null;

  if (serverReport.status === 'approved') return null;

  const localAt = parseTs(local._localSavedAt);
  const serverAt = parseTs(
    serverReport.submittedAt || serverReport.updatedAt || serverReport.approvedAt,
  );

  if (!localAt) return null;

  const differs = reportsDifferMeaningfully(local, serverReport);

  if (serverReport.status === 'pending_review') {
    if (options.editPending && localAt >= serverAt && differs) {
      return {
        local,
        server: serverReport,
        reason: 'O RH já recebeu uma versão, mas o tablet tem alterações mais recentes.',
      };
    }
    if (!options.editPending && differs) {
      return {
        local,
        server: serverReport,
        reason: 'Este relatório já foi enviado para revisão no escritório.',
      };
    }
    return null;
  }

  if (serverReport.status === 'rejected') {
    if (localAt < serverAt && differs) {
      return {
        local,
        server: serverReport,
        reason: 'O RH rejeitou o relatório com notas novas no servidor.',
      };
    }
    return null;
  }

  if (serverAt && localAt < serverAt && differs) {
    return {
      local,
      server: serverReport,
      reason: 'Existem dados mais recentes no servidor.',
    };
  }

  if (localAt > serverAt && differs && serverAt > 0) {
    return {
      local,
      server: serverReport,
      reason: 'O tablet tem um rascunho mais recente que a última sincronização.',
    };
  }

  return null;
}

function formatConflictWhen(iso) {
  if (!iso) return '—';
  const d = String(iso).split('T')[0];
  return formatDate(d) || d;
}

/**
 * Modal: sincronizar (servidor) ou manter local.
 * @returns {Promise<'server' | 'local' | 'cancel'>}
 */
export function promptReportDataConflict(conflict) {
  const { local, server, reason } = conflict;
  const localLabel = formatConflictWhen(local._localSavedAt);
  const serverLabel = formatConflictWhen(
    server.submittedAt || server.updatedAt || server.approvedAt,
  );

  const content = `
    <div class="tech-conflict-dialog">
      <p class="tech-conflict-dialog__lead">${escapeHtml(reason)}</p>
      <p class="text-muted tech-conflict-dialog__hint">
        Escolha qual versão abrir. «Usar servidor» descarta o rascunho local deste trabalho.
      </p>
      <div class="tech-conflict-dialog__options">
        <div class="tech-conflict-option">
          <strong>Tablet</strong>
          <span class="text-muted">Guardado ${escapeHtml(localLabel)}</span>
        </div>
        <div class="tech-conflict-option">
          <strong>Servidor</strong>
          <span class="text-muted">Atualizado ${escapeHtml(serverLabel)}</span>
        </div>
      </div>
      <div class="tech-conflict-dialog__actions">
        <button type="button" class="btn-secondary btn-touch" id="tech-conflict-local">Manter local</button>
        <button type="button" class="btn-primary btn-touch" id="tech-conflict-server">Usar servidor</button>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const overlay = openModal('Dados desatualizados', content, '');

    const finish = (choice) => {
      closeModal();
      resolve(choice);
    };

    overlay.querySelector('#tech-conflict-server')?.addEventListener('click', () => finish('server'));
    overlay.querySelector('#tech-conflict-local')?.addEventListener('click', () => finish('local'));

    const onDismiss = () => finish('cancel');
    overlay.querySelector('.modal-close')?.addEventListener('click', onDismiss, { once: true });
    overlay.addEventListener(
      'click',
      (e) => {
        if (e.target === overlay) onDismiss();
      },
      { once: true },
    );
  });
}

/**
 * Resolve conflito antes de abrir o formulário.
 * @returns {Promise<'default' | 'server' | 'local' | 'cancel'>}
 */
export async function resolveReportOpenConflict(jobId, serverReport, options = {}) {
  const conflict = await detectReportDataConflict(jobId, serverReport, options);
  if (!conflict) return 'default';
  return promptReportDataConflict(conflict);
}

/** Descarta rascunho local após escolha explícita do servidor. */
export async function applyServerConflictChoice(jobId) {
  try {
    await removeLocalReportDraft(jobId);
  } catch {
    /* melhor esforço */
  }
}
