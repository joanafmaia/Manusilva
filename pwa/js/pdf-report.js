/**
 * Manusilva PWA — Geração profissional de PDF (jsPDF)
 */

import {
  PDF_DOCUMENT_TITLES,
  EMPILHADORES_MATERIAL_SECTION,
} from './mock_data.js';
import { pdfAddImageContained } from './pdf-image-fit.js';
import MANUSILVA_LOGO from './logo_data.js';
import { isLogoConfigured, getPdfLogoFormat } from './brand-ui.js';
import {
  ensurePdfFonts,
  pdfAutoTableFont,
  pdfSetFont,
  pdfSafeText,
  pdfSplitText,
  pdfStatusGlyph,
} from './pdf-font.js';
import { getColumnLabels } from './views/relatorio-grandes.js';
import {
  buildEmpilhadoresPdfService,
  flattenEmpilhadoresValues,
  getEmpilhadoresMaquinasFromReport,
  isEmpilhadoresMultiMaquinaReport,
  maquinaRowLabel,
} from './views/relatorio-empilhadores-maquinas.js';
import { reportIncludesDeslocacao, SERVICES_WITH_SECTION_VISITAS, VISITAS_FIELD_ID, normalizeVisitasForService } from './deslocacao-field.js';
import {
  buildPdfAutoTableStyles,
  getBlockPdfTitle,
  getMachineSectionScalarFields,
  getMachineSectionTitle,
  mergePdfTableDidParseCell,
  PDF_COLOR_CORPORATE_BLUE as CORPORATE_BLUE,
  PDF_COLOR_DANGER as DANGER,
  PDF_COLOR_SLATE_LINE as SLATE_LINE,
  PDF_COLOR_SUCCESS as SUCCESS,
  PDF_COLOR_TEXT_DARK as TEXT_DARK,
  PDF_COLOR_TEXT_MUTED as TEXT_MUTED,
  PDF_CONTENT_W as CONTENT_W,
  PDF_FONT_BODY,
  PDF_FONT_SECTION,
  PDF_FONT_SUBTITLE,
  PDF_FONT_TABLE,
  PDF_INTERVENTION_FOTO_SLOT_FILL,
  PDF_APPENDIX_THUMB_W_MM,
  PDF_APPENDIX_THUMB_H_MM,
  PDF_APPENDIX_THUMB_GAP_MM,
  PDF_LOGO_HEIGHT_MM,
  PDF_LOGO_WIDTH_MM,
  PDF_MARGIN as MARGIN,
  PDF_MACHINE_SECTION,
  PDF_PAGE_W as PAGE_W,
  PDF_SCALAR_FIELD_TYPES,
  PDF_SECTION_BAND_HEIGHT_MM,
  PDF_SECTION_GAP_MM,
  PDF_SERVICE_INFO_MARGIN_TOP_MM,
  PDF_SERVICE_INFO_MARGIN_BOTTOM_MM,
  PDF_SERVICE_INFO_ROW_H_MM,
  PDF_BAR_RADIUS_MM,
  PDF_CONTENT_BOX_RADIUS_MM,
  PDF_SECTION_TITLE_BAR_H_MM,
  PDF_STANDARD_MACHINE_SPECS,
  PDF_CLOSING_DIAGNOSTIC_SPECS,
  PDF_LAYOUT_SKIP_FIELD_IDS,
  resolvePdfStandardFieldValue,
  PDF_CLIENT_BOX_FILL,
  PDF_TABLE_LINE,
  PDF_TABLE_LINE_WIDTH,
  isMachineInfoSection,
  pdfNormalizeHeading,
  reportHasMachineSection,
  shouldSkipPdfSectionHeader,
} from './pdf-design-system.js';
import {
  columnKey,
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
} from './inspecao-dl50-categories.js';
import { resolvePdfFotoSources } from './job-fotos.js';
import { getTechnician, getServiceType, getJob } from './entity-lookups.js';
import { loadJsPDF, loadJsPdfAutoTable } from './pdf-jspdf-loader.js';
export { loadJsPDF } from './pdf-jspdf-loader.js';
import {
  cleanPdfText,
  pdfDisplayValue,
  resolvePdfCellToken,
  formatPdfDeslocacao,
  formatPdfNumeroVisitas,
  formatPdfServiceDateOnly,
  isPdfLayoutReservedField,
} from './pdf-format-utils.js';
import { resolvePdfClientMeta, buildPdfRenderContext } from './pdf-client-meta.js';
import {
  pdfContentBottomY,
  getPdfAutoTableMargin,
  normalizeYAfterAutoTable,
  ensureBlockFitsSafeZone,
  pdfMaxContentHeight,
  ensureKeepTogetherBlock,
  ensureBlockFitsPage,
  ensureSpace,
  touchPdfContentPage,
  trimTrailingBlankPages,
  buildPdfAutoTableDidDrawPage,
} from './pdf-page-layout.js';
import {
  drawPdfDocumentTitleBar,
  drawPdfSectionTitleBar,
  drawPdfContentBox,
} from './pdf-layout-bars.js';
import {
  buildCorretivaServiceInfoMeta,
  buildRavServiceInfoMeta,
  buildGrandesServiceInfoMeta,
  buildEmpilhadoresServiceInfoMeta,
  buildFolhaAvariasServiceInfoMeta,
} from './pdf-service-info-meta.js';
import {
  getReportFilename,
  resolveEmpilhadoresPdfMachineIndex,
  withEmpilhadoresPdfMeta,
  yieldToMain,
} from './pdf-report-filename.js';
import {
  drawFolhaDocumentFooters,
  drawPageFooter,
} from './pdf-institutional-footer.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimatePolaroidSectionHeight,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { formatTableHeaderLabel, buildSmartColumnStyles } from './pdf-table-column-utils.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
import { drawPdfGridTable } from './pdf-grid-table.js';
import {
  drawFolhaAvariasTitleBar,
  drawFolhaIntervencaoAvariasBody,
  drawFolhaIntervencaoAvariasClosingSection,
  drawFolhaIntervencaoOrcamentoBlock,
} from './pdf-folha-avarias.js';
import {
  drawCarregadorTitleBar,
  drawReparacaoCarregadorTopSection,
  drawReparacaoCarregadorBody,
  drawReparacaoCarregadorClosingSection,
} from './pdf-reparacao-carregador.js';
import {
  drawCorretivaTitleBar,
  drawCorretivaMaquinasBody,
  drawCorretivaMaquinasClosingSection,
} from './pdf-corretiva-maquinas.js';
import {
  drawGrandesTitleBar,
  drawGrandesBateriasBody,
  drawGrandesBateriasClosingSection,
} from './pdf-grandes-baterias.js';
import {
  drawRavBateriaTitleBar,
  drawRavBateriaBody,
  drawRavBateriaClosingSection,
} from './pdf-rav-bateria.js';
import {
  EMPILHADORES_SERVICE_ID,
  isEmpilhadoresMaterialField,
  isEmpilhadoresMaterialSection,
  drawEmpilhadoresDualVerificationBlocks,
  drawEmpilhadoresMaterialSectionBlock,
  collectEmpilhadoresMaterialFields,
  markEmpilhadoresMaterialFieldsRendered,
  drawEmpilhadoresMachineGrid,
} from './pdf-empilhadores.js';
import {
  INSPECAO_DL50_SERVICE_ID,
  DL50_SERVICE_META_BOTTOM_MM,
  drawDl50MachineGrid,
  drawDl50DualMatrixInspectionBlock,
} from './pdf-inspecao-dl50.js';
import {
  drawPreventivaBateriaMirrorHeader,
  drawFolhaTitleBar,
  drawPreventivaBateriaBody,
  drawPreventivaBateriaClosingSection,
  drawPreventivaBateriaIntervencaoTable,
  drawEstadoFinalClosedBlock,
} from './pdf-preventiva-bateria.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import {
  drawCompactClientBox,
  drawLogoPlaceholder,
} from './pdf-header-blocks.js';
import { SERVICE_IDS } from './service-constants.js';


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

  const { withServicoSignaturesForPdf } = await import('./report-pdf-signatures.js');
  if (report?.servicoId) {
    const { ensureServicosLoadedSafe } = await import('./servicos-db.js');
    await ensureServicosLoadedSafe();
  }
  const reportForPdf = withServicoSignaturesForPdf(report);

  const service = getServiceType(reportForPdf.serviceType);
  const tech = getTechnician(reportForPdf.technicianId);
  const job = reportForPdf.jobId ? getJob(reportForPdf.jobId) : null;
  const data = reportForPdf.data || {};

  const title = sanitizePdfTitle(
    PDF_DOCUMENT_TITLES[reportForPdf.serviceType] ||
      `FOLHA DE INTERVENÇÃO — ${(service?.label || 'SERVIÇO TÉCNICO').toUpperCase()}`,
  );

  const clientMeta = await resolvePdfClientMeta(reportForPdf, normalizeReportValues(data));
  const isDl50Pdf = reportForPdf.serviceType === 'inspecao_dl50_2005';
  const isPreventivaBateriaPdf = reportForPdf.serviceType === 'manutencao_preventiva_bateria';
  const isFolhaIntervencaoAvariasPdf = reportForPdf.serviceType === 'folha_intervencao_avarias';
  const isReparacaoAvariasBateriaPdf = reportForPdf.serviceType === 'reparacao_avarias_bateria';
  const isReparacaoCarregadorPdf = reportForPdf.serviceType === 'reparacao_carregador';
  const isCorretivaMaquinasPdf = reportForPdf.serviceType === 'manutencao_corretiva_maquinas';
  const isGrandesBateriasPdf = reportForPdf.serviceType === 'manutencao_baterias_grandes';
  const isEmpilhadoresPdf = reportForPdf.serviceType === EMPILHADORES_SERVICE_ID;
  const { fotoAntesUrl, fotoDepoisUrl } = resolvePdfFotoSources(job, data);
  const techName = tech?.name || '—';

  const pdfContext = buildPdfRenderContext(report, job, clientMeta, tech);
  let pdfService = service;
  let seedValues = normalizeReportValues(data);
  if (isEmpilhadoresPdf) {
    const machineIndex = resolveEmpilhadoresPdfMachineIndex(report);
    seedValues = flattenEmpilhadoresValues(seedValues, machineIndex);
    delete seedValues.maquinas;
    pdfService = buildEmpilhadoresPdfService(service, machineIndex);
  }
  let values = mapReportValuesForPdf(data, pdfService, pdfContext, seedValues);
  values = { ...values, ...resolveInspecaoDl50MachineFields(values, pdfContext) };
  pdfContext.values = values;
  pdfContext.service = pdfService;
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
      isDl50Pdf,
  };

  let y;
  if (isPreventivaBateriaPdf) {
    y = drawPreventivaBateriaMirrorHeader(doc, clientMeta, techName, report, job, values, job?.numeroOrdem ?? null);
    y = drawFolhaTitleBar(doc, y, title);
    y = await drawGenericMachineInfoBlock(doc, y, service, values, pdfContext);
    y = await drawPreventivaBateriaBody(doc, y, values, service);
    y = await drawPreventivaBateriaClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
      fotoAntesUrl,
      fotoDepoisUrl,
    });
  } else if (isFolhaIntervencaoAvariasPdf) {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawFolhaAvariasTitleBar(doc, y, title);
    y = drawServiceInfoBlock(doc, y, {
      ...buildFolhaAvariasServiceInfoMeta(report, job, values),
      deslocacao: reportIncludesDeslocacao(service) ? values.deslocacao || '—' : null,
      technician: techName || values.tecnico || '',
    });
    y = await drawFolhaIntervencaoAvariasBody(doc, y, values, service, pdfContext);
    y = await drawFolhaIntervencaoAvariasClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
      fotoAntesUrl,
      fotoDepoisUrl,
    });
  } else if (isReparacaoAvariasBateriaPdf) {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawRavBateriaTitleBar(doc, y, title);
    y = drawServiceInfoBlock(doc, y, {
      ...buildRavServiceInfoMeta(report, job, values),
      technician: techName || values.tecnico || '',
    });
    y = await drawGenericMachineInfoBlock(doc, y, service, values, pdfContext);
    y = await drawRavBateriaBody(doc, y, service, values);
    y = await drawRavBateriaClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
      fotoAntesUrl,
      fotoDepoisUrl,
    });
  } else if (isReparacaoCarregadorPdf) {
    y = await drawReparacaoCarregadorTopSection(doc, clientMeta, techName, report, job, values);
    y = drawCarregadorTitleBar(doc, y, title);
    y = await drawReparacaoCarregadorBody(doc, y, values, service, pdfContext);
    y = await drawReparacaoCarregadorClosingSection(doc, y, {
      signatures: data.signatures || {},
      values,
      fotoAntesUrl,
      fotoDepoisUrl,
    });
  } else if (isCorretivaMaquinasPdf) {
    y = drawTopRowWithClientBlock(doc, clientMeta, job?.numeroOrdem ?? null);
    y = drawCorretivaTitleBar(doc, y, title);
    const visitCount = formatPdfNumeroVisitas(values);
    y = drawServiceInfoBlock(doc, y, {
      ...buildCorretivaServiceInfoMeta(report, job, values, visitCount),
      technician: techName || values.tecnico || '',
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
      ...buildGrandesServiceInfoMeta(report, job, values, visitCount),
      technician: techName || values.tecnico || '',
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
      ...(isEmpilhadoresPdf
        ? buildEmpilhadoresServiceInfoMeta(report, job, values, visitCount)
        : {
            serviceDate: formatPdfServiceDateOnly(report, job, values),
            numeroVisitas:
              service.id === SERVICE_IDS.MOVIMENTO_MATERIAL_CLIENTE
                ? null
                : SERVICES_WITH_SECTION_VISITAS.has(service.id)
                  ? null
                  : visitCount,
            metaBottomGapMm: isDl50Pdf ? DL50_SERVICE_META_BOTTOM_MM : null,
          }),
      deslocacao: reportIncludesDeslocacao(service) ? values.deslocacao || '—' : null,
      technician: techName || values.tecnico || '',
      periodicidade: isDl50Pdf ? values.periodicidade_inspecao || null : null,
    });
    if (reportHasMachineSection(pdfService)) {
      y = drawDivider(doc, y);
      y = await drawStandardMachineBlock(doc, y, values, pdfContext, pdfService);
    }
    if (!isEmpilhadoresPdf) {
      y = drawDivider(doc, y);
    }
    y = await drawReportFieldsSection(doc, y, pdfService, values, pdfContext);
    y = await drawReportClosingSection(doc, y, closingOpts);
  }
  if ((data.photos || []).length && !isFolhaIntervencaoAvariasPdf) {
    await drawPhotosAppendix(doc, y, data.photos || []);
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
 * Gera um PDF por máquina (preventiva empilhadores).
 * @returns {Promise<Array<{ blob: Blob, filename: string, machineIndex: number, machineLabel: string, pageCount: number }>>}
 */
export async function generateEmpilhadoresPdfBlobs(report) {
  const maquinas = getEmpilhadoresMaquinasFromReport(report);
  const count = Math.max(maquinas.length, 1);
  const results = [];

  for (let i = 0; i < count; i += 1) {
    const reportSlice = withEmpilhadoresPdfMeta(report, i);
    await yieldToMain();
    const doc = await renderInterventionPDF(reportSlice);
    await yieldToMain();
    results.push({
      blob: doc.output('blob'),
      filename: getReportFilename(reportSlice),
      machineIndex: i,
      machineLabel: maquinaRowLabel(maquinas[i] || {}, i),
      pageCount: doc.getNumberOfPages(),
    });
  }

  return results;
}

/**
 * Gera PDF como Blob para pré-visualização no browser.
 * @returns {Promise<{ blobUrl: string, blob: Blob, filename: string, pageCount: number, isMulti?: boolean, pdfs?: object[] }>}
 */
export async function generateInterventionPDFBlob(report) {
  if (isEmpilhadoresMultiMaquinaReport(report)) {
    const pdfs = await generateEmpilhadoresPdfBlobs(report);
    return {
      isMulti: true,
      pdfs: pdfs.map((entry) => ({
        ...entry,
        blobUrl: URL.createObjectURL(entry.blob),
      })),
    };
  }

  let reportForPdf = report;
  if (report?.serviceType === EMPILHADORES_SERVICE_ID) {
    reportForPdf = withEmpilhadoresPdfMeta(report, 0);
  }

  await yieldToMain();
  const doc = await renderInterventionPDF(reportForPdf);
  await yieldToMain();
  const filename = getReportFilename(reportForPdf);
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

  if (isEmpilhadoresMultiMaquinaReport(report)) {
    const { downloadEmpilhadoresPdfs } = await import('./pdf-preview.js');
    await downloadEmpilhadoresPdfs(report);
    return null;
  }

  return generateInterventionPDF(report);
}

/* ─── Layout blocks ─── */

/** Layout profissional — relatórios com cabeçalho espelho e tabelas fechadas */

const REPARACAO_AVARIAS_ESTADO_FINAL_FIELD_IDS = new Set(['observacao', 'estado_final']);

/** Caixa compacta CLIENTE (+ Ordem) — fundo #F8FAFC, bordas arredondadas finas */
function sanitizePdfTitle(title) {
  return String(title)
    .replace(/\s*[—–-]\s*MS[.:]?\s*061\s*/gi, '')
    .replace(/\s*MS[.:]?\s*061\s*/gi, '')
    .replace(/Código:\s*MS[.:]?\s*061\s*/gi, '')
    .trim();
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

function isPdfScalarField(field) {
  return Boolean(field?.type && PDF_SCALAR_FIELD_TYPES.has(field.type));
}

async function drawGenericMachineInfoBlock(doc, y, service, values, pdfContext) {
  const fields = getMachineSectionScalarFields(service);
  if (!fields.length) return y;
  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, y, getMachineSectionTitle(service), { skipEnsure: true });
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
    if (isPdfLayoutReservedField(field.id, service)) return false;
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
  return drawPdfDocumentTitleBar(doc, y, title, PDF_SECTION_GAP_MM);
}

async function drawStandardMachineBlock(doc, y, values, pdfContext = null, service = null) {
  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, y, PDF_MACHINE_SECTION, { skipEnsure: true });
  y = drawDivider(doc, y - 4);

  if (service?.id === EMPILHADORES_SERVICE_ID) {
    return drawEmpilhadoresMachineGrid(doc, y, values, pdfContext);
  }

  if (service?.id === INSPECAO_DL50_SERVICE_ID) {
    return drawDl50MachineGrid(doc, y, values, pdfContext);
  }

  const specs = PDF_STANDARD_MACHINE_SPECS;
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
  rowItems.push({
    label: meta.serviceDateLabel || 'Data do Serviço',
    value: meta.serviceDate || '—',
  });
  if (meta.scheduledDate && meta.scheduledDate !== meta.serviceDate) {
    rowItems.push({
      label: meta.scheduledDateLabel || 'Data do Serviço',
      value: meta.scheduledDate,
    });
  }
  if (meta.periodicidade != null && String(meta.periodicidade).trim()) {
    rowItems.push({ label: 'Periodicidade Inspeção', value: pdfDisplayValue(meta.periodicidade) });
  }
  if (meta.numeroVisitas != null) {
    rowItems.push({ label: 'N.º de Visitas', value: pdfDisplayValue(meta.numeroVisitas) });
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
  const blockH =
    PDF_SERVICE_INFO_MARGIN_TOP_MM + boxH + (meta.metaBottomGapMm ?? PDF_SERVICE_INFO_MARGIN_BOTTOM_MM);
  y = ensureSpace(doc, y, blockH);

  y += PDF_SERVICE_INFO_MARGIN_TOP_MM;
  const boxY = y;

  doc.setFillColor(...PDF_CLIENT_BOX_FILL);
  doc.setDrawColor(...PDF_TABLE_LINE);
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH);
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, PDF_BAR_RADIUS_MM, PDF_BAR_RADIUS_MM, 'FD');

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

  y += meta.metaBottomGapMm ?? PDF_SERVICE_INFO_MARGIN_BOTTOM_MM;
  touchPdfContentPage(doc);
  return y;
}

