/**
 * Manusilva PWA — Geração profissional de PDF (jsPDF)
 */

import {
  COMPANY,
  PDF_DOCUMENT_TITLES,
  CLIENTS,
  DEMO_CLIENT_FORKLIFTS,
  mapClientToLegacy,
  TECHNICIANS,
  SERVICE_TYPES,
  reportTemplates,
} from './mock_data.js';
import {
  ensureProductionCatalog,
  getClientFromCatalog,
  getProductionClientsCatalog,
} from './clients-catalog.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import {
  ensurePdfFonts,
  pdfAutoTableFont,
  pdfSetFont,
  pdfSafeText,
  pdfSplitText,
  PDF_SYMBOL,
  pdfStatusGlyph,
} from './pdf-font.js';
import { getColumnLabels } from './views/relatorio-grandes.js';
import { reportIncludesDeslocacao, VISITAS_FIELD_ID, VISIT_DATES_FIELD_ID, DESLOCACAO_BASE_FIELD_ID } from './deslocacao-field.js';
import {
  buildPdfAutoTableStyles,
  getBlockPdfTitle,
  getMachineSectionScalarFields,
  mergePdfTableDidParseCell,
  PDF_AUTOTABLE_MARGIN_BOTTOM_MM,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_CORPORATE_BLUE_DARK as CORPORATE_BLUE_DARK,
  PDF_COLOR_DANGER as DANGER,
  PDF_COLOR_SLATE_LINE as SLATE_LINE,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_COLOR_WHITE as WHITE,
  PDF_CONTENT_SAFE_BOTTOM_MM,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_CAPTION,
  PDF_FONT_SECTION,
  PDF_FONT_SUBTITLE,
  PDF_FONT_TITLE,
  PDF_FOOTER_BLOCK_TOP,
  PDF_FOOTER_TEXT_RGB,
  PDF_FOTO_LABEL_ANTES,
  PDF_FOTO_LABEL_DEPOIS,
  PDF_FOTO_SECTION_TITLE,
  PDF_MARGIN as MARGIN,
  PDF_MACHINE_SECTION,
  PDF_PAGE_CONTENT_START_Y,
  PDF_PAGE_H as PAGE_H,
  PDF_PAGE_NUMBER_Y,
  PDF_PAGE_W as PAGE_W,
  PDF_SCALAR_FIELD_TYPES,
  PDF_SECTION_BG,
  PDF_STANDARD_MACHINE_SPECS,
  PDF_LAYOUT_SKIP_FIELD_IDS,
  resolvePdfStandardFieldValue,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_TABLE_HEAD_FILL,
  PDF_TABLE_HEAD_TEXT,
  PDF_TABLE_LINE,
  isMachineInfoSection,
  pdfNormalizeHeading,
  reportHasMachineSection,
  shouldSkipPdfSectionHeader,
} from './pdf-design-system.js';
import {
  columnKey as materialColumnKey,
  columnLabel as materialColumnLabel,
  fieldAnchorsReportClosing,
  findPairedObservationsField,
  getMaterialTablePdfLabel,
  isMaterialTableField,
  isObservationsField,
  MATERIAL_UTILIZADO_COLUMNS,
  normalizeMaterialRows,
  resolveServiceMaterialField,
} from './material-table-field.js';
import {
  drawInspecaoDl50HeaderBlock,
  INSPECAO_DL50_MACHINE_FIELD_IDS,
  INSPECAO_DL50_PDF_SKIP_FIELD_IDS,
  resolveInspecaoDl50MachineFields,
} from './inspecao-dl50-categories.js';
import {
  formatOrdemTechnicianLine,
  resolvePedidoOrcamentoValue,
  resolvePedidoOrcamentoDetalhe,
  resolveStandardFieldValue,
  PDF_STANDARD_WORK_SPECS,
} from './report-layout-standard.js';

const DB_KEY = 'manusilva_db';
const PDF_FOOTER_FONT_SIZE = PDF_FONT_CAPTION;

function getDB() {
  const raw = localStorage.getItem(DB_KEY);
  return raw ? JSON.parse(raw) : { clients: CLIENTS, technicians: TECHNICIANS };
}

function getClient(id) {
  const raw = getDB().clients?.find((c) => c.id === id);
  if (raw) {
    const legacy = raw.name ? raw : mapClientToLegacy(raw);
    const demo = DEMO_CLIENT_FORKLIFTS[id];
    if (demo?.forklifts?.length && !legacy.forklifts?.length) {
      legacy.forklifts = demo.forklifts;
    }
    return legacy;
  }
  const demo = DEMO_CLIENT_FORKLIFTS[id];
  if (demo) {
    return mapClientToLegacy({ id, Nome: demo.Nome, NIF: demo.NIF, forklifts: demo.forklifts });
  }
  return CLIENTS.find((c) => c.id === id) || null;
}

async function resolvePdfClientMeta(report, values = {}) {
  let catalog = [];
  try {
    await ensureProductionCatalog();
    catalog = getProductionClientsCatalog();
  } catch (err) {
    console.warn('[PDF] Catálogo de clientes indisponível; a usar dados locais.', err);
  }
  const dbClient = getClient(report.clientId);

  let prod =
    (values.cliente_id && getClientFromCatalog(values.cliente_id, catalog)) || null;
  if (!prod && values.cliente) {
    const q = String(values.cliente).trim().toLowerCase();
    prod = catalog.find((c) => c.Nome.toLowerCase() === q) || null;
  }

  const nome = values.cliente || prod?.Nome || dbClient?.name || dbClient?.Nome || '—';
  const morada = values.morada || prod?.Morada || dbClient?.morada || dbClient?.Morada || '';
  const localidade = values.localidade || prod?.Localidade || dbClient?.localidade || dbClient?.Localidade || '';
  const cp = values.codigo_postal || prod?.['Código postal'] || dbClient?.['Código postal'] || '';

  const street = cleanPdfText(morada);
  const cpLoc = [cp, localidade].filter(Boolean).map((p) => cleanPdfText(p)).join(' ').trim();
  let addressLine = street;
  let addressSubline = cpLoc;

  if (!street && !cpLoc) {
    const fallback = cleanPdfText(dbClient?.address || '');
    if (fallback) {
      addressLine = fallback;
      addressSubline = '';
    }
  }

  return { nome, addressLine: addressLine || '—', addressSubline, localidade };
}

function buildPdfRenderContext(report, job, clientMeta, tech) {
  return {
    techName: tech?.name || '',
    jobDate: job?.date || '',
    localidade: clientMeta?.localidade || '',
    forkliftSerial: report?.forkliftSerial || job?.forkliftSerial || '',
    report,
    data: report?.data || {},
    clientMeta,
    values: null,
  };
}

function resolvePdfCellToken(val, ctx = {}) {
  if (val === '$technician') return ctx.techName || '';
  if (val === '$jobDate') return ctx.jobDate || '';
  if (val === '$localidade') return ctx.localidade || '';
  return val;
}

/** Célula/campo vazio → traço tipográfico */
function pdfDisplayValue(val) {
  if (val === undefined || val === null) return '—';
  const t = cleanPdfText(val);
  if (!t || t === 'null' || t === 'undefined') return '—';
  return t;
}

/** Deslocação legível — localidade do cliente em vez de siglas/tokens internos */
function formatPdfDeslocacao(raw, ctx = {}) {
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

/** Número de visitas ao terreno — padrão 1 quando omitido. */
function formatPdfNumeroVisitas(values) {
  const raw = values?.[VISITAS_FIELD_ID] ?? values?.visitas ?? values?.numero_visitas;
  const n = Number(String(raw ?? '').replace(',', '.').trim());
  if (Number.isFinite(n) && n >= 1) return String(Math.round(n));
  return '1';
}

function parsePdfVisitDatesRaw(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** DD/MM — para linha condicional de múltiplas visitas */
function formatPdfShortVisitDate(raw) {
  const pure = String(raw || '').split('T')[0];
  const [y, m, d] = pure.split('-');
  if (y && m && d) return `${d}/${m}`;
  return '';
}

/** Data principal do serviço — apenas dia (DD/MM/AAAA), sem hora */
function formatPdfServiceDateOnly(report, job, values = {}) {
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

/** Datas de visitas ao terreno — só relevante quando visitas > 1 */
function resolvePdfVisitDatesLine(values, report, job, visitCount) {
  const n = Number(visitCount) || 1;
  if (n <= 1) return '';

  let dates = parsePdfVisitDatesRaw(
    values?.[VISIT_DATES_FIELD_ID] ??
      values?.visitas_datas ??
      report?.data?.[VISIT_DATES_FIELD_ID] ??
      report?.data?.values?.[VISIT_DATES_FIELD_ID],
  );

  for (let i = 1; i <= 8; i += 1) {
    const key = `data_${i}`;
    if (values?.[key]) dates.push(values[key]);
  }

  dates = [...new Set(dates.map(formatPdfShortVisitDate).filter(Boolean))];

  const serviceShort = formatPdfShortVisitDate(job?.date || values?.data_de_conclusao);
  if (serviceShort && !dates.includes(serviceShort)) dates.unshift(serviceShort);

  if (!dates.length && serviceShort) dates = [serviceShort];
  while (dates.length < n && serviceShort) {
    dates.push(serviceShort);
  }

  return dates.slice(0, n).join(', ');
}

function isPdfLayoutReservedField(fieldId) {
  return PDF_LAYOUT_SKIP_FIELD_IDS.has(fieldId);
}

function getTechnician(id) {
  return getDB().technicians?.find((t) => t.id === id) || TECHNICIANS.find((t) => t.id === id);
}

function getServiceType(id) {
  return reportTemplates.find((s) => s.id === id) || SERVICE_TYPES.find((s) => s.id === id);
}

function columnKey(col) {
  return materialColumnKey(col);
}

function getJob(id) {
  return getJobsSnapshot().find((j) => j.id === id) || null;
}

const TABLE_HEADER_SHORT = {
  artigo: 'Artigo / Desc.',
  quantidade: 'Qtd.',
  qtd: 'Qtd.',
  data_intervencao: 'Data',
  servico_efectuado_equipamento: 'Serviço / Equip.',
  tecnico: 'Técnico',
  equipamento: 'Equipamento',
  material: 'Material',
  tipo: 'Tipo',
  horas: 'Horas',
};

let jsPDFCtor = null;
let jsPDFLoadPromise = null;
let autoTableLoadPromise = null;

/** URL absoluta do bundle UMD (sem dependências npm) */
function getJsPdfScriptUrl() {
  const pagePath = window.location.pathname.replace(/\\/g, '/');
  const slash = pagePath.lastIndexOf('/');
  const base = slash >= 0 ? pagePath.slice(0, slash + 1) : '/';
  return `${window.location.origin}${base}js/vendor/jspdf.umd.min.js`;
}

function getAutoTableScriptUrl() {
  const pagePath = window.location.pathname.replace(/\\/g, '/');
  const slash = pagePath.lastIndexOf('/');
  const base = slash >= 0 ? pagePath.slice(0, slash + 1) : '/';
  return `${window.location.origin}${base}js/vendor/jspdf.plugin.autotable.min.js`;
}

function isAutoTableReady() {
  try {
    const probe = new window.jspdf.jsPDF();
    return typeof probe.autoTable === 'function';
  } catch {
    return false;
  }
}

function loadJsPdfAutoTable() {
  if (isAutoTableReady()) return Promise.resolve();

  if (!autoTableLoadPromise) {
    autoTableLoadPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if (isAutoTableReady()) resolve();
        else reject(new Error('jspdf-autotable carregou mas autoTable não ficou disponível.'));
      };

      const script =
        document.querySelector('script[data-jspdf-autotable]') ||
        Array.from(document.scripts).find((s) => s.src && s.src.includes('jspdf.plugin.autotable'));

      if (script) {
        if (script.getAttribute('data-jspdf-autotable-ready') === 'true' || isAutoTableReady()) {
          finish();
          return;
        }
        script.addEventListener(
          'load',
          () => {
            script.setAttribute('data-jspdf-autotable-ready', 'true');
            finish();
          },
          { once: true },
        );
        script.addEventListener(
          'error',
          () => reject(new Error(`Falha ao carregar jspdf-autotable (${getAutoTableScriptUrl()})`)),
          { once: true },
        );
        return;
      }

      const el = document.createElement('script');
      el.src = getAutoTableScriptUrl();
      el.async = true;
      el.setAttribute('data-jspdf-autotable', 'true');
      el.onload = () => {
        el.setAttribute('data-jspdf-autotable-ready', 'true');
        finish();
      };
      el.onerror = () => reject(new Error(`Falha ao carregar jspdf-autotable (${getAutoTableScriptUrl()})`));
      document.head.appendChild(el);
    }).catch((err) => {
      autoTableLoadPromise = null;
      throw err;
    });
  }

  return autoTableLoadPromise;
}

