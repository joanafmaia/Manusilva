/**
 * Estado do e-mail ao cliente após aprovação do relatório.
 * - sent: visitClienteEmailSentAt definido
 * - pending: aprovação ok mas envio falhou (clienteEmailPendingAt)
 * - none: ainda não tentado / sem destinatário
 */

export function reportClientEmailAlreadySent(report) {
  return Boolean(report?.data?.visitClienteEmailSentAt);
}

export function reportClientEmailIsPending(report) {
  if (reportClientEmailAlreadySent(report)) return false;
  return Boolean(report?.data?.clienteEmailPendingAt);
}

/** @returns {'sent'|'pending'|'none'} */
export function getReportClienteEmailState(report) {
  if (reportClientEmailAlreadySent(report)) return 'sent';
  if (reportClientEmailIsPending(report)) return 'pending';
  return 'none';
}

export function buildClienteEmailSentPatch(sentAt = new Date().toISOString()) {
  return {
    visitClienteEmailSentAt: sentAt,
    clienteEmailPendingAt: null,
    clienteEmailLastError: null,
  };
}

export function buildClienteEmailPendingPatch(errorMessage = '') {
  return {
    clienteEmailPendingAt: new Date().toISOString(),
    clienteEmailLastError: String(errorMessage || '').trim().slice(0, 400) || null,
  };
}

export function renderReportClienteEmailBadge(report) {
  const state = getReportClienteEmailState(report);
  if (state === 'sent') {
    return '<span class="rh-email-state-badge rh-email-state-badge--sent" title="E-mail enviado ao cliente">E-mail enviado</span>';
  }
  if (state === 'pending') {
    const err = String(report?.data?.clienteEmailLastError || '')
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const title = err
      ? `E-mail pendente: ${err}`
      : 'Aprovado, mas o e-mail ao cliente ainda não foi enviado';
    return `<span class="rh-email-state-badge rh-email-state-badge--pending" title="${title}">E-mail pendente</span>`;
  }
  return '';
}

export function countReportsWithPendingClienteEmail(reports = []) {
  return (reports || []).filter(
    (r) => r?.status === 'approved' && reportClientEmailIsPending(r),
  ).length;
}
