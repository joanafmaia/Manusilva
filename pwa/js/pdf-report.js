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
import { isMachineTrackingField } from './form-engine.js';
import { getColumnLabels } from './views/relatorio-grandes.js';
import {
  drawInspecaoDl50HeaderBlock,
  INSPECAO_DL50_MACHINE_FIELD_IDS,
  INSPECAO_DL50_PDF_SKIP_FIELD_IDS,
  resolveInspecaoDl50MachineFields,
} from './inspecao-dl50-categories.js';

const DB_KEY = 'manusilva_db';

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
  const nif = values.nif || prod?.NIF || dbClient?.nif || dbClient?.NIF || '';
  const email = values.email || values.e_mail || prod?.['E-mail'] || dbClient?.email || dbClient?.['E-mail'] || '';
  const morada = values.morada || prod?.Morada || dbClient?.morada || dbClient?.Morada || '';
  const localidade = values.localidade || prod?.Localidade || dbClient?.localidade || dbClient?.Localidade || '';
  const cp = values.codigo_postal || prod?.['Código postal'] || '';
  const parts = [morada, cp, localidade].filter(Boolean);
  const addressLine = parts.length ? parts.join(', ') : dbClient?.address || '';
  return { nome, nif, email, addressLine, localidade };
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

  return text;
}

function getTechnician(id) {
  return getDB().technicians?.find((t) => t.id === id) || TECHNICIANS.find((t) => t.id === id);
}

function getServiceType(id) {
  return reportTemplates.find((s) => s.id === id) || SERVICE_TYPES.find((s) => s.id === id);
}

function columnKey(col) {
  return col
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '');
}

function getJob(id) {
  return getJobsSnapshot().find((j) => j.id === id) || null;
}

