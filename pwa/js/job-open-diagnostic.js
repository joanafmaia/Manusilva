/**
 * Diagnóstico quando um relatório não abre no tablet do técnico.
 */

import { getClient, getJob, getReportForJob, getServiceType, resolveJobForForm } from './app.js';
import { normalizeEntityId } from './entity-id.js';

/**
 * @param {string} jobId
 * @returns {{ ok: boolean, job: object|null, issues: Array<{ code: string, message: string, action?: string }> }}
 */
export function diagnoseJobFormOpen(jobId) {
  const key = normalizeEntityId(jobId);
  const issues = [];

  if (!key) {
    return {
      ok: false,
      job: null,
      issues: [{ code: 'invalid_id', message: 'Identificador do trabalho inválido.' }],
    };
  }

  const cachedJob = getJob(key);
  const report = getReportForJob(key);
  const job = resolveJobForForm(key);

  if (!job) {
    issues.push({
      code: 'job_missing',
      message: 'Trabalho não encontrado. Os dados podem ainda não estar sincronizados.',
      action: 'sync',
    });
    return { ok: false, job: null, issues };
  }

  if (!cachedJob && report) {
    issues.push({
      code: 'job_from_report',
      message: 'Trabalho recuperado a partir do rascunho/relatório local.',
    });
  }

  const service = getServiceType(job.serviceType);
  if (!service) {
    issues.push({
      code: 'service_unknown',
      message: `Tipo de relatório não reconhecido: ${job.serviceType || '—'}`,
    });
  }

  if (job.clientId && !getClient(job.clientId)) {
    issues.push({
      code: 'client_missing',
      message: 'Cliente ainda não carregado neste dispositivo.',
      action: 'sync',
    });
  }

  if (report?.status === 'approved') {
    issues.push({
      code: 'already_approved',
      message: 'Este relatório já foi aprovado pelo RH.',
    });
  }

  const blockingCodes = new Set(['invalid_id', 'job_missing', 'service_unknown', 'already_approved']);
  const ok = !issues.some((i) => blockingCodes.has(i.code));

  return { ok, job, issues };
}

export function formatJobOpenDiagnosticMessage(diagnostic) {
  if (!diagnostic?.issues?.length) return 'Não foi possível abrir este relatório.';
  return diagnostic.issues.map((i) => i.message).join(' ');
}

export function diagnosticNeedsSync(diagnostic) {
  return Boolean(diagnostic?.issues?.some((i) => i.action === 'sync'));
}
