/**
 * Painel do técnico — detalhe de visita (serviço) com vários relatórios.
 */

import {
  escapeHtml,
  formatDateLong,
  getClient,
  getServiceType,
  openModal,
  closeModal,
  showToast,
  SERVICE_TYPES,
} from './app.js';
import { getServico } from './servicos-db.js';
import {
  canRemoveServicoReport,
  getAvailableServiceTypesForServico,
  getReportsForServico,
  isServicoReportTechnicianComplete,
} from './servicos-panel-utils.js';
import { renderWorkStateBadge, resolveCalendarEventState } from './calendar-event-state.js';
import { getServicoVisitSubmitState } from './servicos-submit-workflow.js';
import { openServicoVisitSubmit } from './tech-servico-signatures.js';

function reportStatusLabel(report) {
  if (!report) return 'Sem relatório';
  if (report.status === 'draft' && isServicoReportTechnicianComplete(report)) {
    return 'Concluído — aguarda visita';
  }
  if (report.status === 'draft') return 'Rascunho';
  if (report.status === 'pending_review') return 'À espera de aprovação';
  if (report.status === 'approved') return 'Aprovado';
  if (report.status === 'rejected') return 'Rejeitado — corrigir';
  return report.status;
}

function reportActionForStatus(status) {
  if (status === 'approved') return 'view';
  if (status === 'scheduled') return 'start';
  return 'continue';
}

async function openServicoReportFormLazy(servicoId, options) {
  const { openServicoReportForm } = await import('./forms.js');
  await openServicoReportForm(servicoId, options);
}

function formatReportTypeLabel(report, servicoReports) {
  const st = getServiceType(report.serviceType);
  const base = st?.label || report.serviceType;
  const sameType = servicoReports.filter((r) => r.serviceType === report.serviceType);
  if (sameType.length <= 1) return base;
  const idx = sameType.findIndex((r) => String(r.id) === String(report.id)) + 1;
  return `${base} (${idx})`;
}

function buildReportRow(servico, report, servicoReports) {
  const st = getServiceType(report.serviceType);
  const typeLabel = formatReportTypeLabel(report, servicoReports);
  const pseudoJob = {
    id: servico.id,
    clientId: servico.clientId,
    serviceType: report.serviceType,
    date: servico.date,
    status: report.status === 'rejected' ? 'rejected' : 'scheduled',
    rejectionNote: report.rejectionNote,
  };
  const state = resolveCalendarEventState(pseudoJob, report);
  const action = reportActionForStatus(report.status);
  const btnLabel =
    action === 'view' ? 'Ver' : action === 'start' ? 'Iniciar' : report.status === 'rejected' ? 'Corrigir' : 'Continuar';

  const rejection =
    report.status === 'rejected' && report.rejectionNote
      ? `<p class="text-muted" style="margin:0.35rem 0 0;font-size:0.8125rem">↩ ${escapeHtml(report.rejectionNote)}</p>`
      : '';

  const removeBtn = canRemoveServicoReport(report)
    ? `<button
        type="button"
        class="btn-danger btn-sm tech-servico-report-remove"
        data-servico-id="${escapeHtml(servico.id)}"
        data-report-id="${escapeHtml(report.id || '')}"
        title="Remover relatório"
        aria-label="Remover relatório"
      >Remover</button>`
    : '';

  return `
    <div class="tech-servico-report-row">
      <div class="tech-servico-report-row__main">
        <div class="tech-servico-report-row__top">
          <span>${st?.icon || '🔧'} ${escapeHtml(typeLabel)}</span>
          ${renderWorkStateBadge(pseudoJob, report)}
        </div>
        <p class="text-muted" style="margin:0.25rem 0 0;font-size:0.8125rem">${escapeHtml(reportStatusLabel(report))}</p>
        ${rejection}
      </div>
      <div class="tech-servico-report-row__actions">
        <button
          type="button"
          class="btn-secondary btn-sm tech-servico-report-open"
          data-servico-id="${escapeHtml(servico.id)}"
          data-service-type="${escapeHtml(report.serviceType)}"
          data-report-id="${escapeHtml(report.id || '')}"
          data-action="${escapeHtml(action)}"
        >${escapeHtml(btnLabel)}</button>
        ${removeBtn}
      </div>
    </div>
  `;
}

