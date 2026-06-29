/**
 * Data da intervenção para e-mails (DD/MM/AAAA) — espelho de js/report-intervention-date.js
 */

function formatInterventionDatePt(raw) {
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

function getReportFormValues(reportRow) {
  const dados = reportRow?.dados && typeof reportRow.dados === 'object' ? reportRow.dados : {};
  const nested = dados.values && typeof dados.values === 'object' ? dados.values : {};
  return { ...dados, ...nested };
}

function resolveReportInterventionDatePt(reportRow, jobDate) {
  const values = getReportFormValues(reportRow);
  const candidates = [values.data_de_conclusao, values.data_1, jobDate, values.concluido_testado_em];
  for (const raw of candidates) {
    const formatted = formatInterventionDatePt(raw);
    if (formatted) return formatted;
  }
  return '';
}

module.exports = {
  formatInterventionDatePt,
  resolveReportInterventionDatePt,
};
