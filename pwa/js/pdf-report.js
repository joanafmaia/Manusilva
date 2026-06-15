/**
 * Manusilva PWA — Geração profissional de PDF (jsPDF)
 */

import {
  COMPANY,
  PDF_DOCUMENT_TITLES,
  CLIENTS,
  DEMO_CLIENT_FORKLIFTS,
  EMPILHADORES_MATERIAL_SECTION,
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
import { getColumnLabels, getColumnKeys } from './views/relatorio-grandes.js';
import { reportIncludesDeslocacao, SERVICES_WITH_SECTION_VISITAS, VISITAS_FIELD_ID, VISIT_DATES_FIELD_ID, DESLOCACAO_BASE_FIELD_ID } from './deslocacao-field.js';
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
  PDF_FONT_TABLE,
  PDF_FONT_TITLE,
  PDF_FOOTER_BLOCK_TOP,
  PDF_FOOTER_INSTITUTIONAL_RGB,
  PDF_FOOTER_TEXT_RGB,
  PDF_FOTO_LABEL_ANTES,
  PDF_FOTO_LABEL_DEPOIS,
  PDF_FOTO_SECTION_TITLE,
  PDF_HEADER_CLIENT_W,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_MACHINE_SECTION,
  PDF_PAGE_CONTENT_START_Y,
  PDF_PAGE_H as PAGE_H,
  PDF_PAGE_NUMBER_Y,
  PDF_PAGE_W as PAGE_W,
  PDF_SCALAR_FIELD_TYPES,
  PDF_SECTION_BG,
  PDF_SECTION_BAND_HEIGHT_MM,
  PDF_SECTION_GAP_MM,
  PDF_SERVICE_INFO_MARGIN_TOP_MM,
  PDF_SERVICE_INFO_MARGIN_BOTTOM_MM,
  PDF_SERVICE_INFO_ROW_H_MM,
  PDF_SERVICE_INFO_COL_GAP_MM,
  PDF_TABLE_CELL_PADDING,
  PDF_TABLE_CELL_PADDING_HEAD,
  PDF_TABLE_CELL_PADDING_COMPACT,
  PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
  PDF_TABLE_MIN_CELL_HEIGHT,
  PDF_TABLE_ROW_STEP_MM,
  PDF_TITLE_BAR_HEIGHT_MM,
  PDF_STANDARD_MACHINE_SPECS,
  PDF_CLOSING_DIAGNOSTIC_SPECS,
  PDF_LAYOUT_SKIP_FIELD_IDS,
  PREVENTIVA_BATERIA_ANALYSIS_SPECS,
  resolvePdfStandardFieldValue,
  PDF_TABLE_ALT_ROW_FILL,
  PDF_TABLE_BODY_FILL,
  PDF_CLIENT_BOX_FILL,
  PDF_TABLE_HEAD_FILL,
  PDF_TABLE_HEAD_TEXT,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
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
} from './material-table-field.js';
import {
  drawInspecaoDl50HeaderBlock,
  INSPECAO_DL50_MACHINE_FIELD_IDS,
  INSPECAO_DL50_PDF_SKIP_FIELD_IDS,
  resolveInspecaoDl50MachineFields,
  splitDl50MatrixCategories,
} from './inspecao-dl50-categories.js';

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
  const nif = values.nif || prod?.NIF || dbClient?.NIF || dbClient?.nif || '';
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

  return { nome, addressLine: addressLine || '—', addressSubline, localidade, nif };
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
  const isPreventivaBateriaPdf = report.serviceType === 'manutencao_preventiva_bateria';
  const isFolhaIntervencaoAvariasPdf = report.serviceType === 'folha_intervencao_avarias';
  const isReparacaoAvariasBateriaPdf = report.serviceType === 'reparacao_avarias_bateria';
  const isReparacaoCarregadorPdf = report.serviceType === 'reparacao_carregador';
  const isCorretivaMaquinasPdf = report.serviceType === 'manutencao_corretiva_maquinas';
  const isGrandesBateriasPdf = report.serviceType === 'manutencao_baterias_grandes';
  const isEmpilhadoresPdf = report.serviceType === EMPILHADORES_SERVICE_ID;
  const fotoAntesUrl = data.fotoAntesUrl || job?.fotoAntes || null;
  const fotoDepoisUrl = data.fotoDepoisUrl || job?.fotoDepois || null;
  const techName = tech?.name || '—';

  const pdfContext = buildPdfRenderContext(report, job, clientMeta, tech);
  let values = mapReportValuesForPdf(data, service, pdfContext);
  values = { ...values, ...resolveInspecaoDl50MachineFields(values, pdfContext) };
  pdfContext.values = values;
  pdfContext.service = service;
  pdfContext.closingOpts = {
    fotoAntesUrl,
    fotoDepoisUrl,
    simplePhotoLegend: true,
    legalValue: isDl50Pdf ? values.declaracao_seguranca : null,
  };

  const closingOpts = {
    legalLabel: isDl50Pdf ? 'Declaração de Segurança' : null,
    legalValue: isDl50Pdf ? values.declaracao_seguranca : null,
    fotoAntesUrl,
    fotoDepoisUrl,
    fotoLegenda: '',
    simplePhotoLegend: true,
    signatures: data.signatures || {},
    closingValues: values,
    service,
    skipClosingDiagnostic:
      isPreventivaBateriaPdf ||
      isFolhaIntervencaoAvariasPdf ||
      isReparacaoAvariasBateriaPdf ||
      isReparacaoCarregadorPdf ||
      isCorretivaMaquinasPdf ||
      isGrandesBateriasPdf ||
      isDl50Pdf ||
      isEmpilhadoresPdf,
  };

  let y;
  if (isPreventivaBateriaPdf) {
    y = drawPreventivaBateriaMirrorHeader(doc, clientMeta, techName, report, job, values, job?.numeroOrdem ?? null);
    y = drawFolhaTitleBar(doc, y, title);
    y = await drawPreventivaBateriaBody(doc, y, values, service);
    y = await drawPreventivaBateriaClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
    });
  } else if (isFolhaIntervencaoAvariasPdf) {
    y = drawPreventivaBateriaMirrorHeader(doc, clientMeta, techName, report, job, values, job?.numeroOrdem ?? null);
    y = drawFolhaTitleBar(doc, y, title);
    y = await drawFolhaIntervencaoAvariasBody(doc, y, values, service, pdfContext);
    y = await drawFolhaIntervencaoAvariasClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
    });
  } else if (isReparacaoCarregadorPdf) {
    y = await drawReparacaoCarregadorTopSection(doc, clientMeta, techName, report, job, values);
    y = drawCarregadorTitleBar(doc, y, title);
    y = await drawReparacaoCarregadorBody(doc, y, values, service, pdfContext);
    y = await drawReparacaoCarregadorClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
    });
  } else if (isCorretivaMaquinasPdf) {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawCorretivaTitleBar(doc, y, title);
    const visitCount = formatPdfNumeroVisitas(values);
    y = drawServiceInfoBlock(doc, y, {
      serviceDate: formatPdfServiceDateOnly(report, job, values),
      visitDatesLine: resolvePdfVisitDatesLine(values, report, job, visitCount),
      numeroVisitas: visitCount,
      deslocacao: null,
      technician: techName || values.tecnico || '',
      metaBottomGapMm: CORRETIVA_SECTION_GAP_MM,
    });
    y = await drawCorretivaMaquinasBody(doc, y, service, values, pdfContext);
    y = await drawCorretivaMaquinasClosingSection(doc, y, {
      signatures: data.signatures || {},
      closingValues: values,
      fotoAntesUrl,
      fotoDepoisUrl,
      simplePhotoLegend: true,
    });
  } else if (isGrandesBateriasPdf) {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawGrandesTitleBar(doc, y, title);
    const visitCount = formatPdfNumeroVisitas(values);
    y = drawServiceInfoBlock(doc, y, {
      serviceDate: formatPdfServiceDateOnly(report, job, values),
      visitDatesLine: resolvePdfVisitDatesLine(values, report, job, visitCount),
      numeroVisitas: visitCount,
      deslocacao: null,
      technician: techName || values.tecnico || '',
      metaBottomGapMm: GRANDES_SECTION_GAP_MM,
    });
    y = await drawGrandesBateriasBody(doc, y, service, values);
    y = await drawGrandesBateriasClosingSection(doc, y, {
      signatures: data.signatures || {},
      closingValues: values,
      service,
      fotoAntesUrl,
      fotoDepoisUrl,
      simplePhotoLegend: true,
    });
  } else {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawTitleBar(doc, y, title);
    const visitCount = formatPdfNumeroVisitas(values);
    y = drawServiceInfoBlock(doc, y, {
      serviceDate: formatPdfServiceDateOnly(report, job, values),
      visitDatesLine: resolvePdfVisitDatesLine(values, report, job, visitCount),
      numeroVisitas: SERVICES_WITH_SECTION_VISITAS.has(service.id) ? null : visitCount,
      deslocacao: reportIncludesDeslocacao(service) ? values.deslocacao || '—' : null,
      technician: techName || values.tecnico || '',
      periodicidade: isDl50Pdf ? values.periodicidade_inspecao || null : null,
      metaBottomGapMm: isDl50Pdf ? DL50_SERVICE_META_BOTTOM_MM : null,
    });
    if (reportHasMachineSection(service)) {
      y = drawDivider(doc, y);
      y = await drawStandardMachineBlock(doc, y, values, pdfContext, service);
    }
    if (!isEmpilhadoresPdf) {
      y = drawDivider(doc, y);
    }
    y = await drawReportFieldsSection(doc, y, service, values, pdfContext);
    y = await drawReportClosingSection(doc, y, closingOpts);
  }
  if ((data.photos || []).length) {
    y = await drawPhotosAppendix(doc, y, data.photos || []);
  }

  touchPdfContentPage(doc);
  trimTrailingBlankPages(doc);
  if (isPreventivaBateriaPdf || isFolhaIntervencaoAvariasPdf || isReparacaoCarregadorPdf) {
    drawFolhaDocumentFooters(doc);
  } else {
    drawPageFooter(doc, report.id);
  }

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

const EMPILHADORES_SERVICE_ID = 'manutencao_preventiva_empilhadores';
const INSPECAO_DL50_SERVICE_ID = 'inspecao_dl50_2005';
/** Informações da Máquina — PDF empilhadores (inclui Horas) */
const EMPILHADORES_MACHINE_PDF_SPECS = [
  { id: 'marca', label: 'Marca' },
  { id: 'modelo', label: 'Modelo' },
  {
    id: 'numero_de_serie',
    label: 'Nº Série',
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'horas', label: 'Horas', aliases: ['horas_gastas'] },
  { id: 'n_interno', label: 'Nº Interno', aliases: ['num_interno'] },
];
/** Informações da Máquina — PDF DL50 */
const INSPECAO_DL50_MACHINE_PDF_SPECS = [
  { id: 'marca', label: 'Marca' },
  { id: 'modelo', label: 'Modelo' },
  {
    id: 'numero_de_serie',
    label: 'Nº Série',
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'data_fabrico', label: 'Data Fabrico', aliases: ['data_de_fabrico', 'data_fabricacao'] },
];
/** gap ~20px entre colunas da matriz DL50 */
const DL50_DUAL_MATRIX_GAP_MM = 5.3;
const DL50_MATRIX_CAT_BAND_MM = 7;
const DL50_MATRIX_FONT_PT = 9;
const DL50_MATRIX_CAT_FONT_PT = 10;
const DL50_SERVICE_META_BOTTOM_MM = 4;
const EMPILHADORES_DUAL_VERIFY_GAP_MM = 5.3;
const EMPILHADORES_VERIFY_COL_BAND_MM = 7;
const EMPILHADORES_MATERIAL_FONT_PT = 9.5;
const EMPILHADORES_MATERIAL_COLS = 4;
/** ~15px de respiro acima da secção de material */
const EMPILHADORES_MATERIAL_SECTION_TOP_GAP_MM = 4;