const CORPORATE_BLUE = [30, 64, 115];
const CORPORATE_BLUE_DARK = [15, 39, 68];
const SLATE_LINE = [100, 116, 139];
const TEXT_DARK = [30, 41, 59];
const TEXT_MUTED = [100, 116, 139];
const SUCCESS = [16, 185, 129];
const DANGER = [248, 113, 113];

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Zona reservada para rodapé institucional fixo (mm) */
const PDF_FOOTER_RESERVE_MM = 22;
const PDF_FOOTER_TEXT_RGB = [148, 163, 184];
const PDF_FOOTER_FONT_SIZE = 8;

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

  let y = isDl50Pdf
    ? drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null)
    : drawTopRow(doc, service, job?.numeroOrdem ?? null);
  y = drawTitleBar(doc, y, title);
  const pdfContext = buildPdfRenderContext(report, job, clientMeta, tech);
  let values = mapReportValuesForPdf(data, service, pdfContext);
  if (isDl50Pdf) {
    values = { ...values, ...resolveInspecaoDl50MachineFields(values, pdfContext) };
  }
  pdfContext.values = values;
  y = drawMetadataGrid(
    doc,
    y,
    {
      dateTime: formatReportDateTime(report, job, values),
      technician: tech?.name || '—',
      client: clientMeta.nome,
      clientSub: [clientMeta.nif && `NIF ${clientMeta.nif}`, clientMeta.email, clientMeta.addressLine]
        .filter(Boolean)
        .join(' · '),
    },
    { omitClient: isDl50Pdf },
  );
  y = drawDivider(doc, y);
  y = await drawReportFieldsSection(doc, y, service, values, pdfContext);
  const fotoAntesUrl = data.fotoAntesUrl || job?.fotoAntes || null;
  const fotoDepoisUrl = data.fotoDepoisUrl || job?.fotoDepois || null;
  const fotoLegenda = buildFotoRegistoLegenda(service, values);
  if (isDl50Pdf) {
    y = await drawDl50ClosingSection(doc, y, {
      legalLabel: 'Declaração de Segurança',
      legalValue: values.declaracao_seguranca,
      fotoAntesUrl,
      fotoDepoisUrl,
      fotoLegenda,
      signatures: data.signatures || {},
    });
  } else {
    y = await drawAntesDepoisPolaroidSection(doc, y, fotoAntesUrl, fotoDepoisUrl, fotoLegenda);
    if ((data.photos || []).length) {
      y = await drawPhotosAppendix(doc, y, data.photos || []);
    }
    y = await drawSignaturesFooter(doc, y, data.signatures || {});
  }
  if (isDl50Pdf && (data.photos || []).length) {
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

/** Logo no cabeçalho PDF (mm) — largura × altura, proporção do wordmark MS + MANUSILVA */
const PDF_LOGO_WIDTH_MM = 54;
const PDF_LOGO_HEIGHT_MM = 38;

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

/** Cabeçalho DL 50/2005 — logotipo à esquerda, dados do cliente à direita */
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

  const blockW = 84;
  const blockX = PAGE_W - MARGIN - blockW;
  let lineY = topY + 2;

  if (numeroOrdem != null) {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(formatOrdemDisplay(numeroOrdem), PAGE_W - MARGIN, lineY, { align: 'right' });
    lineY += 5;
  }

  const clientLines = [
    { label: 'Cliente', value: clientMeta.nome, prominent: true },
    clientMeta.nif ? { label: 'NIF', value: clientMeta.nif } : null,
    clientMeta.email ? { label: 'Email', value: clientMeta.email } : null,
    clientMeta.addressLine ? { label: 'Morada', value: clientMeta.addressLine } : null,
  ].filter(Boolean);

  clientLines.forEach((line) => {
    pdfSetFont(doc, 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(line.label.toUpperCase(), blockX, lineY);

    pdfSetFont(doc, line.prominent ? 'bold' : 'normal');
    doc.setFontSize(line.prominent ? 8.5 : 7.5);
    doc.setTextColor(...TEXT_DARK);
    const wrapped = pdfSplitText(doc, pdfSafeText(line.value), blockW - 2);
    doc.text(wrapped[0], blockX, lineY + 3.6);
    lineY += line.prominent ? 9.5 : wrapped.length > 1 ? 10.5 : 8.5;
    if (wrapped.length > 1) {
      pdfSetFont(doc, 'normal');
      doc.setFontSize(7);
      doc.text(wrapped.slice(1, 3).join(' '), blockX, lineY - 3);
      lineY += 3.5;
    }
  });

  touchPdfContentPage(doc);
  return Math.max(topY + logoH, lineY + 2) + 6;
}

function drawTitleBar(doc, y, title) {
  pdfSetFont(doc, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  const lines = pdfSplitText(doc, title, CONTENT_W);
  doc.text(lines, MARGIN, y + 4);
  const textH = lines.length * 4.5;
  y += textH + 3;
  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  touchPdfContentPage(doc);
  return y + 7;
}

function drawMetadataGrid(doc, y, meta, options = {}) {
  const cols = options.omitClient
    ? [[{ label: 'Data / Hora', value: meta.dateTime }], [{ label: 'Nome do Técnico', value: meta.technician }]]
    : [
        [
          { label: 'Data / Hora', value: meta.dateTime },
          { label: 'Nome do Técnico', value: meta.technician },
        ],
        [{ label: 'Empresa Cliente', value: meta.client }],
      ];

  const colW = CONTENT_W / 2;
  const rowH = 16;
  let maxY = y;

  cols.forEach((fields, colIndex) => {
    const x = MARGIN + colIndex * colW;
    let cellY = y;

    fields.forEach((field) => {
      const sub = field.sub || (field.label === 'Empresa Cliente' ? meta.clientSub : '');
      const valLines = pdfSplitText(doc,String(field.value), colW - 8);
      const subLines = sub ? pdfSplitText(doc,String(sub), colW - 8) : [];
      const cellH = Math.max(rowH, 12 + valLines.length * 3.8 + subLines.length * 3.2);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(x + 1, cellY, colW - 2, cellH - 2, 1, 1, 'FD');

      pdfSetFont(doc, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(field.label.toUpperCase(), x + 4, cellY + 5);

      pdfSetFont(doc, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT_DARK);
      doc.text(valLines.slice(0, 2), x + 4, cellY + 10);

      if (subLines.length) {
        pdfSetFont(doc, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(subLines.slice(0, 2), x + 4, cellY + 10 + valLines.length * 3.6);
      }

      cellY += cellH;
      maxY = Math.max(maxY, cellY);
    });
  });

  touchPdfContentPage(doc);
  return maxY + 4;
}

function drawDivider(doc, y) {
  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 7;
}

function drawSectionTitle(doc, y, title, options = {}) {
  if (!options.skipEnsure) {
    y = ensureSpace(doc, y, 12);
  }
  pdfSetFont(doc, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(title.toUpperCase(), MARGIN, y);
  touchPdfContentPage(doc);
  return y + 6;
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
  const isDl50 = service?.id === 'inspecao_dl50_2005';

  (service?.fields || []).forEach((field) => {
    if (isMachineTrackingField(field)) {
      const keepForDl50 = isDl50 && INSPECAO_DL50_MACHINE_FIELD_IDS.has(field.id);
      if (!keepForDl50) {
        delete values[field.id];
        return;
      }
    }
    if (values[field.id] === undefined) return;
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

  y = drawSectionTitle(doc, y, 'Conteúdo do Relatório');
  y = drawDivider(doc, y - 4);

  const isDl50 = service.id === 'inspecao_dl50_2005';

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
  }

  let currentSection = null;

  for (const field of service.fields) {
    if (isDl50 && INSPECAO_DL50_PDF_SKIP_FIELD_IDS.has(field.id)) continue;
    if (!isDl50 && isMachineTrackingField(field)) continue;
    if (field.dependency && !isPdfDependencyMet(field, values)) continue;

    if (field.id === 'deslocacao') {
      y = ensureSpace(doc, y, 14);
      const desloc = formatPdfDeslocacao(values.deslocacao, { ...pdfContext, values });
      y = drawKeyValueLine(doc, y, field.label, desloc, field.type);
      continue;
    }

    const value = coercePdfFieldValue(field, values[field.id], pdfContext);
    if (isPdfEmptyValue(field, value)) continue;

    if (field.section && field.section !== currentSection) {
      currentSection = field.section;
      y = ensureSpace(doc, y, 10);
      y = drawSectionTitle(doc, y, currentSection);
      y = drawDivider(doc, y - 4);
    }

    y = ensureSpace(doc, y, 14);

    if (field.type === 'verification_toggles' && value && typeof value === 'object') {
      const sectionRendered = Boolean(field.section && field.section === currentSection);
      const blockTitle = pdfBlockTitle(field, sectionRendered);
      y = drawVerificationBlock(doc, y, blockTitle, field.items || [], value);
      continue;
    }

    if (field.type === 'dynamic_table' && Array.isArray(value)) {
      const sectionRendered = Boolean(field.section && field.section === currentSection);
      y = drawDynamicTableBlock(
        doc,
        y,
        pdfBlockTitle(field, sectionRendered),
        field.columns || [],
        value,
      );
      continue;
    }

    if (field.type === 'grandes_identificacao_baterias' && Array.isArray(value)) {
      const sectionRendered = Boolean(field.section && field.section === currentSection);
      y = drawDynamicTableBlock(
        doc,
        y,
        pdfBlockTitle(field, sectionRendered),
        getColumnLabels(),
        value,
      );
      continue;
    }

    if (field.type === 'multi_checkbox' && Array.isArray(value)) {
      const sectionRendered = Boolean(field.section && field.section === currentSection);
      y = drawMultiCheckboxBlock(doc, y, pdfBlockTitle(field, sectionRendered), value);
      continue;
    }

    if (field.type === 'status_pills') {
      y = drawKeyValueLine(doc, y, field.label, value, 'status_pills');
      continue;
    }

    if (field.type === 'toggle_component') {
      y = drawKeyValueLine(doc, y, field.label, value, 'toggle_component');
      continue;
    }

    if (field.type === 'matrix_4options' && value && typeof value === 'object') {
      y = await drawMatrixInspectionBlock(doc, y, field, value);
      continue;
    }

    if (field.type === 'legal_verdict') {
      y = drawLegalVerdictBlock(doc, y, field.label, value);
      continue;
    }

    if (field.type === 'longtext' || field.type === 'textarea' || field.type === 'grid') {
      if (field.prominent) {
        const sectionRendered = Boolean(field.section && field.section === currentSection);
        y = drawDiagnosticAnalysisBlock(
          doc,
          y,
          field.label,
          sectionRendered ? null : field.section,
          value,
        );
      } else {
        y = drawLongTextBlock(doc, y, field.label, value);
      }
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
  return PAGE_H - PDF_FOOTER_RESERVE_MM - 2;
}

function ensureBlockFitsPage(doc, y, blockHeight, minOrphan = 22) {
  const remaining = pdfContentBottomY() - y;
  if (blockHeight <= remaining) return y;
  if (remaining < Math.min(blockHeight, minOrphan)) {
    doc.addPage();
    touchPdfContentPage(doc);
    return MARGIN + 8;
  }
  return y;
}

function matrixDisplayState(opt) {
  if (!opt) return '—';
  return opt === 'N.A.' ? 'NA' : opt;
}

const MATRIX_TABLE_HEAD_FILL = [241, 245, 249];
const MATRIX_TABLE_LINE = [226, 232, 240];

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

  y = ensureSpace(doc, y, 16);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text((field.label || 'Pontos de Inspeção').toUpperCase(), MARGIN, y);
  y += 7;

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
    doc.setFontSize(8);
    doc.setTextColor(...CORPORATE_BLUE_DARK);
    doc.text(cat.name.toUpperCase(), MARGIN, y);
    y += MATRIX_CAT_TITLE_H;

    pdfSetFont(doc, 'normal');
    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [['Ponto de Inspeção', 'Estado']],
      body,
      theme: 'plain',
      styles: {
        font: pdfAutoTableFont(doc),
        fontSize: 7,
        cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
        lineColor: MATRIX_TABLE_LINE,
        lineWidth: 0.12,
        textColor: TEXT_DARK,
        fontStyle: 'normal',
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        font: pdfAutoTableFont(doc),
        fillColor: MATRIX_TABLE_HEAD_FILL,
        textColor: CORPORATE_BLUE_DARK,
        fontStyle: 'bold',
        fontSize: 7.5,
        lineColor: MATRIX_TABLE_LINE,
        lineWidth: 0.12,
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: MATRIX_POINT_COL_W },
        1: {
          cellWidth: MATRIX_STATE_COL_W,
          halign: 'center',
          font: pdfAutoTableFont(doc),
          fontStyle: 'bold',
          fontSize: 7.5,
        },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const opt = rowOpts[data.row.index];
          data.cell.styles.textColor = matrixPdfRgb(opt);
        }
      },
    });

    y = doc.lastAutoTable.finalY + MATRIX_CAT_GAP;
    touchPdfContentPage(doc);
  });

  return y + 4;
}

function collectMatrixPhotoHints(matrixValue, service) {
  const field = service?.fields?.find((f) => f.type === 'matrix_4options');
  if (!field || !matrixValue || typeof matrixValue !== 'object') return [];

  const hints = [];
  (field.categories || []).forEach((cat) => {
    const catKey = columnKey(cat.name);
    cat.items.forEach((item) => {
      const opt = matrixValue[catKey]?.[columnKey(item)];
      if (opt === 'D' || opt === 'N') {
        hints.push(`${cat.name}: ${item}`);
      }
    });
  });
  return hints;
}

function buildFotoRegistoLegenda(service, values) {
  if (service?.id === 'inspecao_dl50_2005') {
    const hints = collectMatrixPhotoHints(values.pontos_inspecao, service);
    if (hints.length) return hints.slice(0, 2).join(' · ');
    return 'Registo visual da inspeção DL 50/2005';
  }

  const detecao = pdfSafeText(values.detecao_de_avaria || values.detecao_avaria || '');
  if (detecao) return detecao.length > 90 ? `${detecao.slice(0, 87)}…` : detecao;

  const resolucao = pdfSafeText(values.resolucao_da_avaria || '');
  if (resolucao) return resolucao.length > 90 ? `${resolucao.slice(0, 87)}…` : resolucao;

  return pdfSafeText(service?.label || 'Intervenção técnica');
}

function drawLegalVerdictBlock(doc, y, label, value, opts = {}) {
  const gapAfter = opts.gapAfter ?? 8;
  const titleGap = opts.titleGap ?? 6;
  const minBoxH = opts.minBoxH ?? 14;
  const lineFactor = opts.lineFactor ?? 4.5;

  if (!opts.skipEnsure) {
    y = ensureSpace(doc, y, 22);
  }
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

  const lines = pdfSplitText(doc, value, CONTENT_W - 10);
  const boxH = Math.max(minBoxH, lines.length * lineFactor + 6);

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

const DL50_CLOSING_PROFILES = [
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

function estimatePolaroidSectionHeight(hasFotos, profile) {
  if (!hasFotos) return 0;
  const headerH = profile.sectionHeader ? 17 : 0;
  return headerH + profile.descH + profile.polaroidMm + 6 + profile.polaroidBottom;
}

function estimateSignaturesHeight(profile) {
  return profile.sigTop + profile.sigImg + 12;
}

function planDl50ClosingProfile(doc, y, opts) {
  const bottom = pdfContentBottomY();
  const available = bottom - y;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());

  for (const profile of DL50_CLOSING_PROFILES) {
    const total =
      (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
      estimatePolaroidSectionHeight(hasFotos, profile) +
      estimateSignaturesHeight(profile);
    if (total <= available) return profile;
  }

  return DL50_CLOSING_PROFILES[DL50_CLOSING_PROFILES.length - 1];
}

async function drawDl50ClosingSection(doc, y, opts) {
  const profile = planDl50ClosingProfile(doc, y, opts);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);

  if (hasLegal) {
    y = drawLegalVerdictBlock(doc, y, opts.legalLabel, opts.legalValue, {
      skipEnsure: true,
      gapAfter: profile.legalGap,
      titleGap: profile.legalGap <= 5 ? 5 : 6,
      minBoxH: 12,
      lineFactor: profile.legalGap <= 5 ? 4 : 4.5,
    });
  }

  if (hasFotos) {
    y = await drawAntesDepoisPolaroidSection(
      doc,
      y,
      opts.fotoAntesUrl,
      opts.fotoDepoisUrl,
      opts.fotoLegenda,
      {
        polaroidMm: profile.polaroidMm,
        descH: profile.descH,
        bottomGap: profile.polaroidBottom,
        showSectionHeader: profile.sectionHeader,
        skipEnsure: true,
      },
    );
  }

  y = await drawSignaturesFooter(doc, y, opts.signatures || {}, {
    topMargin: profile.sigTop,
    imgHeight: profile.sigImg,
    skipEnsure: true,
  });

  return y;
}

function drawMultiCheckboxBlock(doc, y, label, selected) {
  y = ensureSpace(doc, y, 14);
  if (label) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 6;
  }

  const lineH = 6;
  selected.forEach((item, idx) => {
    y = ensureSpace(doc, y, lineH + 2);
    const fill = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...fill);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_W, lineH, 'FD');

    doc.setTextColor(...SUCCESS);
    pdfSetFont(doc, 'bold');
    doc.setFontSize(8);
    doc.text(pdfStatusGlyph('ok'), MARGIN + 3, y + 4.5);

    doc.setTextColor(...TEXT_DARK);
    pdfSetFont(doc, 'normal');
    doc.text(cleanPdfText(item), MARGIN + 9, y + 4.5);

    y += lineH + 1;
  });

  touchPdfContentPage(doc);
  return y + 4;
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

