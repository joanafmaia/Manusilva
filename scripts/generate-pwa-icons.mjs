/**
 * Gera ícones PWA / favicon com fundo clínico (#f7f6f3).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const py = process.platform === 'win32' ? 'python' : 'python3';
const result = spawnSync(py, [join(root, 'scripts', 'generate-pwa-icons.py')], {
  stdio: 'inherit',
  cwd: root,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