/** Layout profissional — relatórios com cabeçalho espelho e tabelas fechadas */
const PREVENTIVA_TITLE_BAR_BG = PDF_SECTION_BG;
const FOLHA_TITLE_BAR_BG = PREVENTIVA_TITLE_BAR_BG;
const FOLHA_TABLE_HEAD_FILL = PDF_SECTION_BG;
const FOLHA_INSTITUTIONAL_FOOTER_RGB = PDF_FOOTER_INSTITUTIONAL_RGB;
const FOLHA_INSTITUTIONAL_FOOTER_FONT = PDF_FONT_CAPTION;
const FOLHA_INSTITUTIONAL_FOOTER_H_MM = 20;
const FOLHA_CLOSING_PROFILE = {
  sigTop: 8,
  sigImg: 18,
};

/** Reparação Carregador — layout executivo compacto (1 página A4) */
const CARREGADOR_SECTION_GAP_MM = 3.5;
const CARREGADOR_FONT_PT = 9;
const CARREGADOR_HEAD_FONT_PT = 10;
const CARREGADOR_CLOSING_PROFILE = {
  sigTop: 3,
  sigImg: 13,
};
/** ~6px — cantos arredondados executivos */
const CARREGADOR_RADIUS_MM = 1.6;

const CORRETIVA_MAQUINAS_SERVICE_ID = 'manutencao_corretiva_maquinas';
const CORRETIVA_SECTION_GAP_MM = 3.5;
const CORRETIVA_FONT_PT = 9;
const CORRETIVA_HEAD_FONT_PT = 10.5;
const CORRETIVA_RADIUS_MM = 1.6;
const CORRETIVA_BAR_RADIUS_MM = 1.1;
const CORRETIVA_CLOSING_PROFILE = {
  sigTop: 3,
  sigImg: 13,
};

/** Clientes Grandes — Manutenção Baterias (tabela larga compacta, 1 página A4) */
const GRANDES_SECTION_GAP_MM = 2.1;
const GRANDES_SECTION_BAR_H_MM = 5;
const GRANDES_SECTION_BAR_GAP_MM = 0.5;
const GRANDES_HEAD_FONT_PT = 10;
const GRANDES_BATTERY_FONT_PT = 8.5;
const GRANDES_TABLE_FONT_PT = 8.5;
const GRANDES_BAR_RADIUS_MM = 1.1;
const GRANDES_RADIUS_MM = 1.6;
/** ~2px vertical, ~4px horizontal */
const GRANDES_BATTERY_CELL_PADDING = { top: 0.53, right: 1.06, bottom: 0.53, left: 1.06 };
const GRANDES_BATTERY_MIN_CELL_HEIGHT = 3;
const GRANDES_BATTERY_LINE_HEIGHT = 1.1;
const GRANDES_DUAL_COL_GAP_MM = 4;
const GRANDES_OBS_MAX_LINES = 3;
const GRANDES_OBS_MAX_H_MM = 11;
const GRANDES_CLOSING_PROFILE = {
  sigTop: 2,
  sigImg: 11,
};
const GRANDES_BATTERY_PDF_HEADERS = [
  'Máquina',
  'Matríc.',
  'Tipo',
  'Tensão',
  'Dens.',
  'Nível El.',
  'Cofre',
  'C.C.?',
];
/** Índices de colunas curtas — sem quebra de palavra no PDF */
const GRANDES_BATTERY_NOWRAP_COLS = new Set([2, 3, 4, 7]);
const GRANDES_BATTERY_COL_WIDTHS = [30, 24, 16, 14, 14, 42, 24, 16];

function formatFolhaInterventionDate(raw) {
  const pure = String(raw ?? '').trim();
  if (!pure) return '—';
  const iso = pure.includes('T') ? pure.split('T')[0] : pure;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parts = iso.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return pdfDisplayValue(raw) || '—';
}

function buildFolhaInstitutionalFooterLines() {
  const contact = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join(' | ');
  return [COMPANY.name, COMPANY.address, contact].filter(Boolean);
}

function drawFolhaInstitutionalFooter(doc) {
  const total = doc.getNumberOfPages();
  doc.setPage(total);

  const footerTop = PDF_FOOTER_BLOCK_TOP;
  const footerLines = buildFolhaInstitutionalFooterLines();

  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(FOLHA_INSTITUTIONAL_FOOTER_FONT);
  doc.setTextColor(...FOLHA_INSTITUTIONAL_FOOTER_RGB);

  let textY = footerTop + 4;
  footerLines.forEach((line) => {
    pdfSplitText(doc, line, CONTENT_W).forEach((part) => {
      doc.text(part, PAGE_W / 2, textY, { align: 'center' });
      textY += 3.5;
    });
  });
}

function drawFolhaDocumentFooters(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${i} / ${total}`, PAGE_W / 2, PDF_PAGE_NUMBER_Y, { align: 'center' });
    if (i < total) {
      doc.setDrawColor(...PDF_TABLE_LINE);
      doc.setLineWidth(0.15);
      doc.line(MARGIN, PDF_FOOTER_BLOCK_TOP, PAGE_W - MARGIN, PDF_FOOTER_BLOCK_TOP);
    }
  }
  drawFolhaInstitutionalFooter(doc);
}

function buildFolhaAutoTableConfig(doc, y, overrides = {}) {
  const { didParseCell: userParse, ...rest } = overrides;
  return {
    startY: y,
    margin: getPdfAutoTableMargin(MARGIN, MARGIN),
    tableWidth: CONTENT_W,
    theme: 'plain',
    rowPageBreak: 'avoid',
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_TABLE,
      cellPadding: PDF_TABLE_CELL_PADDING,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      fillColor: PDF_TABLE_BODY_FILL,
      valign: 'middle',
      overflow: 'linebreak',
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT,
    },
    bodyStyles: { minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT },
    didParseCell: mergePdfTableDidParseCell(userParse),
    didDrawPage: buildPdfAutoTableDidDrawPage(doc),
    ...rest,
  };
}

function preventivaBateriaSectionHeadStyles() {
  return {
    fillColor: FOLHA_TABLE_HEAD_FILL,
    textColor: CORPORATE_BLUE,
    fontStyle: 'bold',
    fontSize: PDF_FONT_SECTION,
    lineColor: PDF_TABLE_LINE,
    lineWidth: PDF_TABLE_LINE_WIDTH,
    halign: 'left',
    valign: 'middle',
    cellPadding: PDF_TABLE_CELL_PADDING_HEAD,
  };
}

function preventivaBateriaTableHeadStyles() {
  return {
    fillColor: FOLHA_TABLE_HEAD_FILL,
    textColor: TEXT_DARK,
    fontStyle: 'bold',
    fontSize: PDF_FONT_TABLE,
    lineColor: PDF_TABLE_LINE,
    lineWidth: PDF_TABLE_LINE_WIDTH,
    halign: 'center',
    valign: 'middle',
    cellPadding: PDF_TABLE_CELL_PADDING_HEAD,
  };
}

/** Cabeçalho bilateral — topo absoluto: logo + metadados (esq.) | cliente (dir.) */
function drawPreventivaBateriaMirrorHeader(doc, clientMeta, techName, report, job, values, numeroOrdem = null) {
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;
  const leftColW = CONTENT_W * 0.48;
  const dataConclusao = formatPdfServiceDateOnly(report, job, values);

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

  const clientBoxH = drawCompactClientBox(doc, topY, clientMeta, numeroOrdem);

  let leftY = topY + logoH + 2;
  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Funcionário: ${pdfSafeText(techName)}`, MARGIN, leftY, { maxWidth: leftColW });
  leftY += 4;
  doc.text(`Data de conclusão: ${pdfSafeText(dataConclusao)}`, MARGIN, leftY, { maxWidth: leftColW });
  leftY += 4;

  touchPdfContentPage(doc);
  return Math.max(leftY, topY + clientBoxH) + PDF_SECTION_GAP_MM;
}

function drawFolhaTitleBar(doc, y, title) {
  const barH = PDF_TITLE_BAR_HEIGHT_MM;
  y = ensureSpace(doc, y, barH + PDF_SECTION_GAP_MM);
  doc.setFillColor(...PREVENTIVA_TITLE_BAR_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_W, barH, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_TITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  touchPdfContentPage(doc);
  return y + barH + PDF_SECTION_GAP_MM;
}

function resolvePreventivaBateriaAnalysisValue(spec, values) {
  if (spec.id === 'qtd_parafusos_danificados' && !/danificad/i.test(String(values.parafusos || ''))) {
    return '—';
  }

  if (spec.multi || spec.id === 'estado_cofre') {
    const raw = values[spec.id];
    if (Array.isArray(raw)) {
      const joined = raw.map((item) => cleanPdfText(item)).filter(Boolean).join(', ');
      return joined || '—';
    }
    return pdfDisplayValue(raw);
  }

  const raw = values[spec.id];
  if (raw == null || String(raw).trim() === '') return '—';
  if (spec.unit) return `${pdfDisplayValue(raw)} ${spec.unit}`;
  return pdfDisplayValue(raw);
}

function buildPreventivaBateriaAnalysisRows(values) {
  return PREVENTIVA_BATERIA_ANALYSIS_SPECS.map((spec) => [
    `${spec.label}:`,
    resolvePreventivaBateriaAnalysisValue(spec, values),
  ]);
}

async function drawPreventivaBateriaClosedSectionTable(doc, y, options) {
  const {
    sectionTitle,
    colSpan,
    columnHead,
    body,
    columnStyles,
    headStyles,
    bodyStyles,
    minBlockH = 20,
  } = options;

  const rowCount = body?.length || 0;
  const blockH = minBlockH + (columnHead ? 6 : 0) + rowCount * PDF_TABLE_ROW_STEP_MM + 4;
  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));

  const head = [
    [
      {
        content: sectionTitle,
        colSpan,
        styles: preventivaBateriaSectionHeadStyles(),
      },
    ],
  ];
  if (columnHead?.length) {
    head.push(
      columnHead.map((label) => ({
        content: label,
        styles: preventivaBateriaTableHeadStyles(),
      })),
    );
  }

  await loadJsPdfAutoTable();
  doc.autoTable(
    buildFolhaAutoTableConfig(doc, y, {
      head,
      body,
      headStyles: headStyles || preventivaBateriaTableHeadStyles(),
      bodyStyles: {
        font: pdfAutoTableFont(doc),
        fillColor: PDF_TABLE_BODY_FILL,
        textColor: TEXT_DARK,
        fontStyle: 'normal',
        fontSize: PDF_FONT_TABLE,
        lineColor: PDF_TABLE_LINE,
        lineWidth: PDF_TABLE_LINE_WIDTH,
        valign: 'middle',
        ...bodyStyles,
      },
      columnStyles,
    }),
  );
  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_SECTION_GAP_MM);
}

async function drawPreventivaBateriaAnalysisTable(doc, y, values) {
  const body = buildPreventivaBateriaAnalysisRows(values);
  const labelColW = CONTENT_W * 0.46;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'ANÁLISE DA BATERIA',
    colSpan: 2,
    body,
    minBlockH: 14 + body.length * PDF_TABLE_ROW_STEP_MM,
    columnStyles: {
      0: {
        cellWidth: labelColW,
        fontStyle: 'normal',
        textColor: TEXT_DARK,
        halign: 'left',
      },
      1: { cellWidth: CONTENT_W - labelColW, halign: 'left' },
    },
  });
}

async function drawPreventivaBateriaConsumiveisTable(doc, y, rows) {
  const columns = MATERIAL_UTILIZADO_COLUMNS;
  const colKeys = columns.map((c) => columnKey(c));
  const body =
    rows.length > 0
      ? rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])))
      : [['—', '—']];
  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'CONSUMÍVEIS',
    colSpan: 2,
    columnHead: ['Material', 'Quantidade'],
    body,
    minBlockH: 28 + body.length * PDF_TABLE_ROW_STEP_MM,
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

async function drawPreventivaBateriaIntervencaoTable(doc, y, values) {
  const visitas =
    pdfDisplayValue(
      resolvePdfStandardFieldValue(values, {
        id: VISITAS_FIELD_ID,
        aliases: ['visitas', 'numero_visitas'],
      }),
    ) || formatPdfNumeroVisitas(values);
  const horas =
    pdfDisplayValue(
      resolvePdfStandardFieldValue(values, { id: 'horas', aliases: ['horas_gastas'] }),
    ) || '—';

  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'NÚMERO DE VISITAS E TEMPO',
    colSpan: 2,
    columnHead: ['Nr de visitas', 'Horas'],
    body: [[visitas, horas]],
    minBlockH: 36,
    bodyStyles: { halign: 'center' },
    columnStyles: {
      0: { cellWidth: colW, halign: 'center' },
      1: { cellWidth: colW, halign: 'center' },
    },
  });
}

