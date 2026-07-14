/**
 * Manusilva PWA — HR / Admin Dashboard
 */

import {
  requireAuth,
  getWeekDates,
  getClient,
  getTechnician,
  getServiceType,
  getPendingReports,
  getPendingBillingCount,
  getAdminReviewReports,
  getRhPanelReportCounts,
  getReport,
  approveReport,
  assignServico,
  deleteJob,
  deleteServico,
  rescheduleJob,
  rescheduleServico,
  getJob,
  getServico,
  warmJobs,
  getReportForJob,
  statusBadge,
  warmClientsCatalog,
  warmOperacoes,
  getAllTechnicians,
  getJobTechnicianLabel,
  getPrimaryTechnicianForJob,
  openModal,
  closeModal,
  escapeHtml,
  formatDate,
  formatDateLong,
  getDayLabel,
  getDayNumber,
  isToday,
  COMPANY,
  applyBrandLogo,
  showToast,
  showNotificationToast,
} from './app.js';
import { serviceIconHtml } from './ui-icons.js';
import {
  getCalendarEventStateClass,
  renderWorkStateBadge,
} from './calendar-event-state.js';
import { ensureProductionCatalog, formatClientsLoadError } from './clients-catalog.js';
import { isTestClient } from './client-test-utils.js';
import { reportPedidoOrcamentoRoutesToOrcamentosTab } from './pedido-orcamento.js';
import { formatOrdemLabel } from './report-review-ui.js';
import { renderClientCombobox, bindClientComboboxes } from './client-combobox.js';
import { finishAppBoot } from './bootstrap-entry.js';
import { forceLogout, renderUserGreeting } from './auth.js';
import { initMetricsPanel, refreshMetricsPanel } from './views/dashboard.js';
import { initClientsApp } from './views/clients-app.js';
import { initEmployeesPanel, refreshTechniciansList } from './views/rh-registry.js';
import { initFaturacaoPanel, refreshFaturacaoPanel, queueBillingReportFocus } from './views/faturacao.js';
import {
  initOrcamentosPanel,
  refreshOrcamentosPanel,
  queueOrcamentoReportFocus,
  countOrcamentosPorPreparar,
} from './views/orcamentos.js';
import { consumeAdminPendingTab } from './orcamento-modal.js';
import { initAvaliacoesPanel, refreshAvaliacoesPanel } from './views/avaliacoes.js';
import {
  loadRhReviewFilters,
  saveRhReviewFilters,
  filterRhReports,
  getNextPendingReportId,
  buildRhOpsSummaryText,
  loadRhDayCollapseState,
  isRhDayCollapsed,
  toggleRhDayCollapsed,
} from './rh-panel-utils.js';
import { computeDashboardMetrics } from './views/dashboard-metrics.js';
import { syncTechniciansCatalog } from './technicians-admin.js';
import {
  bindRhNotificationPermissionOnGesture,
  maybeNotifyRhPendingReport,
} from './rh-notifications.js';
import { LABEL_NUMERO_SERIE } from './field-labels.js';
import {
  filterCalendarItemsByTech,
  getAdminCalendarItems,
  getCalendarItemReport,
  getCalendarItemReports,
  getCalendarItemSubtitle,
  getRhCalendarVisitDeleteGuard,
  getServicoActiveReports,
  isRhVisitDeleteConfirmWord,
  isServicoMultiReportVisit,
  rhReportStatusLine,
  resolveServicoIdForReport,
  servicoToCalendarItem,
} from './servicos-panel-utils.js';

/** Aba ativa do painel admin (controlada pela sidebar) */
let currentTab = 'calendario';

const ADMIN_TAB_BY_NAV = {
  '#calendar': 'calendario',
  '#pending': 'relatorios',
  '#orcamentos': 'orcamentos',
  '#billing': 'faturacao',
  '#avaliacoes': 'avaliacoes',
  '#clients': 'clientes',
  '#employees': 'funcionarios',
};

const ADMIN_MOBILE_LAYOUT_MQ = '(max-width: 767px), (max-width: 1024px) and (orientation: portrait)';
const ADMIN_SIDEBAR_COLLAPSED_KEY = 'admin_sidebar_collapsed';

function isAdminMobileLayout() {
  return window.matchMedia(ADMIN_MOBILE_LAYOUT_MQ).matches;
}

let calendarView = 'week';
let filterTechId = 'all';
let currentWeekOffset = 0;
/** Vista mobile: calendário ou relatórios (telemóvel / tablet em retrato) */
let opsMobileView = 'calendario';

const savedRhFilters = loadRhReviewFilters();
/** Filtro ativo no painel RH — por defeito mostra pendentes */
let rhReviewFilter = savedRhFilters.status || 'pending_review';
let rhReviewTechFilter = savedRhFilters.techId || 'all';
let rhReviewSearch = savedRhFilters.search || '';
const RH_EMPTY_MESSAGES = {
  all: 'Nenhum relatório no histórico.',
  pending_review: 'Nenhum relatório pendente de aprovação neste momento.',
  draft: 'Nenhum rascunho em curso.',
  approved: 'Nenhum relatório aprovado.',
  rejected: 'Nenhum relatório recusado.',
  orcamento_pendente: 'Nenhuma proposta comercial por preparar.',
};

const AGENDA_SWIPE_OPEN_PX = 88;

let reviewPanelHeightObserver = null;
let rhReviewStackRenderToken = 0;

/** Evita substituir o DOM a meio do ciclo de clique (mousedown → mouseup). */
function deferPanelDomWrite(writeFn) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        writeFn();
        resolve();
      });
    });
  });
}

function applyRhDayCollapseDom(section, collapsed) {
  if (!section) return;
  section.classList.toggle('is-collapsed', collapsed);
  const items = section.querySelector('.rh-review-day-group__items');
  const toggle = section.querySelector('.rh-review-day-group__toggle');
  const chevron = section.querySelector('.rh-review-day-group__chevron');
  if (items) items.hidden = collapsed;
  if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}