function resolveJsPDFFromWindow() {
  const ctor = window.jspdf?.jsPDF;
  if (!ctor) return null;
  jsPDFCtor = ctor;
  return jsPDFCtor;
}

function loadJsPdfScript() {
  const existing = resolveJsPDFFromWindow();
  if (existing) return Promise.resolve(existing);

  const src = getJsPdfScriptUrl();

  return new Promise((resolve, reject) => {
    const finish = () => {
      const ctor = resolveJsPDFFromWindow();
      if (ctor) resolve(ctor);
      else reject(new Error('jsPDF carregou mas não ficou disponível em window.jspdf.'));
    };

    const script =
      document.querySelector('script[data-jspdf]') ||
      Array.from(document.scripts).find((s) => s.src && s.src.includes('jspdf.umd'));

    if (script) {
      if (script.getAttribute('data-jspdf-ready') === 'true' || window.jspdf?.jsPDF) {
        finish();
        return;
      }
      script.addEventListener('load', () => {
        script.setAttribute('data-jspdf-ready', 'true');
        finish();
      }, { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error(`Falha ao carregar jsPDF (${src})`)),
        { once: true },
      );
      return;
    }

    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.setAttribute('data-jspdf', 'true');
    el.onload = () => {
      el.setAttribute('data-jspdf-ready', 'true');
      finish();
    };
    el.onerror = () => reject(new Error(`Falha ao carregar jsPDF (${src})`));
    document.head.appendChild(el);
  });
}

/** Carrega jsPDF (UMD local em `js/vendor/jspdf.umd.min.js`) */
export async function loadJsPDF() {
  if (jsPDFCtor) return jsPDFCtor;

  if (!jsPDFLoadPromise) {
    jsPDFLoadPromise = loadJsPdfScript().catch((err) => {
      jsPDFLoadPromise = null;
      console.error('[PDF] loadJsPDF:', err);
      throw new Error(
        err?.message?.includes('jsPDF')
          ? err.message
          : 'Não foi possível carregar a biblioteca PDF. Recarregue a página (Ctrl+F5).',
      );
    });
  }

  return jsPDFLoadPromise;
}

function getReportFilename(report) {
  const safeSerial = (report.forkliftSerial || 'report').replace(/[^\w-]/g, '_');
  const dateStamp = (report.submittedAt || new Date().toISOString()).slice(0, 10);
  return `Manusilva_${report.serviceType}_${safeSerial}_${dateStamp}.pdf`;
}

function yieldToMain() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Constrói o documento PDF completo (sem descarregar).
 * @param {object} report
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function renderInterventionPDF(report) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.__manusilvaLastContentPage = 1;
  await ensurePdfFonts(doc);
  pdfSetFont(doc, 'normal');

  const service = getServiceType(report.serviceType);
  const tech = getTechnician(report.technicianId);
  const job = report.jobId ? getJob(report.jobId) : null;
  const data = report.data || {};

  const title = sanitizePdfTitle(
    PDF_DOCUMENT_TITLES[report.serviceType] ||
      `FOLHA DE INTERVENÇÃO — ${(service?.label || 'SERVIÇO TÉCNICO').toUpperCase()}`,
  );

  const clientMeta = await resolvePdfClientMeta(report, normalizeReportValues(data));
  const isDl50Pdf = report.serviceType === 'inspecao_dl50_2005';
  const fotoAntesUrl = data.fotoAntesUrl || job?.fotoAntes || null;
  const fotoDepoisUrl = data.fotoDepoisUrl || job?.fotoDepois || null;

  let y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null, tech?.name || '—');
  y = drawTitleBar(doc, y, title);
  const pdfContext = buildPdfRenderContext(report, job, clientMeta, tech);
  let values = mapReportValuesForPdf(data, service, pdfContext);
  values = { ...values, ...resolveInspecaoDl50MachineFields(values, pdfContext) };
  pdfContext.values = values;
  pdfContext.service = service;
  pdfContext.closingOpts = {
    service,
    pdfContext,
    fotoAntesUrl,
    fotoDepoisUrl,
    simplePhotoLegend: true,
    legalValue: isDl50Pdf ? values.declaracao_seguranca : null,
  };
  y = await drawStandardMachineBlock(doc, y, values, pdfContext);
  y = drawDivider(doc, y);
  y = await drawStandardWorkBlock(doc, y, values, service);
  y = drawDivider(doc, y);
  y = await drawReportFieldsSection(doc, y, service, values, pdfContext);
  y = await drawReportClosingSection(doc, y, {
    service,
    pdfContext,
    legalLabel: isDl50Pdf ? 'Declaração de Segurança' : null,
    legalValue: isDl50Pdf ? values.declaracao_seguranca : null,
    fotoAntesUrl,
    fotoDepoisUrl,
    fotoLegenda: '',
    simplePhotoLegend: true,
    signatures: data.signatures || {},
    closingValues: values,
  });
  if ((data.photos || []).length) {
    y = await drawPhotosAppendix(doc, y, data.photos || []);
  }

  touchPdfContentPage(doc);
  trimTrailingBlankPages(doc);
  drawPageFooter(doc, report.id);

  return doc;
}

/**
 * Gera PDF como Blob para pré-visualização no browser.
 * @returns {Promise<{ blobUrl: string, blob: Blob, filename: string, pageCount: number }>}
 */
export async function generateInterventionPDFBlob(report) {
  await yieldToMain();
  const doc = await renderInterventionPDF(report);
  await yieldToMain();
  const filename = getReportFilename(report);
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return {
    blobUrl,
    blob,
    filename,
    pageCount: doc.getNumberOfPages(),
  };
}

/**
 * Gera e descarrega o PDF da folha de intervenção.
 * @param {object} report — relatório aprovado (com data preenchida)
 * @returns {Promise<string>} nome do ficheiro gerado
 */
export async function generateInterventionPDF(report) {
  const doc = await renderInterventionPDF(report);
  const filename = getReportFilename(report);
  doc.save(filename);
  return filename;
}

/**
 * Geração dedicada para "Manutenção Baterias Grandes".
 * Mantém validação explícita por tipo de relatório.
 */
export async function generateManutencaoBateriasGrandesPDF(report) {
  if (report?.serviceType !== 'manutencao_baterias_grandes') {
    throw new Error('Tipo de relatório inválido para PDF de Manutenção Baterias Grandes.');
  }
  return generateInterventionPDF(report);
}

/**
 * Geração dedicada para "Inspeção Decreto-Lei 50-2005".
 * Mantém validação explícita por tipo de relatório.
 */
export async function generateInspecaoDl50PDF(report) {
  if (report?.serviceType !== 'inspecao_dl50_2005') {
    throw new Error('Tipo de relatório inválido para PDF de Inspeção Decreto-Lei 50-2005.');
  }
  return generateInterventionPDF(report);
}

/**
 * Dispatcher por tipo de serviço para geração/download de PDF.
 */
export async function generateReportPdfByServiceType(report) {
  if (!report?.serviceType) {
    throw new Error('Relatório sem tipo de serviço.');
  }

  if (report.serviceType === 'manutencao_baterias_grandes') {
    return generateManutencaoBateriasGrandesPDF(report);
  }

  if (report.serviceType === 'inspecao_dl50_2005') {
    return generateInspecaoDl50PDF(report);
  }

  return generateInterventionPDF(report);
}

/* ─── Layout blocks ─── */

/** Logo no cabeçalho PDF (mm) — compacto para impressão */
const PDF_LOGO_WIDTH_MM = 34;
const PDF_LOGO_HEIGHT_MM = 22;

/** Espaçamentos verticais compactos (mm) */
const PDF_GAP_BLOCK = 2;
const PDF_GAP_TABLE = 1.5;
const PDF_GAP_DIVIDER = 1.5;
const PDF_GAP_TITLE_AFTER = 2;
const PDF_SECTION_BAND_H = 5.5;

function formatTableHeaderLabel(col) {
  const key = columnKey(col);
  if (TABLE_HEADER_SHORT[key]) return TABLE_HEADER_SHORT[key];
  const label = materialColumnLabel(col);
  return label
    .replace(/Descrição/gi, 'Desc.')
    .replace(/Quantidade/gi, 'Qtd.')
    .replace(/Intervenção/gi, 'Interv.')
    .replace(/Verificação/gi, 'Verif.')
    .replace(/Efectuado/gi, 'Efect.')
    .replace(/Identificação/gi, 'Ident.');
}

