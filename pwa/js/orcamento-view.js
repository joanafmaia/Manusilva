/**
 * Vista partilhada da proposta MS.015 (página ou modal legado).
 */

import { getClient, getJob, getTechnician } from './app.js';
import { renderOrcamentoEditor, bindOrcamentoEditor } from './orcamento-rh-editor.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { escapeHtml } from './html-utils.js';

export function renderOrcamentoMetaBar(report, { client, job, tech } = {}) {
  const resolvedClient = client ?? getClient(report?.clientId);
  const resolvedJob = job ?? (report?.jobId ? getJob(report.jobId) : null);
  const resolvedTech = tech ?? getTechnician(report?.technicianId);

  return `
    <p class="orcamento-view-lead text-muted">
      Proposta comercial independente do relatório técnico. Use um e-mail diferente se a proposta for para compras ou gestão.
    </p>
    <div class="orcamento-view-meta">
      <span><strong>Cliente:</strong> ${escapeHtml(resolvedClient?.name || resolvedClient?.Nome || '—')}</span>
      ${resolvedJob?.numeroOrdem != null ? `<span><strong>OP:</strong> ${escapeHtml(String(resolvedJob.numeroOrdem))}</span>` : ''}
      ${resolvedTech?.name ? `<span><strong>Técnico:</strong> ${escapeHtml(resolvedTech.name)}</span>` : ''}
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {object} report
 * @param {{ client?: object, onUpdated?: (report: object) => void, onNumeroChange?: (numero: string) => void, onSaved?: (report: object) => void, onSent?: (report: object) => void }} [options]
 */
export function mountOrcamentoEditorView(root, report, options = {}) {
  const client = options.client ?? getClient(report?.clientId);
  let currentReport = report;

  const render = (activeReport) => {
    currentReport = activeReport;
    root.innerHTML = `
      ${renderOrcamentoMetaBar(activeReport, { client })}
      ${renderOrcamentoEditor(activeReport, { client })}
    `;

    bindOrcamentoEditor(root, {
      report: activeReport,
      onUpdated: (updated) => {
        currentReport = updated;
        options.onUpdated?.(updated);
        const num = updated.data?.orcamento?.numeroFormatado;
        if (num) options.onNumeroChange?.(num);
      },
      onSaved: options.onSaved,
      onSent: options.onSent,
      onTipoChange: (nextReport) => render(nextReport),
    });
  };

  render(currentReport);
}

export function resolveOrcamentoTitleNumero(report) {
  const meta = getReportOrcamentoMeta(report);
  return meta?.numeroFormatado || '';
}