function syncRhReviewFilterChipsUi(panel, activeFilter = rhReviewFilter) {
  panel?.querySelectorAll('[data-rh-filter]').forEach((chip) => {
    const active = chip.dataset.rhFilter === activeFilter;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function queueRhReviewStackRender() {
  void renderRhReviewStack().catch(console.error);
}

/** Secções fora do ecrã — refresh adiado até o utilizador abrir a aba. */
const adminTabDirty = {
  ops: false,
  orcamentos: false,
  faturacao: false,
  avaliacoes: false,
  clientes: false,
  funcionarios: false,
};

/** Avaliações do cliente por visita — cache para calendário e painel RH. */
let calendarAvaliacoesMap = new Map();

function isOpsTabActive() {
  return currentTab === 'calendario' || currentTab === 'relatorios';
}

function refreshOpsTab() {
  loadCalendarAvaliacoes()
    .then(() => {
      renderCalendar();
      renderSidebar();
      updateAdminChrome();
      renderRhReviewStack().catch(console.error);
      if (currentTab === 'calendario') {
        refreshMetricsPanel(getMetricActionHandlers()).catch(console.error);
      }
    })
    .catch((err) => {
      console.warn('[Admin] Avaliações no calendário:', err);
      renderCalendar();
      renderSidebar();
      updateAdminChrome();
      renderRhReviewStack().catch(console.error);
    });
}

async function loadCalendarAvaliacoes() {
  const jobs = filterCalendarItemsByTech(getAdminCalendarItems(), filterTechId);
  const servicoIds = jobs.filter((job) => job.isServico).map((job) => String(job.id));
  if (!servicoIds.length) {
    calendarAvaliacoesMap = new Map();
    return calendarAvaliacoesMap;
  }
  const { fetchAvaliacoesByServicoIds } = await import('./avaliacoes-db.js');
  calendarAvaliacoesMap = await fetchAvaliacoesByServicoIds(servicoIds);
  return calendarAvaliacoesMap;
}

function getCalendarAvaliacao(job) {
  if (!job?.isServico) return null;
  return calendarAvaliacoesMap.get(String(job.id)) || null;
}

function renderCalendarAvaliacaoBadge(avaliacao, { compact = false } = {}) {
  if (!avaliacao) return '';
  return `<span class="cal-block-avaliacao" title="${escapeHtml(avaliacao.label)}" aria-label="Avaliação: ${escapeHtml(avaliacao.label)}">${avaliacao.emoji}</span>`;
}

function persistRhReviewFilters() {
  saveRhReviewFilters({
    status: rhReviewFilter,
    techId: rhReviewTechFilter,
    search: rhReviewSearch,
  });
}

function getRhFilteredReports() {
  const base = getAdminReviewReports(rhReviewFilter);
  return filterRhReports(base, {
    techId: rhReviewTechFilter,
    search: rhReviewSearch,
  });
}

function getMetricActionHandlers() {
  return {
    'go-pending': () => {
      rhReviewFilter = 'pending_review';
      persistRhReviewFilters();
      setAdminTab('relatorios');
      renderRhReviewStack().catch(console.error);
    },
    'go-orcamentos': () => setAdminTab('orcamentos'),
    'go-billing': () => setAdminTab('faturacao'),
    'go-calendar-today': () => {
      currentWeekOffset = 0;
      setAdminTab('calendario');
      renderCalendar();
    },
    'go-calendar-week': () => {
      currentWeekOffset = 0;
      setAdminTab('calendario');
      renderCalendar();
    },
    'go-clients': () => setAdminTab('clientes'),
    'go-employees': () => setAdminTab('funcionarios'),
  };
}

function updateAdminChrome() {
  updatePendingCount();
  updateSidebarBadges();
  updateOpsSummary();
  updateHeaderShortcuts();
}

function refreshClientesTab() {
  initClientsApp().catch(console.error);
}

function refreshFuncionariosTab() {
  refreshTechniciansList(document.getElementById('employees-panel'));
  renderSidebar();
}

function flushDirtyAdminTab(tab) {
  if ((tab === 'calendario' || tab === 'relatorios') && adminTabDirty.ops) {
    adminTabDirty.ops = false;
    refreshOpsTab();
    return;
  }
  if (tab === 'faturacao' && adminTabDirty.faturacao) {
    adminTabDirty.faturacao = false;
    refreshFaturacaoPanel().catch(console.error);
    return;
  }
  if (tab === 'orcamentos' && adminTabDirty.orcamentos) {
    adminTabDirty.orcamentos = false;
    refreshOrcamentosPanel().catch(console.error);
    return;
  }
  if (tab === 'avaliacoes' && adminTabDirty.avaliacoes) {
    adminTabDirty.avaliacoes = false;
    refreshAvaliacoesPanel().catch(console.error);
    return;
  }
  if (tab === 'clientes' && adminTabDirty.clientes) {
    adminTabDirty.clientes = false;
    refreshClientesTab();
    return;
  }
  if (tab === 'funcionarios' && adminTabDirty.funcionarios) {
    adminTabDirty.funcionarios = false;
    refreshFuncionariosTab();
  }
}

function handleAdminDbUpdated() {
  try {
    if (isOpsTabActive()) {
      adminTabDirty.ops = false;
      refreshOpsTab();
    } else {
      adminTabDirty.ops = true;
    }

    if (currentTab === 'faturacao') {
      adminTabDirty.faturacao = false;
      refreshFaturacaoPanel({ soft: true }).catch(console.error);
    } else {
      adminTabDirty.faturacao = true;
    }

    if (currentTab === 'orcamentos') {
      adminTabDirty.orcamentos = false;
      refreshOrcamentosPanel().catch(console.error);
    } else {
      adminTabDirty.orcamentos = true;
    }

    if (currentTab === 'avaliacoes') {
      adminTabDirty.avaliacoes = false;
      refreshAvaliacoesPanel().catch(console.error);
    } else {
      adminTabDirty.avaliacoes = true;
    }

    if (currentTab === 'clientes') {
      adminTabDirty.clientes = false;
      refreshClientesTab();
    } else {
      adminTabDirty.clientes = true;
    }

    if (currentTab === 'funcionarios') {
      adminTabDirty.funcionarios = false;
      refreshFuncionariosTab();
    } else {
      adminTabDirty.funcionarios = true;
    }
  } catch (err) {
    console.error('[Admin] Atualização:', err);
  }
}

/** Painel de relatórios em ecrã inteiro — altura definida por CSS, não pelo calendário. */
function syncReviewPanelHeight() {
  const panel = document.querySelector('.admin-review-panel');
  if (!panel) return;
  panel.style.removeProperty('height');
  panel.style.removeProperty('max-height');
}

function bindReviewPanelHeightSync() {
  if (reviewPanelHeightObserver) return;
  const cal = document.querySelector('.admin-split-calendar');
  if (!cal) return;

  reviewPanelHeightObserver = new ResizeObserver(() => {
    syncReviewPanelHeight();
  });
  reviewPanelHeightObserver.observe(cal);

  window.addEventListener('resize', syncReviewPanelHeight, { passive: true });
}

/** Abre Orçamentos e destaca um relatório com proposta por preparar. */
export async function navigateToOrcamentoReport(reportId) {
  if (!reportId) return;
  queueOrcamentoReportFocus(reportId);
  setAdminTab('orcamentos');
  adminTabDirty.orcamentos = false;
  await refreshOrcamentosPanel();
}

/** Abre Faturação e destaca um relatório aprovado por faturar. */
export async function navigateToBillingReport(reportId) {
  if (!reportId) return;
  queueBillingReportFocus(reportId);
  setAdminTab('faturacao');
  adminTabDirty.faturacao = false;
  await refreshFaturacaoPanel();
}

export function setAdminTab(tab) {
  if (!tab) return;
  currentTab = tab;
  if (tab === 'relatorios') opsMobileView = 'relatorios';
  if (tab === 'calendario') opsMobileView = 'calendario';
  updateAdminTabUI();
  flushDirtyAdminTab(tab);
  if (tab === 'orcamentos') {
    refreshOrcamentosPanel().catch(console.error);
  }
  if (tab === 'avaliacoes') {
    refreshAvaliacoesPanel().catch(console.error);
  }
  if (tab === 'relatorios' || tab === 'calendario') {
    updateOpsSummary();
  }
  document.querySelector('.admin-main')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAdminTabUI() {
  document.querySelectorAll('[data-admin-tab]').forEach((panel) => {
    const tabs = String(panel.dataset.adminTab || '')
      .split(/\s+/)
      .filter(Boolean);
    panel.classList.toggle('is-active', tabs.includes(currentTab));
  });

  document.querySelectorAll('[data-admin-subtab]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.adminSubtab === currentTab);
  });

  document.querySelectorAll('.nav-item[data-admin-tab]').forEach((item) => {
    item.classList.toggle('active', item.dataset.adminTab === currentTab);
  });

  const split = document.getElementById('calendar');
  if (split) {
    const mobileLayout = isAdminMobileLayout();
    split.classList.toggle('admin-split-layout--calendar', currentTab === 'calendario');
    split.classList.toggle('admin-split-layout--review', currentTab === 'relatorios');
    split.classList.toggle(
      'admin-split-layout--mobile-calendar',
      mobileLayout && opsMobileView === 'calendario',
    );
    split.classList.toggle(
      'admin-split-layout--mobile-relatorios',
      mobileLayout && opsMobileView === 'relatorios',
    );
  }

  const mobileToggle = document.getElementById('admin-ops-mobile-toggle');
  if (mobileToggle) {
    mobileToggle.querySelectorAll('[data-ops-mobile]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.opsMobile === opsMobileView);
    });
  }

  const showSplit = currentTab === 'calendario' || currentTab === 'relatorios';
  if (showSplit) {
    requestAnimationFrame(() => syncReviewPanelHeight());
  }
}

function bindAdminSidebarToggle() {
  const app = document.querySelector('.admin-app');
  const btn = document.getElementById('admin-sidebar-toggle');
  if (!app || !btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  const applyCollapsed = (collapsed) => {
    app.classList.toggle('admin-sidebar--collapsed', collapsed);
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    btn.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
    syncReviewPanelHeight();
  };

  applyCollapsed(localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === '1');

  btn.addEventListener('click', () => {
    const collapsed = !app.classList.contains('admin-sidebar--collapsed');
    localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    applyCollapsed(collapsed);
  });
}

function applyAdminInitialTab() {
  const pending = consumeAdminPendingTab();
  if (pending) {
    setAdminTab(pending);
    return;
  }
  const tab = ADMIN_TAB_BY_NAV[window.location.hash];
  if (tab) setAdminTab(tab);
}

function bindAdminNavigation() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      const tab = item.dataset.adminTab || ADMIN_TAB_BY_NAV[href];
      if (tab) setAdminTab(tab);
    });
  });

  window.addEventListener('hashchange', () => {
    const tab = ADMIN_TAB_BY_NAV[window.location.hash];
    if (tab) setAdminTab(tab);
  });
}

function bindAppRefreshControls() {
  import(`./app-refresh-ui.js${globalThis.__MS_MODULE_Q || `?_=${Date.now()}`}`).then(({ bindAppRefreshButton }) => {
    bindAppRefreshButton('btn-force-app-refresh', {
      notifyStyle: 'button',
      updateHint: 'Nova versão disponível — clique em «Atualizar».',
    });
  });
}

