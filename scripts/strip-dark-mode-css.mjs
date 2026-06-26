/**
 * Remove modo escuro do app.css — mantém apenas tema claro.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '../pwa/css/app.css');
let css = fs.readFileSync(cssPath, 'utf8');

function stripDarkSelectors(selector) {
  const parts = selector
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/dark-mode/i.test(s));
  return parts.join(', ');
}

function processCss(input) {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const open = input.indexOf('{', i);
    if (open === -1) {
      out += input.slice(i);
      break;
    }
    const selector = input.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < input.length && depth > 0) {
      if (input[j] === '{') depth += 1;
      else if (input[j] === '}') depth -= 1;
      j += 1;
    }
    const body = input.slice(open + 1, j - 1);
    i = j;

    if (!selector) continue;

    if (/^body\.dark-mode\s*$/.test(selector)) continue;
    if (/^body:not\(\.light-mode\):not\(\.dark-mode\)\s*$/.test(selector)) continue;
    if (/^body\.dark-mode,/.test(selector) && /body\.light-mode/.test(selector)) {
      const cleaned = stripDarkSelectors(selector);
      if (!cleaned) continue;
      out += `${normalizeSelector(cleaned)} {${body}}\n`;
      continue;
    }
    if (/dark-mode/i.test(selector) && !/light-mode/i.test(selector)) continue;
    if (/\.theme-toggle-btn/.test(selector)) continue;
    if (/login-page-wrapper.*dark-mode/.test(selector)) continue;

    const normalized = normalizeSelector(stripDarkSelectors(selector));
    if (!normalized) continue;
    out += `${normalized} {${body}}\n`;
  }
  return out;
}

function normalizeSelector(selector) {
  return selector
    .replace(/\bbody\.light-mode\b/g, 'body')
    .replace(/\bbody\.tech-dashboard-page:not\(\.dark-mode\)/g, 'body.tech-dashboard-page')
    .replace(/\bbody:not\(\.dark-mode\)/g, 'body')
    .replace(/\s+/g, ' ')
    .trim();
}

css = css.replace(
  /^\/\*[\s\S]*?Temas[\s\S]*?\*\/\s*/,
  '/* Manusilva PWA — tema claro único */\n\n',
);

css = processCss(css);

css = css.replace(
  /color-scheme:\s*var\(--color-scheme,\s*dark\);/g,
  'color-scheme: light;',
);

css = css.replace(/--theme-toggle-height:\s*[^;]+;/g, '--app-chrome-offset: 0px;');

css = css.replace(
  /top:\s*calc\(var\(--app-top-inset\)\s*\+\s*var\(--theme-toggle-height\)[^)]+\);/g,
  'top: calc(var(--app-top-inset) + 0.65rem);',
);

css = css.replace(
  /body:not\(:has\(\.theme-toggle-btn[^)]+\)\)\s*\.toast-container\s*\{[^}]+\}/g,
  '',
);

css = css.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(cssPath, css, 'utf8');
console.log('app.css atualizado — modo escuro removido');
