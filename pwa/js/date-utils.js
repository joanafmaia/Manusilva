/**
 * Utilitários de data — calendários e formatação PT.
 */

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const PORTUGAL_TZ = 'Europe/Lisbon';

/**
 * Calendário civil em horário de Portugal (Europe/Lisbon).
 * Datas puras AAAA-MM-DD mantêm-se; timestamps ISO usam o fuso de Lisboa
 * (não o UTC do `.slice(0, 10)`).
 * @param {Date|string|number} [value]
 * @returns {string} AAAA-MM-DD ou ''
 */
export function toPortugalIsoDate(value = new Date()) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatDateInTimeZone(value, PORTUGAL_TZ);
  }
  const pure = String(value ?? '').trim();
  if (!pure) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(pure)) return pure;
  const d = new Date(pure);
  if (Number.isNaN(d.getTime())) return '';
  return formatDateInTimeZone(d, PORTUGAL_TZ);
}

function formatDateInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function toLocalIsoDate(date) {
  return toPortugalIsoDate(date instanceof Date ? date : new Date(date));
}

export function getWeekDates(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(toLocalIsoDate(dt));
  }
  return dates;
}

export function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function isToday(iso) {
  return iso === toLocalIsoDate(new Date());
}

export function getDayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return DAY_LABELS[idx];
}

export function getDayNumber(iso) {
  return new Date(iso + 'T00:00:00').getDate();
}

export function addDaysToIsoDate(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
}