export async function initAdminDashboard() {
  const session = requireAuth('admin');
  if (!session) return;

  renderUserGreeting('user-name');
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    void forceLogout();
  });
  bindAppRefreshControls();
  bindAdminNavigation();
  finishAppBoot();

  try {
    await warmClientsCatalog();
    await warmOperacoes();
  } catch (err) {
    const { handleFatalDashboardError } = await import('./app.js');
    if (await handleFatalDashboardError(err)) return;

    console.error('[Admin] Supabase:', err);
    const msg =
      err?.message ||
      formatClientsLoadError(err) ||
      'Não foi possível carregar dados do Supabase. Verifique a sessão e as políticas RLS.';
    showToast(msg, 'error', 9000);
  }

  try {
    renderSidebar();
    loadCalendarAvaliacoes().then(() => renderCalendar()).catch(console.error);
    bindAdminSidebarToggle();
    bindReviewPanelHeightSync();
    bindViewToggle();
    bindCalendarJobInteractions();
    bindRhReviewPanel();
    bindAssignWork();
    bindOpsMobileToggle();
    bindHeaderShortcuts();
    bindRhNotificationPermissionOnGesture();
    bindCalTodayBtn();
    updateAdminChrome();
    renderRhReviewStack().catch(console.error);
    applyAdminInitialTab();
    updateAdminTabUI();
    window.matchMedia(ADMIN_MOBILE_LAYOUT_MQ).addEventListener('change', () => {
      updateAdminTabUI();
      syncReviewPanelHeight();
    });
  } catch (err) {
    console.error('[Admin] Erro ao iniciar painel:', err);
    showToast('Erro ao carregar o calendário. Veja a consola (F12).', 'error');
  }

  const { initAdminRealtime, playNotificationBeep } = await import('./admin-realtime.js');
  initAdminRealtime({
    onTrabalhoInserted: () => {
      try {
        if (isOpsTabActive()) {
          loadCalendarAvaliacoes().then(() => renderCalendar()).catch(console.error);
        } else {
          adminTabDirty.ops = true;
        }
      } catch (e) {
        console.error('[Admin] Calendário após trabalho realtime:', e);
      }
    },
    onServicoChanged: () => {
      try {
        if (isOpsTabActive()) {
          loadCalendarAvaliacoes().then(() => renderCalendar()).catch(console.error);
        } else {
          adminTabDirty.ops = true;
        }
      } catch (e) {
        console.error('[Admin] Calendário após serviço realtime:', e);
      }
    },
    onTrabalhoPendente: (job) => {
      const report = getReportForJob(job.id);
      if (report?.status === 'pending_review') {
        handleNewPendingReport(report, { playSound: true }, playNotificationBeep).catch(console.error);
      }
    },
    onPendingReport: (report, opts = {}) => {
      handleNewPendingReport(report, opts, playNotificationBeep).catch(console.error);
    },
    onReportUpdated: (report, oldRow) => {
      const becamePending =
        report?.status === 'pending_review' &&
        !isPendingReviewEstado(oldRow?.estado);
      try {
        if (isOpsTabActive()) {
          renderCalendar();
          renderRhReviewStack()
            .then(() => {
              if (becamePending && report?.id) flashPendingReportInPanel(report.id);
            })
            .catch(console.error);
        } else {
          adminTabDirty.ops = true;
        }
      } catch (e) {
        console.error('[Admin] Atualização visual após relatório:', e);
      }
    },
  }).catch((err) => {
    console.error('[Admin] Realtime:', err);
  });

  const metricsRoot = document.getElementById('admin-metrics-root');
  const faturacaoRoot = document.getElementById('faturacao-panel-root');
  const orcamentosRoot = document.getElementById('orcamentos-panel-root');
  const avaliacoesRoot = document.getElementById('avaliacoes-panel-root');

  await Promise.all([
    metricsRoot
      ? initMetricsPanel(metricsRoot, getMetricActionHandlers()).catch((err) => {
          console.error('[Admin] Métricas:', err);
        })
      : Promise.resolve(),
    initClientsApp().catch((err) => {
      console.error('[Admin] Painel de clientes:', err);
      showToast(formatClientsLoadError(err), 'error', 9000);
    }),
    orcamentosRoot
      ? initOrcamentosPanel(orcamentosRoot).catch((err) => {
          console.error('[Admin] Orçamentos:', err);
          showToast('Erro ao carregar o painel de orçamentos.', 'error');
        })
      : Promise.resolve(),
    faturacaoRoot
      ? initFaturacaoPanel(faturacaoRoot).catch((err) => {
          console.error('[Admin] Faturação:', err);
          showToast('Erro ao carregar o painel de faturação.', 'error');
        })
      : Promise.resolve(),
    avaliacoesRoot
      ? initAvaliacoesPanel(avaliacoesRoot).catch((err) => {
          console.error('[Admin] Avaliações:', err);
          showToast('Erro ao carregar o painel de avaliações.', 'error');
        })
      : Promise.resolve(),
  ]);

  try {
    initEmployeesPanel(document.getElementById('employees-panel'));
  } catch (err) {
    console.error('[Admin] Funcionários:', err);
    showToast('Erro ao carregar cadastro de técnicos.', 'error');
  }

  window.addEventListener('admin-open-calendar-item', (event) => {
    void focusCalendarVisit(event?.detail || {});
  });

  window.addEventListener('db-updated', handleAdminDbUpdated);
}

function renderSidebar() {
  if (!applyBrandLogo()) {
    const logoEl = document.getElementById('brand-logo');
    if (logoEl) logoEl.textContent = COMPANY.logo;
    const nameEl = document.getElementById('brand-name');
    if (nameEl) nameEl.textContent = COMPANY.name;
  }

  const filter = document.getElementById('tech-filter');
  if (filter) {
    const previous = filter.value;
    filter.innerHTML = `
      <option value="all">Todos os Técnicos</option>
      ${getAllTechnicians()
        .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
        .join('')}
    `;
    if ([...filter.options].some((o) => o.value === previous)) {
      filter.value = previous;
    }
    if (filter.dataset.bound !== 'true') {
      filter.dataset.bound = 'true';
      filter.addEventListener('change', () => {
        filterTechId = filter.value;
        renderCalendar();
      });
    }
  }
}

function bindViewToggle() {
  document.querySelectorAll('[data-cal-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calendarView = btn.dataset.calView;
      document.querySelectorAll('[data-cal-view]').forEach((b) => b.classList.toggle('active', b === btn));
      renderCalendar();
    });
  });

  document.getElementById('prev-week')?.addEventListener('click', () => {
    currentWeekOffset--;
    renderCalendar();
  });
  document.getElementById('next-week')?.addEventListener('click', () => {
    currentWeekOffset++;
    renderCalendar();
  });
}

function bindCalTodayBtn() {
  const btn = document.getElementById('cal-today-btn');
  if (!btn || btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';
  btn.addEventListener('click', () => {
    currentWeekOffset = 0;
    renderCalendar();
  });
}

function bindOpsMobileToggle() {
  const root = document.getElementById('admin-ops-mobile-toggle');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ops-mobile]');
    if (!btn) return;
    opsMobileView = btn.dataset.opsMobile || 'calendario';
    if (opsMobileView === 'relatorios') currentTab = 'relatorios';
    if (opsMobileView === 'calendario') currentTab = 'calendario';
    document.querySelectorAll('.nav-item[data-admin-tab]').forEach((item) => {
      item.classList.toggle('active', item.dataset.adminTab === currentTab);
    });
    updateAdminTabUI();
  });
}

function bindHeaderShortcuts() {
  const goPending = document.getElementById('btn-go-pending');
  if (goPending && goPending.dataset.bound !== 'true') {
    goPending.dataset.bound = 'true';
    goPending.addEventListener('click', () => {
      rhReviewFilter = 'pending_review';
      persistRhReviewFilters();
      setAdminTab('relatorios');
      renderRhReviewStack().catch(console.error);
    });
  }

  const approveValid = document.getElementById('btn-approve-valid-email');
  if (approveValid && approveValid.dataset.bound !== 'true') {
    approveValid.dataset.bound = 'true';
    approveValid.addEventListener('click', () => {
      approveAllWithValidEmail().catch(console.error);
    });
  }
}

function isValidClientEmail(email) {
  const e = String(email || '').trim();
  return e.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function approveAllWithValidEmail() {
  const pending = getPendingReports();
  const eligible = pending.filter((r) => {
    const client = getClient(r.clientId);
    const email = String(client?.email || client?.['E-mail'] || '').trim();
    return isValidClientEmail(email);
  });

  if (!eligible.length) {
    showToast('Nenhum relatório pendente com e-mail de cliente válido.', 'warning');
    return;
  }

  const confirmed = window.confirm(
    `Aprovar ${eligible.length} relatório(s) com e-mail válido na ficha do cliente?`,
  );
  if (!confirmed) return;

  let approved = 0;
  for (const report of eligible) {
    const client = getClient(report.clientId);
    const clientEmail = String(client?.email || client?.['E-mail'] || '').trim();
    const ok = await approveReport(report.id, { clientEmail });
    if (ok) approved += 1;
  }

  if (approved > 0) {
    showToast(
      approved === 1 ? '1 relatório aprovado.' : `${approved} relatórios aprovados.`,
      'success',
      6000,
    );
    await rhReviewModalCallbacks().onApproved?.();
    await renderRhReviewStack();
  } else {
    showToast('Nenhum relatório foi aprovado.', 'warning');
  }
}

function updateOpsSummary() {
  const el = document.getElementById('admin-ops-summary');
  if (!el) return;
  if (!isOpsTabActive()) {
    el.hidden = true;
    return;
  }
  const metrics = computeDashboardMetrics();
  el.hidden = false;
  el.innerHTML = `<p class="admin-ops-summary-text"><strong>Resumo:</strong> ${escapeHtml(buildRhOpsSummaryText(metrics))}</p>`;
}

function updateSidebarBadges() {
  const pending = getPendingReports().length;
  const billing = getPendingBillingCount();
  const orcamentos = countOrcamentosPorPreparar();

  const relBadge = document.getElementById('nav-badge-relatorios');
  if (relBadge) {
    relBadge.textContent = String(pending);
    relBadge.hidden = pending <= 0;
  }

  const orcBadge = document.getElementById('nav-badge-orcamentos');
  if (orcBadge) {
    orcBadge.textContent = String(orcamentos);
    orcBadge.hidden = orcamentos <= 0;
  }

  const fatBadge = document.getElementById('nav-badge-faturacao');
  if (fatBadge) {
    fatBadge.textContent = String(billing);
    fatBadge.hidden = billing <= 0;
  }
}

function updateHeaderShortcuts() {
  const pending = getPendingReports().length;
  const goBtn = document.getElementById('btn-go-pending');
  const approveBtn = document.getElementById('btn-approve-valid-email');

  if (goBtn) {
    goBtn.hidden = pending <= 0;
    goBtn.textContent = pending === 1 ? 'Ir ao pendente' : `Ir aos ${pending} pendentes`;
  }

  if (approveBtn) {
    const eligible = getPendingReports().filter((r) => {
      const client = getClient(r.clientId);
      const email = String(client?.email || client?.['E-mail'] || '').trim();
      return isValidClientEmail(email);
    }).length;
    approveBtn.hidden = eligible <= 0;
    approveBtn.textContent =
      eligible === 1 ? 'Aprovar 1 com e-mail válido' : `Aprovar ${eligible} com e-mail válido`;
  }
}

function getCalendarDates() {
  const base = new Date();
  base.setDate(base.getDate() + currentWeekOffset * 7);
  if (calendarView === 'week' || calendarView === 'list') return getWeekDates(base);

  const dates = [];
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  return dates;
}

function dateToWeekOffset(targetDateStr) {
  const raw = String(targetDateStr || '').trim().slice(0, 10);
  if (!raw) return 0;
  const targetMonday = getWeekDates(new Date(`${raw}T12:00:00`))[0];
  const todayMonday = getWeekDates(new Date())[0];
  const targetMs = new Date(`${targetMonday}T12:00:00`).getTime();
  const todayMs = new Date(`${todayMonday}T12:00:00`).getTime();
  return Math.round((targetMs - todayMs) / (7 * 24 * 60 * 60 * 1000));
}

async function focusCalendarVisit({ jobId, visitDate, clientName, visitSummary } = {}) {
  const id = String(jobId || '').trim();
  if (!id) return;

  setAdminTab('calendario');

  try {
    const { ensureServicosLoadedSafe } = await import('./servicos-db.js');
    await ensureServicosLoadedSafe(true);
  } catch (err) {
    console.warn('[Admin] Serviços para foco de visita:', err);
  }

  const resolved = resolveCalendarItemById(id);
  const date = String(visitDate || resolved?.date || '').trim().slice(0, 10);
  const label = String(clientName || getClient(resolved?.clientId)?.name || 'Visita').trim();
  const summary = String(visitSummary || (date ? `${formatDateLong(date)}` : '')).trim();

  if (date) {
    currentWeekOffset = dateToWeekOffset(date);
    if (calendarView === 'month') {
      calendarView = 'week';
      document.querySelectorAll('[data-cal-view]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.calView === 'week');
      });
    }
  }

  try {
    await loadCalendarAvaliacoes();
  } catch (err) {
    console.warn('[Admin] Avaliações ao focar visita:', err);
  }
  renderCalendar();

  requestAnimationFrame(() => {
    const block = document.querySelector(`[data-job-id="${CSS.escape(id)}"]`);
    if (block) {
      block.classList.add('cal-block--focus');
      block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      window.setTimeout(() => block.classList.remove('cal-block--focus'), 3500);
    } else if (summary) {
      showToast(`Visita: ${label} — ${summary}`, 'info', 6000);
    }
  });

  if (resolved) {
    openJobDetailModal(id);
    return;
  }

  showToast(
    summary
      ? `Visita de ${label} (${summary}) — não encontrada no calendário atual.`
      : 'Visita não encontrada no calendário.',
    'warning',
    7000,
  );
}

