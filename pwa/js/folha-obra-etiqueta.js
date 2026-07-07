/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 * Impressão via iframe oculto (sem pop-ups).
 * Formato: fita 25 mm (largura máx.) — compatível com impressoras de etiquetas.
 */

import { escapeHtml } from './html-utils.js';
import { formatDate } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { formatFolhaObraOrdemLabel, assignFolhaObraEtq } from './folhas-obra-db.js';
import { COMPANY } from './mock_data.js';
import { closeModal, openModal, showToast } from './toast-modal.js';

const PRINT_FRAME_ID = 'folha-obra-etiqueta-print-frame';

/** Largura máxima da fita (mm). */
export const ETIQUETA_PRINT_WIDTH_MM = 25;
/** Comprimento da etiqueta (mm) — bem abaixo do máximo da impressora (431,8 mm). */
export const ETIQUETA_PRINT_HEIGHT_MM = 92;

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
    font-family: "Segoe UI", Arial, sans-serif;
    background: #fff;
    color: #111;
  }
  .folha-etiqueta {
    width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
    height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    padding: 1.5mm 1.4mm;
    display: flex;
    flex-direction: column;
    gap: 0.6mm;
    overflow: hidden;
  }
  .folha-etiqueta__brand {
    font-size: 5.5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #2b6cb0;
    line-height: 1.1;
  }
  .folha-etiqueta__etq {
    font-size: 11pt;
    font-weight: 700;
    line-height: 1.05;
    margin-bottom: 0.3mm;
  }
  .folha-etiqueta__cliente {
    font-size: 7pt;
    font-weight: 600;
    line-height: 1.15;
    max-height: 14mm;
    overflow: hidden;
    word-break: break-word;
  }
  .folha-etiqueta__line {
    font-size: 6.5pt;
    line-height: 1.2;
    display: block;
    word-break: break-word;
  }
  .folha-etiqueta__line span {
    font-weight: 600;
    color: #475569;
  }
  @media print {
    html, body {
      width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
      height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    }
  }
`;

function resolveClientName(folha) {
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return client?.Nome || client?.name || '—';
}

function resolveResponsavelName(folha) {
  return String(folha?.responsavel || '').trim() || '—';
}

function resolveEtqLabel(folha) {
  return assignFolhaObraEtq(folha) || formatFolhaObraOrdemLabel(folha);
}

export function validateFolhaObraEtiqueta(folha) {
  if (!folha?.clientId) throw new Error('Selecione o cliente antes de imprimir a etiqueta.');
  if (!folha?.tipo?.trim()) throw new Error('Indique o tipo de equipamento.');
  if (!folha?.marcaModelo?.trim()) throw new Error('Indique a marca/modelo.');
  if (!folha?.dataRececao) throw new Error('Indique a data de entrada.');
}

function buildFolhaObraEtiquetaBody(folha) {
  const cliente = resolveClientName(folha);
  const entrada = folha?.dataRececao ? formatDate(folha.dataRececao) : '—';
  const responsavel = resolveResponsavelName(folha);
  const etq = resolveEtqLabel(folha);

  return `
    <div class="folha-etiqueta">
      <div class="folha-etiqueta__brand">${escapeHtml(COMPANY.name || 'Manusilva')}</div>
      <div class="folha-etiqueta__etq">${escapeHtml(etq)}</div>
      <div class="folha-etiqueta__cliente">${escapeHtml(cliente)}</div>
      <div class="folha-etiqueta__line"><span>T:</span> ${escapeHtml(folha?.tipo || '—')}</div>
      <div class="folha-etiqueta__line"><span>M:</span> ${escapeHtml(folha?.marcaModelo || '—')}</div>
      <div class="folha-etiqueta__line"><span>S:</span> ${escapeHtml(folha?.numeroSerie || '—')}</div>
      <div class="folha-etiqueta__line"><span>Ent:</span> ${escapeHtml(entrada)}</div>
      <div class="folha-etiqueta__line"><span>R:</span> ${escapeHtml(responsavel)}</div>
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
          justify-content: center;
          padding: 0.5rem 0 1rem;
        }
        .folha-etiqueta-preview-wrap .folha-etiqueta {
          transform-origin: top center;
          transform: scale(2.2);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
          border: 0.4mm solid #1e293b;
        }
        ${ETIQUETA_STYLES}
      </style>
      ${buildFolhaObraEtiquetaBody(folha)}
      <p class="folha-etiqueta-preview-note">Formato de impressão: ${ETIQUETA_PRINT_WIDTH_MM} × ${ETIQUETA_PRINT_HEIGHT_MM} mm (fita 25 mm)</p>
    </div>
  `;
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

function writeFrameAndPrint(frame, html) {
  return new Promise((resolve, reject) => {
    const win = frame.contentWindow;
    const doc = frame.contentDocument || win?.document;
    if (!win || !doc) {
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
      }, 200);
    };

    frame.onload = doPrint;
    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState === 'complete') doPrint();
  });
}

export function printFolhaObraEtiqueta(folha) {
  validateFolhaObraEtiqueta(folha);
  const html = buildFolhaObraEtiquetaHtml(folha);
  const frame = prepareFolhaObraEtiquetaPrint();
  return writeFrameAndPrint(frame, html);
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
