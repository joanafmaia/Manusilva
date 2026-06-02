/**
 * Manusilva PWA — Core Architecture
 * Storage, auth, utilities, notifications
 */

import {
  COMPANY,
  CLIENTS,
  clients,
  mapClientToLegacy,
  TECHNICIANS,
  SERVICE_TYPES,
  reportTemplates,
  JOB_STATUSES,
  seedDatabase,
} from './mock_data.js';
import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  loadClientsDataModule,
} from './clients-catalog.js';
export { MANUSILVA_LOGO, applyBrandLogo, isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';

import {
  APP_SESSION_KEY,
  clearSession,
  getSession,
  normalizeSession,
} from './session.js';
import { applyThemeToDocument } from './theme.js';
import { LoginView } from './views/login.js';
import { AuthService } from './auth.js';

export { APP_SESSION_KEY, clearSession, getSession, normalizeSession };

const DB_KEY = 'manusilva_db';
const REPORT_EMAIL_SUBJECT_PREFIX = '[ManuSilva] Relatório de Intervenção';

/* ─── Storage Layer ─── */

export function getDB() {
  seedDatabase();
  return JSON.parse(localStorage.getItem(DB_KEY));
}

/** Pré-carrega o catálogo de 560 clientes (uma vez por sessão) */
export function warmClientsCatalog() {
  return ensureProductionCatalog();
}

function normalizeStoredClient(record) {
  if (!record) return null;
  return record.name ? record : mapClientToLegacy(record);
}

/**
 * Sincroniza o catálogo completo para `manusilva_db.clients` no localStorage.
 * Preserva empilhadores dos registos demo já existentes.
 */
export async function ensureFullClientsInStorage() {
  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog();
  const db = getDB();
  const stored = Array.isArray(db.clients) ? db.clients : [];

  if (!catalog.length) {
    const fallback = stored.length ? stored : clients;
    return fallback.map(normalizeStoredClient).filter(Boolean);
  }

  if (stored.length >= catalog.length) {
    return stored.map(normalizeStoredClient).filter(Boolean);
  }

  const forkliftsById = new Map();
  stored.forEach((row) => {
    const leg = normalizeStoredClient(row);
    if (leg?.forklifts?.length) forkliftsById.set(leg.id, leg.forklifts);
  });

  const merged = catalog.map((row) => {
    const copy = { ...row };
    if (forkliftsById.has(copy.id)) copy.forklifts = forkliftsById.get(copy.id);
    return copy;
  });

  updateDB((d) => {
    d.clients = merged;
  });

  return merged.map(normalizeStoredClient).filter(Boolean);
}

/** Lista completa de clientes (localStorage + catálogo), ordenada por nome */
export async function getAllClientsList() {
  const list = await ensureFullClientsInStorage();
  return [...list].sort((a, b) =>
    String(a.name || a.Nome).localeCompare(String(b.name || b.Nome), 'pt'),
  );
}

export function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent('db-updated'));
}

export function updateDB(updater) {
  const db = getDB();
  updater(db);
  saveDB(db);
  return db;
}

/**
 * Dispara envio de e-mail oficial via Serverless Function (`/api/enviar-email`).
 * @param {{ tipoRelatorio?: string, reportId?: string, clienteNome?: string, nome_empresa?: string, tecnico?: string, dataConclusao?: string, to?: string, serieFrota?: string, pdfFilename?: string, pdfBase64?: string }} [meta]
 */
export async function sendOfficialReportEmail(meta = {}) {
  const dateStamp =
    meta.dataConclusao ||
    new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const clienteNome = meta.clienteNome || meta.nome_empresa || 'Cliente não indicado';
  const tecnico = meta.tecnico || 'Técnico não indicado';
  const tipoRelatorio = meta.tipoRelatorio || 'outro';
  const serieFrota = meta.serieFrota || '';

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: meta.to,
      reportId: meta.reportId,
      clienteNome,
      tecnico,
      dataConclusao: dateStamp,
      tipoRelatorio,
      serieFrota,
      pdfFilename: meta.pdfFilename,
      pdfBase64: meta.pdfBase64,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const details = [err.error, err.hint, err.code, err.responseCode]
      .filter(Boolean)
      .join(' | ');
    throw new Error(details || 'Falha ao enviar e-mail pela API.');
  }

  return true;
}

