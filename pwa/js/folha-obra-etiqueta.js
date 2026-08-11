/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 * Impressão via iframe oculto (sem pop-ups).
 * Formato: etiqueta 62 × 58 mm — compatível com impressoras de etiquetas térmicas.
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

const PRINT_FRAME_ID = 'folha-obra-etiqueta-print-frame';

/** Largura da etiqueta (fita 62 mm). */
export const ETIQUETA_PRINT_WIDTH_MM = 62;
/** Comprimento da etiqueta no sentido vertical. */
export const ETIQUETA_PRINT_HEIGHT_MM = 58;

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
    padding: 1.4mm 2.2mm 1.6mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0;
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

function buildFolhaObraEtiquetaBody(folha) {
  const cliente = resolveClientName(folha);
  const dataEntrada = formatEtiquetaDate(folha?.dataRececao);
  const etq = resolveEtqLabel(folha);
  const fo = formatFolhaObraOrdemLabel(folha);
  const msRc = formatFolhaResponsabilidadeLabel(folha?.responsabilidade);
  const badgeClass =
    normalizeFolhaResponsabilidade(folha?.responsabilidade) === FOLHA_RESPONSABILIDADE.MS
      ? 'folha-etiqueta__badge--ms'
      : 'folha-etiqueta__badge--rc';
  const tecnico = resolveEntradaEtiqueta(folha);

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
        ${renderEquipRow('Tipo', folha?.tipo)}
        ${renderEquipRow('Marca', folha?.marcaModelo)}
        ${renderEquipRow('Série', folha?.numeroSerie)}
        ${renderEquipRow('Data', dataEntrada)}
        ${tecnico ? renderEquipRow('Técnico', tecnico) : ''}
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
      <p class="folha-etiqueta-preview-note">Formato de impressão: ${ETIQUETA_PRINT_WIDTH_MM} × ${ETIQUETA_PRINT_HEIGHT_MM} mm</p>
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
