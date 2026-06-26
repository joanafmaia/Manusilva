/**
 * Manusilva PWA — Core Architecture
 * Storage, auth, utilities, notifications
 */

import { getSupabaseClient } from './supabase-client.js';

export { getSupabaseClient };

import {
  COMPANY,
  CLIENTS,
  DEMO_CLIENT_FORKLIFTS,
  mapClientToLegacy,
  TECHNICIANS,
  SERVICE_TYPES,
  reportTemplates,
  JOB_STATUSES,
  PDF_DOCUMENT_TITLES,
  seedDatabase,
} from './mock_data.js';
import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  loadClientsDataModule,
  registerClientInCatalog,
  normalizeClientRecord,
  formatClientInsertError,
  formatClientUpdateError,
  resetProductionCatalogCache,
} from './clients-catalog.js';
import { isTestClient } from './client-test-utils.js';
import {
  ensureJobsLoaded,
  getJobsSnapshot,
  insertTrabalho,
  insertTrabalhoFromReport,
  deleteTrabalho,
  patchTrabalhoStatus,
  patchTrabalho,
  formatTrabalhosError,
} from './trabalhos-db.js';
import {
  uploadTrabalhoPdf,
  formatPdfStorageError,
  buildReportPdfFilename,
} from './pdf-storage.js';
import {
  ensureReportsLoaded,
  getReportsSnapshot,
  upsertRelatorio,
  updateRelatorio,
  deleteRelatoriosByTrabalho,
  formatRelatoriosError,
} from './relatorios-db.js';
import { reportOrcamentoPorPreparar } from './pedido-orcamento.js';
import {
  jobMatchesTechnician,
  splitTechnicianStoredValue,
} from './job-technician-utils.js';
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
import { normalizeFaturaCondicao,
  normalizeStatusRecebimento,
} from './billing-constants.js';
import { sameEntityId, normalizeEntityId } from './entity-id.js';
import { isDevMockEnabled } from './env.js';
import { initErrorMonitoring, captureError } from './error-monitor.js';

export { sameEntityId, normalizeEntityId } from './entity-id.js';
export { captureError } from './error-monitor.js';

export { APP_SESSION_KEY, clearSession, getSession, normalizeSession };

const DB_KEY = 'manusilva_db';
const REPORT_EMAIL_SUBJECT_PREFIX = '[ManuSilva] Relatório de Intervenção';

/* ─── Storage Layer (cache em memória — evita parse repetido do localStorage) ─── */

/** Cache do objeto persistido (sem jobs/reports vindos do Supabase). */
let dbMemoryCache = null;
let dbSeedChecked = false;

function ensureSeededOnce() {
  if (dbSeedChecked) return;
  seedDatabase();
  dbSeedChecked = true;
}

function recoverCorruptedDbStorage(reason) {
  console.warn('[ManuSilva] localStorage manusilva_db inválido; a repor base de dados.', reason);
  invalidateDbMemoryCache();
  try {
    localStorage.removeItem(DB_KEY);
  } catch {
    /* ignore */
  }
  seedDatabase();
  dbSeedChecked = true;
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  } catch {
    return {
      clients: [],
      technicians: [],
      utilizadores: [],
      offlineQueue: [],
      settings: { offline: false },
    };
  }
}

function readPersistedDbFromStorage() {
  ensureSeededOnce();
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    seedDatabase();
    dbSeedChecked = true;
    try {
      return JSON.parse(localStorage.getItem(DB_KEY));
    } catch (err) {
      return recoverCorruptedDbStorage(err);
    }
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return recoverCorruptedDbStorage(err);
  }
}

function ensureMemoryCache() {
  if (!dbMemoryCache) {
    dbMemoryCache = readPersistedDbFromStorage();
    if (stripPasswordsFromDb(dbMemoryCache)) {
      const payload = { ...dbMemoryCache, jobs: [], reports: [] };
      localStorage.setItem(DB_KEY, JSON.stringify(payload));
    }
  }
  return dbMemoryCache;
}

/** Limpa a cache — usar após reset externo do localStorage (`resetDatabase`). */
export function invalidateDbMemoryCache() {
  dbMemoryCache = null;
  dbSeedChecked = false;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('manusilva-db-reset', invalidateDbMemoryCache);
}

/** Garante schema seed + cache quente (arranque da app). */
export function initLocalDatabase() {
  initErrorMonitoring();
  ensureSeededOnce();
  ensureMemoryCache();
}

export function getDB() {
  const db = ensureMemoryCache();
  db.jobs = getJobsSnapshot();
  db.reports = getReportsSnapshot();
  return db;
}

/** Pré-carrega o catálogo de clientes do Supabase (uma vez por sessão) */
export function warmClientsCatalog() {
  return ensureProductionCatalog();
}

/** Garante catálogo carregado antes de pintar painéis (admin / técnico) */
export async function prepareClientsCatalog() {
  return ensureProductionCatalog();
}

/** Carrega trabalhos do Supabase (substitui lista local em localStorage) */
export function warmJobs() {
  return ensureJobsLoaded();
}

/** Carrega relatórios do Supabase (substitui lista local em localStorage) */
export function warmReports() {
  return ensureReportsLoaded();
}

export async function warmOperacoes() {
  const { ensureSupabaseAuthSession } = await import('./supabase-client.js');
  await ensureSupabaseAuthSession();
  await ensureJobsLoaded();
  await ensureReportsLoaded();
  await ensureProductionCatalog();
}

/**
 * Trata erros fatais de arranque da dashboard (sessão/token inválido).
 * Se o erro for de sessão, limpa storage e redireciona para o login.
 * @param {unknown} error
 * @returns {Promise<boolean>} true se o redirect foi iniciado
 */
