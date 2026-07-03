/**
 * Cache local (localStorage) — clientes, técnicos, fila offline.
 * Jobs e relatórios vêm do Supabase via snapshots em memória.
 */

import { seedDatabase } from './mock_data.js';
import { stripPasswordsFromDb, sanitizeUtilizadores } from './local-db-sanitize.js';
import { ensureProductionCatalog } from './clients-catalog.js';
import { ensureJobsLoaded, getJobsSnapshot } from './trabalhos-db.js';
import { ensureReportsLoaded, getReportsSnapshot } from './relatorios-db.js';
import { initErrorMonitoring } from './error-monitor.js';

const DB_KEY = 'manusilva_db';

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

export function invalidateDbMemoryCache() {
  dbMemoryCache = null;
  dbSeedChecked = false;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('manusilva-db-reset', invalidateDbMemoryCache);
}

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

export function warmClientsCatalog() {
  return ensureProductionCatalog();
}

export async function prepareClientsCatalog() {
  return ensureProductionCatalog();
}

export function warmJobs() {
  return ensureJobsLoaded();
}

export function warmReports() {
  return ensureReportsLoaded();
}

export async function warmOperacoes() {
  const { ensureSupabaseAuthSession } = await import('./supabase-client.js');
  const { ensureServicosLoadedSafe } = await import('./servicos-db.js');
  await ensureSupabaseAuthSession();
  await Promise.all([
    ensureJobsLoaded(),
    ensureReportsLoaded(),
    ensureProductionCatalog(),
    ensureServicosLoadedSafe(),
  ]);
}

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