async function drawClosingDiagnosticBlock(doc, y, values, service = null) {
  const isEmpilhadores = service?.id === EMPILHADORES_SERVICE_ID;
  const specs = PDF_CLOSING_DIAGNOSTIC_SPECS.filter((spec) => {
    if (
      spec.id === 'horas' &&
      (SERVICES_WITH_SECTION_VISITAS.has(service?.id) || isEmpilhadores)
    ) {
      return false;
    }
    return true;
  });
  const pairs = specs.map((spec) => ({
    label: spec.label,
    value: pdfDisplayValue(resolvePdfStandardFieldValue(values, spec)),
  }));

  y = ensureSpace(doc, y, 20);
  y = drawSectionTitle(doc, y, isEmpilhadores ? 'Estado da Máquina' : 'Resumo da Intervenção', {
    skipEnsure: true,
  });
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
  return drawPdfSectionTitleBar(doc, y, title, {
    skipEnsure: options.skipEnsure,
    bandH: PDF_SECTION_BAND_HEIGHT_MM,
    gapAfter: PDF_SECTION_GAP_MM,
  });
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

  const machineKeys = [
    'marca',
    'modelo',
    'numero_de_serie',
    'num_serie',
    'n_interno',
    'horas',
    'data_fabrico',
  ];
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

  const structuredKeys = ['pontos_inspecao', 'componentes_externos', 'componentes_internos'];
  structuredKeys.forEach((key) => {
    if (values[key] !== undefined) {
      values[key] = parseJsonIfString(values[key]);
    }
  });

  if (values.maquinas !== undefined) {
    let maquinas = parseJsonIfString(values.maquinas);
    if (Array.isArray(maquinas)) {
      values.maquinas = maquinas;
    }
  }

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

  if (type === 'empilhadores_maquinas') {
    return Array.isArray(value) ? value : raw;
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
function mapReportValuesForPdf(data, service, pdfContext = null, seedValues = null) {
  const values = { ...(seedValues || normalizeReportValues(data)) };

  if (service?.id) {
    Object.assign(values, normalizeVisitasForService(service.id, values));
  }

  (service?.fields || []).forEach((field) => {
    if (field.type === 'empilhadores_maquinas') return;
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

  PDF_LAYOUT_SKIP_FIELD_IDS.forEach((id) => {
    if (isPdfLayoutReservedField(id, service)) scalarRenderedIds.add(id);
  });
  if (service.id === 'reparacao_avarias_bateria') {
    REPARACAO_AVARIAS_ESTADO_FINAL_FIELD_IDS.forEach((id) => scalarRenderedIds.add(id));
  }
  gridRenderedSections.add(getMachineSectionTitle(service));

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
    if (isDl50 && field.id === 'pedido_orcamento') {
      y = await drawFolhaIntervencaoOrcamentoBlock(doc, y, values);
      scalarRenderedIds.add('pedido_orcamento');
      scalarRenderedIds.add('detalhe_pedido_orcamento');
      continue;
    }
    if (field.dependency && !isPdfDependencyMet(field, values)) continue;

    if (isPdfLayoutReservedField(field.id, service)) {
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
    if (!value || typeof value !== 'object') return true;
    return !Object.values(value).some((entry) => String(entry ?? '').trim());
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

/** Após autoTable — força nova página se finalY invadir a zona de segurança */
/**
 * Mantém o bloco inteiro na mesma página quando couber numa página.
 * Blocos maiores que uma página podem partir no espaço restante.
 */
function estimatePdfClosingTailHeight(hasFotos, profile, opts = {}) {
  const bottomGap = opts.bottomGap ?? profile?.polaroidBottom ?? 4;
  const institutionalFooterMm = opts.institutionalFooterMm ?? 0;
  return (
    estimatePolaroidSectionHeight(hasFotos, profile, { bottomGap }) +
    estimateSignaturesHeight(profile) +
    institutionalFooterMm
  );
}

function ensurePdfClosingTailFits(doc, y, hasFotos, profile, opts = {}) {
  const tailH = estimatePdfClosingTailHeight(hasFotos, profile, opts);
  if (tailH <= 0) return y;
  return ensureKeepTogetherBlock(doc, y, Math.min(tailH, pdfMaxContentHeight()));
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

    y = drawPdfSectionTitleBar(doc, y, cat.name, {
      bandH: MATRIX_CAT_TITLE_H,
      gapAfter: 0,
      fontSize: PDF_FONT_BODY,
      skipEnsure: true,
      align: 'left',
    });

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
  const minBoxH = opts.minBoxH ?? 14;
  const lineFactor = opts.lineFactor ?? 4.5;
  const sectionGap = 0.8;

  const lines = pdfSplitText(doc, value, CONTENT_W - 10);
  const boxH = Math.max(minBoxH, lines.length * lineFactor + 6);
  const blockHeight = PDF_SECTION_TITLE_BAR_H_MM + sectionGap + boxH + gapAfter + 6;
  y = ensureBlockFitsSafeZone(doc, y, blockHeight);

  y = drawPdfSectionTitleBar(doc, y, label, {
    bandH: PDF_SECTION_TITLE_BAR_H_MM,
    gapAfter: sectionGap,
    fontSize: PDF_FONT_SECTION,
    skipEnsure: true,
    align: 'left',
  });

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
  doc.roundedRect(
    MARGIN,
    y,
    CONTENT_W,
    boxH,
    PDF_CONTENT_BOX_RADIUS_MM,
    PDF_CONTENT_BOX_RADIUS_MM,
    'FD',
  );

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...rgb);
  doc.text(lines, MARGIN + 4, y + 6, { lineHeightFactor: 1.4 });

  touchPdfContentPage(doc);
  return y + boxH + gapAfter;
}

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

function planReportClosingProfile(doc, y, opts) {
  const bottom = pdfContentBottomY();
  const available = bottom - y;
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const polaroidOpts = { simpleLegend: Boolean(opts.simplePhotoLegend) };

  const preferCompact =
    opts.service?.id === EMPILHADORES_SERVICE_ID ||
    opts.service?.id === INSPECAO_DL50_SERVICE_ID;
  const profiles = preferCompact
    ? [...REPORT_CLOSING_PROFILES].reverse()
    : REPORT_CLOSING_PROFILES;

  for (const profile of profiles) {
    const total =
      (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
      estimatePolaroidSectionHeight(hasFotos, profile, polaroidOpts) +
      estimateSignaturesHeight(profile);
    if (total <= available) return profile;
  }

  return REPORT_CLOSING_PROFILES[preferCompact ? REPORT_CLOSING_PROFILES.length - 1 : 0];
}

async function drawReportClosingSection(doc, y, opts) {
  const hasLegal = Boolean(opts.legalValue && String(opts.legalValue).trim());
  const hasFotos = Boolean(opts.fotoAntesUrl || opts.fotoDepoisUrl);
  const isEmpilhadoresClosing = opts.service?.id === EMPILHADORES_SERVICE_ID;

  let profile = planReportClosingProfile(doc, y, opts);
  const isDl50Closing = opts.service?.id === INSPECAO_DL50_SERVICE_ID;

  if (isDl50Closing) {
    const closingH =
      (hasLegal ? estimateLegalVerdictHeight(doc, opts.legalValue, profile) : 0) +
      estimateSignaturesHeight(profile);
    if (closingH > 0 && y + closingH > pdfContentBottomY()) {
      y = ensureBlockFitsSafeZone(doc, y, closingH);
      profile = planReportClosingProfile(doc, y, opts);
    }
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

  if (isEmpilhadoresClosing && opts.closingValues && !opts.skipClosingDiagnostic) {
    y = await drawClosingDiagnosticBlock(doc, y, opts.closingValues, opts.service);
  }

  if (hasFotos) {
    const bottomGap = profile.polaroidBottom ?? 4;
    if (isEmpilhadoresClosing) {
      let available = pdfContentBottomY() - y;
      let maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
      let tailH =
        estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);

      if (y + tailH > pdfContentBottomY()) {
        y = ensureBlockFitsSafeZone(doc, y, tailH);
        available = pdfContentBottomY() - y;
        maxImgH = resolveAdaptiveClosingPhotoHeight(available, profile, bottomGap);
        tailH =
          estimatePdfInterventionFotosOverhead(bottomGap) + maxImgH + estimateSignaturesHeight(profile);
        if (y + tailH > pdfContentBottomY()) {
          y = ensureBlockFitsSafeZone(doc, y, tailH);
        }
      }

      y = await drawInterventionFotografiasSection(
        doc,
        y,
        opts.fotoAntesUrl,
        opts.fotoDepoisUrl,
        {
          skipEnsure: true,
          bottomGap,
          maxImgH,
        },
      );
    } else {
      y = ensurePdfClosingTailFits(doc, y, hasFotos, profile, {
        bottomGap,
      });
      y = await drawInterventionFotografiasSection(
        doc,
        y,
        opts.fotoAntesUrl,
        opts.fotoDepoisUrl,
        {
          skipEnsure: true,
          bottomGap,
          maxImgH: profile.polaroidMm,
        },
      );
    }
  }

  if (!isEmpilhadoresClosing && opts.closingValues && !opts.skipClosingDiagnostic) {
    y = await drawClosingDiagnosticBlock(doc, y, opts.closingValues, opts.service);
  }

  if (opts.service?.id === 'reparacao_avarias_bateria' && opts.closingValues) {
    y = await drawEstadoFinalClosedBlock(doc, y, opts.closingValues, {
      observacaoLabel: 'Observação:',
    });
  }

  const sigH = estimateSignaturesHeight(profile);
  y = ensureBlockFitsSafeZone(doc, y, sigH);
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
  const contentBlockH =
    (materialEmpty ? 0 : estimateDynamicTableBlockHeight(columns, materialRows)) +
    (obsEmpty ? 0 : estimateLongTextBlockHeight(doc, obsValue));

  if (contentBlockH > 0 && contentBlockH <= 50) {
    y = ensureKeepTogetherBlock(doc, y, Math.min(contentBlockH, pdfMaxContentHeight()));
  }

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
      closingAnchor: fieldAnchorsReportClosing(pdfContext?.service, materialField),
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
    y = drawPdfSectionTitleBar(doc, y, bandTitle, { skipEnsure: true });
  }

  const lines = pdfParagraphLines(doc, value, CONTENT_W - 12);
  const textTop = innerTitle ? 14 : 8;
  const boxH = Math.max(24, lines.length * 5 + textTop + 8);
  y = ensureSpace(doc, y, boxH + 6);
  drawPdfContentBox(doc, MARGIN, y, CONTENT_W, boxH);

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
  void options;
  prepareObservationsTypography(doc);
  const allLines = [];
  pdfObservationParagraphs(doc, value, CONTENT_W - 8).forEach((lines) => {
    lines.forEach((line) => allLines.push(line));
  });

  y = drawPdfSectionTitleBar(doc, y, label, { skipEnsure: true });

  if (!allLines.length) {
    const boxH = 12;
    y = ensureSpace(doc, y, boxH + OBS_BOTTOM_PAD);
    const boxY = y;
    drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, boxH);
    prepareObservationsTypography(doc);
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    doc.text('—', MARGIN + 2.5, boxY + 4.5);
    touchPdfContentPage(doc);
    return boxY + boxH + OBS_BOTTOM_PAD;
  }

  let lineIdx = 0;
  while (lineIdx < allLines.length) {
    const maxLines = Math.max(
      1,
      Math.floor((pdfContentBottomY() - y - 6) / OBS_LINE_HEIGHT),
    );
    const chunk = allLines.slice(lineIdx, lineIdx + maxLines);
    const boxH = Math.max(12, chunk.length * OBS_LINE_HEIGHT + 5);
    y = ensureSpace(doc, y, boxH + 2);
    const boxY = y;
    drawPdfContentBox(doc, MARGIN, boxY, CONTENT_W, boxH);
    prepareObservationsTypography(doc);
    doc.setFontSize(PDF_FONT_BODY);
    doc.setTextColor(...TEXT_DARK);
    let textY = boxY + 4.5;
    chunk.forEach((line) => {
      if (line) doc.text(line, MARGIN + 2.5, textY);
      textY += line ? OBS_LINE_HEIGHT : OBS_EMPTY_LINE_HEIGHT;
    });
    y = boxY + boxH + OBS_BOTTOM_PAD;
    lineIdx += chunk.length;
  }

  touchPdfContentPage(doc);
  return y;
}


async function drawPhotosAppendix(doc, y, photos) {
  if (!photos.length) return y;

  y = ensureBlockFitsSafeZone(doc, y, 48);
  y = drawSectionTitle(doc, y, 'Anexo Fotográfico — Evidências');
  y = drawDivider(doc, y - 4);

  const thumbW = PDF_APPENDIX_THUMB_W_MM;
  const thumbH = PDF_APPENDIX_THUMB_H_MM;
  const gap = PDF_APPENDIX_THUMB_GAP_MM;
  const perRow = Math.floor((CONTENT_W + gap) / (thumbW + gap));
  let col = 0;
  let rowY = y;

  for (const photo of photos) {
    if (col === 0) rowY = ensureSpace(doc, rowY, thumbH + 14);

    const x = MARGIN + col * (thumbW + gap);

    doc.setDrawColor(...SLATE_LINE);
    doc.setLineWidth(0.3);
    doc.setFillColor(...PDF_INTERVENTION_FOTO_SLOT_FILL);
    doc.roundedRect(x, rowY, thumbW, thumbH, 1.5, 1.5, 'FD');

    const imgData = photo.dataUrl || (await createPlaceholderImage(photo.label));
    try {
      await pdfAddImageContained(doc, imgData, x, rowY, thumbW, thumbH - 5, { padding: 0.8 });
    } catch {
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('IMG', x + thumbW / 2, rowY + (thumbH - 5) / 2, { align: 'center' });
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

/** Data/hora compacta para grelha de metadados — evita quebras artificiais */
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
