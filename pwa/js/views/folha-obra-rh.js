/**
 * Secção RH — folhas R.C à espera de orçamento (aba Orçamentos).
 */

import { escapeHtml } from '../html-utils.js';
import { formatDate } from '../date-utils.js';
import { showToast } from '../toast-modal.js';
import { getClient } from '../entity-lookups.js';
import {
  ensureFolhasObraLoadedSafe,
  formatFolhaObraEstadoLabel,
} from '../folhas-obra-db.js';
import {
  formatFolhaResponsabilidadeLabel,
  getFolhasObraAguardaOrcamento,
  openFolhaObraOrcamentoEditor,
} from '../folha-obra-orcamento.js';
import { openFolhaObraEditor } from './folhas-obra.js';

function resolveClientName(folha) {
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return client?.Nome || client?.name || '—';
}

function renderFolhaObraRhRow(folha) {
  const estadoLabel = formatFolhaObraEstadoLabel(folha.estado, { rh: true });
  const hasOrcamento = Boolean(folha.orcamentoReportId);
  const actionLabel = hasOrcamento ? 'Abrir orçamento' : 'Criar orçamento MS.015';
  return `
    <tr class="rh-data-table-row folha-obra-rh-row" data-folha-obra-id="${escapeHtml(folha.id)}">
      <td><code class="folha-obra-etq-badge">${escapeHtml(folha.etq || '—')}</code></td>
      <td>${escapeHtml(resolveClientName(folha))}</td>
      <td>${escapeHtml(formatFolhaResponsabilidadeLabel(folha.responsabilidade))}</td>
      <td>${escapeHtml(folha.tipo || '—')}</td>
      <td>${escapeHtml(folha.marcaModelo || '—')}</td>
      <td>${folha.dataRececao ? escapeHtml(formatDate(folha.dataRececao)) : '—'}</td>
      <td><span class="folha-obra-estado folha-obra-estado--draft">${escapeHtml(estadoLabel)}</span></td>
      <td>
        <div class="folha-obra-rh-actions">
          <button type="button" class="btn-outline btn-sm" data-folha-obra-view="${escapeHtml(folha.id)}">Ver</button>
          <button type="button" class="btn-primary btn-sm" data-folha-obra-orcamento="${escapeHtml(folha.id)}">${escapeHtml(actionLabel)}</button>
        </div>
      </td>
    </tr>
  `;
}

export function renderFolhaObraRhSection(folhas = getFolhasObraAguardaOrcamento()) {
  if (!folhas.length) {
    return `
      <section class="folha-obra-rh-section rh-section glass-card">
        <h3 class="ms-h2 folha-obra-rh-title">Oficina — R.C por orçamentar</h3>
        <p class="text-muted">Nenhum equipamento R.C aguarda orçamento.</p>
      </section>
    `;
  }

  return `
    <section class="folha-obra-rh-section rh-section glass-card">
      <h3 class="ms-h2 folha-obra-rh-title">Oficina — R.C por orçamentar <span class="badge-count">${folhas.length}</span></h3>
      <p class="text-muted folha-obra-rh-lead">
        Equipamentos com diagnóstico técnico concluído. Crie a proposta MS.015 e registe o aceite do cliente — só depois o Armazém inicia a reparação.
      </p>
      <div class="folha-obra-desktop-table-wrap">
        <table class="rh-data-table rh-data-table--compact folha-obra-data-table">
          <thead>
            <tr>
              <th>ETQ</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Equipamento</th>
              <th>Marca / Modelo</th>
              <th>Entrada</th>
              <th>Estado</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${folhas.map(renderFolhaObraRhRow).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function bindFolhaObraRhSection(root, { session, onRefresh } = {}) {
  if (!root) return;

  root.addEventListener('click', (event) => {
    const viewBtn = event.target.closest('[data-folha-obra-view]');
    if (viewBtn) {
      const folhaId = viewBtn.dataset.folhaObraView;
      if (!folhaId) return;
      openFolhaObraEditor(folhaId, session, { onClose: () => onRefresh?.() });
      return;
    }

    const orcBtn = event.target.closest('[data-folha-obra-orcamento]');
    if (!orcBtn) return;

    const folhaId = orcBtn.dataset.folhaObraOrcamento;
    if (!folhaId) return;

    orcBtn.disabled = true;
    void openFolhaObraOrcamentoEditor(folhaId, {
      onUpdated: async () => {
        await ensureFolhasObraLoadedSafe(true);
        onRefresh?.();
        showToast('Orçamento atualizado.', 'success', 4000);
      },
    })
      .catch((err) => showToast(err?.message || 'Não foi possível abrir o orçamento.', 'error', 7000))
      .finally(() => {
        orcBtn.disabled = false;
      });
  });
}

export function countFolhasObraAguardaOrcamento() {
  return getFolhasObraAguardaOrcamento().length;
}
