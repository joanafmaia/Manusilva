/**
 * Propostas MS.015 criadas pelo RH sem relatório técnico prévio.
 */

import {
  closeModal,
  getClient,
  openModal,
  showToast,
} from './app.js';
import { bindClientComboboxes, renderClientCombobox } from './client-combobox.js';
import { getClientFromCatalog } from './clients-catalog.js';
import { escapeHtml } from './html-utils.js';
import { openOrcamentoPage } from './orcamento-modal.js';
import { deleteRelatorioById, upsertRelatorio } from './relatorios-db.js';
import { deleteTrabalho } from './trabalhos-db.js';

export const STANDALONE_ORCAMENTO_SERVICE_TYPE = 'proposta_ms015_rh';
export const STANDALONE_ORCAMENTO_ORIGEM = 'rh_standalone';
export const STANDALONE_ORCAMENTO_TECH_ID = 'rh-admin';

export function reportIsStandaloneOrcamento(report) {
  if (!report) return false;
  if (String(report.serviceType || '') === STANDALONE_ORCAMENTO_SERVICE_TYPE) return true;
  return String(report?.data?.orcamentoOrigem || '').trim() === STANDALONE_ORCAMENTO_ORIGEM;
}

function clientDisplayName(clientId, clientRecord = null) {
  const fromRecord = String(clientRecord?.Nome || clientRecord?.name || '').trim();
  if (fromRecord) return fromRecord;
  const client = getClient(clientId);
  return String(client?.name || client?.Nome || '').trim();
}

function buildStandaloneReportDraft({ clientId, clientRecord }) {
  const nome = clientDisplayName(clientId, clientRecord);
  if (!nome) {
    throw new Error('Cliente inválido.');
  }

  const now = new Date().toISOString();
  return {
    clientId: String(clientId),
    technicianId: STANDALONE_ORCAMENTO_TECH_ID,
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    status: 'approved',
    submittedAt: now,
    approvedAt: now,
    forkliftSerial: '',
    data: {
      values: {
        nome_empresa: nome,
        cliente: nome,
      },
      orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
      orcamento: null,
    },
  };
}

/** Cria relatório mínimo + trabalho (OP) e abre o editor MS.015. */
export async function createStandaloneOrcamentoReport({ clientId, clientRecord = null }) {
  const id = String(clientId ?? '').trim();
  if (!id) throw new Error('Selecione um cliente.');

  const record = clientRecord || getClientFromCatalog(id);
  const report = buildStandaloneReportDraft({ clientId: id, clientRecord: record });
  const saved = await upsertRelatorio(report);
  if (!saved?.id) {
    throw new Error('Não foi possível criar a proposta.');
  }
  return saved;
}

export async function deleteStandaloneOrcamentoReport(reportId) {
  const { getReport } = await import('./app.js');
  const report = getReport(reportId);
  if (!report) {
    showToast('Proposta não encontrada.', 'error');
    return false;
  }
  if (!reportIsStandaloneOrcamento(report)) {
    showToast('Esta proposta não pode ser eliminada por aqui.', 'info');
    return false;
  }

  const meta = report?.data?.orcamento;
  if (meta?.enviadoEm) {
    showToast('A proposta já foi enviada ao cliente. Não é possível eliminar.', 'warning', 8000);
    return false;
  }

  try {
    const jobId = report.jobId || null;
    await deleteRelatorioById(reportId);
    if (jobId) {
      await deleteTrabalho(jobId);
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Proposta eliminada.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] deleteStandaloneOrcamentoReport:', err);
    showToast(err?.message || 'Erro ao eliminar a proposta.', 'error', 9000);
    return false;
  }
}

/**
 * Modal RH — escolher cliente e criar proposta MS.015 do zero.
 * @param {{ onCreated?: (report: object) => void }} [options]
 */
export function openNovaPropostaModal({ onCreated } = {}) {
  const content = `
    <form id="nova-proposta-form" class="nova-proposta-form">
      <p class="text-muted nova-proposta-lead">
        Cria uma proposta comercial sem relatório de intervenção. Pode adicionar máquinas, linhas e gerar o PDF MS.015 de seguida.
      </p>
      ${renderClientCombobox({
        fieldId: 'nova-proposta-client',
        label: 'Cliente',
        value: '',
        selectedId: '',
      })}
    </form>`;

  const actions = `
    <button type="button" class="btn-outline" data-nova-proposta-cancel>Cancelar</button>
    <button type="button" class="btn-primary" data-nova-proposta-create>Criar proposta</button>`;

  const overlay = openModal('Nova proposta MS.015', content, actions);
  bindClientComboboxes(overlay);

  const combo = overlay.querySelector('[data-client-combobox][data-field-id="nova-proposta-client"]');
  const getSelectedClientId = () => combo?.querySelector('.client-combobox-id')?.value?.trim() || '';

  overlay.querySelector('[data-nova-proposta-cancel]')?.addEventListener('click', () => closeModal());

  const runCreate = async () => {
    const clientId = getSelectedClientId();
    if (!clientId) {
      showToast('Selecione um cliente da lista.', 'warning');
      combo?.querySelector('.client-combobox-input')?.focus();
      return;
    }

    const btn = overlay.querySelector('[data-nova-proposta-create]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'A criar…';
    }

    try {
      const clientRecord = getClientFromCatalog(clientId);
      const report = await createStandaloneOrcamentoReport({ clientId, clientRecord });
      closeModal();
      onCreated?.(report);
      openOrcamentoPage(report);
    } catch (err) {
      console.error('[ManuSilva] openNovaPropostaModal:', err);
      showToast(err?.message || 'Erro ao criar a proposta.', 'error', 9000);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Criar proposta';
      }
    }
  };

  overlay.querySelector('[data-nova-proposta-create]')?.addEventListener('click', () => {
    void runCreate();
  });

  combo?.querySelector('.client-combobox-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runCreate();
    }
  });
}

/** Etiqueta curta para listagens RH. */
export function standaloneOrcamentoLabel() {
  return 'Proposta RH';
}

export function reportOrcamentoQueueLabel(report) {
  if (reportIsStandaloneOrcamento(report)) return standaloneOrcamentoLabel();
  if (report?.status === 'approved') return 'Relatório aprovado';
  if (report?.status === 'pending_review') return 'Aguarda aprovação RH';
  return report?.status || '—';
}