function buildSmartColumnStyles(columns, tableWidth = CONTENT_W) {
  const keys = columns.map((c) => columnKey(c));
  const narrowKeys = new Set(['qtd', 'quantidade', 'horas', 'qty', 'tipo', 'estado']);
  const narrowCount = keys.filter((k) => narrowKeys.has(k)).length;
  const wideCount = Math.max(columns.length - narrowCount, 1);
  const narrowW = Math.min(tableWidth * 0.2, 28);
  const wideW = (tableWidth - narrowCount * narrowW) / wideCount;
  const styles = {};
  keys.forEach((k, i) => {
    styles[i] = {
      cellWidth: narrowKeys.has(k) ? narrowW : wideW,
      overflow: 'linebreak',
    };
  });
  return styles;
}

function drawLogoPlaceholder(doc, x, y, widthMm, heightMm = widthMm) {
  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x, y, widthMm, heightMm, 2, 2, 'FD');
  doc.setFillColor(...CORPORATE_BLUE);
  doc.roundedRect(x + 1.5, y + 1.5, widthMm - 3, heightMm - 3, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(Math.min(18, 8 + widthMm * 0.22));
  doc.text(COMPANY.logo || 'MS', x + widthMm / 2, y + heightMm / 2 + 1.5, { align: 'center' });
}

function sanitizePdfTitle(title) {
  return String(title)
    .replace(/\s*[—–-]\s*MS[.:]?\s*061\s*/gi, '')
    .replace(/\s*MS[.:]?\s*061\s*/gi, '')
    .replace(/Código:\s*MS[.:]?\s*061\s*/gi, '')
    .trim();
}

function formatOrdemDisplay(numeroOrdem) {
  const padded = String(numeroOrdem).padStart(2, '0');
  return `Ordem No: OP-2026-${padded}`;
}

function buildInstitutionalFooterLines() {
  const contact = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join(' · ');
  return [
    COMPANY.name,
    COMPANY.nif ? `NIF ${COMPANY.nif}` : null,
    COMPANY.address,
    contact,
  ].filter(Boolean);
}

function pdfGridCell(label, value) {
  return `${label}: ${pdfDisplayValue(value)}`;
}

function buildTwoColumnGridBody(pairs) {
  const body = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i];
    const right = pairs[i + 1];
    body.push([
      left ? pdfGridCell(left.label, left.value) : '',
      right ? pdfGridCell(right.label, right.value) : '',
    ]);
  }
  return body;
}

/**
 * Grelha autoTable padrão Manusilva — cabeçalho #f1f5f9, linhas #e2e8f0.
 * @param {import('jspdf').jsPDF} doc
 */
async function drawPdfGridTable(doc, y, options = {}) {
  const {
    head,
    body,
    columnStyles,
    didParseCell,
    gapAfter = PDF_GAP_TABLE,
    marginLeft = MARGIN,
    marginRight = MARGIN,
    tableWidth = CONTENT_W,
  } = options;
  if (!body?.length && !head?.length) return y;

  await loadJsPdfAutoTable();
  const tableConfig = {
    startY: y,
    margin: getPdfAutoTableMargin(marginLeft, marginRight),
    tableWidth,
    ...buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont),
    columnStyles: columnStyles || {
      0: { cellWidth: tableWidth / 2, overflow: 'linebreak' },
      1: { cellWidth: tableWidth / 2, overflow: 'linebreak' },
    },
  };

  if (head?.length) tableConfig.head = head;
  if (body?.length) tableConfig.body = body;
  tableConfig.didParseCell = mergePdfTableDidParseCell(didParseCell);
  tableConfig.didDrawPage = buildPdfAutoTableDidDrawPage(doc);

  doc.autoTable(tableConfig);
  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, gapAfter);
}

function isPdfScalarField(field) {
  return Boolean(field?.type && PDF_SCALAR_FIELD_TYPES.has(field.type));
}

async function drawGenericMachineInfoBlock(doc, y, service, values, pdfContext) {
  const fields = getMachineSectionScalarFields(service);
  if (!fields.length) return y;
  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, y, PDF_MACHINE_SECTION, { skipEnsure: true });
  y = drawDivider(doc, y - 4);
  return drawSectionScalarGrid(doc, y, fields, values, pdfContext);
}

function collectPdfScalarFields(service, values, pdfContext, filters = {}) {
  const { section = null, isDl50 = false, skipIds = new Set() } = filters;
  return (service?.fields || []).filter((field) => {
    if (skipIds.has(field.id)) return false;
    if (INSPECAO_DL50_MACHINE_FIELD_IDS.has(field.id)) return false;
    if (field.section && isMachineInfoSection(field.section)) return false;
    if (field.id === 'declaracao_seguranca') return false;
    if (isDl50 && INSPECAO_DL50_PDF_SKIP_FIELD_IDS.has(field.id)) return false;
    if (isPdfLayoutReservedField(field.id)) return false;
    if (section !== null && field.section !== section) return false;
    if (field.dependency && !isPdfDependencyMet(field, values)) return false;
    if (!isPdfScalarField(field)) return false;
    const value = coercePdfFieldValue(field, values[field.id], pdfContext);
    if (isPdfEmptyValue(field, value)) return false;
    return true;
  });
}

async function drawSectionScalarGrid(doc, y, fields, values, pdfContext) {
  if (!fields.length) return y;
  const pairs = fields.map((field) => ({
    label: field.label,
    value: coercePdfFieldValue(field, values[field.id], pdfContext),
  }));
  const body = buildTwoColumnGridBody(pairs);
  if (!body.length) return y;
  y = ensureSpace(doc, y, 14);
  return drawPdfGridTable(doc, y, { body });
}

function drawTopRow(doc, _service, numeroOrdem = null) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;

  if (isLogoConfigured()) {
    try {
      doc.addImage(
        MANUSILVA_LOGO,
        getPdfLogoFormat(),
        MARGIN,
        topY,
        logoW,
        logoH,
        undefined,
        'FAST',
      );
    } catch {
      drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
    }
  } else {
    drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
  }

  if (numeroOrdem != null) {
    doc.setTextColor(...TEXT_DARK);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(9);
    doc.text(formatOrdemDisplay(numeroOrdem), PAGE_W - MARGIN, topY + logoH * 0.35, {
      align: 'right',
    });
  }

  touchPdfContentPage(doc);
  return topY + logoH + 6;
}

/** Cabeçalho — logo/empresa, ordem/técnico e cliente (nome + morada) em coluna */
function drawTopRowWithClientBlock(doc, clientMeta, numeroOrdem = null, techName = '') {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;
  const contentW = CONTENT_W;

  if (isLogoConfigured()) {
    try {
      doc.addImage(
        MANUSILVA_LOGO,
        getPdfLogoFormat(),
        MARGIN,
        topY,
        logoW,
        logoH,
        undefined,
        'FAST',
      );
    } catch {
      drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
    }
  } else {
    drawLogoPlaceholder(doc, MARGIN, topY, logoW, logoH);
  }

  let y = topY + logoH + 2.5;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  const companyLines = pdfSplitText(doc, pdfSafeText(COMPANY.name), contentW);
  doc.text(companyLines, MARGIN, y);
  y += companyLines.length * 3.1 + 0.5;

  if (numeroOrdem != null || techName) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...CORPORATE_BLUE);
    const ordemLine = formatOrdemTechnicianLine(numeroOrdem, techName);
    const ordemLines = pdfSplitText(doc, pdfSafeText(ordemLine), contentW);
    doc.text(ordemLines, MARGIN, y);
    y += ordemLines.length * 3.8 + 1.5;
  }

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('CLIENTE', MARGIN, y);
  y += 3.8;

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  const nameLines = pdfSplitText(doc, pdfSafeText(clientMeta.nome), contentW);
  doc.text(nameLines, MARGIN, y);
  y += nameLines.length * 3.4 + 0.5;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  const addrLines = pdfSplitText(doc, pdfSafeText(clientMeta.addressLine), contentW);
  doc.text(addrLines, MARGIN, y);
  y += addrLines.length * 3.1;

  if (clientMeta.addressSubline) {
    const addrSubLines = pdfSplitText(doc, pdfSafeText(clientMeta.addressSubline), contentW);
    doc.text(addrSubLines, MARGIN, y);
    y += addrSubLines.length * 3.1;
  }

  touchPdfContentPage(doc);
  return y + PDF_GAP_BLOCK;
}

function drawTitleBar(doc, y, title) {
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...CORPORATE_BLUE_DARK);
  const lines = pdfSplitText(doc, title, CONTENT_W);
  doc.text(lines, MARGIN, y + 3);
  const textH = lines.length * 3.8;
  y += textH + 1.5;
  doc.setDrawColor(...CORPORATE_BLUE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  touchPdfContentPage(doc);
  return y + PDF_GAP_TITLE_AFTER;
}

async function drawStandardMachineBlock(doc, y, values, pdfContext = null) {
  y = ensureSpace(doc, y, 16);
  y = drawSectionTitle(doc, y, PDF_MACHINE_SECTION, { skipEnsure: true });

  const machinePairs = PDF_STANDARD_MACHINE_SPECS.filter((spec) => spec.id !== 'horas').map((spec) => {
    let fallback = null;
    if (spec.id === 'numero_de_serie') {
      fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
    }
    return {
      label: spec.label,
      value: pdfDisplayValue(resolvePdfStandardFieldValue(values, spec, fallback)),
    };
  });

  y = await drawMachineRowTable(doc, y, machinePairs);

  const horasValue = pdfDisplayValue(
    resolvePdfStandardFieldValue(values, { id: 'horas' }) ||
      resolveStandardFieldValue(values, { id: 'horas' }),
  );
  return drawKeyValueLine(doc, y, 'Horas', horasValue);
}

async function drawMachineRowTable(doc, y, pairs) {
  if (!pairs.length) return y;
  await loadJsPdfAutoTable();
  const colW = CONTENT_W / pairs.length;
  const columnStyles = {};
  pairs.forEach((_, i) => {
    columnStyles[i] = { cellWidth: colW, overflow: 'linebreak' };
  });

  doc.autoTable({
    startY: y,
    margin: getPdfAutoTableMargin(MARGIN, MARGIN),
    tableWidth: CONTENT_W,
    head: [pairs.map((p) => p.label)],
    body: [pairs.map((p) => p.value)],
    ...buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont),
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE_DARK,
      fontStyle: 'bold',
      fontSize: PDF_FONT_CAPTION,
      lineColor: PDF_TABLE_LINE,
      lineWidth: 0.15,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      fontSize: PDF_FONT_BODY,
    },
    columnStyles,
    didDrawPage: buildPdfAutoTableDidDrawPage(doc),
  });

  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_GAP_TABLE);
}

async function drawStandardWorkBlock(doc, y, values, service = null) {
  for (const spec of PDF_STANDARD_WORK_SPECS) {
    y = drawCompactLongTextBlock(doc, y, spec.label, values[spec.id]);
  }

  const materialField = resolveServiceMaterialField(service);
  if (materialField) {
    const raw = values[materialField.id];
    const rows = normalizeMaterialRows(Array.isArray(raw) ? raw : []);
    y = await drawStandardMaterialTable(doc, y, rows, materialField.columns || MATERIAL_UTILIZADO_COLUMNS);
  }

  return y + 1;
}