export async function handleFatalDashboardError(error) {
  console.error('Erro fatal ao iniciar dashboard:', error);

  const msg = String(error?.message || '').toLowerCase();
  const isSessionError =
    error?.code === 'AUTH_SESSION_MISSING' ||
    msg.includes('sessão') ||
    msg.includes('sessao') ||
    msg.includes('session') ||
    msg.includes('token') ||
    msg.includes('jwt');

  if (!isSessionError) return false;

  console.warn('Sessão expirada totalmente. A redirecionar para o login...');
  const { handleFatalAuthSessionError } = await import('./supabase-client.js');
  handleFatalAuthSessionError(error?.message || 'Sessão em falta no arranque da dashboard.');
  return true;
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
    return stored.map(normalizeStoredClient).filter(Boolean);
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

function sanitizeUtilizadores(list) {
  if (!Array.isArray(list)) return list;
  return list.map((u) => {
    if (!u || typeof u !== 'object') return u;
    const { password: _pwd, ...rest } = u;
    return rest;
  });
}

function stripPasswordsFromDb(db) {
  if (!db?.utilizadores?.length) return false;
  const hadPasswords = db.utilizadores.some((u) => u && Object.prototype.hasOwnProperty.call(u, 'password'));
  if (!hadPasswords) return false;
  db.utilizadores = sanitizeUtilizadores(db.utilizadores);
  return true;
}

export function saveDB(db) {
  const payload = { ...db, jobs: [], reports: [] };
  if (Array.isArray(payload.utilizadores)) {
    payload.utilizadores = sanitizeUtilizadores(payload.utilizadores);
  }
  localStorage.setItem(DB_KEY, JSON.stringify(payload));
  dbMemoryCache = { ...payload };
  window.dispatchEvent(new CustomEvent('db-updated'));
}

export function updateDB(updater) {
  const db = getDB();
  updater(db);
  db.jobs = [];
  db.reports = [];
  saveDB(db);
  dbMemoryCache.jobs = getJobsSnapshot();
  dbMemoryCache.reports = getReportsSnapshot();
  return dbMemoryCache;
}

/**
 * Dispara envio de e-mail oficial via Serverless Function (`/api/enviar-email`).
 * @param {{ tipoRelatorio?: string, reportId?: string, clienteNome?: string, nome_empresa?: string, tecnico?: string, dataConclusao?: string, to?: string, serieFrota?: string, numeroOrdem?: number | null, pdfUrl?: string, pdfFilename?: string, pdfBase64?: string }} [meta]
 */
export async function sendOfficialReportEmail(meta = {}) {
  const { getFreshAccessToken } = await import('./supabase-client.js');
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sessão expirada. Inicie sessão novamente para enviar o e-mail.');
  }

  const dateStamp =
    meta.dataConclusao ||
    new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const clienteNome = meta.clienteNome || meta.nome_empresa || 'Cliente não indicado';
  const tecnico = meta.tecnico || 'Técnico não indicado';
  const tipoRelatorio = meta.tipoRelatorio || 'outro';
  const serieFrota = meta.serieFrota || '';

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: meta.to,
      reportId: meta.reportId,
      clienteNome,
      tecnico,
      dataConclusao: dateStamp,
      tipoRelatorio,
      serieFrota,
      numeroOrdem: meta.numeroOrdem ?? null,
      orcamentoNumero: meta.orcamentoNumero,
      pdfUrl: meta.pdfUrl,
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

/**
 * Envia proposta comercial MS.015 por e-mail (destinatário independente do relatório).
 */
export async function sendOrcamentoProposalEmail(meta = {}) {
  const { getFreshAccessToken } = await import('./supabase-client.js');
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sessão expirada. Inicie sessão novamente para enviar a proposta.');
  }

  const dateStamp =
    meta.dataConclusao ||
    new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const payload = {
    to: meta.to,
    reportId: meta.reportId,
    clienteNome: meta.clienteNome || meta.nome_empresa || 'Cliente não indicado',
    tecnico: meta.tecnico || 'Técnico não indicado',
    dataConclusao: dateStamp,
    tipoRelatorio: 'orcamento',
    orcamentoNumero: meta.orcamentoNumero || '',
    numeroOrdem: meta.numeroOrdem ?? null,
    pdfUrl: meta.pdfUrl,
  };
  if (meta.pdfBase64 && meta.pdfFilename) {
    payload.pdfBase64 = meta.pdfBase64;
    payload.pdfFilename = meta.pdfFilename;
  }

  const response = await fetch('/api/enviar-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const details = [err.error, err.hint, err.code, err.responseCode]
      .filter(Boolean)
      .join(' | ');
    throw new Error(details || 'Falha ao enviar e-mail da proposta.');
  }

  return true;
}

/**
 * Reenvia o e-mail oficial de um relatório já aprovado (ex.: falha de sessão na 1.ª aprovação).
 * @param {string} reportId
 * @param {{ clientEmail?: string }} [options]
 */
