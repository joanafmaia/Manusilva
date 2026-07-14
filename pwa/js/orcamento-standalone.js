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
import { openOrcamentoPage } from './orcamento-modal.js';
import { deleteRelatorioById, upsertRelatorio } from './relatorios-db.js';
import { deleteTrabalho } from './trabalhos-db.js';
import {
  ORCAMENTO_TIPO_PROPOSTA,
  ORCAMENTO_TIPO_PROPOSTA_OPTIONS,
  normalizeOrcamentoTipoProposta,
} from './orcamento-tipo-proposta.js';

export const STANDALONE_ORCAMENTO_SERVICE_TYPE = 'proposta_ms015_rh';
export const STANDALONE_ORCAMENTO_ORIGEM = 'rh_standalone';
export const STANDALONE_ORCAMENTO_TECH_ID = 'rh-admin';

export function reportIsStandaloneOrcamento(report) {
  if (!report) return false;
  if (String(report.serviceType || '') === STANDALONE_ORCAMENTO_SERVICE_TYPE) return true;
  return String(report?.data?.orcamentoOrigem || '').trim() === STANDALONE_ORCAMENTO_ORIGEM;
}

/** Proposta RH criada só com nome (sem cliente_id na ficha). */
export function reportUsesFreeformOrcamentoCliente(report) {
  return reportIsStandaloneOrcamento(report) && !String(report?.clientId || '').trim();
}

function clientDisplayName(clientId, clientRecord = null) {
  const fromRecord = String(clientRecord?.Nome || clientRecord?.name || '').trim();
  if (fromRecord) return fromRecord;
  const client = getClient(clientId);
  return String(client?.name || client?.Nome || '').trim();
}

/**
 * Cliente para nova proposta: id da lista ou nome livre.
 * @param {{ clientId?: string, clientRecord?: object|null, clienteNome?: string }} input
 */
export function resolveStandaloneClienteForCreate({ clientId, clientRecord = null, clienteNome }) {
  const id = String(clientId ?? '').trim();
  const typed = String(clienteNome ?? '').trim();

  if (id) {
    const nome = clientDisplayName(id, clientRecord);
    if (!nome) throw new Error('Cliente inválido.');
    return { clientId: id, nome };
  }

  if (!typed) {
    throw new Error('Indique o cliente — selecione na lista ou escreva o nome.');
  }

  return { clientId: '', nome: typed };
}

function buildStandaloneReportDraft({ clientId, nome, tipoProposta }) {
  const clienteNome = String(nome ?? '').trim();
  if (!clienteNome) {
    throw new Error('Indique o nome do cliente.');
  }

  const tipo = normalizeOrcamentoTipoProposta(tipoProposta);
  const now = new Date().toISOString();
  const draft = {
    technicianId: STANDALONE_ORCAMENTO_TECH_ID,
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    status: 'approved',
    submittedAt: now,
    approvedAt: now,
    faturacaoStatus: 'aguarda_aceite_orcamento',
    forkliftSerial: '',
    data: {
      values: {
        nome_empresa: clienteNome,
        cliente: clienteNome,
      },
      orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM,
      orcamento: {
        tipoProposta: tipo,
      },
    },
  };

  if (clientId) {
    draft.clientId = String(clientId);
  }

  return draft;
}

/** Cria relatório mínimo + trabalho (OP) e abre o editor MS.015. */
export async function createStandaloneOrcamentoReport({
  clientId,
  clientRecord = null,
  clienteNome,
  tipoProposta,
}) {
  const resolved = resolveStandaloneClienteForCreate({ clientId, clientRecord, clienteNome });
  const report = buildStandaloneReportDraft({
    clientId: resolved.clientId,
    nome: resolved.nome,
    tipoProposta,
  });
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
        Cria uma proposta comercial sem relatório de intervenção. Pode adicionar máquinas, linhas e gerar o PDF de seguida.
      </p>
      ${renderClientCombobox({
        fieldId: 'nova-proposta-client',
        label: 'Cliente',
        value: '',
        selectedId: '',
      })}
      <p class="text-muted nova-proposta-client-hint" style="margin-top:-0.35rem;font-size:0.8125rem">
        Selecione na lista ou escreva o nome — não é obrigatório ter o cliente criado na ficha.
      </p>
      <label class="review-orc-field">
        <span>Tipo</span>
        <select class="form-input" id="nova-proposta-tipo" data-nova-proposta-tipo required>
          ${ORCAMENTO_TIPO_PROPOSTA_OPTIONS.map(
            ({ value, label }) =>
              `<option value="${value}"${value === ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO ? ' selected' : ''}>${label}</option>`,
          ).join('')}
        </select>
        <span class="review-orc-field-hint text-muted">Classificação para relatórios e exportação anual.</span>
      </label>
    </form>`;

  const actions = `
    <button type="button" class="btn-outline" data-nova-proposta-cancel>Cancelar</button>
    <button type="button" class="btn-primary" data-nova-proposta-create>Criar proposta</button>`;

  const overlay = openModal('Nova proposta comercial', content, actions);
  bindClientComboboxes(overlay);

  const combo = overlay.querySelector('[data-client-combobox][data-field-id="nova-proposta-client"]');
  const getSelectedClientId = () => combo?.querySelector('.client-combobox-id')?.value?.trim() || '';
  const getTypedClientName = () => combo?.querySelector('.client-combobox-input')?.value?.trim() || '';

  overlay.querySelector('[data-nova-proposta-cancel]')?.addEventListener('click', () => closeModal());

  const runCreate = async () => {
    const clientId = getSelectedClientId();
    const clienteNome = getTypedClientName();
    if (!clientId && !clienteNome) {
      showToast('Indique o cliente — selecione na lista ou escreva o nome.', 'warning');
      combo?.querySelector('.client-combobox-input')?.focus();
      return;
    }

    const btn = overlay.querySelector('[data-nova-proposta-create]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'A criar…';
    }

    try {
      const clientRecord = clientId ? getClientFromCatalog(clientId) : null;
      const tipoProposta =
        overlay.querySelector('[data-nova-proposta-tipo]')?.value?.trim() ||
        ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
      const report = await createStandaloneOrcamentoReport({
        clientId,
        clientRecord,
        clienteNome: clientId ? '' : clienteNome,
        tipoProposta,
      });
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
  return 'Proposta comercial';
}

export function reportOrcamentoQueueLabel(report) {
  if (reportIsStandaloneOrcamento(report)) return standaloneOrcamentoLabel();
  if (report?.status === 'approved') return 'Relatório aprovado';
  if (report?.status === 'pending_review') return 'Aguarda aprovação RH';
  return report?.status || '—';
}
