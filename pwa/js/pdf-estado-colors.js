/**
 * Cores semânticas do estado da máquina / estado final nos PDFs.
 */

import {
  PDF_COLOR_DANGER,
  PDF_COLOR_SUCCESS,
  PDF_COLOR_TEXT_DARK,
} from './pdf-design-system.js';

export const PDF_COLOR_WARNING = [245, 158, 11];

/** Verde = OK · Amarelo = atenção · Vermelho = crítico */
export function resolvePdfEstadoTextColor(estadoText) {
  const text = String(estadoText || '').trim();
  if (!text || text === '—') return PDF_COLOR_TEXT_DARK;

  if (/inoperacional|segurança|seguranca|orçamento|orcamento|danificad/i.test(text)) {
    return PDF_COLOR_DANGER;
  }

  if (
    /apta a trabalhar|operacional|reparação concluída|reparacao concluida|^\s*normal\s*$/i.test(
      text,
    )
  ) {
    return PDF_COLOR_SUCCESS;
  }

  if (
    /aguardar|necessita atenção|necessita atencao|necessita elementos|elementos novos|necessita|baixo|alto|irregular|peças|pecas/i.test(
      text,
    )
  ) {
    return PDF_COLOR_WARNING;
  }

  return PDF_COLOR_TEXT_DARK;
}

export function extractEstadoValueFromPdfCellText(cellText) {
  const text = String(cellText || '').trim();
  const labeled = text.match(
    /estado(?:\s+da\s+m[aá]quina|\s+geral|(?:\s+em\s+que\s+ficou\s+a\s+m[aá]quina)?)?\s*:\s*(.+)$/i,
  );
  if (labeled) return labeled[1].trim();
  return text;
}

export function pdfEstadoGridDidParseCell(data) {
  if (data.section !== 'body') return;
  const raw = String(data.cell.raw ?? '');
  if (!/estado/i.test(raw)) return;
  const rgb = resolvePdfEstadoTextColor(extractEstadoValueFromPdfCellText(raw));
  data.cell.styles.textColor = rgb;
  data.cell.styles.fontStyle = 'bold';
}

export function pdfEstadoValueDidParseCell(data) {
  if (data.section !== 'body') return;
  const rgb = resolvePdfEstadoTextColor(String(data.cell.raw ?? ''));
  data.cell.styles.textColor = rgb;
  data.cell.styles.fontStyle = 'bold';
}