export async function resendApprovedReportEmail(reportId, options = {}) {
  await ensureJobsLoaded(true);

  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }
  if (report.status !== 'approved') {
    showToast('Só é possível reenviar e-mail de relatórios já aprovados.', 'warning');
    return false;
  }

  const client = getClient(report.clientId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const service = getServiceType(report.serviceType);
  const clientEmailInput = String(options.clientEmail ?? '').trim();

  if (clientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (!isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido.', 'error');
      return false;
    }
    if (report.clientId) {
      await syncClientEmailIfChanged(report.clientId, clientEmailInput);
    }
  }

  const recipientEmail =
    clientEmailInput || client?.email || client?.['E-mail'] || '';
  if (!recipientEmail) {
    showToast('O cliente não tem e-mail registado. Indique um e-mail antes de reenviar.', 'warning');
    return false;
  }

  const publicPdfUrl = job?.urlPdf || null;
  if (!publicPdfUrl) {
    showToast('PDF do relatório não encontrado no Storage. Contacte suporte técnico.', 'error');
    return false;
  }

  const values = report?.data?.values || {};
  const tipoRelatorio =
    report.serviceType === 'inspecao_dl50_2005'
      ? 'dl50-2005'
      : report.serviceType === 'manutencao_baterias_grandes'
        ? 'baterias'
        : 'outro';
  const filename =
    report.pdfFilename ||
    buildReportPdfFilename(job, report, {
      serviceTitle: PDF_DOCUMENT_TITLES[report.serviceType] || service?.label,
    });

  let pdfBase64;
  let pdfFilename;
  const MAX_BASE64_LEN = 3_000_000;
  try {
    const res = await fetch(publicPdfUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      if (b64.length > 0 && b64.length <= MAX_BASE64_LEN) {
        pdfBase64 = b64;
        pdfFilename = filename;
      }
    }
  } catch (err) {
    console.warn('[Email] Anexo PDF no reenvio:', err);
  }

  showToast(`A reenviar e-mail para ${recipientEmail}...`, 'info', 5000);

  try {
    await sendOfficialReportEmail({
      tipoRelatorio,
      reportId: report.id,
      clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
      nome_empresa: values.nome_empresa || '',
      tecnico: values.tecnico || getTechnician(report.technicianId)?.name || '',
      dataConclusao:
        values.data_de_conclusao || String(report.approvedAt || report.submittedAt || '').split('T')[0] || '',
      serieFrota: values.numero_de_serie || report.forkliftSerial || '',
      numeroOrdem: job?.numeroOrdem ?? null,
      to: recipientEmail,
      pdfUrl: publicPdfUrl,
      pdfFilename,
      pdfBase64,
    });
    showToast(`E-mail reenviado para ${recipientEmail}.`, 'success', 6000);
    return true;
  } catch (err) {
    console.error('[Email] Reenvio falhou:', err);
    showToast(`Falha ao reenviar e-mail. ${err?.message || ''}`.trim(), 'error', 8000);
    return false;
  }
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
  const raw = (getDB().clients || []).find((c) => sameEntityId(c.id, id));
  if (raw) {
    const legacy = raw.name ? raw : mapClientToLegacy(raw);
    if (isDevMockEnabled()) {
      const demo = DEMO_CLIENT_FORKLIFTS[id];
      if (demo?.forklifts?.length && !legacy.forklifts?.length) {
        legacy.forklifts = demo.forklifts;
      }
    }
    return legacy;
  }

  const fromCatalog = getClientFromCatalog(id);
  if (fromCatalog) {
    const legacy = mapClientToLegacy(fromCatalog);
    if (isDevMockEnabled()) {
      const demo = DEMO_CLIENT_FORKLIFTS[id];
      if (demo?.forklifts?.length) legacy.forklifts = demo.forklifts;
    }
    return legacy;
  }

  if (isDevMockEnabled()) {
    const demoOnly = DEMO_CLIENT_FORKLIFTS[id];
    if (demoOnly) {
      return mapClientToLegacy({
        id,
        Nome: demoOnly.Nome || 'Cliente demo',
        NIF: demoOnly.NIF || '',
        forklifts: demoOnly.forklifts || [],
      });
    }
    return CLIENTS.find((c) => sameEntityId(c.id, id)) || null;
  }

  return null;
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

/** Nomes de técnicos guardados no trabalho (id único legado ou «Hugo, Filipe»). */
export function parseTechnicianNamesFromJob(technicianId) {
  if (!technicianId) return [];
  const stored = String(technicianId);
  const byId = getTechnician(stored);
  if (byId?.name) return [byId.name];
  return splitTechnicianStoredValue(stored);
}

export function getJobTechnicianLabel(technicianId) {
  const names = parseTechnicianNamesFromJob(technicianId);
  return names.length ? names.join(', ') : '—';
}

/** Primeiro técnico do trabalho (cor no calendário, etc.). */
export function getPrimaryTechnicianForJob(job) {
  if (!job?.technicianId) return null;
  const byId = getTechnician(job.technicianId);
  if (byId) return byId;
  const names = parseTechnicianNamesFromJob(job.technicianId);
  if (!names.length) return null;
  return getAllTechnicians().find((t) => t.name === names[0]) || null;
}

/** Trabalho atribuído ao técnico (id de sessão ou nome na string CSV). */
export function jobAssignedToTechnician(job, techId) {
  if (!job || !techId) return false;
  const tech = getTechnician(techId);
  return jobMatchesTechnician(job.technicianId, {
    techId,
    techName: tech?.name,
  });
}

function nextTechnicianId() {
  const ids = getAllTechnicians().map((t) => {
    const m = /^tech-(\d+)$/.exec(t.id || '');
    return m ? Number(m[1]) : 0;
  });
  return `tech-${Math.max(0, ...ids, 0) + 1}`;
}

/**
 * Novo técnico — cria conta Supabase Auth + registo local (`technicians` / `utilizadores`).
 * @returns {Promise<object|null>} registo do técnico
 */
export async function addTechnician({ nome, email, telemovel, nif }) {
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

  try {
    const { createTechnicianAuthAccount } = await import('./technicians-api.js');
    await createTechnicianAuthAccount({
      nome: name,
      email: mail,
      technicianId: id,
      telemovel: phone,
      nif: String(nif || '').trim(),
    });
  } catch (err) {
    showToast(err?.message || 'Não foi possível criar a conta de login do técnico.', 'error', 8000);
    return null;
  }

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
  };

  updateDB((d) => {
    if (!Array.isArray(d.technicians)) d.technicians = [];
    if (!Array.isArray(d.utilizadores)) d.utilizadores = [];
    d.technicians.push(technician);
    d.utilizadores.push(utilizador);
  });

  showToast(
    `Técnico «${name}» adicionado. Conta de login criada no Supabase Auth.`,
    'success',
    5500,
  );
  return technician;
}

/**
 * Novo cliente — push em `clients` e catálogo em memória (pesquisa/agendamento).
 * @returns {object|null} registo normalizado
 */
