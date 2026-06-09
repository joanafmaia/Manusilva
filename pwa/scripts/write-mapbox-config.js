/**
 * Gera js/mapbox-config.js a partir de MAPBOX_ACCESS_TOKEN (Vercel / CI).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = String(process.env.MAPBOX_ACCESS_TOKEN || '').trim();
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const out = path.join(root, 'mapbox-config.js');

const content = `/** Gerado automaticamente — não editar manualmente no deploy */\nexport const MAPBOX_ACCESS_TOKEN = ${JSON.stringify(token)};\n`;

fs.writeFileSync(out, content, 'utf8');

if (!token) {
  console.warn('[Mapbox] MAPBOX_ACCESS_TOKEN vazio — deslocação automática ficará indisponível.');
} else {
  console.log('[Mapbox] mapbox-config.js gerado.');
}