const REPARACAO_AVARIAS_ESTADO_FINAL_FIELD_IDS = new Set(['observacao', 'estado_final']);

async function drawEstadoFinalClosedBlock(doc, y, values, options = {}) {
  const observacaoLabel = options.observacaoLabel || 'Observações:';
  const body = [
    [observacaoLabel, pdfDisplayValue(values.observacao)],
    [`Estado:`, pdfDisplayValue(values.estado_final)],
  ];
  const labelColW = CONTENT_W * 0.22;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'ESTADO FINAL',
    colSpan: 2,
    body,
    minBlockH: 40,
    columnStyles: {
      0: {
        cellWidth: labelColW,
        fontStyle: 'normal',
        textColor: TEXT_DARK,
        valign: 'top',
      },
      1: { cellWidth: CONTENT_W - labelColW, valign: 'top' },
    },
  });
}

async function drawPreventivaBateriaEstadoFinalBlock(doc, y, values) {
  return drawEstadoFinalClosedBlock(doc, y, values);
}

async function drawPreventivaBateriaBody(doc, y, values, service) {
  y = await drawPreventivaBateriaAnalysisTable(doc, y, values);

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  y = await drawPreventivaBateriaConsumiveisTable(doc, y, rows);
  return drawPreventivaBateriaIntervencaoTable(doc, y, values);
}

async function drawFolhaMaterialTable(doc, y, rows, options = {}) {
  const columns = MATERIAL_UTILIZADO_COLUMNS;
  const colKeys = columns.map((c) => columnKey(c));
  const headLabels = options.headLabels || columns.map((c) => formatTableHeaderLabel(c));
  const body = rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])));
  const blockH = 10 + 12 + rows.length * 8 + 10;
  y = ensureKeepTogetherBlock(doc, y, blockH);

  const sectionTitle = (options.sectionTitle || getMaterialTablePdfLabel()).toUpperCase();
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(sectionTitle, MARGIN, y + 4);
  y += 8;

  await loadJsPdfAutoTable();
  doc.autoTable(
    buildFolhaAutoTableConfig(doc, y, {
      head: [headLabels],
      body,
      headStyles: {
        font: pdfAutoTableFont(doc),
        fillColor: FOLHA_TABLE_HEAD_FILL,
        textColor: TEXT_DARK,
        fontStyle: 'bold',
        fontSize: PDF_FONT_TABLE,
        lineColor: PDF_TABLE_LINE,
        lineWidth: PDF_TABLE_LINE_WIDTH,
        halign: 'left',
      },
      columnStyles: buildSmartColumnStyles(columns),
    }),
  );
  touchPdfContentPage(doc);
  return normalizeYAfterAutoTable(doc, y, PDF_SECTION_GAP_MM);
}

async function drawFolhaIntervencaoMaquinaTable(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marca = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'marca' }));
  const modelo = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'modelo' }));
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const nInterno = pdfDisplayValue(
    resolvePdfStandardFieldValue(values, { id: 'n_interno', aliases: ['num_interno'] }),
  );
  const horas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas' }));

  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'INFORMAÇÕES DA MÁQUINA',
    colSpan: 2,
    body: [
      [`Marca: ${marca}`, `Modelo: ${modelo}`],
      [`Numero de Série: ${serie}`, `Nº Interno: ${nInterno}`],
      [{ content: `Horas: ${horas}`, colSpan: 2 }],
    ],
    minBlockH: 40,
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoTextSection(doc, y, sectionTitle, text) {
  const display = pdfDisplayValue(text) || '—';
  const lineCount = pdfParagraphLines(doc, display, CONTENT_W - 14).length;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: sectionTitle.toUpperCase(),
    colSpan: 2,
    body: [[{ content: display, colSpan: 2 }]],
    minBlockH: Math.max(18, lineCount * 4.2 + 10),
    bodyStyles: { valign: 'top', halign: 'left' },
    columnStyles: {
      0: { cellWidth: CONTENT_W, halign: 'left', valign: 'top' },
    },
  });
}

async function drawFolhaIntervencaoMaterialTable(doc, y, rows) {
  const columns = MATERIAL_UTILIZADO_COLUMNS;
  const colKeys = columns.map((c) => columnKey(c));
  const body =
    rows.length > 0
      ? rows.map((row) => colKeys.map((key) => pdfDisplayValue(row[key])))
      : [['—', '—']];
  const colW = CONTENT_W / 2;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'MATERIAL UTILIZADO',
    colSpan: 2,
    columnHead: ['Material', 'Quantidade'],
    body,
    minBlockH: 28 + body.length * PDF_TABLE_ROW_STEP_MM,
    columnStyles: {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoDatasTable(doc, y, values) {
  const visitas = pdfDisplayValue(formatPdfNumeroVisitas(values));
  const data1 = formatFolhaInterventionDate(
    resolvePdfStandardFieldValue(values, { id: 'data_1' }, values.data_de_conclusao),
  );
  const data2 = formatFolhaInterventionDate(resolvePdfStandardFieldValue(values, { id: 'data_2' }));
  const horasGastas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas_gastas' }));

  const colW = CONTENT_W / 4;
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'DATAS DE INTERVENÇÃO',
    colSpan: 4,
    columnHead: ['Visitas realizadas', 'Data 1', 'Data 2', 'Horas Gastas'],
    body: [[visitas, data1, data2, horasGastas]],
    minBlockH: 36,
    bodyStyles: { halign: 'center' },
    columnStyles: {
      0: { cellWidth: colW, halign: 'center' },
      1: { cellWidth: colW, halign: 'center' },
      2: { cellWidth: colW, halign: 'center' },
      3: { cellWidth: colW, halign: 'center' },
    },
  });
}

async function drawFolhaIntervencaoOrcamentoBlock(doc, y, values) {
  const pedido = pdfDisplayValue(values.pedido_orcamento);
  const isSim = String(pedido).toLowerCase() === 'sim';
  const detalhe = pdfDisplayValue(values.detalhe_pedido_orcamento);
  const labelColW = CONTENT_W * 0.34;
  const body = [[`Pedido de Orçamento:`, pedido]];
  if (isSim) {
    body.push([`O que é necessário:`, detalhe]);
  }

  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'PEDIDO DE ORÇAMENTO',
    colSpan: 2,
    body,
    minBlockH: isSim ? 40 : 28,
    columnStyles: {
      0: {
        cellWidth: labelColW,
        fontStyle: 'normal',
        textColor: TEXT_DARK,
        halign: 'left',
      },
      1: { cellWidth: CONTENT_W - labelColW, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoEstadoBlock(doc, y, values) {
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));
  return drawPreventivaBateriaClosedSectionTable(doc, y, {
    sectionTitle: 'ESTADO EM QUE FICOU A MÁQUINA',
    colSpan: 2,
    body: [[{ content: estado, colSpan: 2 }]],
    minBlockH: 24,
    bodyStyles: { halign: 'left', fontStyle: 'normal' },
    columnStyles: {
      0: { cellWidth: CONTENT_W, halign: 'left' },
    },
  });
}

async function drawFolhaIntervencaoAvariasBody(doc, y, values, service, pdfContext = null) {
  y = await drawFolhaIntervencaoMaquinaTable(doc, y, values, pdfContext);
  y = await drawFolhaIntervencaoTextSection(doc, y, 'Deteção de Avaria', values.detecao_de_avaria);
  y = await drawFolhaIntervencaoTextSection(doc, y, 'Resolução da Avaria', values.resolucao_da_avaria);

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  y = await drawFolhaIntervencaoMaterialTable(doc, y, rows);
  return drawFolhaIntervencaoDatasTable(doc, y, values);
}

async function drawFolhaIntervencaoAvariasClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = FOLHA_CLOSING_PROFILE;
  const closingBlockH =
    52 + estimateSignaturesHeight(profile) + FOLHA_INSTITUTIONAL_FOOTER_H_MM;

  y = ensureKeepTogetherBlock(doc, y, Math.min(closingBlockH, pdfMaxContentHeight()));
  y = await drawFolhaIntervencaoOrcamentoBlock(doc, y, values);
  y = await drawFolhaIntervencaoEstadoBlock(doc, y, values);

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
    reserveInstitutionalFooter: true,
  });
}

function formatPdfCarregadorConclusaoDate(report, job, values = {}) {
  const raw =
    values.concluido_testado_em ||
    values.data_de_conclusao ||
    job?.date ||
    report?.submittedAt?.split('T')[0];
  if (!raw) return '—';
  const iso = String(raw).includes('T') ? String(raw).split('T')[0] : String(raw);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : pdfDisplayValue(raw);
}

function drawCarregadorTitleBar(doc, y, title) {
  const barH = 5.5;
  y = ensureSpace(doc, y, barH + CARREGADOR_SECTION_GAP_MM);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, CARREGADOR_RADIUS_MM, CARREGADOR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  touchPdfContentPage(doc);
  return y + barH + CARREGADOR_SECTION_GAP_MM;
}