export async function addClient(payload) {
  const nome = String(
    payload?.nome_empresa ?? payload?.Nome ?? payload?.nome ?? '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!nome) {
    showToast('O nome do cliente é obrigatório.', 'error');
    return null;
  }

  const nif = String(payload?.nif ?? payload?.NIF ?? '')
    .replace(/\s+/g, '')
    .trim();

  try {
    await ensureProductionCatalog();
    const catalog = getProductionClientsCatalog({ warn: false });
    const nomeKey = nome.toLowerCase();
    const existing = catalog.find(
      (c) =>
        (nif && c.NIF === nif) || String(c.Nome || '').toLowerCase() === nomeKey,
    );
    if (existing) {
      showToast('Já existe um cliente com este NIF ou nome.', 'error');
      return null;
    }

    const row = {
      nome_empresa: nome,
      nif: nif || null,
      email: String(payload?.email ?? payload?.['E-mail'] ?? '').trim() || null,
      morada: String(payload?.morada ?? payload?.Morada ?? '').trim() || null,
      codigo_postal:
        String(
          payload?.codigo_postal ??
            payload?.['Código postal'] ??
            payload?.codigoPostal ??
            '',
        ).trim() || null,
      localidade:
        String(payload?.localidade ?? payload?.Localidade ?? '').trim() || null,
      telemovel:
        String(payload?.telemovel ?? payload?.Telemovel ?? payload?.phone ?? '').trim() ||
        null,
    };

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('clientes').insert(row).select();

    if (error) {
      console.error('[ManuSilva] Erro ao gravar cliente no Supabase:', error);
      showToast(formatClientInsertError(error), 'error', 9000);
      return null;
    }

    let inserted = Array.isArray(data) ? data[0] : data;
    if (!inserted) {
      resetProductionCatalogCache();
      await ensureProductionCatalog();
      inserted =
        getProductionClientsCatalog({ warn: false }).find(
          (c) =>
            String(c.Nome || '').toLowerCase() === nomeKey &&
            (!nif || c.NIF === nif),
        ) || null;
    }

    if (!inserted) {
      showToast(
        'Cliente pode ter sido gravado, mas a resposta do Supabase veio vazia. Recarregue a página.',
        'error',
        9000,
      );
      return null;
    }

    const record = normalizeClientRecord(inserted);
    record.forklifts = Array.isArray(payload?.forklifts) ? payload.forklifts : [];

    updateDB((d) => {
      if (!Array.isArray(d.clients)) d.clients = [];
      d.clients.push(record);
    });

    registerClientInCatalog(record);

    showToast(`Cliente «${nome}» adicionado na base de dados.`, 'success');
    return record;
  } catch (err) {
    console.error('[ManuSilva] addClient:', err);
    showToast(formatClientInsertError(err), 'error', 9000);
    return null;
  }
}

/**
 * Atualiza dados cadastrais de um cliente no Supabase.
 * @param {string|number} clientId
 * @param {{ email?: string, morada?: string, telemovel?: string, codigo_postal?: string, localidade?: string, condicao_pagamento?: string, plus_code?: string, zona_rota?: string }} patch
 * @param {{ origem?: string, silent?: boolean }} [options]
 */
export async function updateClient(clientId, patch = {}, options = {}) {
  const id = String(clientId ?? '').trim();
  if (!id) {
    showToast('Cliente inválido.', 'error');
    return null;
  }

  const row = {};
  if (patch.email !== undefined) {
    row.email = String(patch.email ?? '').trim() || null;
  }
  if (patch.morada !== undefined) {
    row.morada = String(patch.morada ?? '').trim() || null;
  }
  if (patch.telemovel !== undefined) {
    row.telemovel = String(patch.telemovel ?? '').trim() || null;
  }
  if (patch.codigo_postal !== undefined) {
    row.codigo_postal = String(patch.codigo_postal ?? '').trim() || null;
  }
  if (patch.localidade !== undefined) {
    row.localidade = String(patch.localidade ?? '').trim() || null;
  }
  if (patch.condicao_pagamento !== undefined) {
    row.condicao_pagamento = String(patch.condicao_pagamento ?? '').trim() || null;
  }
  if (patch.plus_code !== undefined) {
    row.plus_code = String(patch.plus_code ?? '').trim() || null;
  }
  if (patch.zona_rota !== undefined) {
    row.zona_rota = String(patch.zona_rota ?? '').trim() || null;
  }

  if (!Object.keys(row).length) {
    if (!options.silent) showToast('Nenhum dado para atualizar.', 'warning');
    return null;
  }

  try {
    const { ensureSupabaseAuthSession } = await import('./supabase-client.js');
    await ensureSupabaseAuthSession();
    await ensureProductionCatalog();
    const existing = getClientFromCatalog(id);
    const before = {
      email: existing?.['E-mail'] || '',
      morada: existing?.Morada || '',
      telemovel: existing?.Telemovel || '',
      codigo_postal: existing?.['Código postal'] || '',
      localidade: existing?.Localidade || '',
      condicao_pagamento: existing?.condicao_pagamento || '',
      plus_code: existing?.plusCode || '',
      zona_rota: existing?.zonaRota || '',
    };

    const supabase = await getSupabaseClient();
    const numericId = /^\d+$/.test(id) ? Number(id) : id;
    const { data, error } = await supabase
      .from('clientes')
      .update(row)
      .eq('id', numericId)
      .select();

    if (error) {
      console.error('[ManuSilva] Erro ao atualizar cliente no Supabase:', error);
      showToast(formatClientUpdateError(error), 'error', 9000);
      return null;
    }

    const updated = Array.isArray(data) ? data[0] : data;
    if (!updated) {
      showToast('Cliente não encontrado na base de dados.', 'error');
      return null;
    }

    const record = normalizeClientRecord(updated);
    if (existing?.forklifts?.length) {
      record.forklifts = existing.forklifts;
    }

    const { logClientChanges } = await import('./client-audit.js');
    await logClientChanges(
      id,
      before,
      {
        email: record['E-mail'] || '',
        morada: record.Morada || '',
        telemovel: record.Telemovel || '',
        codigo_postal: record['Código postal'] || '',
        localidade: record.Localidade || '',
        condicao_pagamento: record.condicao_pagamento || '',
        plus_code: record.plusCode || '',
        zona_rota: record.zonaRota || '',
      },
      { origem: options.origem || 'rh_ficha' },
    );

    registerClientInCatalog(record);

    updateDB((d) => {
      if (!Array.isArray(d.clients)) d.clients = [];
      const idx = d.clients.findIndex((c) => String(c.id) === id);
      if (idx >= 0) {
        Object.assign(d.clients[idx], record);
      } else {
        d.clients.push(record);
      }
    });

    window.dispatchEvent(new CustomEvent('db-updated'));
    return record;
  } catch (err) {
    console.error('[ManuSilva] updateClient:', err);
    showToast(formatClientUpdateError(err), 'error', 9000);
    return null;
  }
}

