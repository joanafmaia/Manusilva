/**
 * Fonte TTF e texto seguro para jsPDF (UTF-8 / português).
 * Helvetica só suporta WinAnsi — símbolos ✓● e aspas curvas geram lixo (%Ï, etc.).
 */

const FONT_REGULAR = 'Roboto-Regular.ttf';
const FONT_BOLD = 'Roboto-Bold.ttf';
const FONT_FAMILY = 'Roboto';

const UNICODE_REPLACEMENTS = {
  '\uFEFF': '',
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u200B': '',
  '\u200C': '',
  '\u200D': '',
  '\u2060': '',
  '\u2713': '[OK]',
  '\u2714': '[OK]',
  '\u2717': '[X]',
  '\u2718': '[X]',
  '\u2715': '[X]',
  '\u25CF': '-',
  '\u2022': '-',
  '\u00B7': ' ',
};

function getAssetsBaseUrl() {
  const pagePath = window.location.pathname.replace(/\\/g, '/');
  const slash = pagePath.lastIndexOf('/');
  const base = slash >= 0 ? pagePath.slice(0, slash + 1) : '/';
  return `${window.location.origin}${base}`;
}

function arrayBufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const parts = [];
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return parts.join('');
}

let fontsLoadPromise = null;
let unicodeFontsAvailable = false;

/**
 * Regista Roboto no VFS do documento (uma vez por sessão de geração).
 * @param {import('jspdf').jsPDF} doc
 */
export async function ensurePdfFonts(doc) {
  if (doc.__manusilvaPdfFonts) return FONT_FAMILY;

  if (!fontsLoadPromise) {
    fontsLoadPromise = (async () => {
      const base = getAssetsBaseUrl();
      const [regRes, boldRes] = await Promise.all([
        fetch(`${base}fonts/${FONT_REGULAR}`),
        fetch(`${base}fonts/${FONT_BOLD}`),
      ]);

      if (!regRes.ok || !boldRes.ok) {
        throw new Error(
          `Não foi possível carregar as fontes PDF (${regRes.status}/${boldRes.status}).`,
        );
      }

      const [regBuf, boldBuf] = await Promise.all([regRes.arrayBuffer(), boldRes.arrayBuffer()]);

      return {
        regular: arrayBufferToBinaryString(regBuf),
        bold: arrayBufferToBinaryString(boldBuf),
      };
    })().catch((err) => {
      fontsLoadPromise = null;
      throw err;
    });
  }

  try {
    const { regular, bold } = await fontsLoadPromise;
    if (!doc.__manusilvaPdfFonts) {
      doc.addFileToVFS(FONT_REGULAR, regular);
      doc.addFont(FONT_REGULAR, FONT_FAMILY, 'normal');
      doc.addFileToVFS(FONT_BOLD, bold);
      doc.addFont(FONT_BOLD, FONT_FAMILY, 'bold');
      doc.__manusilvaPdfFonts = true;
      unicodeFontsAvailable = true;
    }
    return FONT_FAMILY;
  } catch (err) {
    console.warn('[PDF] Fontes Roboto indisponíveis; a usar Helvetica com texto simplificado.', err);
    doc.__manusilvaPdfFonts = false;
    unicodeFontsAvailable = false;
    return null;
  }
}

/** @param {import('jspdf').jsPDF} doc @param {'normal'|'bold'|'italic'} style */
export function pdfSetFont(doc, style = 'normal') {
  if (doc.__manusilvaPdfFonts) {
    doc.setFont(FONT_FAMILY, style === 'bold' ? 'bold' : 'normal');
    return;
  }
  const helveticaStyle = style === 'bold' ? 'bold' : style === 'italic' ? 'italic' : 'normal';
  doc.setFont('helvetica', helveticaStyle);
}

/** Remove caracteres que o PDF não consegue desenhar corretamente */
export function pdfSafeText(val) {
  if (val === null || val === undefined) return '';
  let s = typeof val === 'string' ? val : String(val);
  s = s.replace(/^\uFEFF/, '').normalize('NFC');

  Object.entries(UNICODE_REPLACEMENTS).forEach(([from, to]) => {
    s = s.split(from).join(to);
  });

  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  if (!unicodeFontsAvailable) {
    s = s.replace(/[^\u0000-\u00FF]/g, '');
  }

  return s.trim();
}

/** @param {import('jspdf').jsPDF} doc */
export function pdfSplitText(doc, text, maxWidth) {
  const safe = pdfSafeText(text);
  if (!safe) return [''];
  return doc.splitTextToSize(safe, maxWidth);
}

export const PDF_SYMBOL = {
  ok: '[OK]',
  fail: '[X]',
  bullet: '-',
};
