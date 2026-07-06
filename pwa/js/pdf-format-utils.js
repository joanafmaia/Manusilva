/**
 * Formatação de texto e datas para células PDF.
 */

import { pdfSafeText } from './pdf-font.js';
import { VISITAS_FIELD_ID } from './deslocacao-field.js';
import { PDF_LAYOUT_SKIP_FIELD_IDS } from './pdf-design-system.js';

const INSPECAO_DL50_SERVICE_ID = 'inspecao_dl50_2005';

/** Texto legível no PDF — sem aspas JSON, \\n literais nem lixo de serialização */
export function cleanPdfText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);

  let s = val;
  if (typeof s === 'object') {
    if (Array.isArray(s)) return s.map((x) => cleanPdfText(x)).filter(Boolean).join(', ');
    s = s.label ?? s.value ?? s.Nome ?? s.name ?? '';
  }

  if (typeof s !== 'string') s = String(s);

  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    try {
      s = JSON.parse(t.startsWith('"') ? t : `"${t.slice(1, -1).replace(/"/g, '\\"')}"`);
    } catch {
      s = t.slice(1, -1);
    }
  }

  if (typeof s !== 'string') return cleanPdfText(s);

  return pdfSafeText(
    s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\s*\|\s*/g, ' ')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

export function pdfDisplayValue(val) {
  if (val === undefined || val === null) return '—';
  const t = cleanPdfText(val);
  if (!t || t === 'null' || t === 'undefined') return '—';
  return t;
}

export function formatFolhaInterventionDate(raw) {
  const pure = String(raw ?? '').trim();
  if (!pure) return '—';
  const iso = pure.includes('T') ? pure.split('T')[0] : pure;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const parts = iso.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${d}/${m}/${y}`;
  }
  return pdfDisplayValue(raw) || '—';
}

export function resolvePdfCellToken(val, ctx = {}) {
  if (val === '$technician') return ctx.techName || '';
  if (val === '$jobDate') return ctx.jobDate || '';
  if (val === '$localidade') return ctx.localidade || '';
  return val;
}

export function formatPdfDeslocacao(raw, ctx = {}) {
  const localidade =
    cleanPdfText(ctx.values?.localidade) ||
    cleanPdfText(ctx.clientMeta?.localidade) ||
    cleanPdfText(ctx.localidade) ||
    '';

  let text = cleanPdfText(
    resolvePdfCellToken(raw, {
      techName: ctx.techName,
      jobDate: ctx.jobDate,
      localidade,
    }),
  );

  if (!text || /^\$[a-z_]+$/i.test(text)) {
    return localidade || '—';
  }

  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(text) && !text.includes(' ')) {
    return localidade || '—';
  }

  if (
    localidade &&
    /^[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]{2,10}$/.test(text) &&
    text !== localidade.toUpperCase()
  ) {
    return localidade;
  }

  if (/^\d+([.,]\d+)?$/.test(text)) {
    return `${text.replace(',', '.')} Km`;
  }

  return text;
}

export function formatPdfNumeroVisitas(values) {
  const raw = values?.[VISITAS_FIELD_ID] ?? values?.visitas ?? values?.numero_visitas;
  const n = Number(String(raw ?? '').replace(',', '.').trim());
  if (Number.isFinite(n) && n >= 1) return String(Math.round(n));
  return '1';
}

export function formatPdfConclusionDate(values = {}) {
  const formatted = formatFolhaInterventionDate(values.data_de_conclusao);
  return formatted === '—' ? '' : formatted;
}

/** Folha de Avarias: Data 2 = conclusão quando preenchida. */
export function resolveFolhaAvariasConclusionDate(values = {}) {
  const raw = values.data_2 || values.data_de_conclusao || values.data_1 || '';
  const formatted = formatFolhaInterventionDate(raw);
  return formatted === '—' ? '' : formatted;
}

/** Folha de Avarias: com 2 visitas, Data do Serviço = Data 1 (primeira intervenção). */
export function resolveFolhaAvariasServiceDate(values = {}, job = null, report = null) {
  const raw =
    values.data_2 && values.data_1
      ? values.data_1
      : job?.date || values.data_1 || report?.submittedAt?.split('T')[0] || '';
  if (!raw) return '';
  const formatted = formatFolhaInterventionDate(raw);
  return formatted === '—' ? '' : formatted;
}

export function formatPdfJobDateOnly(job, report) {
  const raw = job?.date || report?.submittedAt?.split('T')[0];
  if (!raw) return '';
  const [y, m, d] = String(raw).split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function formatPdfServiceDateOnly(report, job, values = {}) {
  const raw =
    job?.date ||
    values.data_de_conclusao ||
    values.data_1 ||
    values.concluido_testado_em ||
    report?.submittedAt?.split('T')[0];
  if (!raw) return '—';
  const [y, m, d] = String(raw).split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

export function isPdfLayoutReservedField(fieldId, service = null) {
  if (
    service?.id === INSPECAO_DL50_SERVICE_ID &&
    (fieldId === 'pedido_orcamento' || fieldId === 'detalhe_pedido_orcamento')
  ) {
    return false;
  }
  return PDF_LAYOUT_SKIP_FIELD_IDS.has(fieldId);
}
