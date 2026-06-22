/**
 * Painel principal RH — métricas (aba calendário) e cadastro de clientes (aba clientes).
 */

import { ensureProductionCatalog, getClientFromCatalog } from '../clients-catalog.js';
import {
  escapeHtml,
  getJob,
  getServiceType,
  getTechnician,
  openModal,
  closeModal,
  showToast,
} from '../app.js';
import { computeDashboardMetrics, renderMetricsSection } from './dashboard-metrics.js';
import { renderClientFormSection, mountClientForm } from './rh-client-form.js';
import { mountClientsList } from './clients-list.js';
import { getClientSubmittedReports } from './historico-cliente.js';

let metricsRoot = null;

export async function initMetricsPanel(root, onAction) {
  metricsRoot = root;
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  await refreshMetricsPanel(onAction);
}

export async function refreshMetricsPanel(onAction) {
  if (!metricsRoot) return;
  await ensureProductionCatalog();
  metricsRoot.innerHTML = renderMetricsSection(computeDashboardMetrics());
  bindMetricsPanelActions(metricsRoot, onAction);
}

function bindMetricsPanelActions(root, handlers = {}) {
  if (!root || !handlers) return;

  const trigger = (action) => {
    const fn = handlers[action];
    if (typeof fn === 'function') fn();
  };

  root.querySelectorAll('[data-metric-action]').forEach((el) => {
    const action = el.dataset.metricAction;
    el.addEventListener('click', () => trigger(action));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger(action);
      }
    });
  });
}

/** @deprecated Use initMetricsPanel — mantido para compatibilidade */
export async function initDashboardPanel(root) {
  await initMetricsPanel(root);
}

/** @deprecated Use refreshMetricsPanel */
export async function refreshDashboardPanel() {
  await refreshMetricsPanel();
}

let clientsRoot = null;

/* ─── Modal «Adicionar Cliente» ─── */

function openAddClientModal() {
  const overlay = openModal('🏢 Adicionar Cliente', renderClientFormSection({ modal: true }));

  mountClientForm(overlay, {
    onSuccess: () => {
      closeModal();
      showToast('Cliente adicionado com sucesso.', 'success');
      refreshMetricsPanel().catch(console.error);
      refreshClientsListMount().catch(console.error);
    },
  });
}

/* ─── Modal «Ver Histórico» do cliente ─── */

const HISTORY_STATUS_META = {
  approved: { cls: 'approved', label: 'Concluído' },
  pending_review: { cls: 'pending', label: 'Pendente RH' },
  rejected: { cls: 'rejected', label: 'Rejeitado' },
  draft: { cls: 'draft', label: 'Em aberto' },
};

function formatClientHistoryDate(report) {
  const job = report.jobId ? getJob(report.jobId) : null;
  const raw = String(report.submittedAt || job?.date || '').split('T')[0];
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

function renderClientHistoryPdfButton(report, job) {
  if (job?.urlPdf) {
    return `<button type="button" class="btn-outline btn-sm client-history-modal-pdf-btn" data-open-pdf-url="${escapeHtml(job.urlPdf)}" title="Ver PDF" aria-label="Ver PDF do relatório">PDF</button>`;
  }
  return `<button type="button" class="btn-outline btn-sm client-history-modal-pdf-btn" data-download-pdf="${escapeHtml(report.id)}" title="Ver PDF" aria-label="Ver PDF do relatório">PDF</button>`;
}

function renderClientHistoryRows(reports) {
  if (!reports.length) {
    return '<p class="text-muted empty-inline">Sem relatórios registados para este cliente.</p>';
  }

  return `
    <div class="tech-job-rows">
      ${reports
        .map((report) => {
          const meta = HISTORY_STATUS_META[report.status] || HISTORY_STATUS_META.draft;
          const service = getServiceType(report.serviceType);
          const tech = getTechnician(report.technicianId);
          const job = report.jobId ? getJob(report.jobId) : null;
          return `
            <div class="tech-job-row tech-job-row--${meta.cls} client-history-modal-row">
              <span class="tech-job-row-date">${escapeHtml(formatClientHistoryDate(report))}</span>
              <span class="tech-job-row-service">${escapeHtml(service?.label || report.serviceType || '—')}${tech?.name ? ` · ${escapeHtml(tech.name)}` : ''}</span>
              <div class="client-history-modal-row-actions">
                ${renderClientHistoryPdfButton(report, job)}
                <span class="work-state-badge work-state-badge--${meta.cls}">${meta.label}</span>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function bindClientHistoryModalActions(overlay) {
  if (!overlay) return;

  overlay.querySelectorAll('[data-download-pdf]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const reportId = btn.dataset.downloadPdf;
      if (!reportId) return;
      const { downloadReportPDF } = await import('../report-review-modal.js');
      downloadReportPDF(reportId).catch(console.error);
    });
  });

  overlay.querySelectorAll('[data-open-pdf-url]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.openPdfUrl;
      if (url) window.open(url, '_blank');
    });
  });
}

export function openClientHistoryModal(clientId) {
  const record = getClientFromCatalog(clientId);
  const nome = record?.Nome || 'Cliente';
  const reports = getClientSubmittedReports(clientId);

  const content = `
    <p class="text-muted tech-history-modal-summary">
      ${reports.length} relatório${reports.length === 1 ? '' : 's'} registado${reports.length === 1 ? '' : 's'} para ${escapeHtml(nome)}.
    </p>
    <div class="tech-history-modal-list">${renderClientHistoryRows(reports)}</div>
  `;

  const overlay = openModal(`🗂 Histórico — ${nome}`, content);
  bindClientHistoryModalActions(overlay);
}

/* ─── Painel principal de Clientes / Empresas ─── */

async function refreshClientsListMount() {
  const listMount = clientsRoot?.querySelector('[data-clients-list-mount]');
  if (!listMount) return;
  await mountClientsList(listMount, {
    onClientHistory: (clientId) => openClientHistoryModal(clientId),
  });
}

export async function initClientsHubPanel(root) {
  clientsRoot = root;
  if (!clientsRoot) return;

  clientsRoot.innerHTML = `
    <div class="clients-hub" data-clients-hub>
      <div data-clients-list-mount></div>
    </div>
  `;

  const addBtn = document.getElementById('btn-add-client');
  if (addBtn && addBtn.dataset.bound !== 'true') {
    addBtn.dataset.bound = 'true';
    addBtn.addEventListener('click', openAddClientModal);
  }

  await refreshClientsListMount();
}
