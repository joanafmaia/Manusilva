/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 * Impressão via iframe oculto (sem pop-ups).
 * Formato: fita 25 mm (largura máx.) — compatível com impressoras de etiquetas.
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

/** Etiqueta vertical com mais comprimento para leitura fácil. */
export const ETIQUETA_PRINT_WIDTH_MM = 35;
/** Comprimento da etiqueta no sentido vertical. */
export const ETIQUETA_PRINT_HEIGHT_MM = 62;

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
    color: #0f172a;
  }
  .folha-etiqueta {
    width: ${ETIQUETA_PRINT_WIDTH_MM}mm;
    height: ${ETIQUETA_PRINT_HEIGHT_MM}mm;
    padding: 1.5mm 1.4mm 1.4mm;
    display: flex;
    flex-direction: column;
    gap: 1mm;
    overflow: hidden;
    border: 0.25mm solid #cbd5e1;
    border-top: 1.1mm solid #1d4ed8;
    border-radius: 0.8mm;
    background: #fff;
  }
  .folha-etiqueta__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7mm;
    min-height: 4.2mm;
  }
  .folha-etiqueta__brand {
    font-size: 4.5pt;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #2563eb;
    line-height: 1;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folha-etiqueta__badge {
    flex-shrink: 0;
    font-size: 8pt;
    font-weight: 800;
    line-height: 1;
    padding: 0.6mm 1mm;
    border-radius: 0.6mm;
    letter-spacing: 0.02em;
  }
  .folha-etiqueta__badge--ms {
    color: #1e3a5f;
    background: #dbeafe;
    border: 0.12mm solid #93c5fd;
  }
  .folha-etiqueta__badge--rc {
    color: #7c2d12;
    background: #ffedd5;
    border: 0.12mm solid #fdba74;
  }
  .folha-etiqueta__etq-wrap {
    padding: 1.4mm 0.9mm 1.1mm;
    border: 0.22mm solid #bfdbfe;
    border-radius: 0.8mm;
    background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .folha-etiqueta__etq {
    font-size: 20pt;
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: 0.05em;
    color: #0f172a;
  }
  .folha-etiqueta__fo {
    font-size: 8pt;
    color: #334155;
    font-weight: 700;
    line-height: 1.1;
    margin-top: 0.8mm;
  }
  .folha-etiqueta__cliente {
    font-size: 10.2pt;
    font-weight: 700;
    line-height: 1.1;
    max-height: 11mm;
    overflow: hidden;
    word-break: break-word;
    padding: 0.2mm 0;
    color: #0f172a;
  }
  .folha-etiqueta__equip {
    display: flex;
    flex-direction: column;
    gap: 1mm;
    padding-top: 0.9mm;
    border-top: 0.18mm solid #e2e8f0;
  }
  .folha-etiqueta__row {
    font-size: 7.8pt;
    line-height: 1.15;
    display: block;
    min-width: 0;
  }
  .folha-etiqueta__row-label {
    display: block;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    font-size: 5.1pt;
    letter-spacing: 0.03em;
    margin-bottom: 0.3mm;
  }
  .folha-etiqueta__row-value {
    display: block;
    font-weight: 600;
    color: #0f172a;
    overflow: hidden;
    word-break: break-word;
  }
  .folha-etiqueta__people {
    display: flex;
    flex-direction: column;
    gap: 0.9mm;
    align-items: stretch;
    padding-top: 0.9mm;
    border-top: 0.18mm solid #e2e8f0;
    margin-top: auto;
  }
  .folha-etiqueta__person {
    font-size: 7.2pt;
    line-height: 1.15;
    word-break: break-word;
    background: #f8fafc;
    border: 0.16mm solid #e2e8f0;
    border-radius: 0.5mm;
    padding: 0.8mm 0.9mm;
  }
  .folha-etiqueta__person-label {
    font-weight: 700;
    color: #334155;
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

function resolveEtqLabel(folha) {
  return assignFolhaObraEtq(folha) || formatFolhaObraOrdemLabel(folha);
}

/** Técnico que arranjou — campo explícito ou última intervenção. */
export function resolveTecnicoReparacaoEtiqueta(folha) {
  const explicit = String(folha?.tecnicoReparacao || '').trim();
  if (explicit) return explicit;
  const rows = Array.isArray(folha?.intervencoes) ? folha.intervencoes : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const nome = String(rows[i]?.realizado_por || '').trim();
    if (nome) return nome;
  }
  return '';
}

/** Linhas de pessoas para a etiqueta (M.S / R.C). */
export function buildEtiquetaPeopleLines(folha) {
  const tecnico = resolveTecnicoReparacaoEtiqueta(folha);
  const lines = [];

  if (tecnico) {
    lines.push({ label: 'Arranjou', value: tecnico });
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

function buildFolhaObraEtiquetaBody(folha) {
  const cliente = resolveClientName(folha);
  const entrada = folha?.dataRececao ? formatDate(folha.dataRececao) : '—';
  const etq = resolveEtqLabel(folha);
  const fo = formatFolhaObraOrdemLabel(folha);
  const msRc = formatFolhaResponsabilidadeLabel(folha?.responsabilidade);
  const badgeClass =
    normalizeFolhaResponsabilidade(folha?.responsabilidade) === FOLHA_RESPONSABILIDADE.MS
      ? 'folha-etiqueta__badge--ms'
      : 'folha-etiqueta__badge--rc';
  const people = buildEtiquetaPeopleLines(folha);

  return `
    <div class="folha-etiqueta">
      <div class="folha-etiqueta__head">
        <div class="folha-etiqueta__brand">Manusilva</div>
        <span class="folha-etiqueta__badge ${badgeClass}">${escapeHtml(msRc)}</span>
      </div>
      <div class="folha-etiqueta__etq-wrap">
        <div class="folha-etiqueta__etq">${escapeHtml(etq)}</div>
        ${fo && fo !== '—' && fo !== etq ? `<div class="folha-etiqueta__fo">${escapeHtml(fo)}</div>` : ''}
      </div>
      <div class="folha-etiqueta__cliente">${escapeHtml(cliente)}</div>
      <div class="folha-etiqueta__equip">
        ${renderEquipRow('Tipo', folha?.tipo)}
        ${renderEquipRow('Marca / Modelo', folha?.marcaModelo)}
        ${renderEquipRow('Número de série', folha?.numeroSerie)}
        ${renderEquipRow('Data de entrada', entrada)}
      </div>
      ${
        people.length
          ? `<div class="folha-etiqueta__people">
        ${people
          .map(
            (p) =>
              `<div class="folha-etiqueta__person"><span class="folha-etiqueta__person-label">${escapeHtml(p.label)}:</span> ${escapeHtml(p.value)}</div>`,
          )
          .join('')}
      </div>`
          : ''
      }
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
          transform: scale(2.4);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
          border: 0.35mm solid #94a3b8;
          border-radius: 1mm;
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