function drawVerificationBlock(doc, y, label, items, states) {
  y = ensureSpace(doc, y, 16);

  if (label) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 6;
  }

  const rowH = 7;
  const okRgb = SUCCESS;
  const failRgb = DANGER;

  items.forEach((item, idx) => {
    const spec = normalizeVerifyItem(item);
    const state = states[spec.id] || 'OK';
    const isOk = state === 'OK';
    y = ensureSpace(doc, y, rowH + 2);

    const fill = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...fill);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'FD');

    pdfSetFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(spec.label, MARGIN + 3, y + 4.8);

    pdfSetFont(doc, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...(isOk ? okRgb : failRgb));
    doc.text(state, PAGE_W - MARGIN - 3, y + 4.8, { align: 'right' });

    y += rowH + 1;
  });

  touchPdfContentPage(doc);
  return y + 4;
}

function drawDynamicTableBlock(doc, y, label, columns, rows) {
  if (label) {
    y = ensureSpace(doc, y, 12);
    pdfSetFont(doc, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 6;
  }

  const colKeys = columns.map((c) => columnKey(c));
  const colCount = columns.length;
  const tableW = CONTENT_W;
  const colW = tableW / colCount;
  const headerH = 8;
  const rowH = 7;
  const tableTopY = y;

  y = ensureSpace(doc, y, headerH + 2);
  doc.setFillColor(30, 64, 115);
  doc.rect(MARGIN, y, tableW, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(7.5);
  columns.forEach((col, i) => {
    doc.text(col, MARGIN + i * colW + 2, y + 5.5);
  });
  y += headerH;

  rows.forEach((row, rowIdx) => {
    y = ensureSpace(doc, y, rowH + 1);
    const fill = rowIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...fill);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, tableW, rowH, 'FD');

    pdfSetFont(doc, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_DARK);
    colKeys.forEach((key, i) => {
      const cellVal = pdfSplitText(doc, pdfDisplayValue(row[key]), colW - 4);
      doc.text(cellVal[0] || '—', MARGIN + i * colW + 2, y + 5);
    });
    y += rowH;
  });

  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.rect(MARGIN, tableTopY, tableW, y - tableTopY);

  touchPdfContentPage(doc);
  return y + 6;
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
  y = ensureSpace(doc, y, 28);
  if (section) {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...CORPORATE_BLUE);
    doc.text(section.toUpperCase(), MARGIN, y);
    y += 6;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(30, 64, 115);
  doc.setLineWidth(0.35);

  const lines = pdfSplitText(doc,value, CONTENT_W - 12);
  const boxH = Math.max(22, lines.length * 4.6 + 14);
  y = ensureSpace(doc, y, boxH + 6);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD');

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...CORPORATE_BLUE_DARK);
  doc.text(label.toUpperCase(), MARGIN + 4, y + 6);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(lines, MARGIN + 4, y + 12, { lineHeightFactor: 1.45 });

  touchPdfContentPage(doc);
  return y + boxH + 8;
}

