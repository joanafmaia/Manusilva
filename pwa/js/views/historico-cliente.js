/**
 * Histórico do Cliente — ficha da empresa + relatórios de bateria submetidos.
 */

import { getClient, getDB, getServiceType, getTechnician, escapeHtml, formatDateLong } from '../app.js';
import { getClientFromCatalog } from '../clients-catalog.js';
import { mapClientToLegacy } from '../mock_data.js';
import { openReportReviewModal, downloadReportPDF } from '../report-review-modal.js';

/** Tipos de relatório técnico de bateria (MS. 061) */
export const BATTERY_REPORT_SERVICE_TYPES = new Set([
  'reparacao_avarias_bateria',
  'manutencao_preventiva_bateria',
  'manutencao_baterias_grandes',
]);

const SUBMITTED_STATUSES = new Set(['pending_review', 'approved']);

function resolveClientMeta(clientId) {
  const legacy = getClient(clientId) || mapClientToLegacy(getClientFromCatalog(clientId) || { id: clientId });
  const nome = legacy.name || legacy.Nome || '—';
  const nif = legacy.nif || legacy.NIF || '—';
  const email = legacy.email || legacy['E-mail'] || '';
  const phone = legacy.phone || legacy.Telemovel || legacy.telemovel || '';
  const contact = [email, phone].filter(Boolean).join(' · ') || '—';
  return { legacy, nome, nif, contact };
}

function clientIdAliases(clientId) {
  const { legacy } = resolveClientMeta(clientId);
  return new Set(
    [clientId, legacy?.id, legacy?.NIF, legacy?.nif, legacy?.name, legacy?.Nome].filter(Boolean).map(String),
  );
}

function reportBelongsToClient(report, clientId) {
  const aliases = clientIdAliases(clientId);
  return aliases.has(String(report.clientId));
}

function filterClientReports(clientId, { batteryOnly = true } = {}) {
  const db = getDB();
  return (db.reports || [])
    .filter((r) => {
      if (!reportBelongsToClient(r, clientId)) return false;
      if (!SUBMITTED_STATUSES.has(r.status)) return false;
      if (batteryOnly && !BATTERY_REPORT_SERVICE_TYPES.has(r.serviceType)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

export function getClientBatteryReports(clientId) {
  return filterClientReports(clientId, { batteryOnly: true });
}

export function getClientSubmittedReports(clientId) {
  return filterClientReports(clientId, { batteryOnly: false });
}

function statusBadge(status) {
  if (status === 'approved') return '<span class="status-pill status-pill--green">Aprovado</span>';
  if (status === 'pending_review') return '<span class="status-pill status-pill--amber">Pendente RH</span>';
  return `<span class="status-pill">${escapeHtml(status)}</span>`;
}

/** @type {{ onBack?: () => void, showWorkflowActions?: boolean, batteryOnly?: boolean, onDownloadPDF?: (reportId: string) => void } | null} */
let activeNavOptions = null;

export const HistoricoClienteView = {
  /**
   * @param {string} clientId
   * @param {{ batteryOnly?: boolean }} [renderOptions]
   */
  render(clientId, renderOptions = {}) {
    const batteryOnly = renderOptions.batteryOnly !== false;
    const { nome, nif, contact } = resolveClientMeta(clientId);
    const reports = batteryOnly ? getClientBatteryReports(clientId) : getClientSubmittedReports(clientId);
    const reportsTitle = batteryOnly
      ? 'Relatórios técnicos de bateria'
      : 'Intervenções anteriores';
    const reportsHint = batteryOnly
      ? 'Do mais recente ao mais antigo — clique na linha para rever ou use PDF para descarregar.'
      : 'Do mais recente ao mais antigo — consulte o que foi feito em visitas anteriores.';
    const emptyMsg = batteryOnly
      ? 'Ainda não existem relatórios de bateria submetidos para esta empresa.'
      : 'Ainda não existem relatórios submetidos para esta empresa.';

    const listHtml = reports.length
      ? reports
          .map((r) => {
            const service = getServiceType(r.serviceType);
            const tech = getTechnician(r.technicianId);
            const dateStr = r.submittedAt ? formatDateLong(String(r.submittedAt).split('T')[0]) : '—';
            return `
          <li class="client-history-item glass-card" data-report-id="${escapeHtml(r.id)}">
            <button type="button" class="client-history-item-main" data-open-report="${escapeHtml(r.id)}">
              <span class="client-history-date">${escapeHtml(dateStr)}</span>
              <span class="client-history-service">${escapeHtml(service?.label || r.serviceType)}</span>
              <span class="client-history-tech text-muted">${escapeHtml(tech?.name || '—')}</span>
              ${statusBadge(r.status)}
            </button>
            <button type="button" class="btn-outline btn-sm client-history-pdf" data-download-pdf="${escapeHtml(r.id)}" title="Descarregar PDF" aria-label="Descarregar PDF">
              PDF
            </button>
          </li>
        `;
          })
          .join('')
      : `<p class="text-muted client-history-empty">${emptyMsg}</p>`;

    return `
      <div class="client-history-page" data-client-history data-client-id="${escapeHtml(clientId)}">
        <header class="client-history-header">
          <button type="button" class="btn-ghost client-history-back" data-history-back>&larr; Voltar</button>
          <h2 class="client-history-title">Histórico do Cliente</h2>
        </header>

        <section class="client-history-company glass-card">
          <h3 class="dashboard-section-title">Dados da empresa</h3>
          <dl class="client-history-dl">
            <div><dt>Nome</dt><dd>${escapeHtml(nome)}</dd></div>
            <div><dt>NIF</dt><dd>${escapeHtml(nif)}</dd></div>
            <div><dt>Contacto</dt><dd>${escapeHtml(contact)}</dd></div>
          </dl>
        </section>

        <section class="client-history-reports">
          <h3 class="dashboard-section-title">${escapeHtml(reportsTitle)}</h3>
          <p class="text-muted client-history-reports-hint">${escapeHtml(reportsHint)}</p>
          <ul class="client-history-list" role="list">${listHtml}</ul>
        </section>
      </div>
    `;
  },

  /**
   * @param {string} clientId
   * @param {{ onBack?: () => void, showWorkflowActions?: boolean, batteryOnly?: boolean, onDownloadPDF?: (reportId: string) => void }} [options]
   */
  init(clientId, options = {}) {
    const onDownloadPDF =
      typeof options.onDownloadPDF === 'function'
        ? options.onDownloadPDF
        : (reportId) => downloadReportPDF(reportId);

    activeNavOptions = options;
    const batteryOnly = options.batteryOnly !== false;
    const root = document.querySelector('[data-client-history]');
    if (!root) return;

    const showWorkflow = options.showWorkflowActions !== false;

    root.querySelector('[data-history-back]')?.addEventListener('click', async () => {
      if (typeof options.onBack === 'function') {
        options.onBack();
        return;
      }
      const { restoreClientsDashboard } = await import('./clients-app.js');
      restoreClientsDashboard();
    });

    const refresh = () => {
      const app = document.getElementById('app');
      if (!app) return;
      app.innerHTML = HistoricoClienteView.render(clientId, { batteryOnly });
      HistoricoClienteView.init(clientId, activeNavOptions || options);
    };

    root.querySelectorAll('[data-open-report]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReportReviewModal(btn.dataset.openReport, {
          showWorkflowActions: showWorkflow,
          onApproved: refresh,
          onRejected: refresh,
        });
      });
    });

    root.querySelectorAll('[data-download-pdf]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDownloadPDF(btn.dataset.downloadPdf);
      });
    });
  },
};