async function drawStandardMaterialTable(doc, y, rows, columns) {
  y = ensureSpace(doc, y, 10);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Consumíveis:', MARGIN, y);
  y += 3.5;

  const colKeys = columns.map((c) => columnKey(c));
  const headLabels = columns.map((c) => formatTableHeaderLabel(c));
  const body =
    rows.length > 0
      ? rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])))
      : [['—', '—']];

  await loadJsPdfAutoTable();
  doc.autoTable({
    startY: y,
    margin: getPdfAutoTableMargin(MARGIN, MARGIN),
    tableWidth: CONTENT_W,
    head: [headLabels],
    body,
    ...buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont),
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE_DARK,
      fontStyle: 'bold',
      fontSize: PDF_FONT_CAPTION,
      lineColor: PDF_TABLE_LINE,
      lineWidth: 0.15,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      fontSize: PDF_FONT_BODY,
      cellPadding: { top: 1.5, right: 2.5, bottom: 1.5, left: 2.5 },
    },
    columnStyles: {
      0: { cellWidth: CONTENT_W * 0.72, overflow: 'linebreak' },
      1: { cellWidth: CONTENT_W * 0.28, halign: 'center', overflow: 'linebreak' },
    },
    didDrawPage: buildPdfAutoTableDidDrawPage(doc),
  });

  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_GAP_TABLE);
}