function drawLongTextBlock(doc, y, label, value) {
  y = ensureSpace(doc, y, 18);
  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...CORPORATE_BLUE);
  doc.text(label.toUpperCase(), MARGIN, y);
  y += 5;
  y = drawDivider(doc, y - 3);

  pdfSetFont(doc, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  const lines = pdfSplitText(doc, value, CONTENT_W);
  lines.forEach((line) => {
    y = ensureSpace(doc, y, 5);
    doc.text(line, MARGIN, y);
    y += 4.5;
  });

  touchPdfContentPage(doc);
  return y + 8;
}

const POLAROID_MM = 60;
const POLAROID_FRAME_PAD = 3;
const POLAROID_CAPTION_H = 6;
const POLAROID_DESC_H = 10;

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
    doc.setFontSize(6.2);
    doc.setTextColor(...TEXT_MUTED);
    const descLines = pdfSplitText(doc, pdfSafeText(description), outerW);
    descLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, x + outerW / 2, cursorY + 3 + i * 3.2, { align: 'center' });
    });
    cursorY += descH;
  }

  const frameY = cursorY;
  const outerH = polaroidMm + POLAROID_CAPTION_H;
  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, frameY, outerW, outerH, 1.5, 1.5, 'FD');

  const imgPad = POLAROID_FRAME_PAD;
  const imgSize = polaroidMm - imgPad * 2;
  try {
    const fmt = detectImageFormat(imgData);
    doc.addImage(imgData, fmt, x + imgPad, frameY + imgPad, imgSize, imgSize, undefined, 'FAST');
  } catch {
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('IMG', x + outerW / 2, frameY + outerW / 2, { align: 'center' });
  }

  pdfSetFont(doc, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);
  doc.text(phaseLabel, x + outerW / 2, frameY + polaroidMm + 4, { align: 'center' });
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
    y = drawSectionTitle(doc, y, 'Registo Fotográfico');
    y = drawDivider(doc, y - 4);
    if (!opts.skipEnsure) {
      y = ensureSpace(doc, y, frameStackH + 6);
    }
  }

  if (antes && depois) {
    const gap = polaroidMm <= 48 ? 8 : 10;
    const totalW = polaroidMm * 2 + gap;
    const startX = MARGIN + (CONTENT_W - totalW) / 2;
    const antesDesc = legenda ? `Antes da intervenção — ${legenda}` : 'Antes da intervenção';
    const depoisDesc = legenda ? `Depois da intervenção — ${legenda}` : 'Depois da intervenção';
    const h1 = drawPolaroidFrame(doc, startX, y, antes, 'Antes', antesDesc, frameLayout);
    const h2 = drawPolaroidFrame(doc, startX + polaroidMm + gap, y, depois, 'Depois', depoisDesc, frameLayout);
    return y + Math.max(h1, h2) + bottomGap;
  }

  const single = antes || depois;
  const phaseLabel = antes ? 'Antes' : 'Depois';
  const desc = legenda
    ? `${phaseLabel} da intervenção — ${legenda}`
    : `${phaseLabel} da intervenção`;
  const startX = MARGIN + (CONTENT_W - polaroidMm) / 2;
  const frameH = drawPolaroidFrame(doc, startX, y, single, phaseLabel, desc, frameLayout);
  return y + frameH + bottomGap;
}

