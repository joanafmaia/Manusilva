/**
 * Estatísticas das avaliações do cliente — gráficos e auditoria anual.
 */

export const AVALIACAO_SCORE_META = {
  1: { label: 'Insatisfeito', color: '#dc2626', emoji: '😞' },
  2: { label: 'Regular', color: '#ca8a04', emoji: '😐' },
  3: { label: 'Satisfeito', color: '#16a34a', emoji: '😊' },
};

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

export function getAvaliacaoResponseDate(row) {
  const raw = row?.criadoEm || row?.servicoDate || '';
  const iso = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}

export function getAvaliacaoResponseYear(row) {
  const iso = getAvaliacaoResponseDate(row);
  return iso ? iso.slice(0, 4) : '';
}

export function listAvailableAvaliacaoYears(rows = []) {
  const years = new Set();
  for (const row of rows) {
    const year = getAvaliacaoResponseYear(row);
    if (year) years.add(year);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function filterAvaliacoesByYear(rows = [], year) {
  const key = String(year || '').trim();
  if (!key || key === 'all') return [...rows];
  return rows.filter((row) => getAvaliacaoResponseYear(row) === key);
}

export function summarizeScoreCounts(rows = []) {
  let good = 0;
  let mid = 0;
  let bad = 0;
  for (const row of rows) {
    const score = Number(row.score);
    if (score === 3) good += 1;
    else if (score === 2) mid += 1;
    else if (score === 1) bad += 1;
  }
  return {
    total: rows.length,
    good,
    mid,
    bad,
  };
}

/** Percentagem de satisfeitos (score 3) sobre o total com resposta. */
export function computeSatisfiedPercent(counts) {
  if (!counts?.total) return null;
  return Math.round((counts.good / counts.total) * 100);
}

/** Índice simples 0–100: satisfeito=100%, regular=50%, insatisfeito=0%. */
export function computeSatisfactionIndex(counts) {
  if (!counts?.total) return null;
  const points = counts.good * 100 + counts.mid * 50;
  return Math.round(points / counts.total);
}

export function buildDistributionChartData(rows = []) {
  const counts = summarizeScoreCounts(rows);
  return {
    labels: [3, 2, 1].map((score) => AVALIACAO_SCORE_META[score].label),
    values: [counts.good, counts.mid, counts.bad],
    colors: [3, 2, 1].map((score) => AVALIACAO_SCORE_META[score].color),
    counts,
  };
}

export function buildMonthlyStackedChartData(rows = [], year) {
  const targetYear = String(year || '').trim();
  const buckets = Array.from({ length: 12 }, () => ({ good: 0, mid: 0, bad: 0 }));

  for (const row of rows) {
    const iso = getAvaliacaoResponseDate(row);
    if (!iso) continue;
    if (targetYear && iso.slice(0, 4) !== targetYear) continue;
    const monthIndex = Number(iso.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    const score = Number(row.score);
    if (score === 3) buckets[monthIndex].good += 1;
    else if (score === 2) buckets[monthIndex].mid += 1;
    else if (score === 1) buckets[monthIndex].bad += 1;
  }

  return {
    labels: [...MONTH_LABELS_PT],
    datasets: [
      {
        label: 'Satisfeito',
        data: buckets.map((b) => b.good),
        backgroundColor: AVALIACAO_SCORE_META[3].color,
      },
      {
        label: 'Regular',
        data: buckets.map((b) => b.mid),
        backgroundColor: AVALIACAO_SCORE_META[2].color,
      },
      {
        label: 'Insatisfeito',
        data: buckets.map((b) => b.bad),
        backgroundColor: AVALIACAO_SCORE_META[1].color,
      },
    ],
    monthTotals: buckets.map((b) => b.good + b.mid + b.bad),
  };
}

export function buildAvaliacoesAuditSummary(rows = [], year) {
  const filtered = filterAvaliacoesByYear(rows, year);
  const counts = summarizeScoreCounts(filtered);
  return {
    year: String(year || 'all'),
    counts,
    satisfiedPercent: computeSatisfiedPercent(counts),
    satisfactionIndex: computeSatisfactionIndex(counts),
    distribution: buildDistributionChartData(filtered),
    monthly: buildMonthlyStackedChartData(filtered, year === 'all' ? '' : year),
  };
}