export function requireAuth(role) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (role && session.role !== role) {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return null;
  }
  return session;
}

/* ─── Lookups ─── */

export function getClient(id) {
  const raw = getDB().clients.find((c) => c.id === id) || clients.find((c) => c.id === id);
  if (!raw) {
    const fromCatalog = getClientFromCatalog(id);
    if (fromCatalog) return mapClientToLegacy(fromCatalog);
    return CLIENTS.find((c) => c.id === id);
  }
  return raw.name ? raw : mapClientToLegacy(raw);
}

const TECHNICIAN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

/** Técnicos persistidos + demonstração (sem duplicar id) */
export function getAllTechnicians() {
  const db = getDB();
  const stored = Array.isArray(db.technicians) ? db.technicians : [];
  const seen = new Set(stored.map((t) => t.id));
  const merged = [...stored];
  TECHNICIANS.forEach((t) => {
    if (!seen.has(t.id)) merged.push(t);
  });
  return merged;
}

export function getTechnician(id) {
  return getAllTechnicians().find((t) => t.id === id) || null;
}

function nextTechnicianId() {
  const ids = getAllTechnicians().map((t) => {
    const m = /^tech-(\d+)$/.exec(t.id || '');
    return m ? Number(m[1]) : 0;
  });
  return `tech-${Math.max(0, ...ids, 0) + 1}`;
}

/**
 * Novo técnico — push em `technicians` e `utilizadores` (login).
 * @returns {object|null} registo do técnico
 */
export function addTechnician({ nome, email, telemovel, nif, password }) {
  const name = String(nome || '').trim();
  const mail = String(email || '').trim();
  const phone = String(telemovel || '').trim();
  if (!name || !mail || !phone) {
    showToast('Preencha nome, e-mail e telemóvel do técnico.', 'error');
    return null;
  }

  const emailKey = mail.toLowerCase();
  const db = getDB();
  const utilizadores = db.utilizadores || [];
  if (utilizadores.some((u) => u.role === 'Tecnico' && String(u.email || '').toLowerCase() === emailKey)) {
    showToast('Já existe um técnico com este e-mail.', 'error');
    return null;
  }

  const id = nextTechnicianId();
  const storedTechs = db.technicians || [];
  const color = TECHNICIAN_COLORS[storedTechs.length % TECHNICIAN_COLORS.length];
  const pwd = String(password || '').trim() || '12345';

  const technician = {
    id,
    name,
    email: mail,
    phone,
    nif: String(nif || '').trim(),
    color,
  };

  const utilizador = {
    nome: name,
    nif: String(nif || '').trim() || null,
    telemovel: phone,
    email: mail,
    role: 'Tecnico',
    technicianId: id,
    password: pwd,
  };

  updateDB((d) => {
    if (!Array.isArray(d.technicians)) d.technicians = [];
    if (!Array.isArray(d.utilizadores)) d.utilizadores = [];
    d.technicians.push(technician);
    d.utilizadores.push(utilizador);
  });

  showToast(
    `Técnico «${name}» criado. Login: ${mail} · palavra-passe: ${pwd}`,
    'success',
    6500,
  );
  return technician;
}

/**
 * Novo cliente — push em `clients` e catálogo em memória (pesquisa/agendamento).
 * @returns {object|null} registo normalizado
 */
