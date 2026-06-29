/**
 * Fase 3e — remove blocos extraídos de pdf-report.js (uso único).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(__dirname, '../pwa/js/pdf-report.js');

const REMOVE_NAMES = new Set([
  'buildConclusionAwareServiceInfoMeta',
  'buildCorretivaServiceInfoMeta',
  'buildRavServiceInfoMeta',
  'buildGrandesServiceInfoMeta',
  'buildEmpilhadoresServiceInfoMeta',
  'buildFolhaAvariasServiceInfoMeta',
  'estimatePdfInterventionFotosOverhead',
  'resolveAdaptiveClosingPhotoHeight',
  'getReportFilename',
  'resolveEmpilhadoresPdfMachineIndex',
  'withEmpilhadoresPdfMeta',
  'yieldToMain',
  'drawPdfDocumentTitleBar',
  'drawPdfSectionTitleBar',
  'drawPdfContentBox',
  'buildFolhaInstitutionalFooterLines',
  'drawFolhaInstitutionalPageFooter',
  'drawFolhaDocumentFooters',
  'estimateInterventionFotografiasHeight',
  'formatTableHeaderLabel',
  'columnPdfWeight',
  'buildSmartColumnStyles',
  'buildInstitutionalFooterLines',
  'drawColumnSectionTitle',
  'pdfContentBottomY',
  'getPdfAutoTableMargin',
  'normalizeYAfterAutoTable',
  'clampYToSafeZone',
  'ensureBlockFitsSafeZone',
  'pdfMaxContentHeight',
  'ensureKeepTogetherBlock',
  'ensureBlockFitsPage',
  'estimatePolaroidSectionHeight',
  'estimateSignaturesHeight',
  'drawSignaturesFooter',
  'drawInstitutionalPageFooter',
  'buildPdfAutoTableDidDrawPage',
  'drawPageFooter',
  'touchPdfContentPage',
  'trimTrailingBlankPages',
  'ensureSpace',
]);

const IMPORT_BLOCK = `import {
  pdfContentBottomY,
  getPdfAutoTableMargin,
  normalizeYAfterAutoTable,
  clampYToSafeZone,
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
  drawColumnSectionTitle,
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
  buildInstitutionalFooterLines,
  buildFolhaInstitutionalFooterLines,
  drawInstitutionalPageFooter,
  drawFolhaInstitutionalPageFooter,
  drawFolhaDocumentFooters,
  drawPageFooter,
} from './pdf-institutional-footer.js';
import {
  estimatePdfInterventionFotosOverhead,
  estimateInterventionFotografiasHeight,
  estimatePolaroidSectionHeight,
  estimateSignaturesHeight,
  resolveAdaptiveClosingPhotoHeight,
} from './pdf-closing-estimates.js';
import { formatTableHeaderLabel, buildSmartColumnStyles } from './pdf-table-column-utils.js';
import { drawSignaturesFooter } from './pdf-signatures-footer.js';
`;

function findFunctionStart(src, name) {
  const re = new RegExp(`^(async )?function ${name}\\(`, 'm');
  const match = re.exec(src);
  return match ? match.index : -1;
}

function removeBalancedBlock(src, startIndex) {
  const open = src.indexOf('{', startIndex);
  if (open === -1) return src;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        let end = i + 1;
        while (end < src.length && /\s/.test(src[end])) end += 1;
        if (src[end] === '\n') end += 1;
        return src.slice(0, startIndex) + src.slice(end);
      }
    }
  }
  throw new Error(`Unbalanced braces for block at ${startIndex}`);
}

function removeConstBlock(src, name) {
  const re = new RegExp(`^const ${name}\\s*=`, 'm');
  const match = re.exec(src);
  if (match === null) return src;
  const start = match.index;
  const semi = src.indexOf(';', start);
  if (semi === -1) throw new Error(`No semicolon for const ${name}`);
  let end = semi + 1;
  if (src[end] === '\n') end += 1;
  return src.slice(0, start) + src.slice(end);
}

let src = fs.readFileSync(reportPath, 'utf8');

if (!src.includes("from './pdf-page-layout.js'")) {
  const anchor = "import { resolvePdfClientMeta, buildPdfRenderContext } from './pdf-client-meta.js';";
  if (!src.includes(anchor)) {
    throw new Error('Import anchor not found');
  }
  src = src.replace(anchor, `${anchor}\n${IMPORT_BLOCK}`);
}

for (const name of REMOVE_NAMES) {
  while (true) {
    const idx = findFunctionStart(src, name);
    if (idx === -1) break;
    src = removeBalancedBlock(src, idx);
  }
}

for (const name of ['TABLE_HEADER_SHORT', 'PDF_FOOTER_FONT_SIZE']) {
  src = removeConstBlock(src, name);
}

// columnKey alias só era usado por TABLE_HEADER_SHORT
src = src.replace(/^const columnKey = materialColumnKey;\n\n/m, '');

// Constantes de assinaturas movidas para pdf-signatures-footer.js
for (const name of [
  'SIGNATURES_TOP_MARGIN_MM',
  'SIGNATURE_LINE_GAP_MM',
  'SIGNATURE_IMG_H_MM',
  'SIGNATURE_LABEL_GAP_MM',
  'SIGNATURES_BLOCK_HEIGHT_MM',
]) {
  src = removeConstBlock(src, name);
}

// Folha footer RGB/font — agora em pdf-institutional-footer.js
for (const name of ['FOLHA_INSTITUTIONAL_FOOTER_RGB', 'FOLHA_INSTITUTIONAL_FOOTER_FONT']) {
  src = removeConstBlock(src, name);
}

src = src.replace(/\n{4,}/g, '\n\n\n');

fs.writeFileSync(reportPath, src);
console.log('pdf-report.js patched for Fase 3e');