function drawCompactLongTextBlock(doc, y, label, value) {
  prepareObservationsTypography(doc);
  const paragraphs = pdfObservationParagraphs(doc, value, CONTENT_W);
  const bodyH = paragraphs.reduce((sum, lines) => sum + measureObservationLinesHeight(lines), 0);
  const blockH = 4 + Math.max(bodyH, OBS_LINE_HEIGHT) + 2;
  y = ensureSpace(doc, y, blockH + 2);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${label}:`, MARGIN, y);
  y += 3.5;

  if (!paragraphs.length) {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('—', MARGIN, y);
    y += OBS_LINE_HEIGHT;
  } else {
    paragraphs.forEach((lines) => {
      lines.forEach((line) => {
        if (y + OBS_LINE_HEIGHT > pdfContentBottomY()) {
          doc.addPage();
          touchPdfContentPage(doc);
          y = PDF_PAGE_CONTENT_START_Y;
        }
        pdfSetFont(doc, 'normal');
        doc.setFontSize(PDF_FONT_BODY);
        doc.setTextColor(...TEXT_DARK);
        if (line) doc.text(line, MARGIN, y);
        y += line ? OBS_LINE_HEIGHT : OBS_EMPTY_LINE_HEIGHT;
      });
    });
  }

  touchPdfContentPage(doc);
  return y + 1.5;
}

async function drawSectionScalarGridFromPairs(doc, y, pairs) {
  const body = buildTwoColumnGridBody(pairs);
  if (!body.length) return y;
  y = ensureSpace(doc, y, 10);
  return drawPdfGridTable(doc, y, { body });
}

/** Bloco superior — apenas data do serviço */
function drawServiceInfoBlock(doc, y, meta) {
  y = ensureSpace(doc, y, 8);

  const leftX = MARGIN;
  const labelW = 32;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Data do Serviço:', leftX, y);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(pdfSafeText(meta.serviceDate || '—'), leftX + labelW, y);

  touchPdfContentPage(doc);
  return y + 6;
}

function estimateStandardClosingBlockHeight(doc, values, service) {
  prepareObservationsTypography(doc);
  let h = 8 + 7 + 10;
  const pedidoDetalhe = resolvePedidoOrcamentoDetalhe(values);
  if (resolvePedidoOrcamentoValue(values) && pedidoDetalhe) {
    h += measureObservationsBlockHeight(doc, pedidoDetalhe, false);
  }
  h += 12;
  return h;
}

async function drawStandardClosingBlock(doc, y, values, service, pdfContext = null) {
  y = ensureSpace(doc, y, 18);

  const pedido = resolvePedidoOrcamentoValue(values);
  y = drawKeyValueLine(doc, y, 'Pedido de Orçamento', pedido ? 'Sim' : 'Não');

  if (pedido) {
    const detalhe = resolvePedidoOrcamentoDetalhe(values);
    if (detalhe) {
      y = drawCompactLongTextBlock(doc, y, 'O que é necessário', detalhe);
    }
  }

  const hasEstadoMaquina = (service?.fields || []).some((f) => f.id === 'estado_maquina');
  if (hasEstadoMaquina) {
    y = drawKeyValueLine(
      doc,
      y,
      'Estado da Máquina',
      pdfDisplayValue(values.estado_maquina || '—'),
      'status_pills',
    );
  }

  y = drawSectionTitle(doc, y, 'Intervenção (Datas e Custos)', { skipEnsure: true });

  const interventionPairs = [
    { label: 'Data 1', value: pdfDisplayValue(values.data_1) },
    { label: 'Data 2', value: pdfDisplayValue(values.data_2) },
    { label: 'Nº de Visitas', value: pdfDisplayValue(formatPdfNumeroVisitas(values)) },
  ];

  if (reportIncludesDeslocacao(service)) {
    interventionPairs.push({
      label: 'Deslocação',
      value: pdfDisplayValue(formatPdfDeslocacao(values.deslocacao, { ...pdfContext, values })),
    });
  }

  interventionPairs.push({
    label: 'Horas Gastas',
    value: pdfDisplayValue(resolveStandardFieldValue(values, { id: 'horas_gastas' }) || '—'),
  });

  y = await drawInterventionRowTable(doc, y, interventionPairs);

  return y + 1;
}

async function drawInterventionRowTable(doc, y, pairs) {
  if (!pairs.length) return y;
  await loadJsPdfAutoTable();
  const colW = CONTENT_W / pairs.length;
  const columnStyles = {};
  pairs.forEach((_, i) => {
    columnStyles[i] = { cellWidth: colW, overflow: 'linebreak' };
  });

  doc.autoTable({
    startY: y,
    margin: getPdfAutoTableMargin(MARGIN, MARGIN),
    tableWidth: CONTENT_W,
    head: [pairs.map((p) => p.label)],
    body: [pairs.map((p) => p.value)],
    ...buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont),
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE_DARK,
      fontStyle: 'bold',
      fontSize: PDF_FONT_CAPTION,
      lineColor: PDF_TABLE_LINE,
      lineWidth: 0.15,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      fontSize: PDF_FONT_BODY,
    },
    columnStyles,
    didDrawPage: buildPdfAutoTableDidDrawPage(doc),
  });

  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_GAP_TABLE);
}

function drawDivider(doc, y) {
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + PDF_GAP_DIVIDER;
}

function drawSectionTitle(doc, y, title, options = {}) {
  const bandH = PDF_SECTION_BAND_H;
  if (!options.skipEnsure) {
    y = ensureSpace(doc, y, bandH + 2);
  }

  doc.setFillColor(...PDF_SECTION_BG);
  doc.rect(MARGIN, y - 1.5, CONTENT_W, bandH, 'F');
  doc.setDrawColor(...CORPORATE_BLUE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y - 1.5, PAGE_W - MARGIN, y - 1.5);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...CORPORATE_BLUE_DARK);
  doc.text(title.toUpperCase(), MARGIN + 2, y + 3.5);
  touchPdfContentPage(doc);
  return y + bandH + 0.5;
}

function normalizeReportValues(data) {
  const values = {};
  if (data.values && typeof data.values === 'object') {
    Object.assign(values, data.values);
  }
  Object.assign(values, data.textFields || {});
  Object.assign(values, data.dropdowns || {});
  Object.entries(data.checklists || {}).forEach(([id, v]) => {
    values[id] = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : v;
  });

  const machineKeys = ['marca', 'modelo', 'numero_de_serie', 'num_serie', 'data_fabrico'];
  machineKeys.forEach((key) => {
    if (data[key] !== undefined && values[key] === undefined) values[key] = data[key];
  });

  const nested = data.maquina || data.machine;
  if (nested && typeof nested === 'object') {
    machineKeys.forEach((key) => {
      if (nested[key] !== undefined && values[key] === undefined) values[key] = nested[key];
    });
    values.maquina = nested;
  }

  if (values.num_serie && !values.numero_de_serie) values.numero_de_serie = values.num_serie;
  if (values.numero_de_serie && !values.num_serie) values.num_serie = values.numero_de_serie;

  return values;
}

/** Converte strings JSON / literais em estruturas utilizáveis */
function parseJsonIfString(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (!trimmed || (trimmed[0] !== '[' && trimmed[0] !== '{')) return val;
  try {
    return JSON.parse(trimmed);
  } catch {
    return val;
  }
}

/** Texto legível no PDF — sem aspas JSON, \\n literais nem lixo de serialização */
function cleanPdfText(val) {
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

/** Normaliza um valor de campo conforme o tipo (evita arrays/strings JSON no PDF) */
function coercePdfFieldValue(field, raw, pdfContext = null) {
  if (raw === undefined || raw === null) return raw;

  let value = parseJsonIfString(raw);
  const type = field?.type;

  if (type === 'multi_checkbox') {
    if (typeof value === 'string') {
      value = value.includes(',')
        ? value.split(',')
        : value.split(/\n+/);
    }
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => cleanPdfText(item))
      .filter((item) => item && item !== 'null' && item !== 'undefined');
  }

  if (type === 'dynamic_table' || type === 'grandes_identificacao_baterias') {
    if (!Array.isArray(value)) return [];
    const columnKeys = (field?.columns || getColumnLabels()).map((c) => columnKey(c));
    return value.map((row) => {
      if (!row || typeof row !== 'object') row = {};
      const out = {};
      columnKeys.forEach((key) => {
        const resolved = resolvePdfCellToken(row[key], pdfContext || {});
        out[key] = pdfDisplayValue(resolved);
      });
      Object.entries(row).forEach(([key, cell]) => {
        if (!(key in out)) {
          out[key] = pdfDisplayValue(resolvePdfCellToken(cell, pdfContext || {}));
        }
      });
      return out;
    });
  }

  if (type === 'verification_toggles' || type === 'matrix_4options') {
    if (typeof value === 'string') return {};
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanPdfText(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return cleanPdfText(value.label ?? value.value ?? value.Nome ?? '');
  }

  return cleanPdfText(value);
}

/** Aplica coerção a todos os campos do template antes de desenhar */
function mapReportValuesForPdf(data, service, pdfContext = null) {
  const values = { ...normalizeReportValues(data) };

  (service?.fields || []).forEach((field) => {
    if (values[field.id] === undefined) return;
    if (isMaterialTableField(field)) {
      values[field.id] = normalizeMaterialRows(values[field.id]);
    }
    values[field.id] = coercePdfFieldValue(field, values[field.id], pdfContext);
  });
  if (values.deslocacao !== undefined) {
    values.deslocacao = formatPdfDeslocacao(values.deslocacao, {
      ...pdfContext,
      values,
    });
  }
  return values;
}

async function drawReportFieldsSection(doc, y, service, values, pdfContext = null) {
  if (!service?.fields?.length) return y;

  const isDl50 = service.id === 'inspecao_dl50_2005';
  const scalarRenderedIds = new Set();
  const gridRenderedSections = new Set();

  PDF_LAYOUT_SKIP_FIELD_IDS.forEach((id) => scalarRenderedIds.add(id));
  gridRenderedSections.add(PDF_MACHINE_SECTION);

  if (isDl50) {
    y = await drawInspecaoDl50HeaderBlock(doc, y, values, {
      ensureSpace,
      drawSectionTitle,
      drawDivider,
      drawKeyValueLine,
      pdfContext,
      loadAutoTable: loadJsPdfAutoTable,
      margin: MARGIN,
      contentW: CONTENT_W,
    });
    INSPECAO_DL50_PDF_SKIP_FIELD_IDS.forEach((id) => scalarRenderedIds.add(id));
  } else if (reportHasMachineSection(service)) {
    getMachineSectionScalarFields(service).forEach((f) => scalarRenderedIds.add(f.id));
  }

  const machineBlockRendered = true;

  const headerScalars = collectPdfScalarFields(service, values, pdfContext, {
    section: null,
    isDl50,
    skipIds: scalarRenderedIds,
  });
  if (headerScalars.length) {
    y = await drawSectionScalarGrid(doc, y, headerScalars, values, pdfContext);
    headerScalars.forEach((f) => scalarRenderedIds.add(f.id));
  }

  let currentSection = null;
  const pairedObservationsRendered = new Set();

  for (const field of service.fields) {
    if (scalarRenderedIds.has(field.id)) continue;
    if (machineBlockRendered && INSPECAO_DL50_MACHINE_FIELD_IDS.has(field.id)) continue;
    if (pairedObservationsRendered.has(field.id)) continue;
    if (field.id === 'declaracao_seguranca') continue;
    if (field.dependency && !isPdfDependencyMet(field, values)) continue;

    if (isPdfLayoutReservedField(field.id)) {
      scalarRenderedIds.add(field.id);
      continue;
    }

    let value = coercePdfFieldValue(field, values[field.id], pdfContext);
    let hasPairedObservations = false;
    if (isMaterialTableField(field)) {
      if (!Array.isArray(value)) value = normalizeMaterialRows(value ?? '');
      const obsField = findPairedObservationsField(service, field);
      if (obsField && isPdfDependencyMet(obsField, values)) {
        const obsValue = coercePdfFieldValue(obsField, values[obsField.id], pdfContext);
        hasPairedObservations = !isPdfEmptyValue(obsField, obsValue);
      }
    }
    if (isPdfEmptyValue(field, value) && !hasPairedObservations) continue;

    if (field.section && field.section !== currentSection) {
      currentSection = field.section;
      const skipSectionHeader = shouldSkipPdfSectionHeader(currentSection, service, {
        machineBlockRendered,
      });

      if (!gridRenderedSections.has(currentSection)) {
        const sectionScalars = skipSectionHeader
          ? []
          : collectPdfScalarFields(service, values, pdfContext, {
              section: currentSection,
              isDl50,
              skipIds: scalarRenderedIds,
            });

        if (sectionScalars.length) {
          y = ensureSpace(doc, y, 10);
          y = drawSectionTitle(doc, y, currentSection);
          y = drawDivider(doc, y - 4);
          y = await drawSectionScalarGrid(doc, y, sectionScalars, values, pdfContext);
          sectionScalars.forEach((f) => scalarRenderedIds.add(f.id));
        } else if (!skipSectionHeader) {
          y = ensureSpace(doc, y, 10);
          y = drawSectionTitle(doc, y, currentSection);
          y = drawDivider(doc, y - 4);
        }

        gridRenderedSections.add(currentSection);
      }
    }

    if (scalarRenderedIds.has(field.id)) continue;

    y = ensureSpace(doc, y, 14);

    if (field.type === 'verification_toggles' && value && typeof value === 'object') {
      y = await drawVerificationBlock(doc, y, getBlockPdfTitle(field), field.items || [], value);
      continue;
    }

    if (field.type === 'dynamic_table' && (Array.isArray(value) || isMaterialTableField(field))) {
      if (isMaterialTableField(field)) {
        const rows = Array.isArray(value) ? value : [];
        const obsField = findPairedObservationsField(service, field);
        let obsValue = null;
        if (obsField && isPdfDependencyMet(obsField, values)) {
          obsValue = coercePdfFieldValue(obsField, values[obsField.id], pdfContext);
          if (isPdfEmptyValue(obsField, obsValue)) obsValue = null;
        }
        y = await drawMaterialAndObservationsBlock(
          doc,
          y,
          field,
          rows,
          obsField,
          obsValue,
          pdfContext,
        );
        if (obsField && obsValue !== null) pairedObservationsRendered.add(obsField.id);
        continue;
      }

      y = await drawDynamicTableBlock(
        doc,
        y,
        getBlockPdfTitle(field),
        field.columns || [],
        value,
      );
      continue;
    }

    if (field.type === 'grandes_identificacao_baterias' && Array.isArray(value)) {
      y = await drawDynamicTableBlock(
        doc,
        y,
        getBlockPdfTitle(field),
        getColumnLabels(),
        value,
      );
      continue;
    }

    if (field.type === 'multi_checkbox' && Array.isArray(value)) {
      y = await drawMultiCheckboxBlock(doc, y, getBlockPdfTitle(field), value);
      continue;
    }

    if (field.type === 'matrix_4options' && value && typeof value === 'object') {
      y = await drawMatrixInspectionBlock(doc, y, field, value);
      continue;
    }

    if (field.type === 'legal_verdict') {
      if (isDl50) continue;
      y = drawLegalVerdictBlock(doc, y, field.label, value);
      continue;
    }

    if (field.type === 'longtext' || field.type === 'textarea' || field.type === 'grid') {
      if (isObservationsField(field)) {
        if (pairedObservationsRendered.has(field.id)) continue;
        const pairedWithMaterial = (service.fields || []).some(
          (f) => isMaterialTableField(f) && findPairedObservationsField(service, f)?.id === field.id,
        );
        if (pairedWithMaterial) continue;
        y = drawLongTextBlock(doc, y, field.label, value, {
          closingAnchor: fieldAnchorsReportClosing(service, field),
          pdfContext,
        });
        continue;
      }

      if (field.prominent) {
        const skipSectionInBox =
          field.section && shouldSkipPdfSectionHeader(field.section, service, { machineBlockRendered });
        y = drawDiagnosticAnalysisBlock(
          doc,
          y,
          getBlockPdfTitle(field),
          skipSectionInBox ? null : field.section,
          value,
        );
      } else {
        y = drawLongTextBlock(doc, y, field.label, value);
      }
      continue;
    }

    if (isPdfScalarField(field)) {
      if (field.section || scalarRenderedIds.has(field.id)) continue;
      y = await drawSectionScalarGrid(doc, y, [field], values, pdfContext);
      scalarRenderedIds.add(field.id);
      continue;
    }

    y = drawKeyValueLine(doc, y, field.label, value, field.type);
  }

  return y + 4;
}

function isPdfDependencyMet(field, values) {
  if (!field.dependency) return true;
  const [depId, expected] = field.dependency.split(':');
  return values[depId] === expected;
}

function isPdfEmptyValue(field, value) {
  if (value === undefined || value === null) return true;
  if (field.type === 'dynamic_table' || field.type === 'grandes_identificacao_baterias') {
    return !Array.isArray(value) || !value.some((row) => row && Object.values(row).some((c) => String(c).trim()));
  }
  if (field.type === 'multi_checkbox') return !Array.isArray(value) || value.length === 0;
  if (field.type === 'matrix_4options') {
    if (!value || typeof value !== 'object') return true;
    return !Object.values(value).some((cat) => cat && Object.keys(cat).length);
  }
  if (field.type === 'verification_toggles') {
    return !value || typeof value !== 'object' || !Object.keys(value).length;
  }
  return cleanPdfText(value) === '';
}

function matrixPdfRgb(opt) {
  if (opt === 'B') return SUCCESS;
  if (opt === 'N') return [245, 158, 11];
  if (opt === 'D') return [251, 113, 133];
  return TEXT_MUTED;
}

const MATRIX_POINT_COL_W = CONTENT_W * 0.78;
const MATRIX_STATE_COL_W = CONTENT_W - MATRIX_POINT_COL_W;
const MATRIX_TABLE_HEADER_H = 7;
const MATRIX_TABLE_ROW_MIN_H = 6;
const MATRIX_CAT_TITLE_H = 6;
const MATRIX_CAT_GAP = 5;
const MATRIX_MIN_KEEP_ROWS = 3;

function pdfContentBottomY() {
  return PAGE_H - PDF_CONTENT_SAFE_BOTTOM_MM;
}

function getPdfAutoTableMargin(marginLeft = MARGIN, marginRight = MARGIN) {
  return {
    left: marginLeft,
    right: marginRight,
    bottom: PDF_AUTOTABLE_MARGIN_BOTTOM_MM,
  };
}

/** Após autoTable — força nova página se finalY invadir a zona de segurança */
function normalizeYAfterAutoTable(doc, y, gapAfter = 0) {
  const nextY = (doc.lastAutoTable?.finalY ?? y) + gapAfter;
  return clampYToSafeZone(doc, nextY);
}

function clampYToSafeZone(doc, y) {
  if (y <= pdfContentBottomY()) return y;
  doc.addPage();
  touchPdfContentPage(doc);
  return PDF_PAGE_CONTENT_START_Y;
}

function ensureBlockFitsSafeZone(doc, y, blockHeight) {
  if (y + blockHeight <= pdfContentBottomY()) return y;
  doc.addPage();
  touchPdfContentPage(doc);
  return PDF_PAGE_CONTENT_START_Y;
}

function pdfMaxContentHeight() {
  return pdfContentBottomY() - PDF_PAGE_CONTENT_START_Y;
}

/**
 * Mantém o bloco inteiro na mesma página quando couber numa página.
 * Se não couber no espaço restante, salta para página nova antes de desenhar.
 */
function ensureKeepTogetherBlock(doc, y, blockHeight) {
  const pageBottom = pdfContentBottomY();
  if (blockHeight <= 0) return y;
  if (y + blockHeight <= pageBottom) return y;

  const maxOnPage = pdfMaxContentHeight();
  if (blockHeight <= maxOnPage) {
    doc.addPage();
    touchPdfContentPage(doc);
    return PDF_PAGE_CONTENT_START_Y;
  }

  const remaining = pageBottom - y;
  if (remaining < maxOnPage * 0.2) {
    doc.addPage();
    touchPdfContentPage(doc);
    return PDF_PAGE_CONTENT_START_Y;
  }
  return y;
}

function ensureBlockFitsPage(doc, y, blockHeight) {
  return ensureKeepTogetherBlock(doc, y, blockHeight);
}

function matrixDisplayState(opt) {
  if (!opt) return '—';
  return opt === 'N.A.' ? 'NA' : opt;
}

function buildMatrixCategoryTable(doc, cat, catData) {
  const body = [];
  const rowOpts = [];

  cat.items.forEach((item) => {
    const opt = catData[columnKey(item)];
    if (!opt) return;
    body.push([pdfSafeText(item), matrixDisplayState(opt)]);
    rowOpts.push(opt);
  });

  return { body, rowOpts };
}

function estimateMatrixAutoTableHeight(doc, body) {
  if (!body.length) return 0;
  let height = MATRIX_CAT_TITLE_H + MATRIX_TABLE_HEADER_H;
  body.forEach((row) => {
    const lines = pdfSplitText(doc, row[0], MATRIX_POINT_COL_W - 6);
    height += Math.max(MATRIX_TABLE_ROW_MIN_H, lines.length * 3.2 + 2.5) + 0.5;
  });
  return height + MATRIX_CAT_GAP;
}

async function drawMatrixInspectionBlock(doc, y, field, matrixValue) {
  await loadJsPdfAutoTable();

  y = drawSectionTitle(doc, y, getBlockPdfTitle(field) || 'Pontos de Inspeção');

  (field.categories || []).forEach((cat) => {
    const catKey = columnKey(cat.name);
    const catData = matrixValue[catKey] || {};
    const { body, rowOpts } = buildMatrixCategoryTable(doc, cat, catData);
    if (!body.length) return;

    const catHeight = estimateMatrixAutoTableHeight(doc, body);
    const minOrphan =
      MATRIX_CAT_TITLE_H +
      MATRIX_TABLE_HEADER_H +
      MATRIX_TABLE_ROW_MIN_H * MATRIX_MIN_KEEP_ROWS;
    y = ensureBlockFitsPage(doc, y, catHeight, minOrphan);

    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...CORPORATE_BLUE_DARK);
    doc.text(cat.name.toUpperCase(), MARGIN, y);
    y += MATRIX_CAT_TITLE_H;

    pdfSetFont(doc, 'normal');
    doc.autoTable({
      startY: y,
      margin: getPdfAutoTableMargin(MARGIN, MARGIN),
      tableWidth: CONTENT_W,
      head: [['Ponto de Inspeção', 'Estado']],
      body,
      ...buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont),
      columnStyles: {
        0: { cellWidth: MATRIX_POINT_COL_W },
        1: {
          cellWidth: MATRIX_STATE_COL_W,
          halign: 'center',
          font: pdfAutoTableFont(doc),
          fontStyle: 'bold',
          fontSize: PDF_FONT_BODY,
        },
      },
      didParseCell: mergePdfTableDidParseCell((data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const opt = rowOpts[data.row.index];
          data.cell.styles.textColor = matrixPdfRgb(opt);
        }
      }),
      didDrawPage: buildPdfAutoTableDidDrawPage(doc),
    });

    y = normalizeYAfterAutoTable(doc, y, MATRIX_CAT_GAP);
    touchPdfContentPage(doc);
  });

  return y + 4;
}

function drawLegalVerdictBlock(doc, y, label, value, opts = {}) {
  const gapAfter = opts.gapAfter ?? 8;
  const titleGap = opts.titleGap ?? 6;
  const minBoxH = opts.minBoxH ?? 14;
  const lineFactor = opts.lineFactor ?? 4.5;

  const lines = pdfSplitText(doc, value, CONTENT_W - 10);
  const boxH = Math.max(minBoxH, lines.length * lineFactor + 6);
  const blockHeight = titleGap + boxH + gapAfter + 6;
  y = ensureBlockFitsSafeZone(doc, y, blockHeight);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(label.toUpperCase(), MARGIN, y);
  y += titleGap;

  let rgb = TEXT_DARK;
  let borderRgb = SLATE_LINE;
  if (/reúne|adequadas|etiqueta/i.test(value)) {
    rgb = SUCCESS;
    borderRgb = SUCCESS;
  } else if (/conveniente|reparações especificadas/i.test(value)) {
    rgb = [245, 158, 11];
    borderRgb = [245, 158, 11];
  } else if (/não deve|nao deve/i.test(value)) {
    rgb = DANGER;
    borderRgb = DANGER;
  }

  doc.setDrawColor(...borderRgb);
  doc.setLineWidth(0.5);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD');

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...rgb);
  doc.text(lines, MARGIN + 4, y + 6, { lineHeightFactor: 1.4 });

  touchPdfContentPage(doc);
  return y + boxH + gapAfter;
}

const POLAROID_MM = 44;
const POLAROID_FRAME_PAD = 2;
const POLAROID_CAPTION_H = 6;
const POLAROID_DESC_H = 6;

const REPORT_CLOSING_PROFILES = [
  {
    polaroidMm: 44,
    descH: 5,
    polaroidBottom: 4,
    sectionHeader: false,
    legalGap: 4,
    sigTop: 5,
    sigImg: 15,
  },
  {
    polaroidMm: 36,
    descH: 4,
    polaroidBottom: 3,
    sectionHeader: false,
    legalGap: 3,
    sigTop: 3,
    sigImg: 13,
  },
  {
    polaroidMm: 30,
    descH: 0,
    polaroidBottom: 2,
    sectionHeader: false,
    legalGap: 2,
    sigTop: 2,
    sigImg: 11,
  },
];

function estimateLegalVerdictHeight(doc, value, profile) {
  if (!value || !String(value).trim()) return 0;
  const lines = pdfSplitText(doc, pdfSafeText(value), CONTENT_W - 10);
  const boxH = Math.max(12, lines.length * (profile.legalGap <= 5 ? 4 : 4.5) + 5);
  return (profile.legalGap <= 5 ? 5 : 6) + boxH + profile.legalGap;
}

function estimatePolaroidSectionHeight(hasFotos, profile, opts = {}) {
  if (!hasFotos) return 0;
  const headerH = profile.sectionHeader ? 10 : 0;
  const descH = opts.simpleLegend ? 0 : profile.descH;
  return headerH + descH + profile.polaroidMm + POLAROID_CAPTION_H + profile.polaroidBottom;
}

function estimateSignaturesHeight(profile) {
  return profile.sigTop + profile.sigImg + SIGNATURE_LABEL_GAP_MM + 6;
}

function estimateReportClosingHeight(doc, y, opts = {}) {
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };
  const profile = planReportClosingProfile(doc, y, opts);
  const resumoH = opts.closingValues
    ? estimateStandardClosingBlockHeight(doc, opts.closingValues, opts.service)
    : 0;
  return (
    resumoH +
    (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
    estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) +
    estimateSignaturesHeight(profile)
  );
}

function planReportClosingProfile(doc, y, opts) {
  const bottom = pdfContentBottomY();
  const available = bottom - y;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };
  const resumoH = opts.closingValues
    ? estimateStandardClosingBlockHeight(doc, opts.closingValues, opts.service)
    : 0;

  for (const profile of REPORT_CLOSING_PROFILES) {
    const total =
      resumoH +
      (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
      estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) +
      estimateSignaturesHeight(profile);
    if (total <= available) return profile;
  }

  return REPORT_CLOSING_PROFILES[REPORT_CLOSING_PROFILES.length - 1];
}

async function drawReportClosingSection(doc, y, opts) {
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };

  let profile = planReportClosingProfile(doc, y, opts);
  const resumoH = opts.closingValues
    ? estimateStandardClosingBlockHeight(doc, opts.closingValues, opts.service)
    : 0;

  const estimateClosingHeight = (closingProfile) =>
    resumoH +
    (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, closingProfile) : 0) +
    estimatePolaroidSectionHeight(hasFotos, closingProfile, polaroidOpts) +
    estimateSignaturesHeight(closingProfile);

  let closingHeight = estimateClosingHeight(profile);
  y = ensureKeepTogetherBlock(doc, y, Math.min(closingHeight, pdfMaxContentHeight()));
  profile = planReportClosingProfile(doc, y, opts);
  closingHeight = estimateClosingHeight(profile);

  if (opts.closingValues) {
    y = await drawStandardClosingBlock(
      doc,
      y,
      opts.closingValues,
      opts.service,
      opts.pdfContext,
    );
  }

  if (hasLegal) {
    const legalH = estimateLegalVerdictHeight(doc, opts.legalValue, profile);
    y = ensureBlockFitsSafeZone(doc, y, legalH);
    y = drawLegalVerdictBlock(doc, y, opts.legalLabel, opts.legalValue, {
      gapAfter: profile.legalGap,
      titleGap: profile.legalGap <= 5 ? 5 : 6,
      minBoxH: 12,
      lineFactor: profile.legalGap <= 5 ? 4 : 4.5,
    });
  }

  if (hasFotos) {
    const photosAndSigsH =
      estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) +
      estimateSignaturesHeight(profile);
    y = ensureKeepTogetherBlock(doc, y, Math.min(photosAndSigsH, pdfMaxContentHeight()));
    y = await drawAntesDepoisPolaroidSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      opts.fotoLegenda,
      {
        polaroidMm: profile.polaroidMm,
        descH: opts.simplePhotoLegend ? 0 : profile.descH,
        bottomGap: profile.polaroidBottom,
        showSectionHeader: profile.sectionHeader,
        simpleLegend: Boolean(opts.simplePhotoLegend),
        skipEnsure: true,
      },
    );
  }

  const sigH = estimateSignaturesHeight(profile);
  y = ensureKeepTogetherBlock(doc, y, Math.min(sigH, pdfMaxContentHeight()));
  y = await drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
  });

  return y;
}

async function drawMultiCheckboxBlock(doc, y, label, selected) {
  if (label) {
    y = drawSectionTitle(doc, y, label);
  }

  if (!selected?.length) return y;

  const body = selected.map((item) => [`${pdfStatusGlyph('ok')} ${cleanPdfText(item)}`]);
  y = ensureSpace(doc, y, 14);
  return drawPdfGridTable(doc, y, {
    head: [['Itens Selecionados']],
    body,
    columnStyles: { 0: { cellWidth: CONTENT_W } },
  });
}

function normalizeVerifyItem(item) {
  if (typeof item === 'string') {
    return {
      id: item.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, ''),
      label: item,
    };
  }
  return { id: item.id, label: item.label };
}

async function drawVerificationBlock(doc, y, label, items, states) {
  if (label) {
    y = drawSectionTitle(doc, y, label);
  }

  const body = items.map((item) => {
    const spec = normalizeVerifyItem(item);
    const state = states[spec.id] || 'OK';
    return [pdfSafeText(spec.label), state];
  });

  if (!body.length) return y;

  y = ensureSpace(doc, y, 14);
  const colW = CONTENT_W * 0.72;
  const stateW = CONTENT_W - colW;
  return drawPdfGridTable(doc, y, {
    head: [['Ponto de Verif.', 'Estado']],
    body,
    columnStyles: {
      0: { cellWidth: colW, overflow: 'linebreak' },
      1: { cellWidth: stateW, halign: 'center', overflow: 'linebreak' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const state = String(data.cell.raw || '');
      const isOk = state === 'OK';
      data.cell.styles.textColor = isOk ? SUCCESS : DANGER;
      data.cell.styles.fontStyle = 'bold';
    },
  });
}

function estimateDynamicTableBlockHeight(columns, rows) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const titleH = 18;
  const tableH = rowCount > 0 ? 12 + rowCount * 7 + 8 : 0;
  return titleH + tableH;
}

const OBS_LINE_HEIGHT = 3.4;
const OBS_EMPTY_LINE_HEIGHT = 1.8;
const OBS_TITLE_BLOCK_HEIGHT = 10;
const OBS_BOTTOM_PAD = 4;

function prepareObservationsTypography(doc) {
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
}

/** Parágrafos preservando \n — cada parágrafo é array de linhas já com wrap */
function pdfObservationParagraphs(doc, text, maxWidth) {
  const cleaned = cleanPdfText(text);
  if (!cleaned) return [];
  return cleaned.split('\n').map((para) => {
    const trimmed = para.trim();
    return trimmed ? pdfSplitText(doc, trimmed, maxWidth) : [''];
  });
}

function measureObservationLinesHeight(lines) {
  let height = 0;
  lines.forEach((line) => {
    height += line ? OBS_LINE_HEIGHT : OBS_EMPTY_LINE_HEIGHT;
  });
  return height;
}

function measureObservationsBlockHeight(doc, value, includeTitle = true) {
  prepareObservationsTypography(doc);
  const paragraphs = pdfObservationParagraphs(doc, value, CONTENT_W);
  const bodyH = paragraphs.reduce((sum, lines) => sum + measureObservationLinesHeight(lines), 0);
  const titleH = includeTitle ? OBS_TITLE_BLOCK_HEIGHT : 0;
  return titleH + bodyH + OBS_BOTTOM_PAD;
}

function estimateLongTextBlockHeight(doc, value) {
  return measureObservationsBlockHeight(doc, value, true);
}

function pdfParagraphLines(doc, text, maxWidth) {
  return pdfObservationParagraphs(doc, text, maxWidth).flat();
}

async function drawMaterialAndObservationsBlock(
  doc,
  y,
  materialField,
  materialRows,
  obsField,
  obsValue,
  pdfContext = null,
) {
  const materialEmpty = isPdfEmptyValue(materialField, materialRows);
  const obsEmpty = !obsField || obsValue === null || isPdfEmptyValue(obsField, obsValue);
  if (materialEmpty && obsEmpty) return y;

  const columns = materialField.columns?.length ? materialField.columns : MATERIAL_UTILIZADO_COLUMNS;
  const materialTitle = getMaterialTablePdfLabel();
  let blockH =
    (materialEmpty ? 0 : estimateDynamicTableBlockHeight(columns, materialRows)) +
    (obsEmpty ? 0 : estimateLongTextBlockHeight(doc, obsValue));

  const anchorsClosing = fieldAnchorsReportClosing(pdfContext?.service, materialField);
  if (anchorsClosing && pdfContext?.closingOpts) {
    blockH += estimateReportClosingHeight(doc, y, pdfContext.closingOpts);
  }

  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));

  if (!materialEmpty) {
    y = await drawDynamicTableBlock(
      doc,
      y,
      materialTitle,
      columns,
      materialRows,
      { skipLeadingPageCheck: true, isMaterialTable: true },
    );
  }

  if (!obsEmpty) {
    y = drawLongTextBlock(doc, y, obsField.label, obsValue, {
      keepTogetherApplied: true,
      closingAnchor: anchorsClosing,
      pdfContext,
    });
  }

  return y;
}

async function drawDynamicTableBlock(doc, y, label, columns, rows, options = {}) {
  const displayLabel = options.isMaterialTable ? getMaterialTablePdfLabel() : label;
  if (displayLabel) {
    if (!options.skipLeadingPageCheck) y = ensureSpace(doc, y, 14);
    y = drawSectionTitle(doc, y, displayLabel, { skipEnsure: true });
  }

  if (!rows?.length || !columns?.length) return y;

  const colKeys = columns.map((c) => columnKey(c));
  const headLabels = columns.map((c) => formatTableHeaderLabel(c));
  const columnStyles = buildSmartColumnStyles(columns);
  const body = rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])));

  if (!options.skipLeadingPageCheck) y = ensureSpace(doc, y, 14);
  return drawPdfGridTable(doc, y, {
    head: [headLabels],
    body,
    columnStyles,
    gapAfter: PDF_GAP_TABLE,
  });
}

function drawKeyValueLine(doc, y, label, value, fieldType) {
  const text = pdfDisplayValue(value);
  const isConforme = /conforme|ok|bom|limpo|operacional|aprovada/i.test(text);
  const isNegative = /não|nao|danificado|substituir|rejeitada|inoperacional|aviso/i.test(text);
  let symbolKind = 'bullet';
  let rgb = TEXT_DARK;

  if (fieldType === 'status_pills') {
    if (/apta a trabalhar|normal|operacional|reparação concluída|reparacao concluida/i.test(text)) rgb = SUCCESS;
    else if (/aguardar|baixo|alto|irregular|peças|pecas|elementos novos|necessita/i.test(text)) rgb = [245, 158, 11];
    else if (/orçamento|orcamento|inoperacional|segurança|seguranca|^inoperacional$/i.test(text)) rgb = DANGER;
    symbolKind = 'bullet';
  } else if (fieldType === 'toggle_component') {
    const damaged = /danificad/i.test(text);
    symbolKind = damaged ? 'fail' : 'ok';
    rgb = damaged ? DANGER : SUCCESS;
  } else if (fieldType === 'choice' || fieldType === 'toggle' || fieldType === 'dropdown') {
    symbolKind = isConforme && !isNegative ? 'ok' : isNegative ? 'fail' : 'bullet';
    rgb = symbolKind === 'ok' ? SUCCESS : symbolKind === 'fail' ? DANGER : TEXT_DARK;
  }

  const symbol = pdfStatusGlyph(symbolKind);

  const valLines = pdfSplitText(doc, text, CONTENT_W - 58);
  const blockH = Math.max(4, valLines.length * 3.6) + 2;
  y = ensureSpace(doc, y, blockH);

  doc.setTextColor(...rgb);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(9);
  if (symbol) doc.text(symbol, MARGIN + 1, y);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${label}:`, MARGIN + 7, y);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(valLines, MARGIN + 58, y);

  touchPdfContentPage(doc);
  return y + blockH;
}

