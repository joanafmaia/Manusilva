/**
 * Manusilva PWA — Core Architecture
 * Ponto de entrada: re-exports e bootstrap da app.
 */

import { escapeHtml } from './html-utils.js';
import { initLocalDatabase } from './local-db.js';
import { JOB_STATUSES } from './mock_data.js';
import { LoginView } from './views/login.js';
import { AuthService } from './auth.js';
import { normalizeSession } from './session.js';

export { getSupabaseClient } from './supabase-client.js';
export { escapeHtml };
export { sameEntityId, normalizeEntityId } from './entity-id.js';
export { captureError } from './error-monitor.js';
export { APP_SESSION_KEY, clearSession, getSession, normalizeSession } from './session.js';
export { MANUSILVA_LOGO, applyBrandLogo, isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';

export { sincronizarTrabalhosOffline, initTrabalhosOfflineSync } from './trabalhos-offline.js';

/* ─── UI Utilities ─── */

export function statusBadge(status) {
  const s = JOB_STATUSES[status] || JOB_STATUSES.scheduled;
  const variant = s.badgeVariant || 'pending';
  return `<span class="status-badge status-badge--${variant}">${s.label}</span>`;
}

/* ─── Re-exports (compatibilidade com importações existentes) ─── */

export {
  invalidateDbMemoryCache,
  initLocalDatabase,
  getDB,
  saveDB,
  updateDB,
  warmClientsCatalog,
  prepareClientsCatalog,
  warmJobs,
  warmReports,
  warmOperacoes,
  handleFatalDashboardError,
} from './local-db.js';

export {
  ensureFullClientsInStorage,
  getAllClientsList,
} from './clients-catalog-storage.js';

export { requireAuth } from './auth-guard.js';

export {
  getClient,
  getAllTechnicians,
  getTechnician,
  parseTechnicianNamesFromJob,
  getJobTechnicianLabel,
  getPrimaryTechnicianForJob,
  jobAssignedToTechnician,
  getServiceType,
  getForklift,
  getJob,
  getReport,
  getReportForJob,
  resolveJobForForm,
  getJobsForTechnician,
  getAllJobs,
} from './entity-lookups.js';

export { addTechnician } from './technicians-admin.js';

export {
  addClient,
  updateClient,
  syncClientEmailIfChanged,
} from './clients-admin.js';

export {
  isOffline,
  isNetworkOnline,
  canReachServer,
  setOfflineMode,
  queueOfflineAction,
  syncOfflineQueue,
} from './offline-mode.js';

export {
  saveReportDraft,
  submitReport,
  approveReport,
  rejectReport,
  cancelPedidoOrcamentoReport,
} from './report-workflow.js';

export {
  assignJob,
  rescheduleJob,
  deleteJob,
} from './jobs-workflow.js';

export {
  assignServico,
  rescheduleServico,
  deleteServico,
} from './servicos-workflow.js';

export {
  getServico,
  getServicosSnapshot,
  ensureServicosLoadedSafe,
} from './servicos-db.js';

export {
  getAdminCalendarItems,
  filterCalendarItemsByTech,
  getCalendarItemReport,
  getCalendarItemReports,
  getCalendarItemSubtitle,
  getReportsForServico,
} from './servicos-panel-utils.js';

export {
  sendOfficialReportEmail,
  sendOrcamentoProposalEmail,
} from './report-email-api.js';

export {
  resendApprovedReportEmail,
  sendSelectedReportsEmail,
} from './report-email-actions.js';

export {
  getWeekDates,
  formatDate,
  formatDateLong,
  isToday,
  getDayLabel,
  getDayNumber,
} from './date-utils.js';

export { showToast, showNotificationToast, openModal, closeModal } from './toast-modal.js';

export {
  RH_PANEL_REPORT_STATUSES,
  getPendingReports,
  getAdminReviewReports,
  getRhPanelReportCounts,
} from './rh-panel-reports.js';

export {
  isPendingBilling,
  getPendingBillingReports,
  resolveInvoiceDueDate,
  resolveInvoiceBillingFields,
  getPendingPaymentInvoices,
  getBillingFinancialMetrics,
  registerReportInvoice,
  dismissPendingBillingReport,
  confirmInvoicePayment,
} from './billing-workflow.js';

export {
  getPendingBillingItems,
  getPendingBillingCount,
  getPendingBillingServicos,
  isServicoPendingBilling,
  registerServicoInvoice,
  dismissPendingBillingServico,
  confirmServicoInvoicePayment,
  markServicoPendingBillingIfReady,
  resolveBillingFocusTarget,
} from './servicos-billing-workflow.js';

export {
  COMPANY,
  CLIENTS,
  DEMO_CLIENT_FORKLIFTS,
  mapClientToLegacy,
  TECHNICIANS,
  SERVICE_TYPES,
  reportTemplates,
  JOB_STATUSES,
  seedDatabase,
} from './mock_data.js';

export {
  loadClientsDataModule,
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  searchClients,
} from './clients-catalog.js';

export { getJobsSnapshot, ensureJobsLoaded } from './trabalhos-db.js';
export { getReportsSnapshot, ensureReportsLoaded } from './relatorios-db.js';

/* ─── Arranque da app (index.html) ─── */

/**
 * Router simples: login ou redireciona para o painel conforme a sessão.
 * @param {string} [containerId] id do contentor (`app` ou `app-root`)
 */
export function bootstrapApp(containerId = 'app') {
  initLocalDatabase();

  const appContainer =
    document.getElementById(containerId) || document.getElementById('app-root');

  if (!appContainer) {
    console.error(`[ManuSilva] Contentor #${containerId} (ou #app-root) não encontrado.`);
    return;
  }

  const sessao = AuthService.getSessao();
  const session = sessao ? normalizeSession(sessao) : null;

  if (session?.role) {
    const panelUrl =
      session.role === 'admin'
        ? 'admin.html'
        : session.role === 'warehouse'
          ? 'warehouse.html'
          : 'dashboard.html';
    window.location.replace(panelUrl);
    return;
  }

  appContainer.innerHTML = LoginView.render();
  LoginView.init();
}
