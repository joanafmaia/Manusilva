/**
 * Data da intervenção para e-mails e textos externos (DD/MM/AAAA).
 * Alinhado com o PDF — não usar data de envio, submissão ou aprovação.
 */

function pickFirstFormatted(candidates) {
  for (const raw of candidates) {
    const formatted = formatInterventionDatePt(raw);
    if (formatted) return formatted;
  }
  return '';
}

/** @param {unknown} raw */
export function formatInterventionDatePt(raw) {
  const pure = String(raw ?? '').trim();
  if (!pure || pure === '—') return '';

  const iso = pure.includes('T') ? pure.split('T')[0] : pure;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const parts = iso.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    const [d, m, y] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  return pure;
}

/** Valores do formulário (suporta `data.values` e campos legados em `data`). */
export function getReportFormValues(report) {
  const data = report?.data && typeof report.data === 'object' ? report.data : {};
  const nested = data.values && typeof data.values === 'object' ? data.values : {};
  return { ...data, ...nested };
}

/**
 * @param {object | null | undefined} report
 * @param {{ date?: string } | null | undefined} [job]
 */
export function resolveReportInterventionDatePt(report, job = null) {
  const values = getReportFormValues(report);
  const isFolhaAvarias = report?.serviceType === 'folha_intervencao_avarias';

  return pickFirstFormatted(
    isFolhaAvarias
      ? [values.data_2, values.data_de_conclusao, values.data_1, job?.date, values.concluido_testado_em]
      : [values.data_de_conclusao, values.data_1, job?.date, values.concluido_testado_em],
  );
}