export async function addClient(payload) {
  const nome = String(payload?.Nome ?? payload?.nome ?? '').trim();
  if (!nome) {
    showToast('O nome do cliente é obrigatório.', 'error');
    return null;
  }

  const nif = String(payload?.NIF ?? payload?.nif ?? '').trim();
  const db = getDB();
  const existing = (db.clients || []).find(
    (c) => (nif && String(c.NIF || c.nif) === nif) || String(c.Nome || c.name) === nome,
  );
  if (existing) {
    showToast('Já existe um cliente com este NIF ou nome.', 'error');
    return null;
  }

  const record = {
    id: payload?.id || `cli-${Date.now()}`,
    Nome: nome,
    NIF: nif,
    'E-mail': String(payload?.['E-mail'] ?? payload?.email ?? '').trim(),
    Morada: String(payload?.Morada ?? payload?.morada ?? '').trim(),
    'Código postal': String(payload?.['Código postal'] ?? payload?.codigoPostal ?? '').trim(),
    Localidade: String(payload?.Localidade ?? payload?.localidade ?? '').trim(),
    'País/Região': String(payload?.['País/Região'] ?? payload?.pais ?? 'Portugal').trim() || 'Portugal',
    forklifts: Array.isArray(payload?.forklifts) ? payload.forklifts : [],
  };

  const { registerClientInCatalog } = await import('./clients-catalog.js');

  updateDB((d) => {
    if (!Array.isArray(d.clients)) d.clients = [];
    d.clients.push(record);
  });

  registerClientInCatalog(record);

  showToast(`Cliente «${nome}» adicionado e disponível para pesquisa.`, 'success');
  return record;
}

export function getServiceType(id) {
  return reportTemplates.find((s) => s.id === id) || SERVICE_TYPES.find((s) => s.id === id);
}

export function getForklift(clientId, serial) {
  const client = getClient(clientId);
  return client?.forklifts.find((f) => f.serial === serial);
}

export function getJob(id) {
  return getDB().jobs.find((j) => j.id === id);
}

export function getReport(id) {
  return getDB().reports.find((r) => r.id === id);
}

export function getReportForJob(jobId) {
  return getDB().reports.find((r) => r.jobId === jobId);
}

export function getJobsForTechnician(techId, date) {
  return getDB().jobs.filter((j) => j.technicianId === techId && j.date === date);
}

export function getAllJobs() {
  return getDB().jobs;
}

export function getPendingReports() {
  return getDB().reports.filter((r) => r.status === 'pending_review');
}

/* ─── Offline Mode ─── */

export function isOffline() {
  return getDB().settings?.offline ?? false;
}

export function setOfflineMode(value) {
  updateDB((db) => {
    db.settings.offline = value;
  });
  if (!value) syncOfflineQueue();
}

export function queueOfflineAction(action) {
  updateDB((db) => {
    db.offlineQueue.push({ ...action, queuedAt: new Date().toISOString() });
  });
}

export function syncOfflineQueue() {
  const db = getDB();
  if (!db.offlineQueue.length) return;

  const queue = [...db.offlineQueue];
  updateDB((db) => {
    db.offlineQueue = [];
    queue.forEach((action) => {
      if (action.type === 'submit_report') {
        const existing = db.reports.findIndex((r) => r.id === action.report.id);
        if (existing >= 0) db.reports[existing] = action.report;
        else db.reports.push(action.report);
        const job = db.jobs.find((j) => j.id === action.report.jobId);
        if (job) {
          job.status = 'completed';
          job.rejectionNote = null;
        }
      }
    });
  });

  showToast(`${queue.length} relatório(s) sincronizado(s) com sucesso!`, 'success');
}

/* ─── Report Actions ─── */

/**
 * Guarda progresso do relatório no localStorage (`manusilva_db.reports`).
 * Não gera ficheiro PDF — apenas os dados do formulário.
 */
/**
 * @param {object} report
 * @param {{ silent?: boolean }} [options] — `silent: true` para auto-save (sem toast)
 */