async function drawPhotosAppendix(doc, y, photos) {
  if (!photos.length) return y;

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
const SIGNATURES_TOP_MARGIN_MM = 16;
const SIGNATURE_LINE_GAP_MM = 12;
const SIGNATURE_IMG_H_MM = 20;
const SIGNATURES_BLOCK_HEIGHT_MM =
  SIGNATURES_TOP_MARGIN_MM + SIGNATURE_IMG_H_MM + 14;

async function drawSignaturesFooter(doc, y, signatures, opts = {}) {
  const topMargin = opts.topMargin ?? SIGNATURES_TOP_MARGIN_MM;
  const imgHeight = opts.imgHeight ?? SIGNATURE_IMG_H_MM;
  const blockHeight = topMargin + imgHeight + 12;

  y += topMargin;
  if (!opts.skipEnsure) {
    y = ensureSpace(doc, y, blockHeight);
  }

  const lineW = (CONTENT_W - SIGNATURE_LINE_GAP_MM) / 2;
  const boxes = [
    { label: 'Assinatura do Técnico', data: signatures.technicianData },
    { label: 'Assinatura do Cliente', data: signatures.clientData },
  ];

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (lineW + SIGNATURE_LINE_GAP_MM);
    const lineY = y + imgHeight + 5;

    if (box.data) {
      try {
        doc.addImage(box.data, 'PNG', x, y, lineW, imgHeight);
      } catch {
        /* linha vazia */
      }
    }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(x, lineY, x + lineW, lineY);

    pdfSetFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(box.label, x + lineW / 2, lineY + 5, { align: 'center' });
  });

  touchPdfContentPage(doc);
  return y + blockHeight;
}