function drawDiagnosticAnalysisBlock(doc, y, label, section, value) {
  const bandTitle = section || label;
  const innerTitle =
    section && label && pdfNormalizeHeading(section) !== pdfNormalizeHeading(label) ? label : null;

  y = ensureSpace(doc, y, 28);
  if (bandTitle) {
    y = drawSectionTitle(doc, y, bandTitle, { skipEnsure: true });
  }

  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...CORPORATE_BLUE);
  doc.setLineWidth(0.3);

  const lines = pdfParagraphLines(doc, value, CONTENT_W - 12);
  const textTop = innerTitle ? 14 : 8;
  const boxH = Math.max(24, lines.length * 5 + textTop + 8);
  y = ensureSpace(doc, y, boxH + 6);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD');

  if (innerTitle) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_SUBTITLE);
    doc.setTextColor(...CORPORATE_BLUE_DARK);
    doc.text(innerTitle.toUpperCase(), MARGIN + 4, y + 7);
  }

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 4, y + textTop, { lineHeightFactor: 1.45 });

  touchPdfContentPage(doc);
  return y + boxH + 8;
}

function drawLongTextBlock(doc, y, label, value, options = {}) {
  prepareObservationsTypography(doc);
  const paragraphs = pdfObservationParagraphs(doc, value, CONTENT_W);
  let blockHeight = measureObservationsBlockHeight(doc, value, true);

  if (options.closingAnchor && options.pdfContext?.closingOpts) {
    blockHeight += estimateReportClosingHeight(doc, y, options.pdfContext.closingOpts);
  }

  if (!options.keepTogetherApplied) {
    y = ensureKeepTogetherBlock(doc, y, Math.min(blockHeight, pdfMaxContentHeight()));
  }

  y = drawSectionTitle(doc, y, label, { skipEnsure: true });

  prepareObservationsTypography(doc);
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);

  paragraphs.forEach((lines) => {
    const paragraphHeight = measureObservationLinesHeight(lines);
    y = ensureKeepTogetherBlock(doc, y, Math.min(paragraphHeight, pdfMaxContentHeight()));

    lines.forEach((line) => {
      if (y + OBS_LINE_HEIGHT > pdfContentBottomY()) {
        doc.addPage();
        touchPdfContentPage(doc);
        y = PDF_PAGE_CONTENT_START_Y;
      }
      if (line) doc.text(line, MARGIN, y);
      y += line ? OBS_LINE_HEIGHT : OBS_EMPTY_LINE_HEIGHT;
    });
  });

  touchPdfContentPage(doc);
  return y + OBS_BOTTOM_PAD;
}