export function saveReportDraft(report, options = {}) {
  const { silent = false } = options;

  if (!report?.jobId) {
    if (!silent) showToast('Não foi possível guardar o rascunho.', 'error');
    return;
  }

  const draft = {
    ...report,
    id: report.id || `rep-draft-${report.jobId}`,
    status: 'draft',
    submittedAt: report.submittedAt || new Date().toISOString(),
  };

  updateDB((db) => {
    const idx = db.reports.findIndex((r) => r.id === draft.id || r.jobId === draft.jobId);
    if (idx >= 0) db.reports[idx] = draft;
    else db.reports.push(draft);
  });

  window.dispatchEvent(new CustomEvent('db-updated'));

  if (!silent) {
    showToast(
      'Rascunho guardado no browser (dados do formulário). Não é um PDF — use «Pré-visualizar» para ver o PDF.',
      'success',
      5000,
    );
  }
}

export function submitReport(report) {
  const offline = isOffline();

  if (offline) {
    queueOfflineAction({ type: 'submit_report', report: { ...report, status: 'pending_review' } });
    showToast('Relatório guardado localmente. Será sincronizado quando voltar online.', 'warning');
    return { queued: true };
  }

  updateDB((db) => {
    const idx = db.reports.findIndex((r) => r.id === report.id);
    const final = { ...report, status: 'pending_review', submittedAt: new Date().toISOString() };
    if (idx >= 0) db.reports[idx] = final;
    else db.reports.push(final);

    const job = db.jobs.find((j) => j.id === report.jobId);
    if (job) {
      job.status = 'completed';
      job.rejectionNote = null;
    }
  });

  showToast('Relatório submetido para aprovação!', 'success');
  return { queued: false };
}

export async function approveReport(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return null;
  }

  const client = getClient(report.clientId);

  try {
    showToast('A gerar folha de intervenção em PDF...', 'info', 2500);
    const { renderInterventionPDF } = await import('./pdf-report.js');

    // Renderiza uma vez: usamos o mesmo documento para download e para anexo no e-mail.
    const doc = await renderInterventionPDF(report);
    const safeSerial = (report.forkliftSerial || 'report').replace(/[^\w-]/g, '_');
    const dateStamp = (report.submittedAt || new Date().toISOString()).slice(0, 10);
    const filename = `Manusilva_${report.serviceType}_${safeSerial}_${dateStamp}.pdf`;

    // Gera anexo em memória (base64) para envio no back-end.
    const pdfBlob = doc.output('blob');
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);
    const pdfBase64Len = pdfBase64.length;

    // Mantém o comportamento existente de download local.
    doc.save(filename);

    updateDB((db) => {
      const r = db.reports.find((x) => x.id === reportId);
      if (r) {
        r.status = 'approved';
        r.approvedAt = new Date().toISOString();
        r.pdfFilename = filename;
      }
      const job = db.jobs.find((j) => j.id === r?.jobId);
      if (job) job.status = 'completed';
    });

    showToast(
      `Relatório aprovado! PDF "${filename}" gerado. A enviar automaticamente para ${client?.email || 'N/A'}...`,
      'success',
      7000
    );

    const recipientEmail = client?.email || client?.['E-mail'] || '';
    if (recipientEmail) {
      const values = report?.data?.values || {};
      const tipoRelatorio =
        report.serviceType === 'inspecao_dl50_2005'
          ? 'dl50-2005'
          : report.serviceType === 'manutencao_baterias_grandes'
            ? 'baterias'
            : 'outro';

      // Proteção: payload grande pode estourar limite do body em serverless (e falhar o envio).
      const MAX_BASE64_LEN = 3_000_000; // ~2.2MB binário (base64 tem overhead)
      const attachPdf = pdfBase64Len > 0 && pdfBase64Len <= MAX_BASE64_LEN;
      if (!attachPdf) {
        showToast('E-mail será enviado sem anexo (PDF demasiado grande).', 'warning', 6000);
      }

      sendOfficialReportEmail({
        tipoRelatorio,
        reportId: report.id,
        clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
        nome_empresa: values.nome_empresa || '',
        tecnico: values.tecnico || getTechnician(report.technicianId)?.name || '',
        dataConclusao: values.data_de_conclusao || String(report.submittedAt || '').split('T')[0] || '',
        serieFrota: values.numero_de_serie || report.forkliftSerial || '',
        to: recipientEmail,
        pdfFilename: attachPdf ? filename : undefined,
        pdfBase64: attachPdf ? pdfBase64 : undefined,
      }).catch((err) => {
        console.error('[Email] Envio após aprovação falhou:', err);
        showToast(
          `Relatório aprovado, mas o e-mail para o cliente falhou. ${err?.message || ''}`.trim(),
          'warning',
          8000,
        );
      });
    } else {
      showToast('Relatório aprovado, mas o cliente não tem e-mail registado.', 'warning');
    }

    return filename;
  } catch (err) {
    console.error('[PDF]', err);
    showToast('Erro ao gerar o PDF. Tente novamente.', 'error');
    return null;
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function rejectReport(reportId, note) {
  updateDB((db) => {
    const r = db.reports.find((x) => x.id === reportId);
    if (!r) return;
    r.status = 'rejected';
    r.rejectionNote = note;
    const job = db.jobs.find((j) => j.id === r.jobId);
    if (job) {
      job.status = 'rejected';
      job.rejectionNote = note;
    }
  });
  showToast('Relatório rejeitado. O técnico foi notificado.', 'error');
}

export function assignJob(jobData) {
  const id = `job-${Date.now()}`;
  updateDB((db) => {
    db.jobs.push({ id, status: 'scheduled', rejectionNote: null, ...jobData });
  });
  showToast('Trabalho atribuído com sucesso!', 'success');
  return id;
}

/** Remove trabalho atribuído e relatórios associados (rascunho, pendente, etc.) */
export function deleteJob(jobId) {
  let removed = false;
  updateDB((db) => {
    const idx = db.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    db.jobs.splice(idx, 1);
    db.reports = (db.reports || []).filter((r) => r.jobId !== jobId);
    removed = true;
  });
  if (removed) {
    showToast('Trabalho eliminado.', 'success');
    window.dispatchEvent(new CustomEvent('db-updated'));
  }
  return removed;
}

/* ─── Date Utilities ─── */

export function getWeekDates(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt.toISOString().split('T')[0]);
  }
  return dates;
}

