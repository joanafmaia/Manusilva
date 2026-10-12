/**
 * Mantém o formulário de relatório após bloqueio do tablet (OS).
 * O browser pode matar/recarregar a página; o rascunho fica no IndexedDB
 * e este marcador diz à app para reabrir o mesmo formulário.
 */

const STORAGE_KEY = 'manusilva_open_report_form';
/** Após este tempo sem reabrir, ignora o marcador (formulário abandonado). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * @typedef {{
 *   kind: 'job' | 'servico',
 *   jobId?: string,
 *   servicoId?: string,
 *   serviceType?: string,
 *   reportId?: string,
 *   editPending?: boolean,
 *   openedAt: number,
 * }} OpenReportFormIntent
 */

/**
 * @param {unknown} raw
 * @returns {OpenReportFormIntent | null}
 */
export function parseOpenReportFormIntent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'servico' ? 'servico' : raw.kind === 'job' ? 'job' : null;
  if (!kind) return null;
  const openedAt = Number(raw.openedAt);
  if (!Number.isFinite(openedAt) || openedAt <= 0) return null;
  if (Date.now() - openedAt > MAX_AGE_MS) return null;

  if (kind === 'job') {
    const jobId = String(raw.jobId || '').trim();
    if (!jobId) return null;
    return {
      kind: 'job',
      jobId,
      editPending: raw.editPending === true,
      openedAt,
    };
  }

  const servicoId = String(raw.servicoId || '').trim();
  const serviceType = String(raw.serviceType || '').trim();
  if (!servicoId || !serviceType) return null;
  return {
    kind: 'servico',
    servicoId,
    serviceType,
    reportId: raw.reportId ? String(raw.reportId) : undefined,
    editPending: raw.editPending === true,
    openedAt,
  };
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseOpenReportFormIntent(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStorage(intent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    /* quota / private mode */
  }
}

/** Há formulário em edição (ou acabou de ser interrompido pelo bloqueio do tablet). */
export function hasOpenReportFormIntent() {
  return Boolean(readStorage());
}

/**
 * Grava o formulário aberto para reabrir após reload/bloqueio do tablet.
 * @param {Omit<OpenReportFormIntent, 'openedAt'>} intent
 */
export function markOpenReportForm(intent) {
  const parsed = parseOpenReportFormIntent({ ...intent, openedAt: Date.now() });
  if (!parsed) return;
  writeStorage(parsed);
}

/** Limpa o marcador (fecho explícito ou após reabertura). */
export function clearOpenReportForm() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Lê e remove o marcador (uma tentativa de reabertura).
 * @returns {OpenReportFormIntent | null}
 */
export function consumeOpenReportFormIntent() {
  const intent = readStorage();
  clearOpenReportForm();
  return intent;
}

/**
 * Lê sem remover (ex.: para adiar reload de build).
 * @returns {OpenReportFormIntent | null}
 */
export function peekOpenReportFormIntent() {
  return readStorage();
}