const PDF_IMAGE_MAX_PX = 900;
const PDF_IMAGE_JPEG_QUALITY = 0.72;

async function compressImageForPdf(dataUrl, maxPx = PDF_IMAGE_MAX_PX, quality = PDF_IMAGE_JPEG_QUALITY) {
  if (!dataUrl || typeof document === 'undefined') return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxPx / Math.max(width, height, 1));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function loadImageForPdf(url) {
  if (!url) return null;
  let dataUrl = url;
  if (!url.startsWith('data:')) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[PDF] Não foi possível carregar imagem:', url, err);
      return null;
    }
  }
  return compressImageForPdf(dataUrl);
}

function detectImageFormat(dataUrl) {
  if (String(dataUrl).includes('image/png')) return 'PNG';
  if (String(dataUrl).includes('image/webp')) return 'WEBP';
  return 'JPEG';
}

function drawPolaroidFrame(doc, x, y, imgData, phaseLabel, description = '', layout = {}) {
  const polaroidMm = layout.polaroidMm ?? POLAROID_MM;
  const descH = layout.descH ?? POLAROID_DESC_H;
  const outerW = polaroidMm;
  let cursorY = y;

  if (description) {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...TEXT_MUTED);
    const descLines = pdfSplitText(doc, pdfSafeText(description), outerW);
    descLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, x + outerW / 2, cursorY + 3 + i * 3.5, { align: 'center' });
    });
    cursorY += descH;
  }

  const frameY = cursorY;
  const outerH = polaroidMm + POLAROID_CAPTION_H;
  const shadowOffset = 0.8;

  doc.setFillColor(226, 232, 240);
  doc.roundedRect(x + shadowOffset, frameY + shadowOffset, outerW, outerH, 2, 2, 'F');

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, frameY, outerW, outerH, 2, 2, 'FD');

  const imgPad = POLAROID_FRAME_PAD + 1;
  const imgSize = polaroidMm - imgPad * 2;
  try {
    const fmt = detectImageFormat(imgData);
    doc.addImage(imgData, fmt, x + imgPad, frameY + imgPad, imgSize, imgSize, undefined, 'FAST');
  } catch {
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('IMG', x + outerW / 2, frameY + outerW / 2, { align: 'center' });
  }

  const safeLabel = pdfSafeText(phaseLabel);
  const captionY = frameY + polaroidMm + POLAROID_CAPTION_H / 2 + 1;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...CORPORATE_BLUE);
  if (safeLabel) {
    doc.text(safeLabel, x + outerW / 2, captionY, { align: 'center' });
  }
  return cursorY - y + outerH;
}