/**
 * Atualiza o e-mail do cliente se o valor do formulário de aprovação for diferente.
 * @returns {Promise<boolean>} true se houve update na base de dados
 */
export async function syncClientEmailIfChanged(clientId, newEmail) {
  const { isValidEmail, normalizeEmail } = await import('./validators.js');
  const email = String(newEmail ?? '').trim();
  if (!email || !clientId) return false;
  if (!isValidEmail(email)) return false;

  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog({ warn: false });
  const record = getClientFromCatalog(clientId, catalog);
  const current = normalizeEmail(record?.['E-mail'] || record?.email || '');

  if (current === normalizeEmail(email)) return false;

  const updated = await updateClient(clientId, { email }, { origem: 'aprovacao_relatorio', silent: true });
  return !!updated;
}

export function getServiceType(id) {
  return reportTemplates.find((s) => s.id === id) || SERVICE_TYPES.find((s) => s.id === id);
}

export function getForklift(clientId, serial) {
  const client = getClient(clientId);
  return client?.forklifts.find((f) => f.serial === serial);
}

export function getJob(id) {
  return getJobsSnapshot().find((j) => sameEntityId(j.id, id)) || null;
}

export function getReport(id) {
  return getReportsSnapshot().find((r) => sameEntityId(r.id, id)) || null;
}

export function getReportForJob(jobId) {
  return getReportsSnapshot().find((r) => sameEntityId(r.jobId, jobId)) || null;
}

/**
 * Resolve trabalho para abrir o formulário — cache Supabase ou fallback a partir do relatório/rascunho.
 */
export function resolveJobForForm(jobId) {
  if (!jobId) return null;
  const cached = getJob(jobId);
  if (cached) return cached;

  const report = getReportForJob(jobId);
  if (!report) return null;

  return {
    id: String(report.jobId || jobId),
    clientId: report.clientId != null ? String(report.clientId) : '',
    serviceType: report.serviceType,
    forkliftSerial: report.forkliftSerial || '',
    date: report.submittedAt?.split('T')[0] || '',
    time: '',
    technicianId: report.technicianId,
    status: report.status === 'rejected' ? 'rejected' : 'scheduled',
    rejectionNote: report.rejectionNote ?? null,
  };
}

export function getJobsForTechnician(techId, date) {
  return getJobsSnapshot().filter((j) => j.date === date && jobAssignedToTechnician(j, techId));
}

export function getAllJobs() {
  return getJobsSnapshot();
}

export function getPendingReports() {
  return getReportsSnapshot().filter((r) => r.status === 'pending_review');
}

/** Estados de relatório exibidos no painel RH (histórico completo) */
export const RH_PANEL_REPORT_STATUSES = new Set([
  'pending_review',
  'draft',
  'approved',
  'rejected',
]);

/** Mais antigo primeiro — prioridade FIFO na fila RH */
function sortReportsForRhPanel(a, b) {
  return String(a.submittedAt || a.approvedAt || '').localeCompare(
    String(b.submittedAt || b.approvedAt || ''),
  );
}

/** Relatórios visíveis no painel RH (com filtro opcional por estado) */
export function getAdminReviewReports(filter = 'all') {
  const list = getReportsSnapshot().filter((r) => RH_PANEL_REPORT_STATUSES.has(r.status));
  const filtered = filter === 'all' ? list : list.filter((r) => r.status === filter);
  return filtered.sort(sortReportsForRhPanel);
}

/** Contagens por estado para filtros rápidos do painel RH */
export function getRhPanelReportCounts() {
  const list = getReportsSnapshot().filter((r) => RH_PANEL_REPORT_STATUSES.has(r.status));
  return {
    all: list.length,
    pending_review: list.filter((r) => r.status === 'pending_review').length,
    orcamento_pendente: list
      .filter((r) => r.status === 'approved' || r.status === 'pending_review')
      .filter(reportOrcamentoPorPreparar).length,
    draft: list.filter((r) => r.status === 'draft').length,
    approved: list.filter((r) => r.status === 'approved').length,
    rejected: list.filter((r) => r.status === 'rejected').length,
  };
}

/** Relatório aprovado ainda por faturar (controlo interno) */
export function isPendingBilling(report) {
  if (!report || report.status !== 'approved') return false;
  const fs = report.faturacaoStatus;
  return fs === 'pendente' || !fs;
}

export function getPendingBillingReports() {
  return getReportsSnapshot()
    .filter(isPendingBilling)
    .sort((a, b) =>
      String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')),
    );
}

function addDaysToIsoDate(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
}

/**
 * Calcula data_vencimento a partir da condição de pagamento e data de emissão.
 */
export function resolveInvoiceDueDate(condicaoPagamento, dataEmissao) {
  const condicao = normalizeFaturaCondicao(condicaoPagamento);
  if (condicao === '30_dias') return addDaysToIsoDate(dataEmissao, 30);
  if (condicao === '60_dias') return addDaysToIsoDate(dataEmissao, 60);
  return dataEmissao;
}

/** Campos financeiros da fatura (condição + recebimento independentes). */
export function resolveInvoiceBillingFields(condicaoPagamento, statusRecebimento, dataEmissao) {
  const faturaCondicaoPagamento = normalizeFaturaCondicao(condicaoPagamento);
  const status = normalizeStatusRecebimento(statusRecebimento);
  return {
    faturaCondicaoPagamento,
    statusRecebimento: status,
    dataVencimento: resolveInvoiceDueDate(faturaCondicaoPagamento, dataEmissao),
  };
}

/** Relatórios já faturados com cobrança em aberto */
export function getPendingPaymentInvoices() {
  return getReportsSnapshot()
    .filter(
      (r) => r.faturacaoStatus === 'faturado' && r.statusRecebimento === 'pendente',
    )
    .sort((a, b) =>
      String(a.dataVencimento || a.dataFatura || '').localeCompare(
        String(b.dataVencimento || b.dataFatura || ''),
      ),
    );
}