/** Trabalhos do dia no calendário RH — lista plana (sem pastas). */
function renderAdminCalendarDayContent(dayJobs, options = {}) {
  const { compact = false, listMode = false, maxSlots = null } = options;

  if (!dayJobs.length) {
    return '<span class="cal-empty">Sem trabalhos</span>';
  }

  const visibleJobs = maxSlots != null ? dayJobs.slice(0, maxSlots) : dayJobs;
  const hiddenJobCount = maxSlots != null ? Math.max(0, dayJobs.length - visibleJobs.length) : 0;

  const renderJob = listMode
    ? (j) => renderAgendaListItem(j)
    : (j) => renderCalendarBlock(j, compact);

  const contentHtml = visibleJobs.map(renderJob).join('');
  const moreHtml = hiddenJobCount > 0 ? `<span class="cal-more">+${hiddenJobCount}</span>` : '';
  return contentHtml + moreHtml;
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('calendar-title');
  if (!grid) return;

  const dates = getCalendarDates();
  const jobs = filterCalendarItemsByTech(getAdminCalendarItems(), filterTechId);
  const jobsInRange = jobs.filter((j) => dates.includes(j.date));
  const weekEmpty = jobsInRange.length === 0;

  const firstDate = new Date(dates[0] + 'T00:00:00');
  if (calendarView === 'list') {
    title.textContent = `Agenda — Semana de ${formatDate(dates[0])}`;
  } else if (calendarView === 'week') {
    title.textContent = `Semana de ${formatDate(dates[0])}`;
  } else {
    title.textContent = firstDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  }

  if (calendarView === 'list') {
    grid.className = 'calendar-grid calendar-agenda-list';
    grid.innerHTML = weekEmpty
      ? renderCalendarEmptyState()
      : renderAgendaList(jobs, dates);
    if (!weekEmpty) bindAgendaSwipeRows(grid);
  } else if (calendarView === 'week') {
    grid.className = 'calendar-grid calendar-week';
    if (weekEmpty) {
      grid.innerHTML = renderCalendarEmptyState();
    } else {
      grid.innerHTML = dates
        .map((date) => {
          const dayJobs = jobs.filter((j) => j.date === date);
          const emptyDay = dayJobs.length === 0;
          return `
        <div class="cal-col ${isToday(date) ? 'today-col' : ''}${emptyDay ? ' cal-col--empty' : ''}">
          <div class="cal-col-header">
            <span>${getDayLabel(date)}</span>
            <strong>${getDayNumber(date)}</strong>
          </div>
          <div class="cal-col-body">
            ${renderAdminCalendarDayContent(dayJobs, { defaultOpen: true })}
          </div>
        </div>
      `;
        })
        .join('');
    }
  } else {
    grid.className = 'calendar-grid calendar-month';
    const startDay = firstDate.getDay();
    const pad = startDay === 0 ? 6 : startDay - 1;
    let html = Array(pad).fill('<div class="cal-cell cal-pad"></div>').join('');

    dates.forEach((date) => {
      const dayJobs = jobs.filter((j) => j.date === date);
      html += `
        <div class="cal-cell ${isToday(date) ? 'today-cell' : ''}">
          <span class="cal-cell-day">${getDayNumber(date)}</span>
          ${renderAdminCalendarDayContent(dayJobs, { compact: true, defaultOpen: false, maxSlots: 3 })}
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  if (weekEmpty && (calendarView === 'list' || calendarView === 'week')) {
    bindCalendarEmptyStateActions();
  }

  requestAnimationFrame(() => syncReviewPanelHeight());
}

function renderCalendarEmptyState() {
  return `
    <div class="cal-empty-state">
      <p class="cal-empty-state-title">Sem trabalhos neste período</p>
      <p class="cal-empty-state-hint text-muted">Não há serviços agendados para a semana ou mês selecionado.</p>
      <div class="cal-empty-state-actions">
        <button type="button" class="btn-outline btn-sm" id="cal-empty-today">Ir para hoje</button>
        <button type="button" class="btn-primary btn-sm" id="cal-empty-assign">+ Criar Serviço</button>
      </div>
    </div>
  `;
}

function bindCalendarEmptyStateActions() {
  document.getElementById('cal-empty-today')?.addEventListener('click', () => {
    currentWeekOffset = 0;
    renderCalendar();
  });
  document.getElementById('cal-empty-assign')?.addEventListener('click', () => {
    document.getElementById('btn-assign-work')?.click();
  });
}

function renderCalendarBlock(job, compact = false) {
  const tech = getPrimaryTechnicianForJob(job);
  const techLabel = getJobTechnicianLabel(job.technicianId);
  const client = getClient(job.clientId);
  const report = getCalendarItemReport(job);
  const subtitle = getCalendarItemSubtitle(job);
  const stateClass = getCalendarEventStateClass(job, report);
  const sizeClass = compact ? 'cal-block cal-block-sm' : 'cal-block';
  const testClass = isTestClient(client) ? ' cal-block--teste' : '';
  const avaliacao = getCalendarAvaliacao(job);
  const avaliacaoHtml = renderCalendarAvaliacaoBadge(avaliacao, { compact });
  const cls = `${sizeClass} cal-block--interactive ${stateClass}${testClass}`;
  const label = `${client?.name || 'Cliente'} — ${subtitle}${avaliacao ? ` — ${avaliacao.label}` : ''}`;
  return `
    <button type="button" class="${cls}" data-job-id="${job.id}" style="--tech-color:${tech?.color || '#3b82f6'}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${avaliacaoHtml}
      <span class="cal-block-client${avaliacao ? ' cal-block-client--with-avaliacao' : ''}">${escapeHtml(compact ? client?.name?.split(' ')[0] : client?.name)}</span>
      ${!compact ? `<span class="cal-block-tech">${escapeHtml(techLabel.split(',')[0]?.trim() || tech?.name?.split(' ')[0] || '—')}</span>` : ''}
    </button>
  `;
}

function sortJobsByDateTime(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || '').localeCompare(b.time || '');
}

function renderAgendaList(jobs, dates) {
  const dateSet = new Set(dates);
  const inRange = jobs.filter((j) => dateSet.has(j.date)).sort(sortJobsByDateTime);

  if (!inRange.length) {
    return '<p class="cal-empty">Sem serviços atribuídos neste período.</p>';
  }

  return dates
    .map((date) => {
      const dayJobs = inRange.filter((j) => j.date === date);
      if (!dayJobs.length) return '';

      return `
        <section class="agenda-day-group" aria-label="${escapeHtml(formatDateLong(date))}">
          <h3 class="agenda-day-heading">${escapeHtml(formatDateLong(date))}</h3>
          ${renderAdminCalendarDayContent(dayJobs, { listMode: true, defaultOpen: false })}
        </section>
      `;
    })
    .filter(Boolean)
    .join('');
}

function renderAgendaListItem(job) {
  const tech = getPrimaryTechnicianForJob(job);
  const techLabel = getJobTechnicianLabel(job.technicianId);
  const client = getClient(job.clientId);
  const report = getCalendarItemReport(job);
  const subtitle = getCalendarItemSubtitle(job);
  const stateClass = getCalendarEventStateClass(job, report);
  const serial = !job.isServico && job.forkliftSerial ? ` · ${job.forkliftSerial}` : '';
  const avaliacao = getCalendarAvaliacao(job);
  const avaliacaoHtml = avaliacao
    ? `<span class="agenda-list-avaliacao" title="${escapeHtml(avaliacao.label)}" aria-label="Avaliação: ${escapeHtml(avaliacao.label)}">${avaliacao.emoji}</span>`
    : '';
  const deleteGuard = getRhCalendarVisitDeleteGuard(job);
  const listItemHtml = `
        <button type="button" class="agenda-list-item ${stateClass}" data-job-id="${job.id}" style="--tech-color:${tech?.color || '#3b82f6'}">
          <div class="agenda-list-top">
            ${renderWorkStateBadge(job, report)}
            ${avaliacaoHtml}
          </div>
          <p class="agenda-list-client">${escapeHtml(client?.name || 'Cliente')}</p>
          <p class="agenda-list-meta">${escapeHtml(subtitle)} · ${escapeHtml(techLabel)}${escapeHtml(serial)}</p>
        </button>`;

  if (deleteGuard.hasReports) {
    return `<div class="agenda-list-row agenda-list-row--no-delete" data-job-id="${job.id}">${listItemHtml}</div>`;
  }

  return `
    <div class="agenda-swipe-row" data-job-id="${job.id}">
      <div class="agenda-swipe-actions" aria-hidden="true">
        <button type="button" class="agenda-swipe-delete" data-delete-job="${job.id}">Eliminar</button>
      </div>
      <div class="agenda-swipe-track">
        ${listItemHtml}
      </div>
    </div>
  `;
}

/** Clique nos blocos do calendário (semana / mês) */
function bindCalendarJobInteractions() {
  const grid = document.getElementById('calendar-grid');
  if (!grid || grid.__calendarJobsBound) return;
  grid.__calendarJobsBound = true;

  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-delete-job]')) return;
    const trigger = e.target.closest('[data-job-id]');
    if (!trigger?.dataset.jobId) return;
    e.preventDefault();
    openJobDetailModal(trigger.dataset.jobId);
  });
}

function isPendingReviewEstado(estado) {
  const e = String(estado || '').toLowerCase();
  return e === 'pending_review' || e === 'pendente' || e === 'pending';
}

function flashPendingReportInPanel(reportId) {
  if (!reportId) return;
  const card = document.querySelector(`#rh-review-panel [data-report-id="${reportId}"]`);
  if (!card) return;
  card.classList.add('rh-review-stack-card--highlight', 'work-state-card--flash');
  card.querySelector('.work-state-badge--pending')?.classList.add('work-state-badge--flash');
  setTimeout(() => {
    card.classList.remove('rh-review-stack-card--highlight', 'work-state-card--flash');
    card.querySelector('.work-state-badge--pending')?.classList.remove('work-state-badge--flash');
  }, 5000);
}

function scrollToReportInPanel(reportId) {
  if (!reportId) return;
  setAdminTab('relatorios');
  const card = document.querySelector(`#rh-review-panel [data-report-id="${reportId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  flashPendingReportInPanel(reportId);
}

/** Renderiza histórico completo de relatórios no painel direito (com filtros rápidos). */
async function renderRhReviewStack() {
  const panel = document.getElementById('rh-review-panel');
  if (!panel) return;

  const token = ++rhReviewStackRenderToken;

  try {
    await syncTechniciansCatalog({ silent: true });
  } catch (err) {
    console.warn('[Admin] Dados para painel de relatórios:', err);
  }

  if (token !== rhReviewStackRenderToken) return;

  updateAdminChrome();

  const counts = getRhPanelReportCounts();
  const reports = getRhFilteredReports();

  const { buildRhReviewGroupedStack, buildRhReviewFilterBar } = await import(
    './report-review-rh-modal.js'
  );

  if (token !== rhReviewStackRenderToken) return;

  const filterBar = buildRhReviewFilterBar(counts, rhReviewFilter, {
    techId: rhReviewTechFilter,
    search: rhReviewSearch,
    technicians: getAllTechnicians(),
    showFullListLink: currentTab === 'calendario',
  });

  let stackHtml;
  if (!reports.length) {
    const hasFilters = rhReviewTechFilter !== 'all' || String(rhReviewSearch).trim();
    const emptyMsg = hasFilters
      ? 'Nenhum relatório corresponde aos filtros aplicados.'
      : RH_EMPTY_MESSAGES[rhReviewFilter] || RH_EMPTY_MESSAGES.all;
    stackHtml = `<p class="rh-review-panel-empty">${escapeHtml(emptyMsg)}</p>`;
  } else {
    const { resolveServicoIdForReport } = await import('./servicos-panel-utils.js');
    const { fetchAvaliacoesByServicoIds } = await import('./avaliacoes-db.js');
    if (token !== rhReviewStackRenderToken) return;

    const servicoIds = [
      ...new Set(reports.map((report) => resolveServicoIdForReport(report)).filter(Boolean)),
    ];
    const avaliacoesMap = await fetchAvaliacoesByServicoIds(servicoIds);
    if (token !== rhReviewStackRenderToken) return;

    const dayCollapseState = loadRhDayCollapseState();
    const cards = buildRhReviewGroupedStack(reports, {
      getJobFn: getJob,
      avaliacoesMap,
      dayCollapseState,
    });

    stackHtml = `<div class="rh-review-stack" role="list">${cards}</div>`;
  }

  const html = `
    <div class="rh-review-panel-inner">
      ${filterBar}
      <div class="rh-review-stack-wrap">${stackHtml}</div>
    </div>`;

  await deferPanelDomWrite(() => {
    if (token !== rhReviewStackRenderToken) return;
    panel.innerHTML = html;
    requestAnimationFrame(() => syncReviewPanelHeight());
    updateRhBatchToolbar(panel);
  });
}

function rhReviewModalCallbacks() {
  const queue = () => getRhFilteredReports();
  return {
    getNextReportId: (currentId) => getNextPendingReportId(currentId, queue()),
    navigateToBilling: (reportId) => navigateToBillingReport(reportId),
    onApproved: async () => {
      if (isOpsTabActive()) {
        renderCalendar();
        updateAdminChrome();
        await renderRhReviewStack();
        if (currentTab === 'calendario') {
          await refreshMetricsPanel(getMetricActionHandlers()).catch(console.error);
        }
        adminTabDirty.ops = false;
      } else {
        adminTabDirty.ops = true;
      }
      adminTabDirty.faturacao = true;
      if (currentTab === 'faturacao') {
        adminTabDirty.faturacao = false;
        await refreshFaturacaoPanel({ soft: true });
      }
    },
    onRejected: async () => {
      if (isOpsTabActive()) {
        renderCalendar();
        await renderRhReviewStack();
        updateAdminChrome();
      } else {
        adminTabDirty.ops = true;
      }
    },
  };
}

let rhReviewPanelBound = false;
/** Relatórios com aprovação rápida em curso (evita duplo clique). */
const rhApprovingReportIds = new Set();

function updateRhBatchToolbar(panel) {
  const checkboxes = [...panel.querySelectorAll('.rh-batch-checkbox:checked')];
  const btn = panel.querySelector('#rh-batch-approve');
  const allBox = panel.querySelector('#rh-select-all-pending');
  const pendingBoxes = [...panel.querySelectorAll('.rh-batch-checkbox')];
  if (btn) {
    btn.disabled = checkboxes.length === 0;
    btn.textContent = `Aprovar selecionados (${checkboxes.length})`;
  }
  if (allBox && pendingBoxes.length) {
    allBox.indeterminate = checkboxes.length > 0 && checkboxes.length < pendingBoxes.length;
    allBox.checked = checkboxes.length === pendingBoxes.length;
  }
}

async function approveSelectedRhReports(panel) {
  const ids = [...panel.querySelectorAll('.rh-batch-checkbox:checked')].map(
    (cb) => cb.dataset.batchReportId,
  );
  if (!ids.length) return;

  const confirmed = window.confirm(
    `Aprovar ${ids.length} relatório(s) selecionado(s)?\n\nVisitas com vários relatórios enviam um único e-mail ao cliente quando todos estiverem aprovados.`,
  );
  if (!confirmed) return;

  const btn = panel.querySelector('#rh-batch-approve');
  if (btn) btn.disabled = true;

  let approved = 0;
  let skippedEmail = 0;
  const total = ids.length;
  for (let i = 0; i < ids.length; i += 1) {
    const reportId = ids[i];
    if (btn) btn.textContent = `A aprovar ${i + 1}/${total}…`;

    const report = getReport(reportId);
    if (!report || report.status !== 'pending_review') continue;
    const client = getClient(report.clientId);
    const clientEmail = String(client?.email || client?.['E-mail'] || '').trim();
    if (!isValidClientEmail(clientEmail)) {
      skippedEmail += 1;
      continue;
    }
    const ok = await approveReport(reportId, { clientEmail });
    if (ok) approved += 1;
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Aprovar selecionados';
  }

  if (approved > 0) {
    showToast(
      approved === 1 ? '1 relatório aprovado.' : `${approved} relatórios aprovados.`,
      'success',
      6000,
    );
    if (skippedEmail > 0) {
      showToast(
        skippedEmail === 1
          ? '1 relatório ignorado — e-mail do cliente em falta ou inválido.'
          : `${skippedEmail} relatórios ignorados — e-mail do cliente em falta ou inválido.`,
        'warning',
        8000,
      );
    }
    await rhReviewModalCallbacks().onApproved?.();
  } else if (skippedEmail > 0) {
    showToast(
      skippedEmail === 1
        ? 'Relatório ignorado — e-mail do cliente em falta ou inválido.'
        : `${skippedEmail} relatórios ignorados — e-mail do cliente em falta ou inválido.`,
      'warning',
      8000,
    );
  } else {
    showToast('Nenhum relatório foi aprovado.', 'warning', 5000);
  }
}

function bindRhReviewPanel() {
  const panel = document.getElementById('rh-review-panel');
  if (!panel || rhReviewPanelBound) return;
  rhReviewPanelBound = true;

  let searchDebounce = null;

  panel.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'rh-review-search') {
      rhReviewSearch = target.value;
      persistRhReviewFilters();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        renderRhReviewStack().catch(console.error);
      }, 280);
    }
  });

  panel.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;

    if (target.id === 'rh-review-tech-filter') {
      rhReviewTechFilter = target.value;
      persistRhReviewFilters();
      renderRhReviewStack().catch(console.error);
      return;
    }

    if (target.id === 'rh-select-all-pending') {
      panel.querySelectorAll('.rh-batch-checkbox').forEach((cb) => {
        cb.checked = target.checked;
      });
      updateRhBatchToolbar(panel);
      return;
    }

    if (target.classList.contains('rh-batch-checkbox')) {
      updateRhBatchToolbar(panel);
      return;
    }
  });

  panel.addEventListener('click', (e) => {
    const batchBtn = e.target.closest('#rh-batch-approve');
    if (batchBtn) {
      void approveSelectedRhReports(panel);
      return;
    }

    const filterBtn = e.target.closest('[data-rh-filter]');
    if (filterBtn) {
      const next = filterBtn.dataset.rhFilter;
      if (next && next !== rhReviewFilter) {
        rhReviewFilter = next;
        persistRhReviewFilters();
        syncRhReviewFilterChipsUi(panel, next);
        queueRhReviewStackRender();
      }
      return;
    }

    const fullListBtn = e.target.closest('#rh-open-full-relatorios-tab');
    if (fullListBtn) {
      setAdminTab('relatorios');
      return;
    }

    const dayHeader = e.target.closest('.rh-review-day-group__header');
    if (dayHeader && !e.target.closest('.rh-review-day-group__count')) {
      const section = dayHeader.closest('.rh-review-day-group');
      if (section) {
        const nextCollapsed = !isRhDayCollapsed(section.dataset.day ?? '');
        toggleRhDayCollapsed(section.dataset.day ?? '');
        applyRhDayCollapseDom(section, nextCollapsed);
        return;
      }
    }

    const quickApproveNext = e.target.closest('[data-quick-approve-next]');
    if (quickApproveNext?.dataset.quickApproveNext) {
      const reportId = quickApproveNext.dataset.quickApproveNext;
      if (rhApprovingReportIds.has(reportId)) return;
      quickApproveNext.disabled = true;
      quickApproveNext.setAttribute('aria-busy', 'true');
      void quickApproveRhReportAndNext(reportId).finally(() => {
        quickApproveNext.disabled = false;
        quickApproveNext.removeAttribute('aria-busy');
      });
      return;
    }

    const quickApprove = e.target.closest('[data-quick-approve]');
    if (quickApprove?.dataset.quickApprove) {
      const reportId = quickApprove.dataset.quickApprove;
      if (rhApprovingReportIds.has(reportId)) return;
      quickApprove.disabled = true;
      quickApprove.setAttribute('aria-busy', 'true');
      void quickApproveRhReport(reportId).finally(() => {
        quickApprove.disabled = false;
        quickApprove.removeAttribute('aria-busy');
      });
      return;
    }

    const quickReject = e.target.closest('[data-quick-reject]');
    if (quickReject?.dataset.quickReject) {
      void import('./report-review-rh-modal.js').then(({ openRhRejectDialog }) => {
        openRhRejectDialog(quickReject.dataset.quickReject, rhReviewModalCallbacks().onRejected);
      });
      return;
    }

    const openBtn = e.target.closest('[data-panel-open]');
    if (openBtn?.dataset.panelOpen) {
      void import('./report-review-rh-modal.js').then(({ openRhReviewModal }) =>
        openRhReviewModal(openBtn.dataset.panelOpen, rhReviewModalCallbacks()),
      );
      return;
    }

    const servicoReviewBtn = e.target.closest('[data-servico-review]');
    if (servicoReviewBtn?.dataset.servicoReview) {
      void import('./report-review-rh-modal.js').then(({ openRhServicoReview }) =>
        openRhServicoReview(servicoReviewBtn.dataset.servicoReview, rhReviewModalCallbacks()),
      );
      return;
    }

    const resendVisitBtn = e.target.closest('[data-servico-resend-email]');
    if (resendVisitBtn?.dataset.servicoResendEmail) {
      const servicoId = resendVisitBtn.dataset.servicoResendEmail;
      const confirmed = window.confirm(
        'Reenviar e-mail da visita com todos os relatórios aprovados em anexo?',
      );
      if (!confirmed) return;
      resendVisitBtn.disabled = true;
      void import('./servicos-email-workflow.js')
        .then(({ resendServicoVisitClientEmail }) => resendServicoVisitClientEmail(servicoId))
        .then((ok) => {
          if (ok) {
            showToast('E-mail da visita reenviado ao cliente.', 'success', 7000);
            return renderRhReviewStack();
          }
        })
        .catch((err) => {
          console.error('[RH] Reenvio e-mail visita:', err);
          showToast(err?.message || 'Falha ao reenviar e-mail da visita.', 'error', 8000);
        })
        .finally(() => {
          resendVisitBtn.disabled = false;
        });
    }
  });
}

async function quickApproveRhReport(reportId, options = {}) {
  const { quiet = false } = options;
  const key = String(reportId || '');
  if (!key || rhApprovingReportIds.has(key)) return false;
  rhApprovingReportIds.add(key);

  try {
    const report = getReport(key);
    if (!report || report.status !== 'pending_review') return false;

    const client = getClient(report.clientId);
    const clientEmail = String(client?.email || client?.['E-mail'] || '').trim();
    if (!isValidClientEmail(clientEmail)) {
      showToast('E-mail do cliente em falta ou inválido. Abra «Rever» para corrigir.', 'error');
      return false;
    }

    const job = report.jobId ? getJob(report.jobId) : null;
    const ordem = formatOrdemLabel(job, client);
    const confirmMsg = isTestClient(client)
      ? `Aprovar relatório de teste (${ordem})? Sem número OP oficial; o e-mail segue normalmente se o cliente tiver endereço válido.`
      : `Aprovar ${ordem} e enviar para o cliente?`;
    const confirmed = quiet ? true : window.confirm(confirmMsg);
    if (!confirmed) return false;

    const ok = await approveReport(key, { clientEmail });
    if (ok) {
      await rhReviewModalCallbacks().onApproved?.();
      if (!quiet) await renderRhReviewStack();
    }
    return Boolean(ok);
  } finally {
    rhApprovingReportIds.delete(key);
  }
}

async function quickApproveRhReportAndNext(reportId) {
  const ok = await quickApproveRhReport(reportId);
  if (!ok) return;

  const nextId = getNextPendingReportId(reportId, getRhFilteredReports());
  if (nextId) {
    const { openRhReviewModal } = await import('./report-review-rh-modal.js');
    await openRhReviewModal(nextId, rhReviewModalCallbacks());
    return;
  }

  showToast('Relatório aprovado. Não há mais pendentes nesta fila.', 'success', 5000);
}

/** Swipe para a esquerda na vista Agenda — revela Eliminar */
function bindAgendaSwipeRows(container) {
  let openRow = null;

  const closeRow = (row) => {
    if (!row) return;
    row.classList.remove('is-open');
    const track = row.querySelector('.agenda-swipe-track');
    if (track) track.style.transform = '';
  };

  container.querySelectorAll('.agenda-swipe-row').forEach((row) => {
    const track = row.querySelector('.agenda-swipe-track');
    if (!track) return;

    let startX = 0;
    let startOffset = 0;
    let dragging = false;

    const applyOffset = (px) => {
      const clamped = Math.max(-AGENDA_SWIPE_OPEN_PX, Math.min(0, px));
      track.style.transform = `translateX(${clamped}px)`;
      return clamped;
    };

    const snapOpen = (open) => {
      if (open && openRow && openRow !== row) closeRow(openRow);
      if (open) {
        row.classList.add('is-open');
        track.style.transform = `translateX(-${AGENDA_SWIPE_OPEN_PX}px)`;
        openRow = row;
      } else {
        closeRow(row);
        if (openRow === row) openRow = null;
      }
    };

    track.addEventListener(
      'touchstart',
      (e) => {
        if (e.target.closest('[data-delete-job]')) return;
        dragging = true;
        startX = e.touches[0].clientX;
        startOffset = row.classList.contains('is-open') ? -AGENDA_SWIPE_OPEN_PX : 0;
      },
      { passive: true },
    );

    track.addEventListener(
      'touchmove',
      (e) => {
        if (!dragging) return;
        const dx = e.touches[0].clientX - startX;
        applyOffset(startOffset + dx);
      },
      { passive: true },
    );

    track.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const wasOpen = row.classList.contains('is-open');
      if (wasOpen && dx > 28) snapOpen(false);
      else if (!wasOpen && dx < -36) snapOpen(true);
      else snapOpen(wasOpen);
    });

    track.addEventListener('touchcancel', () => {
      dragging = false;
      snapOpen(row.classList.contains('is-open'));
    });
  });

  container.querySelectorAll('[data-delete-job]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteJob(btn.dataset.deleteJob);
    });
  });
}

function resolveCalendarItemById(id) {
  const servico = getServico(id);
  if (servico) return servicoToCalendarItem(servico);
  return getJob(id);
}

function buildJobDetailContent(job) {
  const techLabel = getJobTechnicianLabel(job.technicianId);
  const client = getClient(job.clientId);
  const service = getServiceType(job.serviceType);
  const report = getReportForJob(job.id);
  const reportLine = rhReportStatusLine(report);

  const rejectionBlock =
    job.status === 'rejected' && job.rejectionNote
      ? `<div class="job-detail-rejection"><strong>Nota de rejeição</strong>${escapeHtml(job.rejectionNote)}</div>`
      : '';

  return `
    <dl class="job-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(client?.name || '—')}</dd></div>
      <div><dt>Técnico</dt><dd>${escapeHtml(techLabel)}</dd></div>
      <div><dt>Serviço</dt><dd>${serviceIconHtml(service, 'ms-icon')} ${escapeHtml(service?.label || job.serviceType)}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateLong(job.date))}</dd></div>
      <div><dt>${LABEL_NUMERO_SERIE}</dt><dd>${escapeHtml(job.forkliftSerial || '—')}</dd></div>
      <div><dt>Estado</dt><dd>${statusBadge(job.status)}</dd></div>
      <div><dt>Relatório</dt><dd>${escapeHtml(reportLine)}</dd></div>
    </dl>
    ${rejectionBlock}
  `;
}

function buildCalendarItemDetailContent(item) {
  if (!item?.isServico) return buildJobDetailContent(item);

  const techLabel = getJobTechnicianLabel(item.technicianId);
  const client = getClient(item.clientId);
  const reports = getCalendarItemReports(item);
  const reportsHtml = reports.length
    ? `<ul class="job-detail-reports" style="margin:0;padding-left:1.1rem">${reports
        .map((r) => {
          const st = getServiceType(r.serviceType);
          const job = r.jobId ? getJob(r.jobId) : null;
          const op =
            job?.numeroOrdem != null
              ? ` · OP-2026-${String(job.numeroOrdem).padStart(2, '0')}`
              : '';
          return `<li>${serviceIconHtml(st, 'ms-icon')} ${escapeHtml(st?.label || r.serviceType || 'Relatório')}${escapeHtml(op)} — ${escapeHtml(rhReportStatusLine(r))}</li>`;
        })
        .join('')}</ul>`
    : '<p class="text-muted" style="margin:0">Ainda sem relatórios — o técnico adiciona no tablet.</p>';

  const rejectedNotes = reports
    .filter((r) => r.status === 'rejected' && r.rejectionNote)
    .map((r) => {
      const st = getServiceType(r.serviceType);
      return `<div class="job-detail-rejection"><strong>${escapeHtml(st?.label || 'Relatório')}</strong>${escapeHtml(r.rejectionNote)}</div>`;
    })
    .join('');

  const avaliacao = getCalendarAvaliacao(item);
  const avaliacaoLine = avaliacao
    ? `<div><dt>Avaliação do cliente</dt><dd>${escapeHtml(`${avaliacao.emoji} ${avaliacao.label}`)}</dd></div>`
    : '';

  return `
    <dl class="job-detail-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(client?.name || '—')}</dd></div>
      <div><dt>Técnicos</dt><dd>${escapeHtml(techLabel)}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateLong(item.date))}</dd></div>
      <div><dt>Estado</dt><dd>${statusBadge(item.status)}</dd></div>
      ${avaliacaoLine}
      <div><dt>Relatórios</dt><dd>${reportsHtml}</dd></div>
    </dl>
    ${rejectedNotes}
  `;
}

function openJobDetailModal(jobId) {
  const item = resolveCalendarItemById(jobId);
  if (!item) {
    showToast('Serviço não encontrado.', 'error');
    return;
  }

  const client = getClient(item.clientId);
  const reports = getCalendarItemReports(item);
  const pendingReport = reports.find((r) => r.status === 'pending_review');
  const report = item.isServico ? pendingReport || getCalendarItemReport(item) : getReportForJob(item.id);
  const deleteGuard = getRhCalendarVisitDeleteGuard(item);
  const modalTitle = item.isServico
    ? `${client?.name || 'Visita'} — ${formatDateLong(item.date)}`
    : `${getServiceType(item.serviceType)?.label || 'Serviço'} — ${client?.name || 'Serviço'} — ${formatDateLong(item.date)}`;

  const reviewBtn =
    report?.status === 'pending_review'
      ? `<button type="button" class="btn-primary" id="job-detail-review">${reports.filter((r) => r.status === 'pending_review').length > 1 ? 'Rever relatórios' : 'Rever relatório'}</button>`
      : '';

  const deleteBtn = deleteGuard.hasReports
    ? `<button type="button" class="btn-danger" id="job-detail-delete" title="Eliminar visita e todos os relatórios (confirmação extra)">Eliminar visita…</button>`
    : `<button type="button" class="btn-danger" id="job-detail-delete">Eliminar</button>`;

  const actions = `
    <button type="button" class="btn-ghost" id="job-detail-close">Fechar</button>
    <button type="button" class="btn-secondary" id="job-detail-reschedule">Alterar data</button>
    ${deleteBtn}
    ${reviewBtn}
  `;

  const overlay = openModal(modalTitle, buildCalendarItemDetailContent(item), actions);

  overlay.querySelector('#job-detail-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#job-detail-reschedule')?.addEventListener('click', () => {
    closeModal();
    openRescheduleJobModal(jobId);
  });
  overlay.querySelector('#job-detail-delete')?.addEventListener('click', () => {
    closeModal();
    confirmDeleteJob(jobId);
  });
  overlay.querySelector('#job-detail-review')?.addEventListener('click', async () => {
    closeModal();
    if (item.isServico && reports.filter((r) => r.status === 'pending_review').length) {
      const { openRhServicoReview } = await import('./report-review-rh-modal.js');
      rhReviewFilter = 'pending_review';
      persistRhReviewFilters();
      setAdminTab('relatorios');
      await openRhServicoReview(item.id, rhReviewModalCallbacks());
      return;
    }
    if (report?.id) {
      rhReviewFilter = 'pending_review';
      persistRhReviewFilters();
      setAdminTab('relatorios');
      const { openRhReviewModal } = await import('./report-review-rh-modal.js');
      await openRhReviewModal(report.id, rhReviewModalCallbacks());
    }
  });
}

function openRescheduleJobModal(jobId) {
  const item = resolveCalendarItemById(jobId);
  if (!item) {
    showToast('Serviço não encontrado.', 'error');
    return;
  }

  const client = getClient(item.clientId);
  const label = item.isServico
    ? `${client?.name || 'Cliente'} — visita ao cliente`
    : `${client?.name || 'Cliente'} — ${getServiceType(item.serviceType)?.label || 'Serviço'}`;

  const content = `
    <p class="text-muted" style="margin-bottom:1rem">${escapeHtml(label)}</p>
    <div class="form-group">
      <label class="form-label" for="reschedule-job-date">Nova data</label>
      <input type="date" class="form-input" id="reschedule-job-date" value="${escapeHtml(item.date)}" required>
    </div>
    <p class="text-muted" style="margin-top:0.5rem;font-size:0.8125rem">
      Data atual: <strong>${escapeHtml(formatDateLong(item.date))}</strong>. O técnico verá o serviço no novo dia.
    </p>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="cancel-reschedule-job">Cancelar</button>
    <button type="button" class="btn-primary" id="confirm-reschedule-job">Guardar data</button>
  `;

  const overlay = openModal('Alterar data do serviço', content, actions);
  const dateInput = overlay.querySelector('#reschedule-job-date');

  overlay.querySelector('#cancel-reschedule-job')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-reschedule-job')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirm-reschedule-job');
    const newDate = dateInput?.value?.trim();
    if (!newDate) {
      showToast('Selecione uma data.', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    const ok = item.isServico
      ? await rescheduleServico(jobId, newDate)
      : await rescheduleJob(jobId, newDate);
    if (ok) {
      closeModal();
      renderCalendar();
    } else {
      btn.disabled = false;
      btn.textContent = 'Guardar data';
    }
  });
}

function confirmDeleteJob(jobId) {
  const item = resolveCalendarItemById(jobId);
  if (!item) return;

  const deleteGuard = getRhCalendarVisitDeleteGuard(item);
  const reports = deleteGuard.reports;
  const client = getClient(item.clientId);
  const clientLabel = client?.name || 'este cliente';
  const dateLabel = formatDateLong(item.date);

  if (!deleteGuard.hasReports) {
    const content = `
      <p>Tem a certeza que deseja eliminar o serviço atribuído a <strong>${escapeHtml(clientLabel)}</strong> (${escapeHtml(dateLabel)})?</p>
      <p class="text-muted" style="margin-top:0.5rem;font-size:0.8125rem">Ainda não há relatórios nesta visita.</p>
    `;
    const actions = `
      <button type="button" class="btn-ghost" id="cancel-delete-job">Cancelar</button>
      <button type="button" class="btn-danger" id="confirm-delete-job">Eliminar</button>
    `;
    const overlay = openModal('Eliminar serviço', content, actions);
    overlay.querySelector('#cancel-delete-job')?.addEventListener('click', closeModal);
    overlay.querySelector('#confirm-delete-job')?.addEventListener('click', async () => {
      const ok = item.isServico ? await deleteServico(jobId) : await deleteJob(jobId);
      if (ok) {
        closeModal();
        renderCalendar();
      }
    });
    return;
  }

  const reportsList = reports
    .map((r) => {
      const st = getServiceType(r.serviceType);
      const job = r.jobId ? getJob(r.jobId) : null;
      const op =
        job?.numeroOrdem != null
          ? ` · OP-2026-${String(job.numeroOrdem).padStart(2, '0')}`
          : '';
      return `<li><strong>${escapeHtml(st?.label || r.serviceType || 'Relatório')}${escapeHtml(op)}</strong> — ${escapeHtml(rhReportStatusLine(r))}</li>`;
    })
    .join('');

  const content = `
    <div class="job-detail-rejection" style="margin-bottom:1rem">
      <strong>Esta visita tem trabalho do técnico.</strong>
      <p style="margin:0.35rem 0 0">Eliminar apaga <strong>permanentemente</strong> os relatórios abaixo. O técnico perde o trabalho guardado no tablet.</p>
    </div>
    <p>Visita: <strong>${escapeHtml(clientLabel)}</strong> (${escapeHtml(dateLabel)})</p>
    <ul class="job-detail-reports" style="margin:0.75rem 0;padding-left:1.1rem">${reportsList}</ul>
    <p class="text-muted" style="font-size:0.8125rem;margin-bottom:0.5rem">
      Para confirmar, escreva <strong>${escapeHtml(deleteGuard.confirmWord)}</strong> (maiúsculas):
    </p>
    <div class="form-group" style="margin:0">
      <input type="text" class="form-input" id="confirm-delete-typed" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(deleteGuard.confirmWord)}">
    </div>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="cancel-delete-job">Cancelar</button>
    <button type="button" class="btn-danger" id="confirm-delete-job" disabled>Eliminar visita e relatórios</button>
  `;

  const overlay = openModal('Eliminar visita com relatórios', content, actions);
  const typedInput = overlay.querySelector('#confirm-delete-typed');
  const confirmBtn = overlay.querySelector('#confirm-delete-job');

  const syncConfirmEnabled = () => {
    if (!confirmBtn || !typedInput) return;
    confirmBtn.disabled = !isRhVisitDeleteConfirmWord(typedInput.value);
  };
  typedInput?.addEventListener('input', syncConfirmEnabled);

  overlay.querySelector('#cancel-delete-job')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-delete-job')?.addEventListener('click', async () => {
    if (!isRhVisitDeleteConfirmWord(typedInput?.value)) {
      showToast(`Escreva ${deleteGuard.confirmWord} para confirmar.`, 'error');
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'A eliminar…';
    const ok = item.isServico
      ? await deleteServico(jobId, { force: true })
      : await deleteJob(jobId, { force: true });
    if (ok) {
      closeModal();
      renderCalendar();
    } else {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Eliminar visita e relatórios';
      syncConfirmEnabled();
    }
  });
}

function formatOrdemOp2026(numeroOrdem, client = null) {
  if (numeroOrdem != null) {
    return `Ordem OP-2026-${String(numeroOrdem).padStart(2, '0')}`;
  }
  if (isTestClient(client)) return 'Trabalho de teste (sem OP oficial)';
  return 'nova ordem';
}

function showPendingReportNotification(report) {
  const tech = getTechnician(report.technicianId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const client = getClient(report.clientId);
  const ordem = formatOrdemOp2026(job?.numeroOrdem, client);
  const clientName = client?.name || client?.Nome || '';
  const servicoId = resolveServicoIdForReport(report);
  const multi = servicoId && isServicoMultiReportVisit(servicoId);
  const reportCount = multi ? getServicoActiveReports(servicoId).length : 0;

  showNotificationToast(
    multi ? 'Nova Visita Pendente!' : 'Novo Relatório Pendente!',
    multi
      ? `O técnico ${tech?.name || '—'} concluiu a visita com ${reportCount} relatórios (${ordem}).`
      : `O técnico ${tech?.name || '—'} acabou de submeter o relatório da ${ordem}.`,
    {
      icon: 'bell',
      duration: 8000,
      dedupeKey: multi ? `servico-pending-${servicoId}` : report.id || report.jobId,
      onClick: () => scrollToReportInPanel(report.id),
    },
  );

  maybeNotifyRhPendingReport(report, {
    techName: tech?.name,
    ordem,
    clientName,
  });
}

async function handleNewPendingReport(report, opts = {}, beep) {
  if (!report?.id) return;
  try {
    await warmJobs();
  } catch (err) {
    console.warn('[Admin] Trabalhos para notificação:', err);
  }

  const client = getClient(report.clientId);
  if (reportPedidoOrcamentoRoutesToOrcamentosTab(report, client)) {
    showPendingReportNotification(report);
    await navigateToOrcamentoReport(report.id);
    if (opts.playSound && beep) beep();
    return;
  }

  rhReviewFilter = 'pending_review';
  setAdminTab('relatorios');
  renderCalendar();
  await renderRhReviewStack();
  showPendingReportNotification(report);
  scrollToReportInPanel(report.id);
  const { openRhReviewModal } = await import('./report-review-rh-modal.js');
  await openRhReviewModal(report.id, rhReviewModalCallbacks());
  if (opts.playSound && beep) beep();
}

function updatePendingCount() {
  const count = document.getElementById('pending-count');
  if (count) count.textContent = String(getPendingReports().length);
}

function bindAssignWork() {
  const btn = document.getElementById('btn-assign-work');
  btn?.addEventListener('click', () => {
    openAssignModal().catch((err) => {
      console.error('[Admin] Criar serviço:', err);
      showToast('Erro ao abrir o formulário de criação de serviço.', 'error');
    });
  });
}

const ASSIGN_TEAM_TECHS = ['Hugo', 'Filipe', 'Adelton'];

async function openAssignModal() {
  try {
    await ensureProductionCatalog();
  } catch (err) {
    console.error('[Admin] Clientes para atribuição:', err);
    showToast(formatClientsLoadError(err), 'error', 9000);
    return;
  }

  const techCheckboxes = ASSIGN_TEAM_TECHS.map(
    (name) => `
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          class="assign-tech-checkbox rounded text-blue-600 focus:ring-blue-500"
          name="assign-tech"
          value="${escapeHtml(name)}"
        >
        ${escapeHtml(name)}
      </label>
    `,
  ).join('');

  const content = `
    <form id="assign-form" class="assign-form">
      <div class="form-group">
        <label class="form-label">Técnicos <span class="text-muted">(escolha 1 a 3)</span></label>
        <div class="flex gap-4 mt-2" id="assign-tech-options">${techCheckboxes}</div>
        <p class="assign-tech-hint text-muted" id="assign-tech-hint" hidden>Selecione pelo menos um técnico.</p>
      </div>
      ${renderClientCombobox({ fieldId: 'assign-client', label: 'Cliente / Empresa' })}
      <p class="text-muted assign-test-hint" id="assign-test-hint" hidden>
        Cliente de teste — o serviço não recebe número OP oficial (só simulação).
      </p>
      <div class="form-group">
        <label class="form-label">Data do serviço</label>
        <input type="date" class="form-input form-input-date" id="assign-date" required autocomplete="off">
      </div>
    </form>
  `;

  const actions = `
    <button type="button" class="btn-ghost" id="cancel-assign">Cancelar</button>
    <button type="button" class="btn-primary" id="confirm-assign">Criar Serviço</button>
  `;

  const overlay = openModal('Criar Serviço', content, actions);
  await bindClientComboboxes(overlay);

  const testHint = overlay.querySelector('#assign-test-hint');
  const assignClientCombo = overlay.querySelector(
    '[data-client-combobox][data-field-id="assign-client"]',
  );
  const syncAssignTestHint = () => {
    const clientId = assignClientCombo?.querySelector('.client-combobox-id')?.value || '';
    const client = clientId ? getClient(clientId) : null;
    if (testHint) testHint.hidden = !isTestClient(client);
  };
  assignClientCombo?.querySelector('.client-combobox-input')?.addEventListener('input', syncAssignTestHint);
  assignClientCombo?.addEventListener('mousedown', (e) => {
    if (e.target.closest('.client-combobox-option')) setTimeout(syncAssignTestHint, 0);
  });
  assignClientCombo?.querySelector('.client-combobox-clear')?.addEventListener('click', () => {
    setTimeout(syncAssignTestHint, 0);
  });

  const dateInput = overlay.querySelector('#assign-date');
  dateInput.value = new Date().toISOString().split('T')[0];

  const techHint = overlay.querySelector('#assign-tech-hint');
  const assignForm = overlay.querySelector('#assign-form');

  overlay.querySelectorAll('.assign-tech-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = overlay.querySelectorAll('.assign-tech-checkbox:checked');
      if (checked.length > 3) {
        cb.checked = false;
        showToast('Pode selecionar no máximo 3 técnicos.', 'warning');
      }
      if (techHint) techHint.hidden = checked.length >= 1;
    });
  });

  const submitAssignForm = async () => {
    const selectedTechs = [...overlay.querySelectorAll('.assign-tech-checkbox:checked')].map(
      (el) => el.value.trim(),
    ).filter(Boolean);
    const clientId = overlay.querySelector(
      '[data-client-combobox][data-field-id="assign-client"] .client-combobox-id',
    )?.value;
    const date = overlay.querySelector('#assign-date').value;

    if (selectedTechs.length < 1) {
      if (techHint) techHint.hidden = false;
      showToast('Selecione pelo menos um técnico.', 'error');
      return;
    }
    if (selectedTechs.length > 3) {
      showToast('Pode selecionar no máximo 3 técnicos.', 'error');
      return;
    }
    if (!clientId || !date) {
      showToast('Preencha todos os campos.', 'error');
      return;
    }

    const id = await assignServico({
      technicianId: selectedTechs.join(', '),
      clientId,
      date,
      time: '',
    });
    if (!id) return;
    closeModal();
    renderCalendar();
  };

  overlay.querySelector('#cancel-assign')?.addEventListener('click', closeModal);
  overlay.querySelector('#confirm-assign')?.addEventListener('click', () => {
    submitAssignForm().catch((err) => {
      console.error('[Admin] Criar serviço:', err);
      showToast('Erro ao criar serviço.', 'error');
    });
  });
  assignForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    overlay.querySelector('#confirm-assign')?.click();
  });
}