function drawPageFooter(doc, _reportId) {
  const total = doc.getNumberOfPages();
  const footerLines = buildInstitutionalFooterLines();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    const footerTop = PAGE_H - PDF_FOOTER_RESERVE_MM;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);

    pdfSetFont(doc, 'normal');
    doc.setFontSize(PDF_FOOTER_FONT_SIZE);
    doc.setTextColor(...PDF_FOOTER_TEXT_RGB);

    let textY = footerTop + 4.5;
    footerLines.forEach((line) => {
      const wrapped = pdfSplitText(doc, line, CONTENT_W - 8);
      wrapped.forEach((part) => {
        doc.text(part, PAGE_W / 2, textY, { align: 'center' });
        textY += 3.4;
      });
    });

    doc.setFontSize(7);
    doc.text(`Pág. ${i} / ${total}`, PAGE_W / 2, PAGE_H - 5, { align: 'center' });
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

function pdfNormalizeHeading(text) {
  return String(text || '')
    .trim()
    .toLocaleLowerCase('pt-PT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Título de bloco/tabela — evita repetir o cabeçalho de secção já desenhado */
function pdfBlockTitle(field, sectionRendered) {
  if (!sectionRendered) return field.section || field.label || null;
  if (
    field.label &&
    pdfNormalizeHeading(field.label) !== pdfNormalizeHeading(field.section)
  ) {
    return field.label;
  }
  return null;
}

function ensureSpace(doc, y, needed) {
  const bottomLimit = PAGE_H - PDF_FOOTER_RESERVE_MM - 2;
  const maxChunk = bottomLimit - (MARGIN + 8);
  const chunk = Math.max(4, Math.min(needed, maxChunk));
  if (y + chunk > bottomLimit) {
    doc.addPage();
    return MARGIN + 8;
  }
  return y;
}

function formatReportDateTime(report, job, values = {}) {
  if (report?.submittedAt) {
    const submitted = new Date(report.submittedAt);
    if (!Number.isNaN(submitted.getTime())) {
      const dateStr = submitted.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const timeStr = submitted.toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr} · ${timeStr}`;
    }
  }

  const dateKey =
    values.data_de_conclusao ||
    values.concluido_testado_em ||
    values.data_1 ||
    values.data_rececao ||
    job?.date;
  let dateStr;
  if (dateKey) {
    const iso = String(dateKey).includes('T') ? dateKey : `${dateKey}T12:00:00`;
    const d = new Date(iso);
    dateStr = !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
      : String(dateKey);
  } else {
    dateStr = new Date().toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  return `${dateStr} · —`;
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
