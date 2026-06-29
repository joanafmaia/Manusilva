/**
 * Manusilva PWA — Core Architecture
 * Storage, auth, utilities, notifications
 */

import { getSupabaseClient } from './supabase-client.js';
import { escapeHtml } from './html-utils.js';
import { buildReportEmailMeta } from './report-email-meta.js';
import { resolveReportInterventionDatePt } from './report-intervention-date.js';
import { isRhOrAdminSession } from './auth-roles-core.js';
import {
  formatDate,
  formatDateLong,
} from './date-utils.js';
import { showToast } from './toast-modal.js';
import {
  invalidateDbMemoryCache,
  initLocalDatabase,
  getDB,
  warmClientsCatalog,
  prepareClientsCatalog,
  warmJobs,
  warmReports,
  warmOperacoes,
  handleFatalDashboardError,
  saveDB,
  updateDB,
} from './local-db.js';
import {
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
import {
  sendOfficialReportEmail,
  sendOrcamentoProposalEmail,
} from './report-email-api.js';
import {
  buildReportEmailPdfPayload,
  blobToBase64,
  generateAndUploadApprovedReportPdfs,
} from './report-email-pdf.js';
import {
  resendApprovedReportEmail,
  sendSelectedReportsEmail,
} from './report-email-actions.js';

export { getSupabaseClient };
export { escapeHtml };

import {
  COMPANY,
  mapClientToLegacy,
  JOB_STATUSES,
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
  insertTrabalho,
  insertTrabalhoFromReport,
  deleteTrabalho,
  patchTrabalhoStatus,
  patchTrabalho,
  formatTrabalhosError,
} from './trabalhos-db.js';
import {
  formatPdfStorageError,
} from './pdf-storage.js';
import {
  ensureReportsLoaded,
  upsertRelatorio,
  updateRelatorio,
  deleteRelatoriosByTrabalho,
  formatRelatoriosError,
} from './relatorios-db.js';
import {
  reportHasPedidoOrcamento,
  reportOrcamentoPorPreparar,
} from './pedido-orcamento.js';
export { MANUSILVA_LOGO, applyBrandLogo, isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';

import {
  APP_SESSION_KEY,
  clearSession,
  getSession,
  normalizeSession,
} from './session.js';
import { LoginView } from './views/login.js';
import { AuthService } from './auth.js';
import { sameEntityId, normalizeEntityId } from './entity-id.js';
import { captureError } from './error-monitor.js';

export { sameEntityId, normalizeEntityId } from './entity-id.js';
export { captureError } from './error-monitor.js';

export { APP_SESSION_KEY, clearSession, getSession, normalizeSession };

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


export function requireAuth(role) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (role === 'admin' && !isRhOrAdminSession(session)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  if (role === 'technician' && session.role !== 'technician') {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'index.html';
    return null;
  }
  if (role && session.role !== role) {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return null;
  }
  return session;
}

const TECHNICIAN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

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
  if (!isRhOrAdminSession(getSession())) {
    showToast('Apenas RH pode criar clientes.', 'error');
    return null;
  }

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
  if (!isRhOrAdminSession(getSession())) {
    showToast('Apenas RH pode alterar clientes.', 'error');
    return null;
  }

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

  if (!isCorrection && final.jobId) {
    await ensureReportsLoaded();
    const duplicatePending = getReportsSnapshot().find(
      (r) =>
        sameEntityId(r.jobId, final.jobId) &&
        r.status === 'pending_review' &&
        (!final.id || !sameEntityId(r.id, final.id)),
    );
    if (duplicatePending) {
      showToast(
        'Este trabalho já tem um relatório à espera de aprovação do RH.',
        'warning',
        7000,
      );
      return { queued: false };
    }
  }

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
 * @param {{ clientEmail?: string, skipClientEmail?: boolean }} [options]
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

    let pdfEntries;
    try {
      pdfEntries = await generateAndUploadApprovedReportPdfs(reportForPdf, job, service);
    } catch (storageErr) {
      console.error('[ManuSilva] Upload PDF Storage:', storageErr);
      showToast(formatPdfStorageError(storageErr), 'error', 9000);
      return null;
    }
    if (!pdfEntries.length) {
      showToast('Não foi possível gerar os PDFs do relatório.', 'error');
      return null;
    }

    const publicPdfUrl = pdfEntries[0].publicUrl;
    const filename = pdfEntries[0].filename;
    const urlPdfs = pdfEntries.map((entry) => entry.publicUrl);
    const pdfFilenames = pdfEntries.map((entry) => entry.filename);

    const emailPdfPayload =
      pdfEntries.length > 1
        ? buildReportEmailPdfPayload(pdfEntries)
        : buildReportEmailPdfPayload([
            { ...pdfEntries[0], base64: await blobToBase64(pdfEntries[0].blob) },
          ]);

    await updateRelatorio(reportId, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      pdfFilename: filename,
      faturacaoStatus: 'pendente',
      data: {
        ...(report.data || {}),
        urlPdfs,
        pdfFilenames,
      },
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

    const skipClientEmail = options.skipClientEmail === true;

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
    } else if (recipientEmail && !skipClientEmail) {
      const pdfCount = pdfEntries.length;
      showToast(
        pdfCount > 1
          ? `Relatório aprovado! ${pdfCount} PDFs guardados. A enviar e-mail para ${recipientEmail}...`
          : `Relatório aprovado! PDF guardado no Storage. A enviar e-mail para ${recipientEmail}...`,
        'success',
        7000,
      );
    } else if (!emailSynced) {
      showToast('Relatório aprovado, mas o cliente não tem e-mail registado.', 'warning');
    }

    if (recipientEmail && !skipClientEmail) {
      sendOfficialReportEmail({
        ...buildReportEmailMeta(report, {
          client,
          job,
          technicianName: getTechnician(report.technicianId)?.name || '',
        }),
        to: recipientEmail,
        ...emailPdfPayload,
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

/** Remove pedido de orçamento do relatório (mantém o relatório técnico). */
export async function cancelPedidoOrcamentoReport(reportId) {
  const report = getReport(reportId);
  if (!report) {
    showToast('Relatório não encontrado.', 'error');
    return false;
  }
  if (!reportHasPedidoOrcamento(report)) {
    showToast('Este relatório já não tem pedido de orçamento.', 'info');
    return false;
  }

  const meta = report?.data?.orcamento;
  if (meta?.enviadoEm) {
    showToast('A proposta MS.015 já foi enviada ao cliente. Não é possível eliminar o pedido.', 'warning', 8000);
    return false;
  }

  try {
    const values = {
      ...(report.data?.values || {}),
      pedido_orcamento: 'Não',
      detalhe_pedido_orcamento: '',
    };

    await updateRelatorio(reportId, {
      data: {
        ...(report.data || {}),
        values,
        orcamento: null,
        urlPdfOrcamento: null,
        orcamentoPdfFilename: null,
        urlDocxOrcamento: null,
        orcamentoDocxFilename: null,
      },
    });

    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Pedido de orçamento eliminado.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] cancelPedidoOrcamentoReport:', err);
    showToast(formatRelatoriosError(err), 'error', 9000);
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

/* ─── UI Utilities ─── */

export function statusBadge(status) {
  const s = JOB_STATUSES[status] || JOB_STATUSES.scheduled;
  const variant = s.badgeVariant || 'pending';
  return `<span class="status-badge status-badge--${variant}">${s.label}</span>`;
}

/* ─── Re-exports para dashboards (sem carregar PDF/form-engine no admin) ─── */

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
    window.location.replace(session.role === 'admin' ? 'admin.html' : 'dashboard.html');
    return;
  }

  appContainer.innerHTML = LoginView.render();
  LoginView.init();
}
