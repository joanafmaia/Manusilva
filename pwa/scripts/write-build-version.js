/**
 * Gera js/build-version.js e atualiza CACHE_VERSION do service worker no deploy.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let buildId = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim().slice(0, 12);
if (!buildId) {
  try {
    buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    buildId = String(Date.now());
  }
}

const versionFile = path.join(root, 'js', 'build-version.js');
fs.writeFileSync(
  versionFile,
  `/** Gerado automaticamente no deploy — não editar */\nexport const APP_BUILD_ID = ${JSON.stringify(buildId)};\n`,
  'utf8',
);

const swPath = path.join(root, 'sw.js');
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');
  fs.writeFileSync(
    swPath,
    sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${buildId}';`),
    'utf8',
  );
}

console.log('[Build] APP_BUILD_ID =', buildId);
