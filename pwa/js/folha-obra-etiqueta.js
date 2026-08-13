/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 * Impressão em PDF 62 × 58 mm (fita contínua Brother QL / 62 mm).
 */

import { escapeHtml } from './html-utils.js';
import { formatDate } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { formatFolhaObraOrdemLabel, assignFolhaObraEtq } from './folhas-obra-db.js';
import {
  FOLHA_RESPONSABILIDADE,
  formatFolhaResponsabilidadeLabel,
  normalizeFolhaResponsabilidade,
} from './folha-obra-orcamento.js';
import { closeModal, openModal, showToast } from './toast-modal.js';
import { loadJsPDF } from './pdf-jspdf-loader.js';
import { ensurePdfFonts, pdfSafeText, pdfSetFont } from './pdf-font.js';

const PRINT_FRAME_ID = 'folha-obra-etiqueta-print-frame';

/** Largura da fita (Brother QL — fita contínua 62 mm). */
export const ETIQUETA_PRINT_WIDTH_MM = 62;
/** Comprimento do corte — alinhado ao tamanho 62×60 mm da Brother QL. */
export const ETIQUETA_PRINT_HEIGHT_MM = 60;

const ETIQUETA_STYLES = `
  @page {
    size: ${ETIQUETA_PRINT_WIDTH_MM}mm ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
    height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    font-family: Arial, Helvetica, sans-serif;
    background: #fff;
    color: #0f172a;
  }
  .folha-etiqueta {
    width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
    height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    padding: 1.6mm 2.2mm 1.8mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 1.2mm;
    overflow: hidden;
    border: 0.3mm solid #94a3b8;
    border-top: 1mm solid #1d4ed8;
    background: #fff;
  }
  .folha-etiqueta__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5mm;
  }
  .folha-etiqueta__brand {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #1d4ed8;
    line-height: 1.1;
  }
  .folha-etiqueta__badge {
    flex-shrink: 0;
    font-size: 8pt;
    font-weight: 800;
    line-height: 1;
    padding: 0.55mm 1.1mm;
    border-radius: 0.4mm;
  }
  .folha-etiqueta__badge--ms {
    color: #1e3a5f;
    background: #dbeafe;
    border: 0.18mm solid #93c5fd;
  }
  .folha-etiqueta__badge--rc {
    color: #7c2d12;
    background: #ffedd5;
    border: 0.18mm solid #fdba74;
  }
  .folha-etiqueta__etq-main {
    text-align: center;
    padding: 0.4mm 0 0.8mm;
  }
  .folha-etiqueta__etq {
    font-size: 20pt;
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: 0.02em;
    color: #0f172a;
  }
  .folha-etiqueta__fo {
    font-size: 8pt;
    color: #475569;
    font-weight: 700;
    line-height: 1.1;
    margin-top: 0.3mm;
  }
  .folha-etiqueta__cliente {
    border-top: 0.25mm solid #cbd5e1;
    border-bottom: 0.25mm solid #cbd5e1;
    padding: 1mm 0;
    background: transparent;
  }
  .folha-etiqueta__cliente-label {
    display: block;
    font-size: 5.8pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #1d4ed8;
    line-height: 1;
    margin-bottom: 0.35mm;
  }
  .folha-etiqueta__cliente-name {
    display: block;
    font-size: 12pt;
    font-weight: 800;
    line-height: 1.1;
    max-height: 7mm;
    overflow: hidden;
    word-break: break-word;
    color: #0f172a;
  }
  .folha-etiqueta__equip {
    display: flex;
    flex-direction: column;
    gap: 0.55mm;
    padding: 1.1mm 0 0;
    flex: 0 0 auto;
  }
  .folha-etiqueta__row {
    display: grid;
    grid-template-columns: 14mm 1fr;
    column-gap: 1.2mm;
    align-items: baseline;
    min-width: 0;
  }
  .folha-etiqueta__row-label {
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    font-size: 5.6pt;
    letter-spacing: 0.03em;
    line-height: 1.15;
  }
  .folha-etiqueta__row-value {
    font-weight: 700;
    font-size: 9pt;
    color: #0f172a;
    line-height: 1.15;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  @media print {
    html, body {
      width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
      height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    }
  }
`;

