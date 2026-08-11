/**
 * Secção RH — folhas de obra à espera de orçamento (aba Orçamentos).
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
  const nome = resolveClientName(folha);
  const detailParts = [
    formatFolhaResponsabilidadeLabel(folha.responsabilidade),
    folha.tipo,
    folha.marcaModelo,
    folha.dataRececao ? `Entrada ${formatDate(folha.dataRececao)}` : '',
  ].filter(Boolean);
  return `
    <tr class="rh-data-table-row folha-obra-rh-row faturacao-row--compact" data-folha-obra-id="${escapeHtml(folha.id)}">
      <td class="faturacao-cell-client" title="${escapeHtml(nome)}">
        <span class="faturacao-cell-client-name">${escapeHtml(nome)}</span>
        <span class="faturacao-row-meta">
          <code class="folha-obra-etq-badge faturacao-ordem">${escapeHtml(folha.etq || '—')}</code>
          <span class="faturacao-visit-badge faturacao-visit-badge--folha">Oficina</span>
        </span>
      </td>
      <td class="faturacao-cell-ordem">
        <span class="folha-obra-estado folha-obra-estado--pending">${escapeHtml(estadoLabel)}</span>
        <span class="faturacao-cell-detail">${escapeHtml(detailParts.join(' · '))}</span>
      </td>
      <td class="faturacao-col-action">
        <div class="faturacao-billing-actions folha-obra-rh-actions">
          <button type="button" class="btn-outline btn-sm faturacao-btn-compact" data-folha-obra-view="${escapeHtml(folha.id)}" title="Ver folha">Ver</button>
          <button type="button" class="btn-primary btn-sm faturacao-btn-compact" data-folha-obra-orcamento="${escapeHtml(folha.id)}" title="Criar orçamento MS.015">Orçamento</button>
        </div>
      </td>
    </tr>
  `;
}

export function renderFolhaObraRhSection(folhas = getFolhasObraAguardaOrcamento()) {
  if (!folhas.length) {
    return `
      <section class="folha-obra-rh-section rh-section glass-card">
        <h3 class="ms-h2 faturacao-section-title folha-obra-rh-title">Oficina — por orçamentar</h3>
        <p class="text-muted faturacao-empty">Nenhuma folha de obra aguarda orçamento.</p>
      </section>
    `;
  }

  const scrollClass = folhas.length > 8 ? ' faturacao-table-wrap--scroll-y' : '';

  return `
    <section class="folha-obra-rh-section rh-section glass-card">
      <h3 class="ms-h2 faturacao-section-title folha-obra-rh-title">Oficina — por orçamentar <span class="badge-count">${folhas.length}</span></h3>
      <p class="text-muted folha-obra-rh-lead">
        Diagnóstico enviado pelo Armazém sem proposta. Crie o MS.015; depois continue na lista ou no quadro (origem «Folha de obra»).
      </p>
      <div class="faturacao-table-wrap rh-table-scroll${scrollClass}">
        <table class="rh-data-table rh-data-table--compact faturacao-table faturacao-table--compact folha-obra-data-table faturacao-table--dense">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Detalhe</th>
              <th scope="col" class="faturacao-col-action">Ação</th>
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
  if (!root || root.dataset.folhaObraBound === '1') return;
  root.dataset.folhaObraBound = '1';

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
