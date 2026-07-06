/**
 * API enxuta para o tablet técnico — evita carregar faturação, RH, e-mail, etc. via app.js.
 */

export { escapeHtml } from './html-utils.js';
export { captureError } from './error-monitor.js';
export { getSession, clearSession } from './session.js';
export { requireAuth } from './auth-guard.js';
export { MANUSILVA_LOGO, applyBrandLogo, isLogoConfigured } from './brand-ui.js';

export {
  invalidateDbMemoryCache,
  initLocalDatabase,
  getDB,
  saveDB,
  updateDB,
  warmOperacoes,
  handleFatalDashboardError,
} from './local-db.js';

export {
  getClient,
  getTechnician,
  getPrimaryTechnicianForJob,
  jobAssignedToTechnician,
  getServiceType,
  getJob,
  getReport,
  getReportForJob,
  resolveJobForForm,
} from './entity-lookups.js';

export {
  isOffline,
  isNetworkOnline,
  canReachServer,
  setOfflineMode,
} from './offline-mode.js';

export {
  getWeekDates,
  formatDate,
  formatDateLong,
  getDayLabel,
  getDayNumber,
  isToday,
} from './date-utils.js';

export { showToast, showNotificationToast, openModal, closeModal } from './toast-modal.js';

export { getJobsSnapshot, ensureJobsLoaded } from './trabalhos-db.js';
export { getReportsSnapshot } from './relatorios-db.js';

export { COMPANY, SERVICE_TYPES } from './mock_data.js';