function openAddReportPicker(servicoId, overlay) {
  const available = getAvailableServiceTypesForServico(servicoId, SERVICE_TYPES);
  if (!available.length) {
    showToast('Nenhum tipo de relatório disponível neste dispositivo.', 'warning', 5000);
    return;
  }

  const options = available
    .map(
      (t) =>
        `<button type="button" class="btn-ghost tech-servico-type-pick" data-service-type="${escapeHtml(t.id)}" style="justify-content:flex-start;width:100%;margin-bottom:0.35rem">${t.icon} ${escapeHtml(t.label)}</button>`,
    )
    .join('');

  const picker = openModal(
    'Adicionar relatório',
    `<p class="text-muted" style="margin-bottom:0.75rem">Escolha o tipo de relatório para esta visita:</p>${options}`,
    '<button type="button" class="btn-ghost" id="cancel-add-report">Cancelar</button>',
  );

  picker.querySelector('#cancel-add-report')?.addEventListener('click', closeModal);
  picker.querySelectorAll('.tech-servico-type-pick').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const serviceType = btn.dataset.serviceType;
      closeModal();
      closeModal();
      try {
        await openServicoReportFormLazy(servicoId, { serviceType, createNew: true });
      } catch (err) {
        console.error('[Tech] Novo relatório:', err);
        showToast('Não foi possível abrir o formulário.', 'error');
      }
    });
  });
}

/**
 * Modal com lista de relatórios do serviço e opção de adicionar novo.
 * @param {string} servicoId
 */
export async function openTechServicoDetail(servicoId) {
  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Serviço não encontrado. Atualize o calendário.', 'warning', 6000);
    return;
  }

  const client = getClient(servico.clientId);
  const reports = getReportsForServico(servicoId);
  const reportsHtml = reports.length
    ? reports.map((r) => buildReportRow(servico, r, reports)).join('')
    : '<p class="text-muted">Ainda não há relatórios nesta visita. Adicione o primeiro abaixo.</p>';

  const canAdd = SERVICE_TYPES.length > 0;
  const visitState = getServicoVisitSubmitState(servicoId);
  const canConclude = visitState.canSubmit;

  const content = `
    <dl class="job-detail-grid" style="margin-bottom:1rem">
      <div><dt>Cliente</dt><dd>${escapeHtml(client?.name || '—')}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateLong(servico.date))}</dd></div>
    </dl>
    <h4 style="margin:0 0 0.5rem;font-size:0.9375rem">Relatórios desta visita</h4>
    <div class="tech-servico-reports-list">${reportsHtml}</div>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="tech-servico-close">Fechar</button>
    ${canConclude ? '<button type="button" class="btn-primary" id="tech-servico-conclude">Concluir visita</button>' : ''}
    ${canAdd ? '<button type="button" class="btn-secondary" id="tech-servico-add">+ Adicionar relatório</button>' : ''}
  `;

  const overlay = openModal(
    `📋 ${client?.name || 'Visita'} — ${formatDateLong(servico.date)}`,
    content,
    actions,
  );

  overlay.querySelector('#tech-servico-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#tech-servico-conclude')?.addEventListener('click', () => {
    closeModal();
    void openServicoVisitSubmit(servicoId);
  });
  overlay.querySelector('#tech-servico-add')?.addEventListener('click', () => {
    openAddReportPicker(servicoId, overlay);
  });

  overlay.querySelectorAll('.tech-servico-report-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const opts = {
        serviceType: btn.dataset.serviceType,
        reportId: btn.dataset.reportId || undefined,
        viewOnly: action === 'view',
        editPending: action === 'continue',
      };
      closeModal();
      try {
        await openServicoReportFormLazy(btn.dataset.servicoId, opts);
      } catch (err) {
        console.error('[Tech] Abrir relatório do serviço:', err);
        showToast('Não foi possível abrir o relatório.', 'error');
      }
    });
  });

  overlay.querySelectorAll('.tech-servico-report-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.servicoId;
      const rid = btn.dataset.reportId;
      if (!sid || !rid) return;
      try {
        const { removeServicoReport } = await import('./servicos-report-workflow.js');
        const removed = await removeServicoReport(sid, rid);
        if (removed) {
          closeModal();
          await openTechServicoDetail(sid);
        }
      } catch (err) {
        console.error('[Tech] Remover relatório do serviço:', err);
        showToast('Não foi possível remover o relatório.', 'error');
      }
    });
  });
}
