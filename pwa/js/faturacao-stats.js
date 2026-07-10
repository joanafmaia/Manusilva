/**
 * Estatísticas de faturação — resumo anual para auditoria.
 */

const MONTH_LABELS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function getBillingInvoiceYear(row) {
  const iso = String(row?.date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 4) : '';
}

export function listAvailableBillingYears(rows = []) {
  const years = new Set();
  for (const row of rows) {
    const year = getBillingInvoiceYear(row);
    if (year) years.add(year);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function filterBillingByYear(rows = [], year) {
  const key = String(year || '').trim();
  if (!key || key === 'all') return [...rows];
  return rows.filter((row) => getBillingInvoiceYear(row) === key);
}

export function computeBillingMetrics(rows = []) {
  let totalFaturado = 0;
  let totalRecebido = 0;
  let totalDivida = 0;
  let countPago = 0;
  let countPendente = 0;

  for (const row of rows) {
    const valor = Number(row.valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    totalFaturado += valor;
    if (row.estado === 'pago') {
      totalRecebido += valor;
      countPago += 1;
    } else if (row.estado === 'pendente') {
      totalDivida += valor;
      countPendente += 1;
    }
  }

  return {
    totalFaturado,
    totalRecebido,
    totalDivida,
    invoiceCount: rows.length,
    countPago,
    countPendente,
  };
}

export function buildBillingByTypeRows(rows = []) {
  const byType = new Map();
  for (const row of rows) {
    const tipo = row.tipo || '—';
    const current = byType.get(tipo) || { count: 0, valor: 0, recebido: 0 };
    const valor = Number(row.valor) || 0;
    current.count += 1;
    current.valor += valor;
    if (row.estado === 'pago') current.recebido += valor;
    byType.set(tipo, current);
  }

  return [...byType.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .map(([tipo, metrics]) => ({
      tipo,
      count: metrics.count,
      valor: metrics.valor,
      recebido: metrics.recebido,
    }));
}

export function buildMonthlyBillingRows(rows = [], year) {
  const targetYear = String(year || '').trim();
  const buckets = Array.from({ length: 12 }, () => ({
    faturado: 0,
    recebido: 0,
    divida: 0,
  }));

  for (const row of rows) {
    const iso = String(row.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    if (targetYear && iso.slice(0, 4) !== targetYear) continue;
    const monthIndex = Number(iso.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    const valor = Number(row.valor) || 0;
    if (valor <= 0) continue;
    buckets[monthIndex].faturado += valor;
    if (row.estado === 'pago') buckets[monthIndex].recebido += valor;
    else if (row.estado === 'pendente') buckets[monthIndex].divida += valor;
  }

  return MONTH_LABELS_PT.map((month, index) => ({
    month,
    faturado: buckets[index].faturado,
    recebido: buckets[index].recebido,
    divida: buckets[index].divida,
  }));
}

export function buildBillingAuditSummary(rows = [], year) {
  const filtered = filterBillingByYear(rows, year);
  const metrics = computeBillingMetrics(filtered);
  return {
    year: String(year || 'all'),
    metrics,
    byType: buildBillingByTypeRows(filtered),
    monthly: buildMonthlyBillingRows(filtered, year === 'all' ? '' : year),
  };
}