/**
 * Secção Antes/Depois estilo Polaroid — só ocupa espaço se houver foto(s).
 */
async function drawAntesDepoisPolaroidSection(doc, y, fotoAntesUrl, fotoDepoisUrl, legenda = '', opts = {}) {
  const antes = fotoAntesUrl ? await loadImageForPdf(fotoAntesUrl) : null;
  const depois = fotoDepoisUrl ? await loadImageForPdf(fotoDepoisUrl) : null;
  if (!antes && !depois) return y;

  const polaroidMm = opts.polaroidMm ?? POLAROID_MM;
  const descH = opts.descH ?? POLAROID_DESC_H;
  const bottomGap = opts.bottomGap ?? 10;
  const showSectionHeader = opts.showSectionHeader !== false;
  const frameLayout = { polaroidMm, descH };

  const frameStackH = descH + polaroidMm + POLAROID_CAPTION_H;
  const blockH = frameStackH + (showSectionHeader ? 16 : 4);

  if (!opts.skipEnsure) {
    y = ensureSpace(doc, y, blockH);
  }

  if (showSectionHeader) {
    y = drawSectionTitle(doc, y, PDF_FOTO_SECTION_TITLE);
    y = drawDivider(doc, y - 4);
    if (!opts.skipEnsure) {
      y = ensureSpace(doc, y, frameStackH + 6);
    }
  }

  if (antes && depois) {
    const gap = polaroidMm <= 48 ? 8 : 10;
    const totalW = polaroidMm * 2 + gap;
    const startX = MARGIN + (CONTENT_W - totalW) / 2;
    const h1 = drawPolaroidFrame(doc, startX, y, antes, PDF_FOTO_LABEL_ANTES, '', frameLayout);
    const h2 = drawPolaroidFrame(
      doc,
      startX + polaroidMm + gap,
      y,
      depois,
      PDF_FOTO_LABEL_DEPOIS,
      '',
      frameLayout,
    );
    return y + Math.max(h1, h2) + bottomGap;
  }

  const single = antes || depois;
  const phaseLabel = antes ? PDF_FOTO_LABEL_ANTES : PDF_FOTO_LABEL_DEPOIS;
  const startX = MARGIN + (CONTENT_W - polaroidMm) / 2;
  const frameH = drawPolaroidFrame(doc, startX, y, single, phaseLabel, '', frameLayout);
  return y + frameH + bottomGap;
}

async function drawPhotosAppendix(doc, y, photos) {
  if (!photos.length) return y;

  y = ensureBlockFitsSafeZone(doc, y, 48);
  y = drawSectionTitle(doc, y, 'Anexo Fotográfico — Evidências');
  y = drawDivider(doc, y - 4);

  const thumbW = 42;
  const thumbH = 32;
  const gap = 6;
  const perRow = Math.floor((CONTENT_W + gap) / (thumbW + gap));
  let col = 0;
  let rowY = y;

  for (const photo of photos) {
    if (col === 0) rowY = ensureSpace(doc, rowY, thumbH + 14);

    const x = MARGIN + col * (thumbW + gap);

    doc.setDrawColor(...SLATE_LINE);
    doc.setLineWidth(0.3);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, rowY, thumbW, thumbH, 1.5, 1.5, 'FD');

    const imgData = photo.dataUrl || (await createPlaceholderImage(photo.label));
    try {
      doc.addImage(imgData, 'PNG', x + 1, rowY + 1, thumbW - 2, thumbH - 6);
    } catch {
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('IMG', x + thumbW / 2, rowY + thumbH / 2, { align: 'center' });
    }

    pdfSetFont(doc, 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...TEXT_DARK);
    const caption = pdfSplitText(doc,photo.label || 'Evidência', thumbW);
    doc.text(caption, x + thumbW / 2, rowY + thumbH - 1, { align: 'center', maxWidth: thumbW });

    col += 1;
    if (col >= perRow) {
      col = 0;
      rowY += thumbH + gap + 4;
    }
  }

  return col > 0 ? rowY + thumbH + 10 : rowY + 6;
}

/** Espaço generoso após fotos Polaroid + bloco de assinaturas */
const SIGNATURES_TOP_MARGIN_MM = 6;
const SIGNATURE_LINE_GAP_MM = 10;
const SIGNATURE_IMG_H_MM = 14;
const SIGNATURE_LABEL_GAP_MM = 4;
const SIGNATURES_BLOCK_HEIGHT_MM =
  SIGNATURES_TOP_MARGIN_MM + SIGNATURE_IMG_H_MM + SIGNATURE_LABEL_GAP_MM + 6;

async function drawSignaturesFooter(doc, y, signatures, opts = {}) {
  const topMargin = opts.topMargin ?? SIGNATURES_TOP_MARGIN_MM;
  const imgHeight = opts.imgHeight ?? SIGNATURE_IMG_H_MM;
  const blockHeight = topMargin + imgHeight + SIGNATURE_LABEL_GAP_MM + 6;

  if (!opts.skipEnsure) {
    y = ensureBlockFitsSafeZone(doc, y, blockHeight);
  }
  y += topMargin;

  const lineW = (CONTENT_W - SIGNATURE_LINE_GAP_MM) / 2;
  const boxes = [
    { label: 'Assinatura do Técnico', data: signatures.technicianData },
    { label: 'Assinatura do Cliente', data: signatures.clientData },
  ];

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (lineW + SIGNATURE_LINE_GAP_MM);
    const lineY = y + imgHeight + 2;
    const sigPad = 2;

    if (box.data) {
      try {
        doc.addImage(box.data, 'PNG', x + sigPad, y, lineW - sigPad * 2, imgHeight - 2);
      } catch {
        /* área reservada sem imagem */
      }
    }

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(x, lineY, x + lineW, lineY);

    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(box.label, x + lineW / 2, lineY + SIGNATURE_LABEL_GAP_MM, { align: 'center' });
  });

  touchPdfContentPage(doc);
  return y + blockHeight;
}

/**
 * Rodapé institucional — única função autorizada a desenhar o bloco comercial no fundo da página.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} pageNumber
 * @param {number} totalPages
 */
function drawInstitutionalPageFooter(doc, pageNumber, totalPages) {
  doc.setPage(pageNumber);

  const footerTop = PDF_FOOTER_BLOCK_TOP;
  const footerLines = buildInstitutionalFooterLines();
  const pageNumY = PDF_PAGE_NUMBER_Y;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${pageNumber} / ${totalPages}`, PAGE_W / 2, pageNumY, { align: 'center' });

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FOOTER_FONT_SIZE);
  doc.setTextColor(...PDF_FOOTER_TEXT_RGB);

  let textY = footerTop + 4;
  footerLines.forEach((line) => {
    const wrapped = pdfSplitText(doc, line, CONTENT_W);
    wrapped.forEach((part) => {
      doc.text(part, PAGE_W / 2, textY, { align: 'center' });
      textY += 3.4;
    });
  });
}

/** Hook autoTable — reserva páginas; rodapé desenhado no fecho do documento */
function buildPdfAutoTableDidDrawPage(doc) {
  return () => {
    touchPdfContentPage(doc);
  };
}

function drawPageFooter(doc, _reportId) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    drawInstitutionalPageFooter(doc, i, total);
  }
}

function touchPdfContentPage(doc) {
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  doc.__manusilvaLastContentPage = Math.max(doc.__manusilvaLastContentPage || 1, page);
}

function trimTrailingBlankPages(doc) {
  const last = doc.__manusilvaLastContentPage || 1;
  let total = doc.getNumberOfPages();
  while (total > last) {
    doc.deletePage(total);
    total -= 1;
  }
}

function ensureSpace(doc, y, needed) {
  return ensureBlockFitsSafeZone(doc, y, needed);
}

function formatPdfCompactDateTime(dateInput) {
  if (!dateInput) return null;
  const iso = String(dateInput).includes('T') ? dateInput : `${dateInput}T12:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  const dateStr = d.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hasTime = String(dateInput).includes('T') || /:\d{2}/.test(String(dateInput));
  if (!hasTime) return dateStr;
  const timeStr = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}

/** Data/hora compacta para grelha de metadados — evita quebras artificiais */
function formatReportDateTimeCompact(report, job, values = {}) {
  if (report?.submittedAt) {
    const compact = formatPdfCompactDateTime(report.submittedAt);
    if (compact) return compact;
  }

  const dateKey =
    values.data_de_conclusao ||
    values.concluido_testado_em ||
    values.data_1 ||
    values.data_rececao ||
    job?.date;

  if (dateKey) {
    const compact = formatPdfCompactDateTime(dateKey);
    if (compact) return compact;
  }

  return formatPdfCompactDateTime(new Date().toISOString()) || '—';
}

function formatReportDateTime(report, job, values = {}) {
  return formatReportDateTimeCompact(report, job, values);
}

function createPlaceholderImage(label) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 320, 240);
    grad.addColorStop(0, '#1e4073');
    grad.addColorStop(1, '#3b82f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 240);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(12, 12, 296, 216);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Inter, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((label || 'F').charAt(0).toUpperCase(), 160, 100);

    ctx.font = '14px Inter, Helvetica, sans-serif';
    const words = (label || 'Evidência').match(/.{1,28}/g) || ['Evidência'];
    words.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 160, 160 + i * 20);
    });

    resolve(canvas.toDataURL('image/png'));
  });
}