export function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function isToday(iso) {
  return iso === new Date().toISOString().split('T')[0];
}

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function getDayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return DAY_LABELS[idx];
}

export function getDayNumber(iso) {
  return new Date(iso + 'T00:00:00').getDate();
}

/* ─── UI Utilities ─── */

export function statusBadge(status) {
  const s = JOB_STATUSES[status] || JOB_STATUSES.scheduled;
  return `<span class="status-badge" style="color:${s.color};background:${s.bg};border:1px solid ${s.border}">${s.label}</span>`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ─── Toast Notifications ─── */

let toastContainer = null;

export function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ─── Modal ─── */

export function openModal(title, content, actions = '') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal glass-card">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
      ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  requestAnimationFrame(() => overlay.classList.add('show'));
  return overlay;
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }
}

/* ─── Re-exports para dashboards (sem carregar PDF/form-engine no admin) ─── */

export {
  COMPANY,
  CLIENTS,
  clients,
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

/* ─── Tema + arranque da app (index.html) ─── */

/** Aplica `dark-mode` / `light-mode` no body (localStorage `app_theme`) */
export function initAppTheme() {
  return applyThemeToDocument();
}

/**
 * Router simples: login ou redireciona para o painel conforme a sessão.
 * @param {string} [containerId] id do contentor (`app` ou `app-root`)
 */
export function bootstrapApp(containerId = 'app') {
  initAppTheme();
  seedDatabase();

  const appContainer =
    document.getElementById(containerId) || document.getElementById('app-root');

  if (!appContainer) {
    console.error(`[ManuSilva] Contentor #${containerId} (ou #app-root) não encontrado.`);
    return;
  }

  const sessao = AuthService.getSessao();
  const session = sessao ? normalizeSession(sessao) : null;

  if (session?.role) {
    window.location.replace(session.role === 'admin' ? 'admin.html' : 'dashboard.html');
    return;
  }

  appContainer.innerHTML = LoginView.render();
  LoginView.init();
}

/** Tema assim que qualquer página importa `app.js` */
initAppTheme();