function drawCarregadorMetaCell(doc, x, y, label, value, maxW) {
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${label}:`, x, y);
  pdfSetFont(doc, 'normal');
  doc.setFontSize(CARREGADOR_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(pdfSafeText(value) || '—', x, y + 3.2, { maxWidth: maxW });
}

function drawCarregadorIdentificacaoClienteBox(doc, topY, values, techName, dataConclusao) {
  const blockW = PDF_HEADER_CLIENT_W;
  const blockX = PAGE_W - MARGIN - blockW;
  const blockPad = 2.5;
  const colW = (blockW - blockPad * 2 - 2) / 2;
  const dataRececao = formatFolhaInterventionDate(values.data_rececao);
  const etiqueta = pdfDisplayValue(values.etiqueta);
  const rowH = 7;
  const blockH = blockPad * 2 + 4 + rowH * 2;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(blockX, topY, blockW, blockH, CARREGADOR_RADIUS_MM, CARREGADOR_RADIUS_MM, 'FD');

  let lineY = topY + blockPad + 3;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(CARREGADOR_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('IDENTIFICAÇÃO CLIENTE', blockX + blockPad, lineY);
  lineY += 4.2;

  drawCarregadorMetaCell(doc, blockX + blockPad, lineY, 'Data Receção', dataRececao, colW);
  drawCarregadorMetaCell(doc, blockX + blockPad + colW + 2, lineY, 'Etiqueta', etiqueta, colW);
  lineY += rowH;
  drawCarregadorMetaCell(doc, blockX + blockPad, lineY, 'Funcionário', techName, colW);
  drawCarregadorMetaCell(
    doc,
    blockX + blockPad + colW + 2,
    lineY,
    'Data de Conclusão',
    dataConclusao,
    colW,
  );

  return blockH;
}

function carregadorTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: CARREGADOR_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: CARREGADOR_HEAD_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      fontSize: CARREGADOR_FONT_PT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
    },
  };
}

async function drawCarregadorSectionBar(doc, y, title) {
  const bandH = 6;
  y = ensureSpace(doc, y, bandH + 2);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, bandH, CARREGADOR_RADIUS_MM, CARREGADOR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(CARREGADOR_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(String(title).toUpperCase(), MARGIN + 2, y + bandH * 0.62);
  touchPdfContentPage(doc);
  return y + bandH + 1.2;
}

async function drawCarregadorDashboardTable(doc, y, sectionTitle, columnHead, body, columnStyles) {
  const rowCount = body?.length || 0;
  const blockH = 8 + (columnHead?.length ? 5 : 0) + rowCount * 4.2;
  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));
  y = await drawCarregadorSectionBar(doc, y, sectionTitle);

  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: columnHead?.length ? [columnHead] : undefined,
    body,
    columnStyles,
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawReparacaoCarregadorTopSection(doc, clientMeta, techName, report, job, values) {
  void clientMeta;
  const topY = MARGIN;
  const logoW = PDF_LOGO_WIDTH_MM;
  const logoH = PDF_LOGO_HEIGHT_MM;
  const dataConclusao = formatPdfCarregadorConclusaoDate(report, job, values);

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

  const boxH = drawCarregadorIdentificacaoClienteBox(doc, topY, values, techName, dataConclusao);
  touchPdfContentPage(doc);
  return Math.max(topY + logoH, topY + boxH) + CARREGADOR_SECTION_GAP_MM;
}

async function drawReparacaoCarregadorIdentificacaoTable(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marcaModelo = pdfDisplayValue(values.marca_modelo);
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const colW = CONTENT_W / 2;

  y = await drawCarregadorSectionBar(doc, y, 'IDENTIFICAÇÃO DO CARREGADOR');
  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Marca/Modelo: ${marcaModelo}`, `N.º Série: ${serie}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
    },
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

function normalizeRegistoIntervencaoRows(rows, pdfContext = null) {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const dataIntervencao = formatFolhaInterventionDate(
        resolvePdfCellToken(row.data_intervencao, pdfContext),
      );
      const servico = pdfDisplayValue(
        resolvePdfCellToken(row.servico_efectuado_equipamento, pdfContext),
      );
      const horas = pdfDisplayValue(resolvePdfCellToken(row.horas, pdfContext));
      const tecnico = pdfDisplayValue(resolvePdfCellToken(row.tecnico, pdfContext));
      if ([dataIntervencao, servico, horas, tecnico].every((v) => v === '—')) return null;
      return [dataIntervencao, servico, horas, tecnico];
    })
    .filter(Boolean);
  return mapped.length > 0 ? mapped : [['—', '—', '—', '—']];
}

async function drawReparacaoCarregadorRegistoTable(doc, y, values, pdfContext = null) {
  const body = normalizeRegistoIntervencaoRows(values.registo_intervencao, pdfContext);
  const colW = CONTENT_W / 4;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'REGISTO DE INTERVENÇÃO',
    ['Data Intervenção', 'Serviço Efectuado/ Equipamento', 'Horas', 'Tecnico'],
    body,
    {
      0: { cellWidth: colW * 0.85, halign: 'center' },
      1: { cellWidth: colW * 1.45, halign: 'left' },
      2: { cellWidth: colW * 0.55, halign: 'center' },
      3: { cellWidth: colW * 1.15, halign: 'left' },
    },
  );
}

function normalizeResultadoTesteRows(rows, values = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const amperagem = pdfDisplayValue(
        row.valor_da_amperagem_debitado ?? row.valor_amperagem_debitado,
      );
      const equipamento = pdfDisplayValue(row.equipamento);
      if (amperagem === '—' && equipamento === '—') return null;
      return [amperagem, equipamento];
    })
    .filter(Boolean);
  if (mapped.length > 0) return mapped;
  const legacy = pdfDisplayValue(values.valor_amperagem_debitado);
  if (legacy !== '—') return [[legacy, '—']];
  return [['—', '—']];
}

async function drawReparacaoCarregadorResultadoTesteBlock(doc, y, values) {
  const body = normalizeResultadoTesteRows(values.resultado_teste, values);
  const colW = CONTENT_W / 2;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'RESULTADO DO TESTE',
    ['Valor da amperagem debitado', 'Equipamento'],
    body,
    {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
    },
  );
}

function mapCarregadorConsumivelRow(row) {
  const artigo = String(row?.artigo || '').trim();
  const equipamento = String(row?.equipamento || row?.equip || '').trim();
  if (equipamento) {
    return [pdfDisplayValue(artigo), pdfDisplayValue(equipamento), pdfDisplayValue(row?.qtd)];
  }
  const split = artigo.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (split) {
    return [pdfDisplayValue(split[1].trim()), pdfDisplayValue(split[2].trim()), pdfDisplayValue(row?.qtd)];
  }
  return [pdfDisplayValue(artigo), '—', pdfDisplayValue(row?.qtd)];
}

async function drawReparacaoCarregadorConsumiveisTable(doc, y, rows) {
  const body = rows.length > 0 ? rows.map((row) => mapCarregadorConsumivelRow(row)) : [['—', '—', '—']];
  const colW = CONTENT_W / 3;
  return drawCarregadorDashboardTable(
    doc,
    y,
    'CONSUMIVEIS',
    ['Material Colocado', 'Equipamento', 'Quantidade'],
    body,
    {
      0: { cellWidth: colW, halign: 'left' },
      1: { cellWidth: colW, halign: 'left' },
      2: { cellWidth: colW, halign: 'left' },
    },
  );
}

async function drawReparacaoCarregadorFechoBlock(doc, y, values) {
  const concluido = formatFolhaInterventionDate(values.concluido_testado_em);
  const responsavel = pdfDisplayValue(values.responsavel);
  const colW = CONTENT_W / 2;

  y = await drawCarregadorSectionBar(doc, y, 'FECHO');
  const pack = carregadorTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Concluído e Testado Em: ${concluido}`, `Responsável: ${responsavel}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CARREGADOR_FONT_PT },
    },
    gapAfter: CARREGADOR_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawReparacaoCarregadorBody(doc, y, values, service, pdfContext = null) {
  y = await drawReparacaoCarregadorIdentificacaoTable(doc, y, values, pdfContext);
  y = await drawReparacaoCarregadorRegistoTable(doc, y, values, pdfContext);
  y = await drawReparacaoCarregadorResultadoTesteBlock(doc, y, values);

  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  const rows = materialField
    ? normalizeMaterialRows(values[materialField.id]).filter(
        (row) => String(row.artigo || '').trim() || row.qtd,
      )
    : [];
  return drawReparacaoCarregadorConsumiveisTable(doc, y, rows);
}

async function drawReparacaoCarregadorClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = CARREGADOR_CLOSING_PROFILE;
  const closingBlockH =
    22 + estimateSignaturesHeight(profile) + FOLHA_INSTITUTIONAL_FOOTER_H_MM;

  y = ensureKeepTogetherBlock(doc, y, Math.min(closingBlockH, pdfMaxContentHeight()));
  y = await drawReparacaoCarregadorFechoBlock(doc, y, values);

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
    reserveInstitutionalFooter: true,
  });
}

function drawCorretivaTitleBar(doc, y, title) {
  const barH = 5.5;
  y = ensureSpace(doc, y, barH + CORRETIVA_SECTION_GAP_MM);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, CORRETIVA_BAR_RADIUS_MM, CORRETIVA_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  touchPdfContentPage(doc);
  return y + barH + CORRETIVA_SECTION_GAP_MM;
}

function corretivaTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: CORRETIVA_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: CORRETIVA_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      fontSize: CORRETIVA_FONT_PT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
    },
  };
}

async function drawCorretivaSectionBar(doc, y, title) {
  const bandH = 6;
  y = ensureSpace(doc, y, bandH + 2);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, bandH, CORRETIVA_BAR_RADIUS_MM, CORRETIVA_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(CORRETIVA_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(String(title).toUpperCase(), MARGIN + 2, y + bandH * 0.62);
  touchPdfContentPage(doc);
  return y + bandH + 1.2;
}

async function drawCorretivaMachineBlock(doc, y, values, pdfContext = null) {
  const serieFallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
  const marca = pdfDisplayValue(values.marca);
  const modelo = pdfDisplayValue(values.modelo);
  const serie = pdfDisplayValue(
    resolvePdfStandardFieldValue(
      values,
      { id: 'numero_de_serie', aliases: ['num_serie', 'numero_serie', 'n_serie'] },
      serieFallback,
    ),
  );
  const colW = CONTENT_W / 3;

  y = await drawCorretivaSectionBar(doc, y, PDF_MACHINE_SECTION);
  const pack = corretivaTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Marca: ${marca}`, `Modelo: ${modelo}`, `N.º Série: ${serie}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      2: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawCorretivaVerificationTable(doc, y, field, states) {
  const items = field?.items || [];
  const body = items.map((item) => {
    const spec = normalizeVerifyItem(item);
    const state = states?.[spec.id] || 'OK';
    return [pdfSafeText(spec.label), state];
  });
  if (!body.length) return y;

  const blockH = 8 + PDF_TABLE_MIN_CELL_HEIGHT_COMPACT + body.length * 4.2;
  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));
  y = await drawCorretivaSectionBar(doc, y, getBlockPdfTitle(field) || 'Verificações Efetuadas');

  const pointW = CONTENT_W * 0.72;
  const stateW = CONTENT_W - pointW;
  const pack = corretivaTableStylePack(doc);

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: CORRETIVA_FONT_PT },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: CORRETIVA_FONT_PT,
        fontStyle: 'bold',
      },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell((data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
      if (data.section === 'body' && data.column.index === 1) {
        const state = String(data.cell.raw || '');
        data.cell.styles.textColor = state === 'OK' ? SUCCESS : DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    }),
  });
}

async function drawCorretivaObservationsBox(doc, y, value) {
  const text = pdfDisplayValue(value);
  const lines = pdfSplitText(doc, text, CONTENT_W - 6);
  const boxH = Math.max(14, lines.length * 3.8 + 6);
  const blockH = 8 + boxH;

  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));
  y = await drawCorretivaSectionBar(doc, y, 'Observações');

  const boxY = y;
  doc.setFillColor(...PDF_TABLE_BODY_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, CORRETIVA_RADIUS_MM, CORRETIVA_RADIUS_MM, 'FD');

  pdfSetFont(doc, 'normal');
  doc.setFontSize(CORRETIVA_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 3, boxY + 4.5);

  touchPdfContentPage(doc);
  return boxY + boxH + CORRETIVA_SECTION_GAP_MM;
}

async function drawCorretivaResumoRow(doc, y, values) {
  const horas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas' }));
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));
  const colW = CONTENT_W / 2;

  y = await drawCorretivaSectionBar(doc, y, 'Resumo da Intervenção');
  const pack = corretivaTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Horas: ${horas}`, `Estado da Máquina: ${estado}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: CORRETIVA_FONT_PT },
    },
    gapAfter: CORRETIVA_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawCorretivaMaquinasBody(doc, y, service, values, pdfContext = null) {
  y = await drawCorretivaMachineBlock(doc, y, values, pdfContext);

  const verField = (service?.fields || []).find((f) => f.id === 'lista_de_verificacoes');
  if (verField) {
    y = await drawCorretivaVerificationTable(doc, y, verField, values.lista_de_verificacoes || {});
  }

  if (values.observacoes != null && String(values.observacoes).trim()) {
    y = await drawCorretivaObservationsBox(doc, y, values.observacoes);
  } else {
    y = await drawCorretivaObservationsBox(doc, y, '—');
  }

  return y;
}

async function drawCorretivaMaquinasClosingSection(doc, y, opts) {
  const profile = CORRETIVA_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };
  const closingBlockH =
    18 +
    (hasFotos ? estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) : 0) +
    estimateSignaturesHeight(profile);

  y = ensureKeepTogetherBlock(doc, y, Math.min(closingBlockH, pdfMaxContentHeight()));
  y = await drawCorretivaResumoRow(doc, y, opts.closingValues || {});

  if (hasFotos) {
    y = await drawAntesDepoisPolaroidSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      '',
      {
        polaroidMm: 28,
        descH: 0,
        bottomGap: 2,
        showSectionHeader: false,
        simpleLegend: true,
        skipEnsure: true,
      },
    );
  }

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
  });
}

function drawGrandesTitleBar(doc, y, title) {
  const barH = 5;
  y = ensureSpace(doc, y, barH + GRANDES_SECTION_GAP_MM);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, y, CONTENT_W, barH, GRANDES_BAR_RADIUS_MM, GRANDES_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SUBTITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title, MARGIN + CONTENT_W / 2, y + barH * 0.62, { align: 'center' });
  touchPdfContentPage(doc);
  return y + barH + GRANDES_SECTION_GAP_MM;
}

function grandesBatteryTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: GRANDES_BATTERY_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: GRANDES_BATTERY_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: GRANDES_BATTERY_MIN_CELL_HEIGHT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      fontSize: GRANDES_BATTERY_FONT_PT,
      lineHeight: GRANDES_BATTERY_LINE_HEIGHT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
      if (GRANDES_BATTERY_NOWRAP_COLS.has(data.column.index)) {
        data.cell.styles.overflow = 'ellipsize';
        data.cell.styles.cellWidth = GRANDES_BATTERY_COL_WIDTHS[data.column.index];
      }
    },
  };
}

function grandesTableStylePack(doc) {
  return {
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: GRANDES_TABLE_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: GRANDES_HEAD_FONT_PT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding: GRANDES_BATTERY_CELL_PADDING,
      fontSize: GRANDES_TABLE_FONT_PT,
      textColor: TEXT_DARK,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index % 2 === 1) {
        data.cell.styles.fillColor = PDF_TABLE_ALT_ROW_FILL;
      }
      if (data.section === 'body') {
        data.cell.styles.lineWidth = {
          top: 0,
          right: 0,
          bottom: PDF_TABLE_LINE_WIDTH,
          left: 0,
        };
      }
    },
  };
}

async function drawGrandesSectionBar(doc, y, title, layout = {}) {
  const { x = MARGIN, width = CONTENT_W } = layout;
  const bandH = GRANDES_SECTION_BAR_H_MM;
  y = ensureSpace(doc, y, bandH + GRANDES_SECTION_BAR_GAP_MM);
  doc.setFillColor(...PDF_SECTION_BG);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(x, y, width, bandH, GRANDES_BAR_RADIUS_MM, GRANDES_BAR_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'bold');
  doc.setFontSize(GRANDES_HEAD_FONT_PT);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(String(title).toUpperCase(), x + 2, y + bandH * 0.62);
  touchPdfContentPage(doc);
  return y + bandH + GRANDES_SECTION_BAR_GAP_MM;
}

function buildGrandesBatteryPdfBody(rows) {
  const keys = getColumnKeys();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [['—', '—', '—', '—', '—', '—', '—', '—']];
  return list.map((row) =>
    keys.map((key) => {
      const raw = row?.[key];
      return pdfDisplayValue(raw);
    }),
  );
}

function buildGrandesBatteryColumnStyles() {
  const styles = {};
  GRANDES_BATTERY_COL_WIDTHS.forEach((w, i) => {
    styles[i] = {
      cellWidth: w,
      fontSize: GRANDES_BATTERY_FONT_PT,
      overflow: GRANDES_BATTERY_NOWRAP_COLS.has(i) ? 'ellipsize' : 'linebreak',
      halign: i === 3 || i === 4 ? 'center' : 'left',
    };
  });
  return styles;
}

async function drawGrandesBatteryTable(doc, y, rows) {
  const body = buildGrandesBatteryPdfBody(rows);
  y = ensureSpace(doc, y, 16);
  y = await drawGrandesSectionBar(doc, y, 'Identificação Bateria');

  const pack = grandesBatteryTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    head: [GRANDES_BATTERY_PDF_HEADERS],
    body,
    columnStyles: buildGrandesBatteryColumnStyles(),
    gapAfter: GRANDES_SECTION_GAP_MM,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
}

async function drawGrandesConsumablesTableAt(doc, startY, rows, x, width) {
  const normalized = rows.length
    ? rows.map((row) => [pdfDisplayValue(row.artigo), pdfDisplayValue(row.qtd)])
    : [['—', '—']];
  const artW = width * 0.72;
  const qtdW = width - artW;

  let y = await drawGrandesSectionBar(doc, startY, 'Consumíveis Utilizados', { x, width });
  const pack = grandesTableStylePack(doc);
  const endY = await drawPdfGridTable(doc, y, {
    head: [['Artigo / Desc.', 'Qtd.']],
    body: normalized,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    columnStyles: {
      0: { cellWidth: artW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
      1: { cellWidth: qtdW, halign: 'center', fontSize: GRANDES_TABLE_FONT_PT },
    },
    gapAfter: 0,
    ...pack,
    didParseCell: mergePdfTableDidParseCell(pack.didParseCell),
    autoTableExtra: { rowPageBreak: 'avoid' },
  });
  return endY;
}

async function drawGrandesObservationsBoxAt(doc, startY, value, x, width) {
  const text = pdfDisplayValue(value);
  const textWidth = width - 5;
  let lines = pdfSplitText(doc, text, textWidth);
  if (lines.length > GRANDES_OBS_MAX_LINES) {
    lines = lines.slice(0, GRANDES_OBS_MAX_LINES);
    const last = lines[GRANDES_OBS_MAX_LINES - 1];
    lines[GRANDES_OBS_MAX_LINES - 1] =
      last.length > 2 ? `${String(last).slice(0, Math.max(0, last.length - 1))}…` : last;
  }
  const lineStep = (GRANDES_TABLE_FONT_PT / 72) * 25.4 * GRANDES_BATTERY_LINE_HEIGHT;
  const boxH = Math.min(GRANDES_OBS_MAX_H_MM, Math.max(7, lines.length * lineStep + 2.5));

  let y = await drawGrandesSectionBar(doc, startY, 'Observações', { x, width });
  const boxY = y;
  doc.setFillColor(...PDF_TABLE_BODY_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(x, boxY, width, boxH, GRANDES_RADIUS_MM, GRANDES_RADIUS_MM, 'FD');
  pdfSetFont(doc, 'normal');
  doc.setFontSize(GRANDES_TABLE_FONT_PT);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, x + 2.5, boxY + 3.2, { lineHeightFactor: GRANDES_BATTERY_LINE_HEIGHT });
  touchPdfContentPage(doc);
  return boxY + boxH;
}

async function drawGrandesConsumablesObsDualBlock(doc, y, consumableRows, obsText) {
  const gapMm = GRANDES_DUAL_COL_GAP_MM;
  const colW = (CONTENT_W - gapMm) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gapMm;
  const startY = y;

  const leftEndY = await drawGrandesConsumablesTableAt(doc, startY, consumableRows, leftX, colW);
  const rightEndY = await drawGrandesObservationsBoxAt(doc, startY, obsText || '—', rightX, colW);

  return Math.max(leftEndY, rightEndY) + GRANDES_SECTION_GAP_MM;
}

async function drawGrandesResumoRow(doc, y, values) {
  const horas = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'horas' }));
  const estado = pdfDisplayValue(resolvePdfStandardFieldValue(values, { id: 'estado_maquina' }));
  const colW = CONTENT_W / 2;

  y = await drawGrandesSectionBar(doc, y, 'Resumo da Intervenção');
  const pack = grandesTableStylePack(doc);
  return drawPdfGridTable(doc, y, {
    body: [[`Horas: ${horas}`, `Estado da Máquina: ${estado}`]],
    columnStyles: {
      0: { cellWidth: colW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
      1: { cellWidth: colW, halign: 'left', fontSize: GRANDES_TABLE_FONT_PT },
    },
    gapAfter: GRANDES_SECTION_GAP_MM,
    ...pack,
  });
}

async function drawGrandesBateriasBody(doc, y, service, values) {
  const batteryField = (service?.fields || []).find((f) => f.id === 'identificacao_baterias');
  const batteryRows = batteryField ? values[batteryField.id] : values.identificacao_baterias;
  return drawGrandesBatteryTable(doc, y, batteryRows);
}

function collectGrandesConsumableRows(service, values) {
  const materialField = (service?.fields || []).find((f) => isMaterialTableField(f));
  if (!materialField) return [];
  return normalizeMaterialRows(values[materialField.id]).filter(
    (row) => String(row.artigo || '').trim() || row.qtd,
  );
}

async function drawGrandesBateriasClosingSection(doc, y, opts) {
  const values = opts.closingValues || {};
  const service = opts.service;
  const profile = GRANDES_CLOSING_PROFILE;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };
  const obsText = values.observacoes != null ? String(values.observacoes).trim() : '';
  const consumableRows = collectGrandesConsumableRows(service, values);

  y = await drawGrandesConsumablesObsDualBlock(doc, y, consumableRows, obsText);

  const tailH =
    14 + estimateSignaturesHeight(profile) +
    (hasFotos ? estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) : 0);
  y = ensureKeepTogetherBlock(doc, y, Math.min(tailH, pdfMaxContentHeight()));
  y = await drawGrandesResumoRow(doc, y, values);

  if (hasFotos) {
    y = await drawAntesDepoisPolaroidSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      '',
      {
        polaroidMm: 28,
        descH: 0,
        bottomGap: 2,
        showSectionHeader: false,
        simpleLegend: true,
        skipEnsure: true,
      },
    );
  }

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
  });
}

async function drawPreventivaBateriaClosingSection(doc, y, opts) {
  const values = opts.values || {};
  const profile = FOLHA_CLOSING_PROFILE;
  const closingBlockH =
    48 + estimateSignaturesHeight(profile) + FOLHA_INSTITUTIONAL_FOOTER_H_MM;

  y = ensureKeepTogetherBlock(doc, y, Math.min(closingBlockH, pdfMaxContentHeight()));
  y = await drawPreventivaBateriaEstadoFinalBlock(doc, y, values);

  return drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
    reserveInstitutionalFooter: true,
  });
}

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

function columnPdfWeight(col) {
  const label = materialColumnLabel(col);
  const key = columnKey(col);
  const compactDataKeys = new Set(['qtd', 'quantidade', 'horas', 'qty', 'tipo', 'tensao_v']);
  const len = Math.max(String(label).length, 4);
  return compactDataKeys.has(key) ? len * 0.75 : len;
}

function buildSmartColumnStyles(columns, tableWidth = CONTENT_W) {
  const weights = columns.map((c) => columnPdfWeight(c));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const styles = {};
  columns.forEach((_, i) => {
    styles[i] = {
      cellWidth: (weights[i] / total) * tableWidth,
      overflow: 'linebreak',
      fontSize: PDF_FONT_TABLE,
    };
  });
  return styles;
}

/** Caixa compacta CLIENTE (+ Ordem) — fundo #F8FAFC, bordas arredondadas finas */
function drawCompactClientBox(doc, topY, clientMeta, numeroOrdem = null) {
  const blockW = PDF_HEADER_CLIENT_W;
  const blockX = PAGE_W - MARGIN - blockW;
  const blockPad = 2.5;
  const textW = blockW - blockPad * 2;

  const nameLines = pdfSplitText(doc, pdfSafeText(clientMeta.nome), textW);
  const addrLines = pdfSplitText(doc, pdfSafeText(clientMeta.addressLine), textW);
  const addrSubLines = clientMeta.addressSubline
    ? pdfSplitText(doc, pdfSafeText(clientMeta.addressSubline), textW)
    : [];

  let blockContentH = 5;
  if (numeroOrdem != null) blockContentH += 4;
  blockContentH += nameLines.length * 3.6 + 1;
  blockContentH += addrLines.length * 3;
  blockContentH += addrSubLines.length * 3;
  const blockH = blockContentH + blockPad * 2;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(blockX, topY, blockW, blockH, CORRETIVA_RADIUS_MM, CORRETIVA_RADIUS_MM, 'FD');

  let lineY = topY + blockPad + 3;
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text('CLIENTE', blockX + blockPad, lineY);
  lineY += 4;

  if (numeroOrdem != null) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_CAPTION);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(formatOrdemDisplay(numeroOrdem), blockX + blockPad, lineY);
    lineY += 3.8;
  }

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_DARK);
  doc.text(nameLines, blockX + blockPad, lineY);
  lineY += nameLines.length * 3.6 + 0.8;

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_CAPTION);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(addrLines, blockX + blockPad, lineY);
  lineY += addrLines.length * 3 + (addrSubLines.length ? 0.4 : 0);
  if (addrSubLines.length) {
    doc.text(addrSubLines, blockX + blockPad, lineY);
  }

  return blockH;
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

function formatEmpilhadoresHorasPdf(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const n = Number(raw);
  if (!Number.isNaN(n)) return Number.isInteger(n) ? String(n) : String(n);
  return cleanPdfText(raw);
}

function pdfGridCellEmpilhadoresMachine(label, value, options = {}) {
  if (options.horas) {
    const horasText = formatEmpilhadoresHorasPdf(value);
    return horasText ? `${label}: ${horasText}` : `${label}:`;
  }
  return pdfGridCell(label, value);
}

function buildFourColumnGridBody(cells) {
  const body = [];
  for (let i = 0; i < cells.length; i += EMPILHADORES_MATERIAL_COLS) {
    const row = [];
    for (let col = 0; col < EMPILHADORES_MATERIAL_COLS; col += 1) {
      row.push(cells[i + col] || '');
    }
    body.push(row);
  }
  return body;
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

function buildThreeColumnGridBody(pairs) {
  const body = [];
  for (let i = 0; i < pairs.length; i += 3) {
    body.push([
      pairs[i] ? pdfGridCell(pairs[i].label, pairs[i].value) : '',
      pairs[i + 1] ? pdfGridCell(pairs[i + 1].label, pairs[i + 1].value) : '',
      pairs[i + 2] ? pdfGridCell(pairs[i + 2].label, pairs[i + 2].value) : '',
    ]);
  }
  return body;
}

function isEmpilhadoresMaterialSection(section) {
  const norm = pdfNormalizeHeading(section || '');
  return norm.includes('substituicao') && norm.includes('material');
}

function isEmpilhadoresMaterialField(service, field) {
  return (
    service?.id === EMPILHADORES_SERVICE_ID &&
    Boolean(field) &&
    isEmpilhadoresMaterialSection(field.section)
  );
}

/** Título de secção numa coluna estreita (verificações lado a lado) */
function drawColumnSectionTitle(doc, x, y, width, title, options = {}) {
  const bandH = options.bandH ?? PDF_SECTION_BAND_HEIGHT_MM;
  doc.setFillColor(...PDF_SECTION_BG);
  doc.rect(x, y - 1, width, bandH, 'F');
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(x, y - 1, x + width, y - 1);

  pdfSetFont(doc, 'bold');
  const text = String(title).toUpperCase();
  const maxW = width - 4;
  let fontSize = options.fontSize ?? PDF_FONT_SECTION;
  doc.setTextColor(...CORPORATE_BLUE);
  if (options.singleLine) {
    doc.setFontSize(fontSize);
    while (fontSize > 6 && doc.getTextWidth(text) > maxW) {
      fontSize -= 0.4;
      doc.setFontSize(fontSize);
    }
    doc.text(text, x + 2, y + bandH * 0.62);
  } else {
    doc.setFontSize(fontSize);
    const lines = pdfSplitText(doc, text, maxW);
    doc.text(lines, x + 2, y + bandH * 0.55);
  }
  touchPdfContentPage(doc);
  return y + bandH + (options.gapAfter ?? 1.5);
}

function buildVerificationTableBody(items, states) {
  return (items || []).map((item) => {
    const spec = normalizeVerifyItem(item);
    const state = states?.[spec.id] || 'OK';
    return [pdfSafeText(spec.label), state];
  });
}

async function drawVerificationTableColumn(doc, startY, x, width, title, items, states, options = {}) {
  const compact = Boolean(options.compact);
  let y = drawColumnSectionTitle(doc, x, startY, width, title, {
    bandH: compact ? EMPILHADORES_VERIFY_COL_BAND_MM : PDF_SECTION_BAND_HEIGHT_MM,
    fontSize: compact ? PDF_FONT_CAPTION : PDF_FONT_SECTION,
    gapAfter: compact ? 1 : 2,
  });
  const body = buildVerificationTableBody(items, states);
  if (!body.length) return y;

  const pointW = width * 0.68;
  const stateW = width - pointW;
  const cellPadding = compact ? PDF_TABLE_CELL_PADDING_COMPACT : PDF_TABLE_CELL_PADDING;
  const minCellHeight = compact ? PDF_TABLE_MIN_CELL_HEIGHT_COMPACT : PDF_TABLE_MIN_CELL_HEIGHT;

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: PDF_FONT_TABLE,
      cellPadding,
      minCellHeight,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: PDF_FONT_TABLE,
      cellPadding,
      minCellHeight,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
      overflow: 'linebreak',
    },
    bodyStyles: { minCellHeight, cellPadding },
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: PDF_FONT_TABLE,
      },
    },
    didParseCell: (data) => {
      if (compact) {
        data.cell.styles.cellPadding = cellPadding;
        data.cell.styles.minCellHeight = minCellHeight;
      }
      if (data.section === 'body' && data.column.index === 1) {
        const state = String(data.cell.raw || '');
        data.cell.styles.textColor = state === 'OK' ? SUCCESS : DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    gapAfter: compact ? 1 : PDF_SECTION_GAP_MM,
  });
}

/** Verificações Externas + Internas — grid 2 colunas (1fr 1fr, gap 20px) */
async function drawEmpilhadoresDualVerificationBlocks(doc, y, left, right) {
  const gap = EMPILHADORES_DUAL_VERIFY_GAP_MM;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  const rowEstimate = Math.max(left?.items?.length || 0, right?.items?.length || 0);
  y = ensureSpace(
    doc,
    y,
    EMPILHADORES_VERIFY_COL_BAND_MM + rowEstimate * 3.6 + 8,
  );

  const startY = y;
  const compactOpts = { compact: true };
  const leftEnd = await drawVerificationTableColumn(
    doc,
    startY,
    leftX,
    colW,
    left.title,
    left.items,
    left.states,
    compactOpts,
  );
  const rightEnd = right
    ? await drawVerificationTableColumn(
        doc,
        startY,
        rightX,
        colW,
        right.title,
        right.items,
        right.states,
        compactOpts,
      )
    : startY;

  return Math.max(leftEnd, rightEnd) + PDF_SECTION_GAP_MM;
}

/** Substituição de material — grelha 4 colunas compacta (dashboard) */
function estimateEmpilhadoresMaterialSectionHeight(fieldCount) {
  const rowCount = Math.ceil(fieldCount / EMPILHADORES_MATERIAL_COLS);
  const titleH = PDF_SECTION_BAND_HEIGHT_MM + PDF_SECTION_GAP_MM + 2;
  const tableH = rowCount > 0 ? 4 + rowCount * 5.5 + PDF_SECTION_GAP_MM : 0;
  return EMPILHADORES_MATERIAL_SECTION_TOP_GAP_MM + titleH + tableH;
}

async function drawEmpilhadoresMaterialGrid(doc, y, fields, values, pdfContext, options = {}) {
  if (!fields.length) return y;
  const cells = fields.map((field) =>
    pdfGridCell(field.label, coercePdfFieldValue(field, values[field.id], pdfContext)),
  );
  const body = buildFourColumnGridBody(cells);
  if (!body.length) return y;

  const colW = CONTENT_W / EMPILHADORES_MATERIAL_COLS;
  if (!options.skipLeadingEnsure) {
    y = ensureSpace(doc, y, 8 + body.length * 4.5);
  }
  return drawPdfGridTable(doc, y, {
    body,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: EMPILHADORES_MATERIAL_FONT_PT,
      cellPadding: PDF_TABLE_CELL_PADDING_COMPACT,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
      1: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
      2: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
      3: { cellWidth: colW, overflow: 'linebreak', fontSize: EMPILHADORES_MATERIAL_FONT_PT },
    },
    gapAfter: PDF_SECTION_GAP_MM,
  });
}

function collectEmpilhadoresMaterialFields(service, values, pdfContext, skipIds = new Set()) {
  return (service?.fields || []).filter((field) => {
    if (skipIds.has(field.id)) return false;
    if (!isEmpilhadoresMaterialField(service, field)) return false;
    if (!isPdfScalarField(field)) return false;
    const value = coercePdfFieldValue(field, values[field.id], pdfContext);
    return !isPdfEmptyValue(field, value);
  });
}

function markEmpilhadoresMaterialFieldsRendered(service, scalarRenderedIds) {
  (service?.fields || []).forEach((field) => {
    if (isEmpilhadoresMaterialField(service, field)) {
      scalarRenderedIds.add(field.id);
    }
  });
}

/** Bloco completo — título + grelha de óleos/filtros (sempre após verificações) */
async function drawEmpilhadoresMaterialSectionBlock(
  doc,
  y,
  service,
  values,
  pdfContext,
  fields = null,
  skipIds = new Set(),
) {
  const materialFields =
    fields ||
    collectEmpilhadoresMaterialFields(service, values, pdfContext, skipIds);
  if (!materialFields.length) return y;

  const blockH = estimateEmpilhadoresMaterialSectionHeight(materialFields.length);
  y += EMPILHADORES_MATERIAL_SECTION_TOP_GAP_MM;
  y = ensureKeepTogetherBlock(doc, y, Math.min(blockH, pdfMaxContentHeight()));

  y = drawSectionTitle(doc, y, EMPILHADORES_MATERIAL_SECTION, { skipEnsure: true });
  y = drawDivider(doc, y - 4);
  return drawEmpilhadoresMaterialGrid(doc, y, materialFields, values, pdfContext, {
    skipLeadingEnsure: true,
  });
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
    gapAfter = PDF_SECTION_GAP_MM,
    marginLeft = MARGIN,
    marginRight = MARGIN,
    tableWidth = CONTENT_W,
    styles: stylesOverride,
    headStyles: headStylesOverride,
    bodyStyles: bodyStylesOverride,
    autoTableExtra,
  } = options;
  if (!body?.length && !head?.length) return y;

  await loadJsPdfAutoTable();
  const baseStyles = buildPdfAutoTableStyles(doc, pdfAutoTableFont, pdfSetFont);
  const tableConfig = {
    startY: y,
    margin: getPdfAutoTableMargin(marginLeft, marginRight),
    tableWidth,
    ...baseStyles,
    styles: { ...baseStyles.styles, ...(stylesOverride || {}) },
    headStyles: { ...baseStyles.headStyles, ...(headStylesOverride || {}) },
    bodyStyles: { ...baseStyles.bodyStyles, ...(bodyStylesOverride || {}) },
    columnStyles: columnStyles || {
      0: { cellWidth: tableWidth / 2, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: { cellWidth: tableWidth / 2, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
    },
    ...(autoTableExtra || {}),
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
    if (isEmpilhadoresMaterialField(service, field)) return false;
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
  return topY + logoH + PDF_SECTION_GAP_MM;
}

/** Cabeçalho — coluna esquerda: logo; coluna direita: caixa CLIENTE + Ordem */
function drawTopRowWithClientBlock(doc, clientMeta, numeroOrdem = null) {
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

  const clientBoxH = drawCompactClientBox(doc, topY, clientMeta, numeroOrdem);

  touchPdfContentPage(doc);
  return Math.max(topY + logoH, topY + clientBoxH) + PDF_SECTION_GAP_MM;
}

function drawTitleBar(doc, y, title) {
  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_TITLE);
  doc.setTextColor(...CORPORATE_BLUE);
  const lines = pdfSplitText(doc, title, CONTENT_W);
  doc.text(lines, MARGIN, y + 4);
  const textH = lines.length * 5.2;
  y += textH + 2;
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  touchPdfContentPage(doc);
  return y + PDF_SECTION_GAP_MM;
}

async function drawStandardMachineBlock(doc, y, values, pdfContext = null, service = null) {
  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, y, PDF_MACHINE_SECTION, { skipEnsure: true });
  y = drawDivider(doc, y - 4);

  const isEmpilhadores = service?.id === EMPILHADORES_SERVICE_ID;
  const isDl50 = service?.id === INSPECAO_DL50_SERVICE_ID;
  const specs = isEmpilhadores
    ? EMPILHADORES_MACHINE_PDF_SPECS
    : isDl50
      ? INSPECAO_DL50_MACHINE_PDF_SPECS
      : PDF_STANDARD_MACHINE_SPECS;

  if (isEmpilhadores) {
    const cells = specs.map((spec) => {
      let fallback = null;
      if (spec.id === 'numero_de_serie') {
        fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
      }
      const raw = resolvePdfStandardFieldValue(values, spec, fallback);
      if (spec.id === 'horas') {
        return pdfGridCellEmpilhadoresMachine(spec.label, raw, { horas: true });
      }
      return pdfGridCell(spec.label, pdfDisplayValue(raw));
    });
    const body = [];
    for (let i = 0; i < cells.length; i += 3) {
      body.push([cells[i] || '', cells[i + 1] || '', cells[i + 2] || '']);
    }
    if (!body.length) return y;
    y = ensureSpace(doc, y, 10);
    const colW = CONTENT_W / 3;
    return drawPdfGridTable(doc, y, {
      body,
      columnStyles: {
        0: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
        1: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
        2: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      },
    });
  }

  if (isDl50) {
    const cells = specs.map((spec) => {
      let fallback = null;
      if (spec.id === 'numero_de_serie') {
        fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
      }
      const raw = resolvePdfStandardFieldValue(values, spec, fallback);
      return pdfGridCell(spec.label, pdfDisplayValue(raw));
    });
    const body = [];
    for (let i = 0; i < cells.length; i += 2) {
      body.push([cells[i] || '', cells[i + 1] || '']);
    }
    if (!body.length) return y;
    y = ensureSpace(doc, y, 10);
    const colW = CONTENT_W / 2;
    return drawPdfGridTable(doc, y, {
      body,
      columnStyles: {
        0: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_BODY },
        1: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_BODY },
      },
    });
  }

  const pairs = specs.map((spec) => {
    let fallback = null;
    if (spec.id === 'numero_de_serie') {
      fallback = pdfContext?.forkliftSerial || pdfContext?.report?.forkliftSerial || null;
    }
    return {
      label: spec.label,
      value: pdfDisplayValue(resolvePdfStandardFieldValue(values, spec, fallback)),
    };
  });

  return drawSectionScalarGridFromPairs(doc, y, pairs);
}

async function drawSectionScalarGridFromPairs(doc, y, pairs) {
  const body = buildTwoColumnGridBody(pairs);
  if (!body.length) return y;
  y = ensureSpace(doc, y, 14);
  return drawPdfGridTable(doc, y, { body });
}

/** Campo label+valor numa linha (fonte compacta) */
function drawServiceInfoField(doc, x, y, label, value, options = {}) {
  const { align = 'left', maxWidth = CONTENT_W } = options;
  const labelText = String(label).endsWith(':') ? label : `${label}:`;
  const valueText = pdfSafeText(value);

  if (align === 'right') {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_MUTED);
    const labelW = doc.getTextWidth(`${labelText} `);
    pdfSetFont(doc, 'bold');
    doc.setTextColor(...TEXT_DARK);
    const valueW = doc.getTextWidth(valueText);
    const startX = x + maxWidth - labelW - valueW;
    pdfSetFont(doc, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(labelText, startX, y);
    pdfSetFont(doc, 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(valueText, startX + labelW, y);
    return;
  }

  if (align === 'center') {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_MUTED);
    const labelW = doc.getTextWidth(`${labelText} `);
    pdfSetFont(doc, 'bold');
    doc.setTextColor(...TEXT_DARK);
    const valueW = doc.getTextWidth(valueText);
    const startX = x + (maxWidth - labelW - valueW) / 2;
    pdfSetFont(doc, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(labelText, startX, y);
    pdfSetFont(doc, 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(valueText, startX + labelW, y);
    return;
  }

  pdfSetFont(doc, 'normal');
  doc.setFontSize(PDF_FONT_BODY);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(labelText, x, y, { maxWidth });
  const labelW = doc.getTextWidth(`${labelText} `);
  pdfSetFont(doc, 'bold');
  doc.setTextColor(...TEXT_DARK);
  doc.text(valueText, x + labelW, y, { maxWidth: Math.max(maxWidth - labelW, 8) });
}

/** Bloco meta — Data do Serviço, Nº de Visitas e Técnico (subcabeçalho único no topo) */
function drawServiceInfoBlock(doc, y, meta) {
  const rowItems = [];
  rowItems.push({ label: 'Data do Serviço', value: meta.serviceDate || '—' });
  if (meta.periodicidade != null && String(meta.periodicidade).trim()) {
    rowItems.push({ label: 'Periodicidade Inspeção', value: pdfDisplayValue(meta.periodicidade) });
  }
  if (meta.numeroVisitas != null) {
    rowItems.push({ label: 'Nº de Visitas', value: pdfDisplayValue(meta.numeroVisitas) });
  }
  if (meta.deslocacao != null) {
    rowItems.push({ label: 'Deslocação', value: pdfDisplayValue(meta.deslocacao) });
  }
  const techValue = pdfDisplayValue(meta.technician || meta.tecnicoFallback || '');
  if (techValue && techValue !== '—') {
    rowItems.push({ label: 'Técnico', value: techValue });
  }

  const boxPad = 2.5;
  const boxInnerH = PDF_SERVICE_INFO_ROW_H_MM;
  const boxH = boxInnerH + boxPad * 2;
  const extraRowH = meta.visitDatesLine ? PDF_SERVICE_INFO_ROW_H_MM + PDF_SERVICE_INFO_COL_GAP_MM : 0;
  const blockH =
    PDF_SERVICE_INFO_MARGIN_TOP_MM + boxH + extraRowH + (meta.metaBottomGapMm ?? PDF_SERVICE_INFO_MARGIN_BOTTOM_MM);
  y = ensureSpace(doc, y, blockH);

  y += PDF_SERVICE_INFO_MARGIN_TOP_MM;
  const boxY = y;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, 1.5, 1.5, 'FD');

  const rowY = boxY + boxPad + boxInnerH * 0.72;
  const slotCount = Math.max(rowItems.length, 1);
  const slotW = CONTENT_W / slotCount;

  rowItems.forEach((item, i) => {
    const slotX = MARGIN + i * slotW;
    const align = i === 0 ? 'left' : i === slotCount - 1 ? 'right' : 'center';
    drawServiceInfoField(doc, slotX, rowY, item.label, item.value, {
      align,
      maxWidth: slotW - 4,
    });
  });

  y = boxY + boxH;

  if (meta.visitDatesLine) {
    y += PDF_SERVICE_INFO_COL_GAP_MM;
    drawServiceInfoField(doc, MARGIN, y, 'Datas das Visitas', meta.visitDatesLine, {
      align: 'left',
      maxWidth: CONTENT_W,
    });
    y += PDF_SERVICE_INFO_ROW_H_MM;
  }

  y += meta.metaBottomGapMm ?? PDF_SERVICE_INFO_MARGIN_BOTTOM_MM;
  touchPdfContentPage(doc);
  return y;
}

async function drawClosingDiagnosticBlock(doc, y, values, service = null) {
  const specs = PDF_CLOSING_DIAGNOSTIC_SPECS.filter((spec) => {
    if (spec.id === 'horas' && SERVICES_WITH_SECTION_VISITAS.has(service?.id)) return false;
    return true;
  });
  const pairs = specs.map((spec) => ({
    label: spec.label,
    value: pdfDisplayValue(resolvePdfStandardFieldValue(values, spec)),
  }));

  y = ensureSpace(doc, y, 20);
  y = drawSectionTitle(doc, y, 'Resumo da Intervenção', { skipEnsure: true });
  y = drawDivider(doc, y - 4);
  return drawSectionScalarGridFromPairs(doc, y, pairs);
}

function drawDivider(doc, y) {
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + PDF_SECTION_GAP_MM;
}

function drawSectionTitle(doc, y, title, options = {}) {
  const bandH = PDF_SECTION_BAND_HEIGHT_MM;
  if (!options.skipEnsure) {
    y = ensureSpace(doc, y, bandH + PDF_SECTION_GAP_MM);
  }

  doc.setFillColor(...PDF_SECTION_BG);
  doc.rect(MARGIN, y - 1, CONTENT_W, bandH, 'F');
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y - 1, PAGE_W - MARGIN, y - 1);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(PDF_FONT_SECTION);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title.toUpperCase(), MARGIN + 3, y + bandH * 0.62);
  touchPdfContentPage(doc);
  return y + bandH + PDF_SECTION_GAP_MM;
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
  if (service.id === 'reparacao_avarias_bateria') {
    REPARACAO_AVARIAS_ESTADO_FINAL_FIELD_IDS.forEach((id) => scalarRenderedIds.add(id));
  }
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
  let visitasHorasTableRendered = false;
  let empilhadoresMaterialRendered = false;

  for (const field of service.fields) {
    if (
      !visitasHorasTableRendered &&
      SERVICES_WITH_SECTION_VISITAS.has(service.id) &&
      service.id !== 'manutencao_preventiva_bateria' &&
      field.id === VISITAS_FIELD_ID &&
      pdfNormalizeHeading(field.section || '').includes('numero de visitas e tempo')
    ) {
      y = await drawPreventivaBateriaIntervencaoTable(doc, y, values);
      visitasHorasTableRendered = true;
      if (field.section) gridRenderedSections.add(field.section);
      continue;
    }

    if (scalarRenderedIds.has(field.id)) continue;
    if (isEmpilhadoresMaterialField(service, field)) continue;
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
          const deferEmpilhadoresMaterial =
            service.id === EMPILHADORES_SERVICE_ID &&
            isEmpilhadoresMaterialSection(currentSection);

          if (!deferEmpilhadoresMaterial) {
            y = ensureSpace(doc, y, 10);
            y = drawSectionTitle(doc, y, currentSection);
            y = drawDivider(doc, y - 4);
            y = await drawSectionScalarGrid(doc, y, sectionScalars, values, pdfContext);
            sectionScalars.forEach((f) => scalarRenderedIds.add(f.id));
          }
        } else if (!skipSectionHeader) {
          y = ensureSpace(doc, y, 10);
          y = drawSectionTitle(doc, y, currentSection);
          y = drawDivider(doc, y - 4);
        }

        gridRenderedSections.add(currentSection);
      }
    }

    if (scalarRenderedIds.has(field.id)) continue;

    y = ensureSpace(doc, y, service.id === EMPILHADORES_SERVICE_ID ? 8 : 14);

    if (field.type === 'verification_toggles' && value && typeof value === 'object') {
      if (service.id === EMPILHADORES_SERVICE_ID && field.id === 'componentes_externos') {
        const internField = (service.fields || []).find((f) => f.id === 'componentes_internos');
        let internValue = {};
        if (internField) {
          internValue = coercePdfFieldValue(internField, values[internField.id], pdfContext);
          if (typeof internValue !== 'object' || internValue === null) internValue = {};
        }
        y = await drawEmpilhadoresDualVerificationBlocks(
          doc,
          y,
          {
            title: getBlockPdfTitle(field),
            items: field.items || [],
            states: value,
          },
          internField
            ? {
                title: getBlockPdfTitle(internField),
                items: internField.items || [],
                states: internValue,
              }
            : null,
        );
        if (!empilhadoresMaterialRendered) {
          const pendingMaterial = collectEmpilhadoresMaterialFields(
            service,
            values,
            pdfContext,
            scalarRenderedIds,
          );
          if (pendingMaterial.length) {
            y = await drawEmpilhadoresMaterialSectionBlock(
              doc,
              y,
              service,
              values,
              pdfContext,
              pendingMaterial,
              scalarRenderedIds,
            );
            empilhadoresMaterialRendered = true;
            markEmpilhadoresMaterialFieldsRendered(service, scalarRenderedIds);
            gridRenderedSections.add(EMPILHADORES_MATERIAL_SECTION);
          }
        }
        if (internField) {
          scalarRenderedIds.add(internField.id);
          if (internField.section) gridRenderedSections.add(internField.section);
        }
        continue;
      }
      if (service.id === EMPILHADORES_SERVICE_ID && field.id === 'componentes_internos') {
        continue;
      }
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
      y = await drawMatrixInspectionBlock(doc, y, field, value, service);
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

  if (service.id === EMPILHADORES_SERVICE_ID && !empilhadoresMaterialRendered) {
    const pendingMaterial = collectEmpilhadoresMaterialFields(
      service,
      values,
      pdfContext,
      scalarRenderedIds,
    );
    if (pendingMaterial.length) {
      y = await drawEmpilhadoresMaterialSectionBlock(
        doc,
        y,
        service,
        values,
        pdfContext,
        pendingMaterial,
        scalarRenderedIds,
      );
      markEmpilhadoresMaterialFieldsRendered(service, scalarRenderedIds);
      gridRenderedSections.add(EMPILHADORES_MATERIAL_SECTION);
    }
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
const MATRIX_CAT_GAP = PDF_SECTION_GAP_MM;
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

function estimateMatrixAutoTableHeight(doc, body, pointColWidth = MATRIX_POINT_COL_W) {
  if (!body.length) return 0;
  let height = MATRIX_CAT_TITLE_H + MATRIX_TABLE_HEADER_H;
  body.forEach((row) => {
    const lines = pdfSplitText(doc, row[0], pointColWidth - 6);
    height += Math.max(MATRIX_TABLE_ROW_MIN_H, lines.length * 3.2 + 2.5) + 0.5;
  });
  return height + MATRIX_CAT_GAP;
}

function estimateDl50CategoryBlockHeight(doc, body, colWidth) {
  const pointColWidth = colWidth * 0.72;
  const titleH = DL50_MATRIX_CAT_BAND_MM + 1;
  let tableH = PDF_TABLE_MIN_CELL_HEIGHT_COMPACT + 1;
  body.forEach((row) => {
    const lines = pdfSplitText(doc, row[0], pointColWidth - 4);
    tableH += Math.max(PDF_TABLE_MIN_CELL_HEIGHT_COMPACT, lines.length * 3 + 2);
  });
  return titleH + tableH + 1.5;
}

async function drawDl50MatrixCategoryTable(doc, x, startY, width, cat, catData, options = {}) {
  const { body, rowOpts } = buildMatrixCategoryTable(doc, cat, catData);
  if (!body.length) return startY;

  const blockH = estimateDl50CategoryBlockHeight(doc, body, width);
  let y = startY;
  if (!options.skipKeepTogether) {
    y = ensureKeepTogetherBlock(doc, startY, Math.min(blockH, pdfMaxContentHeight()));
  }

  y = drawColumnSectionTitle(doc, x, y, width, cat.name, {
    bandH: DL50_MATRIX_CAT_BAND_MM,
    fontSize: DL50_MATRIX_CAT_FONT_PT,
    gapAfter: 1,
    singleLine: true,
  });

  const pointW = width * 0.72;
  const stateW = width - pointW;
  const cellPadding = PDF_TABLE_CELL_PADDING_COMPACT;

  return drawPdfGridTable(doc, y, {
    head: [['Ponto', 'Est.']],
    body,
    marginLeft: x,
    marginRight: PAGE_W - x - width,
    tableWidth: width,
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: DL50_MATRIX_FONT_PT,
      cellPadding,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: TEXT_DARK,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: pdfAutoTableFont(doc),
      fillColor: PDF_SECTION_BG,
      textColor: CORPORATE_BLUE,
      fontStyle: 'bold',
      fontSize: DL50_MATRIX_FONT_PT,
      cellPadding,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      lineColor: PDF_TABLE_LINE,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      halign: 'left',
      overflow: 'linebreak',
    },
    bodyStyles: {
      fillColor: PDF_TABLE_BODY_FILL,
      minCellHeight: PDF_TABLE_MIN_CELL_HEIGHT_COMPACT,
      cellPadding,
    },
    columnStyles: {
      0: { cellWidth: pointW, overflow: 'linebreak', fontSize: DL50_MATRIX_FONT_PT },
      1: {
        cellWidth: stateW,
        halign: 'center',
        overflow: 'linebreak',
        fontSize: DL50_MATRIX_FONT_PT,
        fontStyle: 'bold',
      },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const opt = rowOpts[data.row.index];
        data.cell.styles.textColor = matrixPdfRgb(opt);
        data.cell.styles.fontStyle = 'bold';
      }
    },
    gapAfter: 1.5,
  });
}

async function drawDl50DualMatrixInspectionBlock(doc, y, field, matrixValue) {
  const categories = field.categories || [];
  const [leftCats, rightCats] = splitDl50MatrixCategories(categories);
  const gap = DL50_DUAL_MATRIX_GAP_MM;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  y = drawSectionTitle(doc, y, getBlockPdfTitle(field) || 'Pontos de Inspeção');
  y = drawDivider(doc, y - 4);

  const rowCount = Math.max(leftCats.length, rightCats.length);
  for (let i = 0; i < rowCount; i++) {
    const leftCat = leftCats[i];
    const rightCat = rightCats[i];

    let leftH = 0;
    let rightH = 0;
    if (leftCat) {
      const { body } = buildMatrixCategoryTable(
        doc,
        leftCat,
        matrixValue[columnKey(leftCat.name)] || {},
      );
      if (body.length) leftH = estimateDl50CategoryBlockHeight(doc, body, colW);
    }
    if (rightCat) {
      const { body } = buildMatrixCategoryTable(
        doc,
        rightCat,
        matrixValue[columnKey(rightCat.name)] || {},
      );
      if (body.length) rightH = estimateDl50CategoryBlockHeight(doc, body, colW);
    }

    const rowH = Math.max(leftH, rightH);
    if (rowH > 0) {
      y = ensureKeepTogetherBlock(doc, y, Math.min(rowH, pdfMaxContentHeight()));
    }

    const rowStartY = y;
    let leftEnd = rowStartY;
    let rightEnd = rowStartY;

    if (leftCat) {
      leftEnd = await drawDl50MatrixCategoryTable(
        doc,
        leftX,
        rowStartY,
        colW,
        leftCat,
        matrixValue[columnKey(leftCat.name)] || {},
        { skipKeepTogether: true },
      );
    }
    if (rightCat) {
      rightEnd = await drawDl50MatrixCategoryTable(
        doc,
        rightX,
        rowStartY,
        colW,
        rightCat,
        matrixValue[columnKey(rightCat.name)] || {},
        { skipKeepTogether: true },
      );
    }

    y = Math.max(leftEnd, rightEnd) + 1.2;
  }

  return y + PDF_SECTION_GAP_MM;
}

async function drawMatrixInspectionBlock(doc, y, field, matrixValue, service = null) {
  if (service?.id === INSPECAO_DL50_SERVICE_ID) {
    return drawDl50DualMatrixInspectionBlock(doc, y, field, matrixValue);
  }

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
    doc.setTextColor(...CORPORATE_BLUE);
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
          fontSize: PDF_FONT_TABLE,
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
  const gapAfter = opts.gapAfter ?? PDF_SECTION_GAP_MM;
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

const POLAROID_MM = 60;
const POLAROID_FRAME_PAD = 3;
const POLAROID_CAPTION_H = 9;
const POLAROID_DESC_H = 10;

const REPORT_CLOSING_PROFILES = [
  {
    polaroidMm: 60,
    descH: 10,
    polaroidBottom: 10,
    sectionHeader: true,
    legalGap: 8,
    sigTop: 16,
    sigImg: 20,
  },
  {
    polaroidMm: 48,
    descH: 8,
    polaroidBottom: 6,
    sectionHeader: true,
    legalGap: 5,
    sigTop: 8,
    sigImg: 16,
  },
  {
    polaroidMm: 42,
    descH: 6,
    polaroidBottom: 4,
    sectionHeader: false,
    legalGap: 4,
    sigTop: 4,
    sigImg: 14,
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
  const headerH = profile.sectionHeader ? 17 : 0;
  const descH = opts.simpleLegend ? 0 : profile.descH;
  return headerH + descH + profile.polaroidMm + POLAROID_CAPTION_H + profile.polaroidBottom;
}

function estimateSignaturesHeight(profile) {
  return profile.sigTop + profile.sigImg + SIGNATURE_LABEL_GAP_MM + 10;
}

function estimateReportClosingHeight(doc, y, opts = {}) {
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };
  const profile = planReportClosingProfile(doc, y, opts);
  return (
    (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
    estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) +
    estimateSignaturesHeight(profile)
  );
}

function planReportClosingProfile(doc, y, opts) {
  if (
    opts.service?.id === EMPILHADORES_SERVICE_ID ||
    opts.service?.id === INSPECAO_DL50_SERVICE_ID
  ) {
    return REPORT_CLOSING_PROFILES[REPORT_CLOSING_PROFILES.length - 1];
  }

  const bottom = pdfContentBottomY();
  const available = bottom - y;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };

  for (const profile of REPORT_CLOSING_PROFILES) {
    const total =
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
  const estimateClosingHeight = (closingProfile) =>
    (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, closingProfile) : 0) +
    estimatePolaroidSectionHeight(hasFotos, closingProfile, polaroidOpts) +
    estimateSignaturesHeight(closingProfile);

  let closingHeight = estimateClosingHeight(profile);
  const isDl50Closing = opts.service?.id === INSPECAO_DL50_SERVICE_ID;

  if (!isDl50Closing) {
    y = ensureKeepTogetherBlock(doc, y, Math.min(closingHeight, pdfMaxContentHeight()));
    profile = planReportClosingProfile(doc, y, opts);
    closingHeight = estimateClosingHeight(profile);
  }

  if (isDl50Closing) {
    const dl50TailH =
      (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
      (hasFotos ? estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) : 0) +
      estimateSignaturesHeight(profile);
    y = ensureKeepTogetherBlock(doc, y, Math.min(dl50TailH, pdfMaxContentHeight()));
    profile = planReportClosingProfile(doc, y, opts);
  }

  if (hasLegal) {
    const legalH = estimateLegalVerdictHeight(doc, opts.legalValue, profile);
    if (!isDl50Closing) {
      y = ensureBlockFitsSafeZone(doc, y, legalH);
    }
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

  if (opts.closingValues && !opts.skipClosingDiagnostic) {
    y = await drawClosingDiagnosticBlock(doc, y, opts.closingValues, opts.service);
  }

  if (opts.service?.id === 'reparacao_avarias_bateria' && opts.closingValues) {
    y = await drawEstadoFinalClosedBlock(doc, y, opts.closingValues, {
      observacaoLabel: 'Observação:',
    });
  }

  const sigH = estimateSignaturesHeight(profile);
  if (!isDl50Closing) {
    y = ensureBlockFitsSafeZone(doc, y, sigH);
  }
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
      0: { cellWidth: colW, overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
      1: { cellWidth: stateW, halign: 'center', overflow: 'linebreak', fontSize: PDF_FONT_TABLE },
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

const OBS_LINE_HEIGHT = 5;
const OBS_EMPTY_LINE_HEIGHT = 3;
const OBS_TITLE_BLOCK_HEIGHT = 14;
const OBS_BOTTOM_PAD = 8;

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
    gapAfter: PDF_SECTION_GAP_MM,
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

  const valLines = pdfSplitText(doc, text, CONTENT_W - 62);
  const blockH = Math.max(5, valLines.length * 4.2) + 3;
  y = ensureSpace(doc, y, blockH);

  doc.setTextColor(...rgb);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(9);
  if (symbol) doc.text(symbol, MARGIN + 1, y);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${label}:`, MARGIN + 7, y);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(8.5);
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
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);

  const lines = pdfParagraphLines(doc, value, CONTENT_W - 12);
  const textTop = innerTitle ? 14 : 8;
  const boxH = Math.max(24, lines.length * 5 + textTop + 8);
  y = ensureSpace(doc, y, boxH + 6);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD');

  if (innerTitle) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(PDF_FONT_SUBTITLE);
    doc.setTextColor(...CORPORATE_BLUE);
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
const SIGNATURES_TOP_MARGIN_MM = 14;
const SIGNATURE_LINE_GAP_MM = 14;
const SIGNATURE_IMG_H_MM = 22;
const SIGNATURE_LABEL_GAP_MM = 6;
const SIGNATURES_BLOCK_HEIGHT_MM =
  SIGNATURES_TOP_MARGIN_MM + SIGNATURE_IMG_H_MM + SIGNATURE_LABEL_GAP_MM + 10;

async function drawSignaturesFooter(doc, y, signatures, opts = {}) {
  const topMargin = opts.topMargin ?? SIGNATURES_TOP_MARGIN_MM;
  const imgHeight = opts.imgHeight ?? SIGNATURE_IMG_H_MM;
  const blockHeight = topMargin + imgHeight + SIGNATURE_LABEL_GAP_MM + 10;
  const footerLimit = opts.reserveInstitutionalFooter
    ? PDF_FOOTER_BLOCK_TOP - 2
    : pdfContentBottomY();

  if (!opts.skipEnsure) {
    y = ensureBlockFitsSafeZone(doc, y, blockHeight);
  }
  if (y + blockHeight > footerLimit) {
    doc.addPage();
    touchPdfContentPage(doc);
    y = PDF_PAGE_CONTENT_START_Y;
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