function resolveClientName(folha) {
  const fromPayload = String(
    folha?.clientName || folha?.clienteNome || folha?.cliente || '',
  ).trim();
  if (fromPayload && fromPayload !== '—') return fromPayload;
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return String(client?.Nome || client?.name || client?.nome || '').trim() || '—';
}

function resolveEtqLabel(folha) {
  return assignFolhaObraEtq(folha) || formatFolhaObraOrdemLabel(folha);
}

/** Técnico de entrada — responsável pelo registo no armazém. */
export function resolveEntradaEtiqueta(folha) {
  return String(folha?.responsavel || '').trim();
}

/** @deprecated Usar resolveEntradaEtiqueta */
export function resolveTecnicoReparacaoEtiqueta(folha) {
  return resolveEntradaEtiqueta(folha);
}

/** Linhas de pessoas para a etiqueta (M.S / R.C). */
export function buildEtiquetaPeopleLines(folha) {
  const entrada = resolveEntradaEtiqueta(folha);
  const lines = [];

  if (entrada) {
    lines.push({ label: 'Entrada', value: entrada });
  }

  return lines;
}

export function validateFolhaObraEtiqueta(folha) {
  if (!folha?.clientId) throw new Error('Selecione o cliente antes de imprimir a etiqueta.');
  if (!folha?.tipo?.trim()) throw new Error('Indique o tipo de equipamento.');
  if (!folha?.marcaModelo?.trim()) throw new Error('Indique a marca/modelo.');
  if (!folha?.dataRececao) throw new Error('Indique a data de entrada.');
}

function renderEquipRow(label, value) {
  return `
    <div class="folha-etiqueta__row">
      <span class="folha-etiqueta__row-label">${escapeHtml(label)}</span>
      <span class="folha-etiqueta__row-value">${escapeHtml(value || '—')}</span>
    </div>
  `;
}

function formatEtiquetaDate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const day = s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
  const [y, m, d] = day.split('-');
  if (!y || !m || !d) return formatDate(iso);
  return `${d}/${m}/${y}`;
}

function buildEtiquetaContent(folha) {
  const cliente = resolveClientName(folha);
  const dataEntrada = formatEtiquetaDate(folha?.dataRececao);
  const etq = resolveEtqLabel(folha);
  const fo = formatFolhaObraOrdemLabel(folha);
  const msRc = formatFolhaResponsabilidadeLabel(folha?.responsabilidade);
  const isMs =
    normalizeFolhaResponsabilidade(folha?.responsabilidade) === FOLHA_RESPONSABILIDADE.MS;
  const tecnico = resolveEntradaEtiqueta(folha);
  const rows = [
    ['Tipo', folha?.tipo || '—'],
    ['Marca', folha?.marcaModelo || '—'],
    ['Série', folha?.numeroSerie || '—'],
    ['Data', dataEntrada],
  ];
  if (tecnico) rows.push(['Técnico', tecnico]);
  return { cliente, etq, fo, msRc, isMs, rows };
}

function buildFolhaObraEtiquetaBody(folha) {
  const { cliente, etq, fo, msRc, isMs, rows } = buildEtiquetaContent(folha);
  const badgeClass = isMs ? 'folha-etiqueta__badge--ms' : 'folha-etiqueta__badge--rc';

  return `
    <div class="folha-etiqueta">
      <div>
        <div class="folha-etiqueta__head">
          <div class="folha-etiqueta__brand">Manusilva</div>
          <span class="folha-etiqueta__badge ${badgeClass}">${escapeHtml(msRc)}</span>
        </div>
        <div class="folha-etiqueta__etq-main">
          <div class="folha-etiqueta__etq">${escapeHtml(etq)}</div>
          ${fo && fo !== '—' && fo !== etq ? `<div class="folha-etiqueta__fo">${escapeHtml(fo)}</div>` : ''}
        </div>
      </div>
      <div class="folha-etiqueta__cliente">
        <span class="folha-etiqueta__cliente-label">Cliente</span>
        <span class="folha-etiqueta__cliente-name">${escapeHtml(cliente)}</span>
      </div>
      <div class="folha-etiqueta__equip">
        ${rows.map(([label, value]) => renderEquipRow(label, value)).join('')}
      </div>
    </div>
  `;
}

