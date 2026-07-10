/**
 * Campos de auditoria RH — colunas dedicadas com fallback em JSON (dados.audit).
 */

export const AUDIT_SERVICO_COLUMNS = ['aprovado_por', 'faturado_por'];
export const AUDIT_RELATORIO_COLUMNS = ['aprovado_por', 'faturado_por'];
export const AUDIT_FOLHA_COLUMNS = ['faturado_por'];
export const AUDIT_MANUAL_COLUMNS = ['registado_por'];

export function isMissingAuditColumnError(error) {
  const msg = String(error?.message || error?.details || error || '').toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    /could not find the .* column/.test(msg) ||
    /column .* does not exist/.test(msg) ||
    /schema cache/.test(msg)
  );
}

export function readAuditField(row, columnName) {
  const direct = row?.[columnName];
  if (direct) return direct;
  const audit = row?.dados?.audit;
  if (audit && audit[columnName]) return audit[columnName];
  return null;
}

export function mergeAuditIntoDados(dados = {}, auditPatch = {}) {
  const next = { ...(dados || {}) };
  const audit = { ...(next.audit || {}) };

  for (const [key, value] of Object.entries(auditPatch)) {
    if (value == null || value === '') delete audit[key];
    else audit[key] = value;
  }

  if (Object.keys(audit).length) next.audit = audit;
  else delete next.audit;

  return next;
}

export function stripAuditColumns(patch = {}, columns = []) {
  const next = { ...patch };
  const audit = {};

  for (const col of columns) {
    if (!(col in next)) continue;
    audit[col] = next[col];
    delete next[col];
  }

  return { patch: next, audit };
}

export function buildRelatorioAuditDados(existingDados = {}, report = {}) {
  const auditPatch = {};
  if (report.approvedBy) auditPatch.aprovado_por = report.approvedBy;
  if (report.invoicedBy) auditPatch.faturado_por = report.invoicedBy;
  if (!Object.keys(auditPatch).length) return existingDados;
  return mergeAuditIntoDados(existingDados, auditPatch);
}

export function stripAuditFromRelatorioRow(row = {}) {
  const { patch, audit } = stripAuditColumns(row, AUDIT_RELATORIO_COLUMNS);
  if (!Object.keys(audit).length) return patch;
  return {
    ...patch,
    dados: mergeAuditIntoDados(patch.dados || {}, audit),
  };
}
