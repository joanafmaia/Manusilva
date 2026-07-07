/**
 * Etiqueta de entrada — equipamento recebido na oficina.
 */

import { escapeHtml } from './html-utils.js';
import { formatDate } from './date-utils.js';
import { getClient } from './entity-lookups.js';
import { formatFolhaObraOrdemLabel } from './folhas-obra-db.js';
import { COMPANY } from './mock_data.js';

function resolveClientName(folha) {
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return client?.Nome || client?.name || '—';
}

export function buildFolhaObraEtiquetaHtml(folha) {
  const ordem = formatFolhaObraOrdemLabel(folha);
  const cliente = resolveClientName(folha);
  const entrada = folha?.dataRececao ? formatDate(folha.dataRececao) : '—';
  const etq = folha?.etq || ordem;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Etiqueta ${escapeHtml(etq)}</title>
  <style>
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
  </style>
</head>
<body>
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
  <script>
    window.addEventListener('load', function () {
      window.setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

export function printFolhaObraEtiqueta(folha) {
  if (!folha?.clientId) throw new Error('Selecione o cliente antes de imprimir a etiqueta.');
  if (!folha?.tipo?.trim()) throw new Error('Indique o tipo de equipamento.');
  if (!folha?.marcaModelo?.trim()) throw new Error('Indique a marca/modelo.');
  if (!folha?.dataRececao) throw new Error('Indique a data de entrada.');

  const html = buildFolhaObraEtiquetaHtml(folha);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=520,height=320');
  if (!win) throw new Error('O browser bloqueou a janela de impressão. Permita pop-ups para este site.');

  win.document.open();
  win.document.write(html);
  win.document.close();
}