export function buildFolhaObraEtiquetaHtml(folha) {
  const etq = resolveEtqLabel(folha);
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Etiqueta ${escapeHtml(etq)}</title>
  <style>${ETIQUETA_STYLES}</style>
</head>
<body>
  ${buildFolhaObraEtiquetaBody(folha)}
</body>
</html>`;
}

export function buildFolhaObraEtiquetaPreviewHtml(folha) {
  return `
    <div class="folha-etiqueta-preview-wrap">
      <style>
        .folha-etiqueta-preview-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.5rem 0 1rem;
        }
        .folha-etiqueta-preview-wrap .folha-etiqueta {
          transform-origin: top center;
          transform: scale(2.1);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
          border: 0.35mm solid #94a3b8;
          border-radius: 1mm;
        }
        ${ETIQUETA_STYLES}
      </style>
      ${buildFolhaObraEtiquetaBody(folha)}
      <p class="folha-etiqueta-preview-note">
        Fita contínua 62 mm · página ${ETIQUETA_PRINT_WIDTH_MM} × ${ETIQUETA_PRINT_HEIGHT_MM} mm
        <br>Na Brother QL escolha «62 mm Fita contínua» (não 29×90).
      </p>
    </div>
  `;
}

/**
 * PDF com página exacta 62×60 mm — tamanho da fita contínua Brother QL.
 */
export async function generateFolhaObraEtiquetaPDFBlob(folha) {
  validateFolhaObraEtiqueta(folha);
  const { cliente, etq, fo, msRc, isMs, rows } = buildEtiquetaContent(folha);
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({
    unit: 'mm',
    format: [ETIQUETA_PRINT_WIDTH_MM, ETIQUETA_PRINT_HEIGHT_MM],
    orientation: 'portrait',
  });
  await ensurePdfFonts(doc);

  const padX = 2.4;
  const padTop = 2.8;
  const padBottom = 2.4;
  const contentW = ETIQUETA_PRINT_WIDTH_MM - padX * 2;
  const usableH = ETIQUETA_PRINT_HEIGHT_MM - padTop - padBottom;

  // Blocos: cabeçalho ETQ, cliente, linhas de equipamento
  const hasFo = Boolean(fo && fo !== '—' && fo !== etq);
  const clientLines = doc.splitTextToSize(pdfSafeText(cliente), contentW).slice(0, 2);
  const headH = 3.2 + 5.2 + (hasFo ? 3.2 : 0.8);
  const clientH = 2.2 + 3.2 + clientLines.length * 3.8 + 1.4;
  const rowH = 4.2;
  const equipH = rows.length * rowH;
  const contentH = headH + clientH + equipH;
  const free = Math.max(0, usableH - contentH);
  const gapAfterHead = free * 0.35;
  const gapAfterClient = free * 0.35;
  const gapBetweenRows = rows.length > 1 ? (free * 0.3) / (rows.length - 1) : 0;

  let y = padTop;

  doc.setDrawColor(29, 78, 216);
  doc.setLineWidth(0.7);
  doc.line(0, 0.6, ETIQUETA_PRINT_WIDTH_MM, 0.6);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(29, 78, 216);
  doc.text(pdfSafeText('MANUSILVA'), padX, y + 1.6);

  const badgeW = 9;
  const badgeH = 3.4;
  const badgeX = ETIQUETA_PRINT_WIDTH_MM - padX - badgeW;
  if (isMs) {
    doc.setFillColor(219, 234, 254);
    doc.setDrawColor(147, 197, 253);
    doc.setTextColor(30, 58, 95);
  } else {
    doc.setFillColor(255, 237, 213);
    doc.setDrawColor(253, 186, 116);
    doc.setTextColor(124, 45, 18);
  }
  doc.setLineWidth(0.18);
  doc.roundedRect(badgeX, y, badgeW, badgeH, 0.4, 0.4, 'FD');
  doc.setFontSize(8);
  doc.text(pdfSafeText(msRc), badgeX + badgeW / 2, y + 2.35, { align: 'center' });

  y += 5.4;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  pdfSetFont(doc, 'bold');
  doc.text(pdfSafeText(etq), ETIQUETA_PRINT_WIDTH_MM / 2, y, { align: 'center' });
  y += 3.8;
  if (hasFo) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(pdfSafeText(fo), ETIQUETA_PRINT_WIDTH_MM / 2, y, { align: 'center' });
    y += 2.8;
  } else {
    y += 0.6;
  }

  y += gapAfterHead;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(padX, y, ETIQUETA_PRINT_WIDTH_MM - padX, y);
  y += 2.4;
  doc.setFontSize(5.8);
  doc.setTextColor(29, 78, 216);
  pdfSetFont(doc, 'bold');
  doc.text(pdfSafeText('CLIENTE'), padX, y);
  y += 3.4;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(clientLines, padX, y);
  y += clientLines.length * 3.8 + 1.2;

  y += gapAfterClient;
  doc.setDrawColor(203, 213, 225);
  doc.line(padX, y, ETIQUETA_PRINT_WIDTH_MM - padX, y);
  y += 3.2;

  const labelW = 15;
  rows.forEach(([label, value], index) => {
    pdfSetFont(doc, 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafeText(String(label).toUpperCase()), padX, y);
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const valueText = doc.splitTextToSize(pdfSafeText(value || '—'), contentW - labelW)[0] || '—';
    doc.text(valueText, padX + labelW, y);
    y += rowH;
    if (index < rows.length - 1) y += gapBetweenRows;
  });

  const blob = doc.output('blob');
  return {
    blob,
    blobUrl: URL.createObjectURL(blob),
    filename: `etiqueta-${etq || 'folha'}.pdf`,
  };
}

/** Criar iframe de impressão no clique — antes de operações async. */
export function prepareFolhaObraEtiquetaPrint() {
  let frame = document.getElementById(PRINT_FRAME_ID);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = PRINT_FRAME_ID;
    frame.setAttribute('title', 'Impressão de etiqueta');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(frame);
  }
  return frame;
}

function printPdfBlobUrl(blobUrl) {
  return new Promise((resolve, reject) => {
    const frame = prepareFolhaObraEtiquetaPrint();
    const win = frame.contentWindow;
    if (!win) {
      reject(new Error('Não foi possível preparar a impressão da etiqueta.'));
      return;
    }

    const cleanup = () => {
      frame.onload = null;
    };

    const doPrint = () => {
      cleanup();
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 350);
    };

    frame.onload = doPrint;
    frame.src = blobUrl;
  });
}

export async function printFolhaObraEtiqueta(folha) {
  validateFolhaObraEtiqueta(folha);
  const { blobUrl } = await generateFolhaObraEtiquetaPDFBlob(folha);
  try {
    await printPdfBlobUrl(blobUrl);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

export function openFolhaObraEtiquetaPreview(folha) {
  validateFolhaObraEtiqueta(folha);
  const etq = resolveEtqLabel(folha);
  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Fechar</button>
    <button type="button" class="btn-primary" id="folha-etiqueta-print-btn">Imprimir etiqueta</button>
  `;
  const overlay = openModal(`Etiqueta ${escapeHtml(etq)}`, buildFolhaObraEtiquetaPreviewHtml(folha), actions);
  overlay.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
  overlay.querySelector('.modal-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#folha-etiqueta-print-btn')?.addEventListener('click', () => {
    printFolhaObraEtiqueta(folha)
      .then(() => showToast('Etiqueta enviada para impressão.', 'success', 4000, { force: true }))
      .catch((err) => showToast(err?.message || 'Não foi possível imprimir.', 'error', 6000, { force: true }));
  });
  return overlay;
}
