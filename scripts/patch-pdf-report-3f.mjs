/**
 * Fase 3f — remove blocos extraídos de pdf-report.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(__dirname, '../pwa/js/pdf-report.js');

const REMOVE_NAMES = new Set([
  'buildFolhaAutoTableConfig',
  'preventivaBateriaTableHeadStyles',
  'drawPreventivaBateriaMirrorHeader',
  'drawFolhaTitleBar',
  'resolvePreventivaBateriaAnalysisValue',
  'buildPreventivaBateriaAnalysisRows',
  'drawPreventivaBateriaClosedSectionTable',
  'drawPreventivaBateriaAnalysisTable',
  'drawPreventivaBateriaConsumiveisTable',
  'drawPreventivaBateriaIntervencaoTable',
  'drawEstadoFinalClosedBlock',
  'drawPreventivaBateriaEstadoFinalBlock',
  'drawPreventivaBateriaBody',
  'drawFolhaMaterialTable',
  'drawInterventionFotografiasSection',
  'drawPreventivaBateriaClosingSection',
  'drawCompactClientBox',
  'drawLogoPlaceholder',
  'formatOrdemDisplay',
  'compressImageForPdf',
  'blobToDataUrlForPdf',
  'loadImageViaCanvas',
  'loadImageForPdf',
  'detectImageFormat',
]);

const IMPORT_BLOCK = `import {
  drawPreventivaBateriaMirrorHeader,
  drawFolhaTitleBar,
  drawPreventivaBateriaBody,
  drawPreventivaBateriaClosingSection,
  drawPreventivaBateriaIntervencaoTable,
  drawEstadoFinalClosedBlock,
  FOLHA_CLOSING_PROFILE,
} from './pdf-preventiva-bateria.js';
import { drawInterventionFotografiasSection } from './pdf-intervention-fotos.js';
import { loadImageForPdf, detectImageFormat } from './pdf-image-loader.js';
import {
  drawCompactClientBox,
  drawLogoPlaceholder,
  formatOrdemDisplay,
} from './pdf-header-blocks.js';
import { FOLHA_INSTITUTIONAL_FOOTER_H_MM } from './pdf-institutional-footer.js';
`;

function findFunctionStart(src, name) {
  const re = new RegExp(`^(async )?function ${name}\\b`, 'm');
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
  const open = src.indexOf('{', start);
  if (open !== -1 && src.indexOf('\n', start) > open) {
    return removeBalancedBlock(src, start);
  }
  const semi = src.indexOf(';', start);
  if (semi === -1) throw new Error(`No semicolon for const ${name}`);
  let end = semi + 1;
  if (src[end] === '\n') end += 1;
  return src.slice(0, start) + src.slice(end);
}

let src = fs.readFileSync(reportPath, 'utf8');

if (!src.includes("from './pdf-preventiva-bateria.js'")) {
  const anchor = "import { drawSignaturesFooter } from './pdf-signatures-footer.js';";
  src = src.replace(anchor, `${anchor}\n${IMPORT_BLOCK}`);
}

for (const name of REMOVE_NAMES) {
  while (true) {
    const idx = findFunctionStart(src, name);
    if (idx === -1) break;
    src = removeBalancedBlock(src, idx);
  }
}

for (const name of [
  'PREVENTIVA_TITLE_BAR_BG',
  'FOLHA_TITLE_BAR_BG',
  'FOLHA_TABLE_HEAD_FILL',
  'FOLHA_INSTITUTIONAL_FOOTER_H_MM',
  'FOLHA_CLOSING_PROFILE',
  'PDF_IMAGE_MAX_PX',
  'PDF_IMAGE_JPEG_QUALITY',
]) {
  src = removeConstBlock(src, name);
}

src = src.replace(/\n{4,}/g, '\n\n\n');

fs.writeFileSync(reportPath, src);

// Verificação de sintaxe
const { execSync } = await import('node:child_process');
try {
  execSync(`node --check "${reportPath}"`, { stdio: 'pipe' });
  console.log('pdf-report.js patched for Fase 3f — syntax OK');
} catch (err) {
  console.error('SYNTAX ERROR after patch:', err.stderr?.toString() || err.message);
  process.exit(1);
}

// Verificar órfãos ") {"
const orphans = src.match(/^\) \{$/gm);
if (orphans?.length) {
  console.error(`Found ${orphans.length} orphan ") {" blocks — abort`);
  process.exit(1);
}
