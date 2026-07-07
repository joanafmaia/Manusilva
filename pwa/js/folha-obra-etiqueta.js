/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 * Impressão via iframe oculto (sem pop-ups).
 */

import { escapeHtml } from './html-utils.js';
import { formatDate } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { formatFolhaObraOrdemLabel, assignFolhaObraEtq } from './folhas-obra-db.js';
import { COMPANY } from './mock_data.js';
import { closeModal, openModal, showToast } from './toast-modal.js';

const PRINT_FRAME_ID = 'folha-obra-etiqueta-print-frame';

const ETIQUETA_STYLES = `
  @page { size: 100mm 50mm; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, sans-serif;
    background: #fff;
    color: #111;
  }
  .folha-etiqueta {
    width: 100mm;
    height: 50mm;
    padding: 4mm 5mm;
    border: 0.4mm solid #1e293b;
    display: flex;
    flex-direction: column;
    gap: 1.2mm;
  }
  .folha-etiqueta__brand {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #2b6cb0;
  }
  .folha-etiqueta__etq {
    font-size: 13pt;
    font-weight: 700;
    line-height: 1.1;
  }
  .folha-etiqueta__cliente {
    font-size: 10pt;
    font-weight: 600;
    line-height: 1.2;
    max-height: 12mm;
    overflow: hidden;
  }
  .folha-etiqueta__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5mm 3mm;
    font-size: 8pt;
    line-height: 1.25;
  }
  .folha-etiqueta__grid strong {
    font-weight: 600;
    color: #475569;
  }
  .folha-etiqueta__entrada {
    margin-top: auto;
    font-size: 8.5pt;
    font-weight: 600;
  }
`;

function resolveClientName(folha) {
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return client?.Nome || client?.name || '—';
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
  const etq = resolveEtqLabel(folha);

  return `
    <div class="folha-etiqueta">
      <div class="folha-etiqueta__brand">${escapeHtml(COMPANY.name || 'Manusilva')}</div>
      <div class="folha-etiqueta__etq">${escapeHtml(etq)}</div>
      <div class="folha-etiqueta__cliente">${escapeHtml(cliente)}</div>
      <div class="folha-etiqueta__grid">
        <div><strong>Tipo</strong> ${escapeHtml(folha?.tipo || '—')}</div>
        <div><strong>Série</strong> ${escapeHtml(folha?.numeroSerie || '—')}</div>
        <div style="grid-column: 1 / -1;"><strong>Marca / Modelo</strong> ${escapeHtml(folha?.marcaModelo || '—')}</div>
      </div>
      <div class="folha-etiqueta__entrada">Entrada: ${escapeHtml(entrada)}</div>
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
          transform: scale(1.35);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        }
        ${ETIQUETA_STYLES}
      </style>
      ${buildFolhaObraEtiquetaBody(folha)}
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
