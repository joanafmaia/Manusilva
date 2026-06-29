/**
 * Conversão data/hora entre formulário HTML e armazenamento.
 */

export const DATE_FIELD_ID_RE =
  /^(data_|data_de_|data_fabrico|data_fabricacao|data_rececao|concluido_testado_em|data_1|data_2)/i;
export const TIME_FIELD_ID_RE = /^(hora_|hora_inicio|hora_fim|hora_de_)/i;
export const DATETIME_FIELD_ID_RE = /^(data_hora|datetime)/i;

export function toHtmlDateValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(text.includes('T') ? text : `${text}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

export function normalizeDateForStorage(val) {
  return toHtmlDateValue(val) || String(val ?? '').trim();
}

export function toHtmlTimeValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  const hm = text.match(/(\d{1,2}):(\d{2})/);
  if (hm) return `${String(hm[1]).padStart(2, '0')}:${hm[2]}`;
  return '';
}

export function normalizeTimeForStorage(val) {
  return toHtmlTimeValue(val) || String(val ?? '').trim();
}

export function toHtmlDatetimeLocalValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/);
  if (iso) {
    const hm = iso[2].match(/(\d{1,2}):(\d{2})/);
    const time = hm ? `${String(hm[1]).padStart(2, '0')}:${hm[2]}` : '00:00';
    return `${iso[1]}T${time}`;
  }
  const datePart = toHtmlDateValue(text);
  const timePart = toHtmlTimeValue(text);
  if (datePart && timePart) return `${datePart}T${timePart}`;
  if (datePart) return `${datePart}T00:00`;
  return '';
}

export function normalizeDatetimeForStorage(val) {
  return toHtmlDatetimeLocalValue(val) || String(val ?? '').trim();
}

export function resolveFieldInputType(field) {
  const type = field?.type;
  if (type === 'date' || type === 'time' || type === 'datetime' || type === 'datetime-local') {
    return type === 'datetime' ? 'datetime-local' : type;
  }
  const id = field?.id || '';
  if (DATETIME_FIELD_ID_RE.test(id)) return 'datetime-local';
  if (TIME_FIELD_ID_RE.test(id)) return 'time';
  if (DATE_FIELD_ID_RE.test(id) || /fabrico|rececao|conclusao/i.test(id)) return 'date';
  return type;
}

export function normalizeDynamicCellValue(inputType, val) {
  if (inputType === 'date') return normalizeDateForStorage(val);
  if (inputType === 'time') return normalizeTimeForStorage(val);
  if (inputType === 'datetime-local' || inputType === 'datetime') return normalizeDatetimeForStorage(val);
  return String(val ?? '').trim();
}
