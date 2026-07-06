/**
 * Gera ícones PWA / favicon a partir de pwa/js/logo_data.js
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MANUSILVA_LOGO from '../pwa/js/logo_data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'pwa', 'assets', 'icons');

const match = String(MANUSILVA_LOGO).match(/^data:image\/png;base64,(.+)$/i);
if (!match) {
  throw new Error('logo_data.js não contém PNG Base64 válido.');
}

const png = Buffer.from(match[1], 'base64');
mkdirSync(outDir, { recursive: true });
const source = join(outDir, 'manusilva-icon.png');
writeFileSync(source, png);
for (const name of ['icon-192.png', 'icon-512.png', 'favicon.png']) {
  copyFileSync(source, join(outDir, name));
}

console.log(`Ícones gerados em ${outDir} (${png.length} bytes).`);