/** Métricas de fluxo de caixa (faturas emitidas na app) */
export function getBillingFinancialMetrics() {
  const invoiced = getReportsSnapshot().filter((r) => r.faturacaoStatus === 'faturado');
  let totalFaturado = 0;
  let totalRecebido = 0;
  let totalDivida = 0;

  invoiced.forEach((r) => {
    const valor = Number(r.valorFaturado);
    if (!Number.isFinite(valor) || valor <= 0) return;
    totalFaturado += valor;
    if (r.statusRecebimento === 'pago') totalRecebido += valor;
    else if (r.statusRecebimento === 'pendente') totalDivida += valor;
  });

  return { totalFaturado, totalRecebido, totalDivida };
}

/** Regista fatura emitida externamente — contas a receber */
export async function registerReportInvoice(
  reportId,
  { numeroFatura, dataFatura, valorFaturado, condicaoPagamento, statusRecebimento },
) {
  const report = getReport(reportId);
  if (!report) throw new Error('Relatório não encontrado.');
  if (!isPendingBilling(report)) {
    throw new Error('Este relatório já não está pendente de faturação.');
  }

  const numero = String(numeroFatura ?? '').trim();
  const data = String(dataFatura ?? '').trim();
  const valor = Number(valorFaturado);
  if (!numero) throw new Error('Indique o número da fatura.');
  if (!data) throw new Error('Indique a data de emissão da fatura.');
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Indique um valor total faturado válido.');
  }

  const billing = resolveInvoiceBillingFields(condicaoPagamento, statusRecebimento, data);

  await updateRelatorio(reportId, {
    faturacaoStatus: 'faturado',
    numeroFatura: numero,
    dataFatura: data,
    valorFaturado: Math.round(valor * 100) / 100,
    faturaCondicaoPagamento: billing.faturaCondicaoPagamento,
    statusRecebimento: billing.statusRecebimento,
    dataVencimento: billing.dataVencimento,
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/** Confirma recebimento de uma fatura pendente */
export async function confirmInvoicePayment(reportId) {
  const report = getReport(reportId);
  if (!report) throw new Error('Fatura não encontrada.');
  if (report.faturacaoStatus !== 'faturado') {
    throw new Error('Este relatório ainda não foi faturado.');
  }
  if (report.statusRecebimento === 'pago') {
    throw new Error('Este recebimento já foi confirmado.');
  }

  await updateRelatorio(reportId, {
    statusRecebimento: 'pago',
  });
  window.dispatchEvent(new CustomEvent('db-updated'));
  return true;
}

/* ─── Offline Mode ─── */

export function isOffline() {
  return getDB().settings?.offline ?? false;
}

/** Rede do dispositivo (navigator.onLine). */
export function isNetworkOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Tablet pode sincronizar com Supabase (rede + modo manual não offline). */
export function canReachServer() {
  return isNetworkOnline() && !isOffline();
}

export function setOfflineMode(value) {
  updateDB((db) => {
    db.settings.offline = value;
  });
  if (!value) {
    import('./trabalhos-offline.js')
      .then((m) => m.sincronizarTrabalhosOffline())
      .catch(console.error);
    syncOfflineQueue().catch(console.error);
  }
}

export function queueOfflineAction(action) {
  updateDB((db) => {
    db.offlineQueue.push({ ...action, queuedAt: new Date().toISOString() });
  });
}

export async function syncOfflineQueue() {
  const db = getDB();
  if (!db.offlineQueue.length) return;

  const queue = [...db.offlineQueue];
  updateDB((d) => {
    d.offlineQueue = [];
  });

  try {
    for (const action of queue) {
      if (action.type === 'save_draft' || action.type === 'submit_report') {
        const report = action.report;
        if (!report) continue;
        const saved = await upsertRelatorio(report);
        if (action.type === 'submit_report' && saved?.jobId) {
          await patchTrabalhoStatus(saved.jobId, {
            status: 'completed',
            rejectionNote: null,
          });
        }
      }
    }
    await ensureReportsLoaded(true);
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast(`${queue.length} item(ns) sincronizado(s) com a base de dados.`, 'success');
  } catch (err) {
    console.error('[ManuSilva] syncOfflineQueue:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
  }
}

/* ─── Report Actions ─── */

/**
 * Guarda progresso do relatório no IndexedDB (rascunhos locais do tablet).
 * Não gera ficheiro PDF — apenas os dados do formulário.
 */
/**
 * @param {object} report
 * @param {{ silent?: boolean }} [options] — `silent: true` para auto-save (sem toast)
 */
export async function saveReportDraft(report, options = {}) {
  const { silent = false } = options;

  if (!report?.jobId) {
    if (!silent) showToast('Não foi possível guardar o rascunho.', 'error');
    return null;
  }

  const draft = {
    ...report,
    status: 'draft',
    submittedAt: report.submittedAt || new Date().toISOString(),
  };

  const { saveLocalReportDraft } = await import('./report-local-storage.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  await saveLocalReportDraft(draft);
  mergeReportInCache(draft);
  window.dispatchEvent(new CustomEvent('db-updated'));

  if (silent) {
    return draft;
  }

  if (!canReachServer()) {
    if (!silent) {
      showToast('Relatório em aberto guardado neste dispositivo.', 'info', 3500);
    }
    return draft;
  }

  try {
    const saved = await upsertRelatorio(draft);
    if (saved) mergeReportInCache(saved);
    const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
    void upsertClienteEquipamentosFromReport(saved || draft);
    window.dispatchEvent(new CustomEvent('db-updated'));
    if (!silent) {
      showToast(
        'Relatório guardado em aberto. Pode continuar amanhã e somar novas visitas.',
        'success',
        5000,
      );
    }
    return saved || draft;
  } catch (err) {
    console.error('[ManuSilva] saveReportDraft:', err);
    if (!silent) {
      showToast(
        'Rascunho guardado neste dispositivo. Sincroniza quando tiver rede.',
        'warning',
        5000,
      );
    }
    return draft;
  }
}

/**
 * @param {object} report
 * @param {{ isCorrection?: boolean }} [options] — `isCorrection`: atualiza relatório pendente (UPDATE)
 */
export async function submitReport(report, options = {}) {
  const { isCorrection = false } = options;
  const {
    addTrabalhoPendente,
    sincronizarTrabalhosOffline,
    hasTrabalhoPendente,
    canSyncToServer,
    MSG_OFFLINE_SUBMIT,
  } = await import('./trabalhos-offline.js');
  const { removeLocalReportDraft } = await import('./report-local-storage.js');
  const { mergeReportInCache } = await import('./relatorios-db.js');

  const final = {
    ...report,
    status: 'pending_review',
    submittedAt: isCorrection
      ? report.submittedAt || new Date().toISOString()
      : new Date().toISOString(),
  };

  if (isCorrection && !final.id && report.jobId) {
    const existing = getReportForJob(report.jobId);
    if (existing?.id) final.id = existing.id;
  }

  let pendingId;
  try {
    pendingId = await addTrabalhoPendente({ report: final, tipo: 'submit' });
  } catch (err) {
    console.error('[ManuSilva] Guardar relatório local:', err);
    showToast('Não foi possível guardar o relatório no dispositivo.', 'error');
    return { queued: false };
  }

  mergeReportInCache(final);

  if (!canSyncToServer()) {
    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    window.dispatchEvent(new CustomEvent('trabalhos-pendentes-changed'));
    return { queued: true, pendingId };
  }

  try {
    await sincronizarTrabalhosOffline({ notify: false });

    if (!(await hasTrabalhoPendente(pendingId))) {
      await removeLocalReportDraft(final.jobId);
      const syncedReport = getReportForJob(final.jobId) || final;
      const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
      void upsertClienteEquipamentosFromReport(syncedReport);
      window.dispatchEvent(new CustomEvent('db-updated'));
      showToast(
        isCorrection
          ? 'Relatório concluído e reenviado para aprovação do RH.'
          : 'Relatório concluído e enviado para aprovação do RH.',
        'success',
      );
      return { queued: false, updated: isCorrection };
    }

    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    return { queued: true, pendingId };
  } catch (err) {
    console.error('[ManuSilva] submitReport:', err);
    showToast(MSG_OFFLINE_SUBMIT, 'warning', 10000);
    window.dispatchEvent(new CustomEvent('db-updated'));
    return { queued: true, pendingId };
  }
}

export { sincronizarTrabalhosOffline, initTrabalhosOfflineSync } from './trabalhos-offline.js';

/**
 * @param {string} reportId
 * @param {{ clientEmail?: string }} [options] — e-mail editável na revisão RH
 */
export async function approveReport(reportId, options = {}) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return null;
  }

  const client = getClient(report.clientId);
  const service = getServiceType(report.serviceType);
  const clientEmailInput = String(options.clientEmail ?? '').trim();
  const testClient = isTestClient(client);

  if (clientEmailInput) {
    const { isValidEmail } = await import('./validators.js');
    if (!isValidEmail(clientEmailInput)) {
      showToast('Introduza um e-mail de cliente válido antes de aprovar.', 'error');
      return null;
    }
  }

  try {
    await ensureJobsLoaded(true);

    let job = report.jobId ? getJob(report.jobId) : null;
    let reportForPdf = report;

    if (!job) {
      job = await insertTrabalhoFromReport(report);
      if (!job?.id) {
        showToast('Não foi possível criar o trabalho para o relatório.', 'error');
        return null;
      }
      reportForPdf = { ...report, jobId: job.id };
      await upsertRelatorio(reportForPdf);
    }

    if (job.numeroOrdem == null && !testClient) {
      await ensureJobsLoaded(true);
      job = getJob(job.id) || job;
    }

    showToast('A gerar folha de intervenção em PDF...', 'info', 2500);
    const { importPdfReport } = await import('./pdf-loader.js');
    const { renderInterventionPDF } = await importPdfReport();

    const doc = await renderInterventionPDF(reportForPdf);
    const filename = buildReportPdfFilename(job, reportForPdf, {
      serviceTitle: PDF_DOCUMENT_TITLES[report.serviceType] || service?.label,
    });

    const pdfBlob = doc.output('blob');
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);
    const pdfBase64Len = pdfBase64.length;

    let publicPdfUrl = null;

    try {
      const uploaded = await uploadTrabalhoPdf(pdfBlob, filename);
      publicPdfUrl = uploaded.publicUrl;
    } catch (storageErr) {
      console.error('[ManuSilva] Upload PDF Storage:', storageErr);
      showToast(formatPdfStorageError(storageErr), 'error', 9000);
      return null;
    }

    await updateRelatorio(reportId, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      pdfFilename: filename,
      faturacaoStatus: 'pendente',
    });

    if (reportForPdf.jobId) {
      await patchTrabalho(reportForPdf.jobId, {
        status: 'completed',
        rejectionNote: null,
        urlPdf: publicPdfUrl,
      });
    }

    window.dispatchEvent(new CustomEvent('db-updated'));

    const { upsertClienteEquipamentosFromReport } = await import('./cliente-equipamentos-db.js');
    void upsertClienteEquipamentosFromReport(reportForPdf);

    let emailSynced = false;
    if (clientEmailInput && report.clientId) {
      emailSynced = await syncClientEmailIfChanged(report.clientId, clientEmailInput);
    }

    const recipientEmail =
      clientEmailInput || client?.email || client?.['E-mail'] || '';

    if (emailSynced) {
      showToast(
        'Relatório aprovado e email do cliente atualizado na base de dados!',
        'success',
        6000,
      );
    } else if (recipientEmail) {
      showToast(
        `Relatório aprovado! PDF guardado no Storage. A enviar e-mail para ${recipientEmail}...`,
        'success',
        7000,
      );
    } else if (!emailSynced) {
      showToast('Relatório aprovado, mas o cliente não tem e-mail registado.', 'warning');
    }

    if (recipientEmail) {
      const values = report?.data?.values || {};
      const tipoRelatorio =
        report.serviceType === 'inspecao_dl50_2005'
          ? 'dl50-2005'
          : report.serviceType === 'manutencao_baterias_grandes'
            ? 'baterias'
            : 'outro';

      // Anexo opcional (só se couber no limite do body serverless); o link do Storage vai sempre no e-mail.
      const MAX_BASE64_LEN = 3_000_000; // ~2.2MB binário (base64 tem overhead)
      const attachPdf = pdfBase64Len > 0 && pdfBase64Len <= MAX_BASE64_LEN;

      sendOfficialReportEmail({
        tipoRelatorio,
        reportId: report.id,
        clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
        nome_empresa: values.nome_empresa || '',
        tecnico: values.tecnico || getTechnician(report.technicianId)?.name || '',
        dataConclusao: values.data_de_conclusao || String(report.submittedAt || '').split('T')[0] || '',
        serieFrota: values.numero_de_serie || report.forkliftSerial || '',
        numeroOrdem: job?.numeroOrdem ?? null,
        to: recipientEmail,
        pdfUrl: publicPdfUrl,
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
    }

    const { reportHasPedidoOrcamento, reportOrcamentoPorPreparar } = await import(
      './pedido-orcamento.js'
    );
    const approvedReport = getReport(reportId) || reportForPdf;
    if (
      reportHasPedidoOrcamento(approvedReport) &&
      reportOrcamentoPorPreparar(approvedReport)
    ) {
      window.setTimeout(() => {
        showToast(
          'Há pedido de orçamento: abra a aba Orçamentos na barra lateral para preparar a proposta MS.015.',
          'info',
          9000,
        );
      }, 2800);
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

export async function rejectReport(reportId, note) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return;
  }

  try {
    await updateRelatorio(reportId, { status: 'rejected', rejectionNote: note });
    if (report.jobId) {
      await patchTrabalhoStatus(report.jobId, { status: 'rejected', rejectionNote: note });
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Relatório rejeitado. O técnico foi notificado.', 'error');
    return true;
  } catch (err) {
    console.error('[ManuSilva] rejectReport:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
    return false;
  }
}

export async function assignJob(jobData) {
  try {
    const client = getClient(jobData.clientId);
    const job = await insertTrabalho({
      ...jobData,
      status: 'scheduled',
      rejectionNote: null,
    });
    if (!job) {
      showToast('Trabalho gravado, mas não foi possível confirmar a resposta.', 'warning');
      await ensureJobsLoaded(true);
      window.dispatchEvent(new CustomEvent('db-updated'));
      return null;
    }
    if (isTestClient(client)) {
      showToast('Trabalho de teste criado — não consome número OP oficial.', 'info', 5500);
    } else {
      showToast('Trabalho atribuído e guardado na base de dados.', 'success');
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    return job.id;
  } catch (err) {
    console.error('[ManuSilva] assignJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return null;
  }
}

/** Altera a data de um trabalho já agendado (calendário RH). */
export async function rescheduleJob(jobId, newDate) {
  const date = String(newDate ?? '')
    .trim()
    .split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('Introduza uma data válida.', 'error');
    return false;
  }

  const job = getJob(jobId);
  if (!job) {
    showToast('Trabalho não encontrado.', 'error');
    return false;
  }
  if (job.date === date) {
    showToast('O trabalho já está marcado para essa data.', 'info');
    return true;
  }

  try {
    await patchTrabalho(jobId, { date });
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast(`Trabalho reagendado para ${formatDateLong(date)}.`, 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] rescheduleJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return false;
  }
}

/** Remove trabalho na Supabase e relatórios locais associados */
export async function deleteJob(jobId) {
  try {
    await deleteRelatoriosByTrabalho(jobId);
    await deleteTrabalho(jobId);
    showToast('Trabalho eliminado.', 'success');
    window.dispatchEvent(new CustomEvent('db-updated'));
    return true;
  } catch (err) {
    console.error('[ManuSilva] deleteJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return false;
  }
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
  const variant = s.badgeVariant || 'pending';
  return `<span class="status-badge status-badge--${variant}">${s.label}</span>`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ─── Toast Notifications ─── */

let toastContainer = null;
let adminToastContainer = null;

/**
 * Toast estilo notificação (canto inferior direito) — painel RH.
 * @param {string} title
 * @param {string} body
 * @param {{ icon?: string, duration?: number, onClick?: () => void, dedupeKey?: string }} [options]
 */
export function showNotificationToast(title, body, options = {}) {
  const {
    icon = '🔔',
    duration = 8000,
    onClick,
    dedupeKey,
  } = options;

  if (dedupeKey) {
    if (!showNotificationToast._recent) showNotificationToast._recent = new Set();
    if (showNotificationToast._recent.has(dedupeKey)) return;
    showNotificationToast._recent.add(dedupeKey);
    setTimeout(() => showNotificationToast._recent.delete(dedupeKey), 4500);
  }

  if (!adminToastContainer) {
    adminToastContainer = document.createElement('div');
    adminToastContainer.id = 'admin-toast-container';
    adminToastContainer.className = 'toast-container toast-container--bottom-end';
    adminToastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(adminToastContainer);
  }

  const toast = document.createElement(onClick ? 'button' : 'div');
  toast.type = onClick ? 'button' : undefined;
  toast.className = 'toast toast-notification toast-info';
  toast.innerHTML = `
    <span class="toast-notification-icon" aria-hidden="true">${icon}</span>
    <span class="toast-notification-content">
      <strong class="toast-notification-title">${escapeHtml(title)}</strong>
      <span class="toast-notification-body">${escapeHtml(body)}</span>
    </span>
  `;

  if (onClick) {
    toast.addEventListener('click', () => {
      onClick();
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 320);
    });
  }

  adminToastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

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

export function openModal(title, content, actions = '', options = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = `modal-overlay${options.review ? ' modal-overlay--review' : ''}${options.reviewWide ? ' modal-overlay--review-wide' : ''}`;
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
    window.location.replace(session.role === 'admin' ? 'admin.html' : 'dashboard.html');
    return;
  }

  appContainer.innerHTML = LoginView.render();
  LoginView.init();
}

/** Tema assim que qualquer página importa `app.js` */
initAppTheme();
