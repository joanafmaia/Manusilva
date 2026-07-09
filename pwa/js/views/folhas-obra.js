/**
 * Folhas de obra — lista e formulário para técnicos (oficina/armazém).
 */

import { escapeHtml } from '../html-utils.js';
import { formatDate } from '../date-utils.js';
import { showToast, openModal, closeModal } from '../toast-modal.js';
import { renderClientCombobox, bindClientComboboxes } from '../client-combobox.js';
import { getClient } from '../entity-lookups.js';
import {
  emptyIntervencaoRow,
  ensureFolhasObraLoadedSafe,
  formatFolhaObraOrdemLabel,
  formatFolhaObraEstadoLabel,
  isFolhaObraFinalizada,
  getFolhasObraSnapshot,
  getFolhaObra,
  insertFolhaObra,
  updateFolhaObra,
  deleteFolhaObra,
  canDeleteFolhaObra,
  validateFolhaObraPayload,
} from '../folhas-obra-db.js';
import { registerFolhaObraEntrada, submitFolhaObraDiagnosticoForOrcamento, submitFolhaObraForBilling } from '../folhas-obra-workflow.js';
import {
  formatFolhaResponsabilidadeLabel,
  isFolhaObraDiagnosticoEditable,
  isFolhaObraRepairEditable,
  isFolhaObraVisibleToArmazem,
  normalizeFolhaResponsabilidade,
  isFolhaObraAguardaOrcamentoEstado,
} from '../folha-obra-orcamento.js';
import { openFolhaObraEtiquetaPreview, prepareFolhaObraEtiquetaPrint, printFolhaObraEtiqueta } from '../folha-obra-etiqueta.js';
import { renderClientFormSection, mountClientForm } from './rh-client-form.js';
import { TECHNICIANS } from '../mock_data.js';

const TIPO_OPCOES = ['Empilhador', 'Bateria', 'Carregador', 'Outro equipamento'];

const ESTADO_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos os estados' },
  { value: 'rascunho', label: 'Entrada em Armazém' },
  { value: 'em_diagnostico', label: 'Diagnóstico técnico' },
  { value: 'aguarda_orcamento', label: 'Aguarda orçamento RH' },
  { value: 'em_reparacao', label: 'Reparação' },
  { value: 'finalizado', label: 'Finalizado' },
];

function isFolhaReparacaoAtiva(folha) {
  return isFolhaObraRepairEditable(folha);
}

function estadoClass(estado) {
  if (estado === 'em_reparacao' || estado === 'em_diagnostico') return 'folha-obra-estado--active';
  if (estado === 'aguarda_orcamento' || estado === 'orcamento_enviado') return 'folha-obra-estado--pending';
  if (isFolhaObraFinalizada(estado)) return 'folha-obra-estado--done';
  return 'folha-obra-estado--draft';
}

function resolveFolhaClientName(folha) {
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  return client?.Nome || client?.name || '—';
}

function matchesFolhaSearch(folha, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    resolveFolhaClientName(folha),
    folha.tipo,
    folha.marcaModelo,
    folha.numeroSerie,
    folha.etq,
    folha.responsavel,
    formatFolhaResponsabilidadeLabel(folha.responsabilidade),
    formatFolhaObraOrdemLabel(folha),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function renderIntervencaoRows(rows, technicianName) {
  const list = rows?.length ? rows : [emptyIntervencaoRow(technicianName)];
  return list
    .map(
      (row, index) => `
    <tr data-intervencao-row="${index}">
      <td><input type="date" class="form-input form-input--sm" data-field="data_intervencao" value="${escapeHtml(row.data_intervencao || '')}"></td>
      <td><input type="text" class="form-input form-input--sm" data-field="material_servico" value="${escapeHtml(row.material_servico || '')}" placeholder="Material ou serviço"></td>
      <td><input type="text" class="form-input form-input--sm" data-field="quantidade" value="${escapeHtml(row.quantidade || '')}" placeholder="Qtd."></td>
      <td><input type="number" class="form-input form-input--sm" data-field="horas" value="${escapeHtml(row.horas || '')}" min="0" step="0.5" placeholder="h"></td>
      <td><input type="text" class="form-input form-input--sm" data-field="realizado_por" value="${escapeHtml(row.realizado_por || technicianName || '')}" placeholder="Técnico"></td>
      <td class="folha-obra-intervencao-actions">
        <button type="button" class="btn-icon btn-icon--danger" data-remove-intervencao="${index}" title="Remover linha" aria-label="Remover linha">×</button>
      </td>
    </tr>
  `,
    )
    .join('');
}

function renderResponsabilidadeField(folha, { disabled = false } = {}) {
  const value = normalizeFolhaResponsabilidade(folha?.responsabilidade);
  if (disabled) {
    return `<p class="folha-obra-resp-readonly"><strong>${escapeHtml(formatFolhaResponsabilidadeLabel(value))}</strong></p>`;
  }
  return `
    <div class="folha-obra-resp-toggle" role="radiogroup" aria-label="Responsabilidade da máquina">
      <label class="folha-obra-resp-option">
        <input type="radio" name="responsabilidade" value="MS"${value === 'MS' ? ' checked' : ''}>
        <span><strong>M.S</strong> — máquina Manusilva</span>
      </label>
      <label class="folha-obra-resp-option">
        <input type="radio" name="responsabilidade" value="RC"${value === 'RC' ? ' checked' : ''}>
        <span><strong>R.C</strong> — responsabilidade do cliente</span>
      </label>
    </div>
  `;
}

function collectIntervencoesFromForm(form) {
  const rows = [];
  form.querySelectorAll('[data-intervencao-row]').forEach((tr) => {
    const row = {};
    tr.querySelectorAll('[data-field]').forEach((input) => {
      row[input.dataset.field] = input.value?.trim() || '';
    });
    const hasContent = Object.values(row).some((v) => String(v).trim());
    if (hasContent) rows.push(row);
  });
  return rows;
}

function resolveDefaultTecnicoReparacao(folha) {
  if (folha?.tecnicoReparacao?.trim()) return folha.tecnicoReparacao.trim();
  const rows = Array.isArray(folha?.intervencoes) ? folha.intervencoes : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const nome = String(rows[i]?.realizado_por || '').trim();
    if (nome) return nome;
  }
  return folha?.responsavel?.trim() || '';
}

function renderResponsavelSelect(folha, session, { disabled = false, name = 'responsavel', id = 'folha-responsavel' } = {}) {
  const selectedName =
    folha?.responsavel ||
    TECHNICIANS.find((t) => t.id === session?.technicianId)?.name ||
    '';
  return `
    <select class="form-select" id="${id}" name="${name}" required ${disabled ? 'disabled' : ''}>
      <option value="">— Selecionar técnico —</option>
      ${TECHNICIANS.map(
        (tech) =>
          `<option value="${escapeHtml(tech.name)}" data-tech-id="${escapeHtml(tech.id)}"${selectedName === tech.name ? ' selected' : ''}>${escapeHtml(tech.name)}</option>`,
      ).join('')}
    </select>
  `;
}

function renderTecnicoReparacaoSelect(folha, session, { disabled = false } = {}) {
  const selectedName = resolveDefaultTecnicoReparacao(folha);
  return `
    <select class="form-select" id="folha-tecnico-reparacao" name="tecnico_reparacao" required ${disabled ? 'disabled' : ''}>
      <option value="">— Selecionar técnico —</option>
      ${TECHNICIANS.map(
        (tech) =>
          `<option value="${escapeHtml(tech.name)}"${selectedName === tech.name ? ' selected' : ''}>${escapeHtml(tech.name)}</option>`,
      ).join('')}
    </select>
  `;
}

function collectFolhaFromForm(form, technicianId) {
  const combo = form.querySelector('[data-client-combobox]');
  const clientId = combo?.querySelector('.client-combobox-id')?.value?.trim() || '';
  const tipo = form.querySelector('[name="tipo"]')?.value?.trim() || '';
  const marcaModelo = form.querySelector('[name="marca_modelo"]')?.value?.trim() || '';
  const numeroSerie = form.querySelector('[name="numero_serie"]')?.value?.trim() || '';
  const dataRececao = form.querySelector('[name="data_rececao"]')?.value?.trim() || '';
  const maquinaConcluidaEm = form.querySelector('[name="maquina_concluida_em"]')?.value?.trim() || '';
  const responsavelSelect = form.querySelector('[name="responsavel"]');
  const responsavel = responsavelSelect?.value?.trim() || '';
  const technicianFromForm = responsavelSelect?.selectedOptions?.[0]?.dataset?.techId || '';
  const tecnicoReparacao = form.querySelector('[name="tecnico_reparacao"]')?.value?.trim() || '';
  const observacoes = form.querySelector('[name="observacoes"]')?.value?.trim() || '';
  const diagnosticoTecnico = form.querySelector('[name="diagnostico_tecnico"]')?.value?.trim() || '';
  const estado = form.querySelector('[name="estado"]')?.value || 'rascunho';
  const responsabilidade =
    form.querySelector('[name="responsabilidade"]:checked')?.value ||
    form.querySelector('[name="responsabilidade"]')?.value ||
    'RC';

  return {
    clientId,
    technicianId: technicianFromForm || technicianId || '',
    tipo,
    marcaModelo,
    numeroSerie,
    dataRececao,
    intervencoes: collectIntervencoesFromForm(form),
    maquinaConcluidaEm,
    responsavel,
    tecnicoReparacao,
    responsabilidade: normalizeFolhaResponsabilidade(responsabilidade),
    observacoes,
    diagnosticoTecnico,
    estado,
  };
}

function selectClientInForm(form, client) {
  const wrap = form?.querySelector('[data-client-combobox][data-field-id="folha-obra-cliente"]');
  if (!wrap || !client) return;
  const input = wrap.querySelector('.client-combobox-input');
  const hidden = wrap.querySelector('.client-combobox-id');
  const clearBtn = wrap.querySelector('.client-combobox-clear');
  if (input) input.value = client.Nome || client.name || '';
  if (hidden) hidden.value = String(client.id || '');
  wrap.classList.add('client-combobox--selected');
  if (clearBtn) clearBtn.hidden = false;
}

function openCreateClientModal(form) {
  const actions = `
    <button type="button" class="btn-outline" data-modal-cancel>Fechar</button>
  `;
  const overlay = openModal('Adicionar cliente', renderClientFormSection({ modal: true }), actions);
  overlay.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
  mountClientForm(overlay, {
    onSuccess: (record) => {
      closeModal();
      selectClientInForm(form, record);
      showToast('Cliente criado e associado à folha de obra.', 'success', 4500, { force: true });
    },
  });
}

function renderFolhaObraFormHtml(folha, session) {
  const technicianName = session?.name || session?.username || '';
  const client = folha?.clientId ? getClient(folha.clientId) : null;
  const today = new Date().toISOString().split('T')[0];
  const estado = folha?.estado || 'rascunho';
  const isLocked = estado === 'pendente_faturacao' || estado === 'faturado';
  const aguardaOrcamento = estado === 'aguarda_orcamento' || estado === 'orcamento_enviado';
  const emDiagnostico = isFolhaObraDiagnosticoEditable(folha);
  const entradaLocked = isLocked || estado !== 'rascunho';
  const podeReparar = isFolhaObraRepairEditable(folha);
  const etqValue = folha?.etq || '';
  const etqPlaceholder = etqValue ? '' : 'Gerado ao dar entrada (ex.: ETQ-12)';

  return `
    <form id="folha-obra-form" class="folha-obra-form" autocomplete="off">
      <input type="hidden" name="estado" value="${escapeHtml(estado)}">
      <section class="folha-obra-section">
        <div class="folha-obra-section-head">
          <h3 class="folha-obra-section-title">Cliente</h3>
          ${entradaLocked ? '' : '<button type="button" class="btn-outline btn-sm" id="folha-create-client">+ Novo cliente</button>'}
        </div>
        ${renderClientCombobox({
          fieldId: 'folha-obra-cliente',
          label: 'Cliente',
          value: client?.Nome || client?.name || '',
          selectedId: folha?.clientId || '',
          required: true,
          disabled: entradaLocked,
        })}
      </section>

      <section class="folha-obra-section folha-obra-section--header">
        <h3 class="folha-obra-section-title">Entrada do equipamento</h3>
        <p class="folha-obra-section-hint">Registe a chegada do equipamento à oficina. M.S segue para reparação; R.C passa por diagnóstico técnico antes do orçamento RH.</p>
        <div class="form-group">
          <span class="form-label">Responsabilidade</span>
          ${renderResponsabilidadeField(folha, { disabled: entradaLocked })}
        </div>
        <div class="folha-obra-header-grid">
          <div class="form-group">
            <label class="form-label" for="folha-tipo">Tipo</label>
            <select class="form-select" id="folha-tipo" name="tipo" required ${entradaLocked ? 'disabled' : ''}>
              <option value="">— Selecionar —</option>
              ${TIPO_OPCOES.map(
                (opt) =>
                  `<option value="${escapeHtml(opt)}"${folha?.tipo === opt ? ' selected' : ''}>${escapeHtml(opt)}</option>`,
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-marca">Marca / Modelo</label>
            <input type="text" class="form-input" id="folha-marca" name="marca_modelo" value="${escapeHtml(folha?.marcaModelo || '')}" required ${entradaLocked ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-serie">N.º Série</label>
            <input type="text" class="form-input" id="folha-serie" name="numero_serie" value="${escapeHtml(folha?.numeroSerie || '')}" ${entradaLocked ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-etq">N.º etiqueta (ETQ)</label>
            <input type="text" class="form-input" id="folha-etq" name="etq" value="${escapeHtml(etqValue)}" placeholder="${escapeHtml(etqPlaceholder)}" readonly aria-readonly="true">
            <p class="folha-obra-field-hint">Número impresso na etiqueta física — gerado automaticamente na entrada.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-rececao">Data de entrada</label>
            <input type="date" class="form-input" id="folha-rececao" name="data_rececao" value="${escapeHtml(folha?.dataRececao || today)}" required ${entradaLocked ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-responsavel">Técnico de entrada</label>
            ${renderResponsavelSelect(folha, session, { disabled: entradaLocked })}
            <p class="folha-obra-field-hint">Quem registou a entrada no Armazém.</p>
          </div>
        </div>
      </section>

      ${
        emDiagnostico
          ? `
      <section class="folha-obra-section folha-obra-section--diagnostico">
        <h3 class="folha-obra-section-title">Diagnóstico técnico</h3>
        <p class="folha-obra-section-hint">Descreva a avaria e o trabalho necessário. Só depois envie ao RH para orçamentar.</p>
        <div class="form-group">
          <label class="form-label" for="folha-diagnostico">Diagnóstico</label>
          <textarea class="form-input" id="folha-diagnostico" name="diagnostico_tecnico" rows="5" required placeholder="Avaria identificada, peças/serviços previstos, observações para o RH…">${escapeHtml(folha?.diagnosticoTecnico || '')}</textarea>
        </div>
      </section>
      `
          : ''
      }

      ${
        aguardaOrcamento
          ? `
      <p class="folha-obra-phase-hint glass-card folha-obra-phase-hint--wait">
        Equipamento <strong>R.C</strong> enviado ao RH. Aguarda orçamento e aceite do cliente — a reparação no Armazém só começa depois.
      </p>
      ${
        folha?.diagnosticoTecnico
          ? `
      <section class="folha-obra-section folha-obra-section--diagnostico-readonly">
        <h3 class="folha-obra-section-title">Diagnóstico técnico</h3>
        <p class="folha-obra-diagnostico-readonly">${escapeHtml(folha.diagnosticoTecnico)}</p>
      </section>
      `
          : ''
      }
      `
          : ''
      }

      ${
        podeReparar
          ? `
      <section class="folha-obra-section">
        <div class="folha-obra-section-head">
          <h3 class="folha-obra-section-title">Intervenções</h3>
          ${isLocked ? '' : '<button type="button" class="btn-outline btn-sm" id="folha-add-intervencao">+ Linha</button>'}
        </div>
        <div class="folha-obra-table-wrap">
          <table class="folha-obra-intervencoes-table">
            <thead>
              <tr>
                <th>Data de Intervenção</th>
                <th>Material Colocado / Serviço</th>
                <th>Quantidades</th>
                <th>Horas</th>
                <th>Realizado Por</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="folha-intervencoes-body">
              ${renderIntervencaoRows(folha?.intervencoes, technicianName)}
            </tbody>
          </table>
        </div>
      </section>

      <section class="folha-obra-section folha-obra-section--closing">
        <h3 class="folha-obra-section-title">Conclusão do serviço</h3>
        <div class="folha-obra-closing-grid">
          <div class="form-group">
            <label class="form-label" for="folha-concluida">Máquina concluída a</label>
            <input type="date" class="form-input" id="folha-concluida" name="maquina_concluida_em" value="${escapeHtml(folha?.maquinaConcluidaEm || '')}" ${isLocked ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label" for="folha-tecnico-reparacao">Técnico que arranjou</label>
            ${renderTecnicoReparacaoSelect(folha, session, { disabled: isLocked })}
            <p class="folha-obra-field-hint">Aparece na etiqueta de identificação.</p>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="folha-obs">Observações (opcional)</label>
          <textarea class="form-input" id="folha-obs" name="observacoes" rows="2" ${isLocked ? 'readonly' : ''}>${escapeHtml(folha?.observacoes || '')}</textarea>
        </div>
      </section>
      `
          : estado === 'rascunho'
            ? `
      <p class="folha-obra-phase-hint glass-card">Após <strong>Dar entrada</strong>, imprima a etiqueta de identificação. M.S passa a reparação; R.C preenche o diagnóstico técnico e só depois envia ao RH.</p>
      `
            : ''
      }
    </form>
  `;
}

function bindFolhaObraForm(form, { getFolhaId, session }) {
  bindClientComboboxes(form);
  form.querySelector('#folha-create-client')?.addEventListener('click', () => {
    openCreateClientModal(form);
  });

  const tbody = form.querySelector('#folha-intervencoes-body');
  const technicianName = session?.name || session?.username || '';

  form.querySelector('#folha-add-intervencao')?.addEventListener('click', () => {
    if (!tbody) return;
    const index = tbody.querySelectorAll('[data-intervencao-row]').length;
    const wrapper = document.createElement('tbody');
    wrapper.innerHTML = renderIntervencaoRows([emptyIntervencaoRow(technicianName)], technicianName);
    const tr = wrapper.querySelector('tr');
    if (!tr) return;
    tr.dataset.intervencaoRow = String(index);
    tr.querySelector('[data-remove-intervencao]')?.setAttribute('data-remove-intervencao', String(index));
    tbody.appendChild(tr);
    bindRemoveButtons(form);
  });

  function bindRemoveButtons(root) {
    if (!tbody) return;
    root.querySelectorAll('[data-remove-intervencao]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const rows = tbody.querySelectorAll('[data-intervencao-row]');
        if (rows.length <= 1) {
          showToast('Deve existir pelo menos uma linha de intervenção.', 'warning', 4000, { force: true });
          return;
        }
        btn.closest('tr')?.remove();
      });
    });
  }
  bindRemoveButtons(form);

  async function persist(mode = 'draft') {
    const payload = collectFolhaFromForm(form, session?.technicianId || '', session);
    validateFolhaObraPayload(payload, mode);
    const folhaId = getFolhaId();
    if (folhaId) return updateFolhaObra(folhaId, payload);
    return insertFolhaObra(payload);
  }

  return { persist };
}

function renderFolhaObraFooterHtml(folha, { isLocked } = {}) {
  const estado = folha?.estado || 'rascunho';
  const aguardaEntrada = estado === 'rascunho' && !isLocked;
  const emDiagnostico = isFolhaObraDiagnosticoEditable(folha);
  const aguardaOrcamento = estado === 'aguarda_orcamento' || estado === 'orcamento_enviado';
  const emReparacaoAtiva = isFolhaReparacaoAtiva(folha);
  const canDelete = Boolean(folha?.id) && canDeleteFolhaObra(folha) && !isLocked;
  const deleteBtn = canDelete
    ? '<button type="button" class="btn-danger" id="folha-obra-delete">Eliminar</button>'
    : '';

  if (isLocked) {
    return `
      ${deleteBtn}
      <button type="button" class="btn-outline" id="folha-obra-etiqueta">Imprimir etiqueta</button>
      <button type="button" class="btn-outline" id="folha-obra-pdf">Gerar PDF</button>
      <p class="folha-obra-locked-hint">Enviada para faturação — apenas consulta.</p>
    `;
  }

  return `
    ${deleteBtn}
    ${emReparacaoAtiva ? '<button type="button" class="btn-outline" id="folha-obra-etiqueta">Imprimir etiqueta</button>' : ''}
    ${emReparacaoAtiva ? '<button type="button" class="btn-outline" id="folha-obra-pdf">Gerar PDF</button>' : ''}
    ${
      aguardaEntrada
        ? `
        <button type="button" class="btn-outline" id="folha-obra-save">Guardar rascunho</button>
        <button type="button" class="btn-primary" id="folha-obra-entrada">Dar entrada e imprimir etiqueta</button>
      `
        : emDiagnostico
          ? `
        <button type="button" class="btn-outline" id="folha-obra-etiqueta">Imprimir etiqueta</button>
        <button type="button" class="btn-outline" id="folha-obra-save">Guardar diagnóstico</button>
        <button type="button" class="btn-primary" id="folha-obra-enviar-rh">Enviar para RH orçamentar</button>
      `
        : aguardaOrcamento
          ? `
        <button type="button" class="btn-outline" id="folha-obra-etiqueta">Imprimir etiqueta</button>
        <p class="folha-obra-locked-hint">Aguarda orçamento RH — reparação bloqueada.</p>
      `
          : emReparacaoAtiva
          ? `
        <button type="button" class="btn-outline" id="folha-obra-save">Guardar</button>
        <button type="button" class="btn-primary" id="folha-obra-submit">Concluir e enviar para faturação</button>
      `
          : ''
    }
  `;
}

function mergeFolhaPayload(form, session, baseFolha, folhaId) {
  const draft = collectFolhaFromForm(form, session?.technicianId || '', session);
  const cached = folhaId ? getFolhaObra(folhaId) : null;
  return {
    ...(baseFolha || cached || {}),
    ...draft,
    id: cached?.id || baseFolha?.id || folhaId || 'draft',
    numeroOrdem: cached?.numeroOrdem ?? baseFolha?.numeroOrdem ?? null,
    etq: cached?.etq || baseFolha?.etq || '',
    responsabilidade: cached?.responsabilidade || draft.responsabilidade || baseFolha?.responsabilidade || 'RC',
    diagnosticoTecnico: cached?.diagnosticoTecnico || draft.diagnosticoTecnico || baseFolha?.diagnosticoTecnico || '',
    entreguePor: cached?.entreguePor || draft.entreguePor || baseFolha?.entreguePor || '',
    tecnicoReparacao: cached?.tecnicoReparacao || draft.tecnicoReparacao || baseFolha?.tecnicoReparacao || '',
    estado: cached?.estado || draft.estado || baseFolha?.estado || 'rascunho',
  };
}

function setFolhaObraEditorStatus(overlay, message, type = 'error') {
  const footer = overlay?.querySelector('.folha-obra-panel__footer');
  if (!footer) return;
  footer.querySelector('.folha-obra-editor-status')?.remove();
  if (!message) return;
  const el = document.createElement('p');
  el.className = `folha-obra-editor-status folha-obra-editor-status--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  footer.prepend(el);
}

function setFolhaObraEditorBusy(overlay, busy, label = 'A processar…') {
  overlay?.querySelectorAll('.folha-obra-panel__footer button').forEach((btn) => {
    if (busy) {
      if (!btn.dataset.busyLabel) btn.dataset.busyLabel = btn.textContent || '';
      btn.disabled = true;
      if (btn.id === 'folha-obra-entrada') btn.textContent = label;
      if (btn.id === 'folha-obra-enviar-rh') btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn.dataset.busyLabel) {
        btn.textContent = btn.dataset.busyLabel;
        delete btn.dataset.busyLabel;
      }
    }
  });
}

export function openFolhaObraEditor(folhaId, session, { onClose } = {}) {
  const editorState = { id: folhaId || null, folha: folhaId ? getFolhaObra(folhaId) : null };
  const runtime = { formActions: null };

  function getFolha() {
    return editorState.folha || (editorState.id ? getFolhaObra(editorState.id) : null);
  }

  function renderTitle() {
    const folha = getFolha();
    if (!folha) return 'Nova folha de obra';
    return `${formatFolhaObraOrdemLabel(folha)} — ${folha.marcaModelo || 'Folha de obra'}`;
  }

  function isLocked() {
    const folha = getFolha();
    return folha?.estado === 'pendente_faturacao' || folha?.estado === 'faturado';
  }

  let overlay = document.getElementById('folha-obra-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'folha-obra-overlay';
    overlay.className = 'folha-obra-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', async (event) => {
      const ctx = overlay._folhaObraEditor;
      if (!ctx || overlay.hidden) return;

      if (event.target.closest('#folha-obra-close')) {
        ctx.close();
        return;
      }

      const btn = event.target.closest('button');
      if (!btn?.id?.startsWith('folha-obra-')) return;

      const form = overlay.querySelector('#folha-obra-form');
      if (!form) return;

      const { editorState: state, session: sess, runtime: rt, close, onClose: afterClose } = ctx;

      try {
        if (btn.id === 'folha-obra-pdf') {
          const payload = mergeFolhaPayload(form, sess, state.folha, state.id);
          const { previewFolhaObraPDF } = await import('../pdf-preview.js');
          await previewFolhaObraPDF(payload);
          return;
        }

        if (btn.id === 'folha-obra-etiqueta') {
          const payload = mergeFolhaPayload(form, sess, state.folha, state.id);
          prepareFolhaObraEtiquetaPrint();
          try {
            await printFolhaObraEtiqueta(payload);
          } catch {
            openFolhaObraEtiquetaPreview(payload);
          }
          return;
        }

        if (btn.id === 'folha-obra-save') {
          const saved = await rt.formActions.persist('draft');
          state.id = saved.id;
          state.folha = saved;
          showToast('Folha de obra guardada.', 'success', 4000, { force: true });
          ctx.repaint();
          afterClose?.();
          return;
        }

        if (btn.id === 'folha-obra-entrada') {
          prepareFolhaObraEtiquetaPrint();
          setFolhaObraEditorStatus(overlay, '');
          setFolhaObraEditorBusy(overlay, true, 'A registar entrada…');
          try {
            const payload = collectFolhaFromForm(form, sess?.technicianId || '', sess);
            validateFolhaObraPayload(payload, 'entrada');
            if (!state.id) {
              const inserted = await insertFolhaObra(payload);
              state.id = inserted.id;
              state.folha = inserted;
            } else {
              const updated = await updateFolhaObra(state.id, payload);
              state.folha = updated;
            }
            const saved = await registerFolhaObraEntrada(state.id, payload);
            state.folha = saved;
            const isMs = normalizeFolhaResponsabilidade(saved.responsabilidade) === 'MS';
            const entradaMsg = isMs
              ? 'Entrada registada (M.S). Equipamento em reparação.'
              : 'Entrada registada (R.C). Preencha o diagnóstico técnico.';
            try {
              await printFolhaObraEtiqueta(saved);
              showToast(`${entradaMsg} Etiqueta enviada para impressão.`, 'success', 6000, { force: true });
              if (isMs) {
                ctx.close();
              } else {
                ctx.repaint();
                afterClose?.();
              }
            } catch {
              openFolhaObraEtiquetaPreview(saved);
              showToast(
                `Entrada registada (${saved.etq || 'ETQ'}). Confirme a impressão da etiqueta e preencha o diagnóstico.`,
                'info',
                7000,
                { force: true },
              );
              if (isMs) {
                ctx.close();
              } else {
                ctx.repaint();
                afterClose?.();
              }
            }
          } finally {
            setFolhaObraEditorBusy(overlay, false);
          }
          return;
        }

        if (btn.id === 'folha-obra-enviar-rh') {
          setFolhaObraEditorStatus(overlay, '');
          setFolhaObraEditorBusy(overlay, true, 'A enviar ao RH…');
          try {
            const payload = collectFolhaFromForm(form, sess?.technicianId || '', sess);
            const saved = await submitFolhaObraDiagnosticoForOrcamento(state.id, payload);
            state.folha = saved;
            showToast('Diagnóstico enviado ao RH para orçamentar.', 'success', 5000, { force: true });
            close();
          } finally {
            setFolhaObraEditorBusy(overlay, false);
          }
          return;
        }

        if (btn.id === 'folha-obra-submit') {
          const saved = await rt.formActions.persist('concluir');
          state.id = saved.id;
          state.folha = saved;
          await submitFolhaObraForBilling(saved.id);
          showToast('Folha enviada para faturação (RH).', 'success', 5000, { force: true });
          close();
          return;
        }

        if (btn.id === 'folha-obra-delete') {
          const folhaAtual = state.folha || getFolhaObra(state.id);
          if (!folhaAtual || !canDeleteFolhaObra(folhaAtual)) {
            throw new Error('Não é possível eliminar esta folha de obra.');
          }
          const label = formatFolhaObraOrdemLabel(folhaAtual);
          if (
            !window.confirm(
              `Eliminar ${label}?\n\nEsta ação não pode ser desfeita.`,
            )
          ) {
            return;
          }
          if (!state.id) {
            ctx.close();
            return;
          }
          await deleteFolhaObra(state.id);
          showToast('Folha de obra eliminada.', 'success', 4000, { force: true });
          ctx.close();
          return;
        }
      } catch (err) {
        const messages = {
          'folha-obra-pdf': 'Não foi possível gerar o PDF.',
          'folha-obra-etiqueta': 'Não foi possível imprimir a etiqueta.',
          'folha-obra-save': 'Erro ao guardar.',
          'folha-obra-entrada': 'Erro ao registar entrada.',
          'folha-obra-enviar-rh': 'Erro ao enviar ao RH.',
          'folha-obra-submit': 'Erro ao concluir.',
          'folha-obra-delete': 'Erro ao eliminar.',
        };
        const message = err?.message || messages[btn.id] || 'Operação falhou.';
        setFolhaObraEditorStatus(overlay, message, 'error');
        showToast(message, 'error', 8000, { force: true });
        if (btn.id === 'folha-obra-entrada' || btn.id === 'folha-obra-enviar-rh') setFolhaObraEditorBusy(overlay, false);
      }
    });
  }

  const close = () => {
    overlay.hidden = true;
    document.body.classList.remove('folha-obra-open');
    overlay._folhaObraEditor = null;
    onClose?.();
  };

  function syncFormBindings() {
    const form = overlay.querySelector('#folha-obra-form');
    if (!form) return;
    runtime.formActions = bindFolhaObraForm(form, {
      getFolhaId: () => editorState.id,
      session,
    });
  }

  function repaint() {
    const folha = getFolha();
    overlay.querySelector('#folha-obra-title').textContent = renderTitle();
    overlay.querySelector('.folha-obra-panel__body').innerHTML = renderFolhaObraFormHtml(folha, session);
    overlay.querySelector('.folha-obra-panel__footer').innerHTML = renderFolhaObraFooterHtml(folha, {
      isLocked: isLocked(),
    });
    syncFormBindings();
  }

  const folha = editorState.folha;
  overlay.innerHTML = `
    <div class="folha-obra-panel" role="dialog" aria-modal="true" aria-labelledby="folha-obra-title">
      <header class="folha-obra-panel__header">
        <button type="button" class="folha-obra-panel__back" id="folha-obra-close" aria-label="Fechar">←</button>
        <h2 id="folha-obra-title" class="folha-obra-panel__title">${escapeHtml(renderTitle())}</h2>
      </header>
      <div class="folha-obra-panel__body">
        ${renderFolhaObraFormHtml(folha, session)}
      </div>
      <footer class="folha-obra-panel__footer">
        ${renderFolhaObraFooterHtml(folha, { isLocked: isLocked() })}
      </footer>
    </div>
  `;

  overlay._folhaObraEditor = { editorState, session, runtime, close, onClose, repaint };
  overlay.hidden = false;
  document.body.classList.add('folha-obra-open');
  syncFormBindings();
}

function renderFolhaCard(folha) {
  const clientName = resolveFolhaClientName(folha);
  const estadoLabel = formatFolhaObraEstadoLabel(folha.estado);

  return `
    <article class="tech-job-card folha-obra-card" data-folha-id="${escapeHtml(folha.id)}" role="button" tabindex="0">
      <div class="tech-job-card__main">
        <div class="tech-job-card__top">
          <code class="folha-obra-ordem">${escapeHtml(formatFolhaObraOrdemLabel(folha))}</code>
          <span class="folha-obra-estado ${estadoClass(folha.estado)}">${escapeHtml(estadoLabel)}</span>
        </div>
        <h3 class="tech-job-card__client">${escapeHtml(clientName)}</h3>
        <p class="tech-job-card__service">${escapeHtml(formatFolhaResponsabilidadeLabel(folha.responsabilidade))} · ${escapeHtml(folha.tipo || 'Equipamento')} · ${escapeHtml(folha.marcaModelo || '—')}</p>
        <p class="tech-job-card__meta">
          ${folha.numeroSerie ? `Série ${escapeHtml(folha.numeroSerie)}` : ''}
          ${folha.etq ? ` · ETQ ${escapeHtml(folha.etq)}` : ''}
          ${folha.dataRececao ? ` · Entrada ${escapeHtml(formatDate(folha.dataRececao))}` : ''}
        </p>
      </div>
    </article>
  `;
}

function renderFolhaTableRow(folha) {
  const clientName = resolveFolhaClientName(folha);
  const estadoLabel = formatFolhaObraEstadoLabel(folha.estado);

  return `
    <tr data-folha-id="${escapeHtml(folha.id)}" tabindex="0" role="button">
      <td><code class="folha-obra-ordem">${escapeHtml(formatFolhaObraOrdemLabel(folha))}</code></td>
      <td>${escapeHtml(clientName)}</td>
      <td>${escapeHtml(formatFolhaResponsabilidadeLabel(folha.responsabilidade))}</td>
      <td>${escapeHtml(folha.tipo || '—')}</td>
      <td>${escapeHtml(folha.marcaModelo || '—')}</td>
      <td>${escapeHtml(folha.numeroSerie || '—')}</td>
      <td>${escapeHtml(folha.etq || '—')}</td>
      <td>${folha.dataRececao ? escapeHtml(formatDate(folha.dataRececao)) : '—'}</td>
      <td>${folha.maquinaConcluidaEm ? escapeHtml(formatDate(folha.maquinaConcluidaEm)) : '—'}</td>
      <td>${escapeHtml(folha.responsavel || '—')}</td>
      <td><span class="folha-obra-estado ${estadoClass(folha.estado)}">${escapeHtml(estadoLabel)}</span></td>
    </tr>
  `;
}

function renderFolhasSection(title, folhas, emptyText, layout = 'cards') {
  if (layout === 'desktop') {
    return `
      <section class="folha-obra-list-section">
        <h3 class="folha-obra-list-title">${escapeHtml(title)}${folhas.length ? ` <span class="badge-count">${folhas.length}</span>` : ''}</h3>
        ${
          folhas.length
            ? `
          <div class="folha-obra-desktop-table-wrap">
            <table class="folha-obra-data-table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Cliente</th>
                  <th>M.S/R.C</th>
                  <th>Tipo</th>
                  <th>Marca / Modelo</th>
                  <th>N.º Série</th>
                  <th>Etiqueta</th>
                  <th>Entrada</th>
                  <th>Concluída</th>
                  <th>Responsável</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${folhas.map(renderFolhaTableRow).join('')}
              </tbody>
            </table>
          </div>
        `
            : `<p class="text-muted folha-obra-empty">${escapeHtml(emptyText)}</p>`
        }
      </section>
    `;
  }

  return `
    <section class="folha-obra-list-section">
      <h3 class="folha-obra-list-title">${escapeHtml(title)}${folhas.length ? ` <span class="badge-count">${folhas.length}</span>` : ''}</h3>
      <div class="folha-obra-list">
        ${folhas.length ? folhas.map(renderFolhaCard).join('') : `<p class="text-muted folha-obra-empty">${escapeHtml(emptyText)}</p>`}
      </div>
    </section>
  `;
}

export async function mountFolhasObraTab(
  mount,
  {
    session,
    onRefresh,
    showCreateButton = true,
    onCreateRequest = null,
    layout = 'cards',
    audience = 'all',
  } = {},
) {
  if (!mount) return;

  mount.innerHTML =
    '<div class="folha-obra-tab folha-obra-tab--loading"><p class="text-muted">A carregar folhas de obra…</p></div>';

  await ensureFolhasObraLoadedSafe(true);

  const defaultCreate = () => openFolhaObraEditor(null, session, { onClose: () => onRefresh?.() });

  function readFilters() {
    return {
      query: mount.querySelector('#folha-obra-search')?.value || '',
      estado: mount.querySelector('#folha-obra-estado-filter')?.value || 'all',
      dataMin: mount.querySelector('#folha-obra-data-min')?.value || '',
      dataMax: mount.querySelector('#folha-obra-data-max')?.value || '',
    };
  }

  function filterFolhas(filters = {}) {
    let folhas = getFolhasObraSnapshot();
    if (audience === 'warehouse') {
      folhas = folhas.filter(isFolhaObraVisibleToArmazem);
    }
    const query = filters.query || '';
    const estado = filters.estado || 'all';
    const dataMin = filters.dataMin || '';
    const dataMax = filters.dataMax || '';

    return folhas
      .filter((folha) => matchesFolhaSearch(folha, query))
      .filter((folha) => {
        if (estado === 'all') return true;
        if (estado === 'finalizado') return isFolhaObraFinalizada(folha);
        if (estado === 'aguarda_orcamento') return isFolhaObraAguardaOrcamentoEstado(folha);
        if (estado === 'em_diagnostico') return folha.estado === 'em_diagnostico';
        return folha.estado === estado;
      })
      .filter((folha) => (!dataMin ? true : String(folha.dataRececao || '') >= dataMin))
      .filter((folha) => (!dataMax ? true : String(folha.dataRececao || '') <= dataMax))
      .sort((a, b) =>
        String(b.dataRececao || b.createdAt || '').localeCompare(String(a.dataRececao || a.createdAt || '')),
      );
  }

  function renderResultsHtml(filtered) {
    const entradaArmazem = filtered.filter((f) => f.estado === 'rascunho');
    const emDiagnostico = filtered.filter((f) => f.estado === 'em_diagnostico');
    const aguardaOrcamento = filtered.filter((f) => isFolhaObraAguardaOrcamentoEstado(f));
    const emReparacao = filtered.filter((f) => f.estado === 'em_reparacao');
    const finalizado = filtered.filter((f) => isFolhaObraFinalizada(f));

    return `
      ${renderFolhasSection('Entrada em Armazém', entradaArmazem, 'Nenhum equipamento aguarda entrada.', layout)}
      ${renderFolhasSection('Diagnóstico técnico (R.C)', emDiagnostico, 'Nenhum equipamento R.C em diagnóstico.', layout)}
      ${renderFolhasSection('Aguarda orçamento (R.C)', aguardaOrcamento, 'Nenhum equipamento R.C à espera de orçamento ou aceite.', layout)}
      ${renderFolhasSection('Reparação', emReparacao, 'Nenhum equipamento em reparação.', layout)}
      ${renderFolhasSection('Finalizado', finalizado, 'Ainda sem folhas concluídas.', layout)}
    `;
  }

  function bindResultCards() {
    mount.querySelectorAll('[data-folha-id]').forEach((card) => {
      const open = () => {
        const id = card.getAttribute('data-folha-id');
        if (id) openFolhaObraEditor(id, session, { onClose: () => onRefresh?.() });
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function renderResults(filters = readFilters()) {
    const resultsMount = mount.querySelector('[data-folha-obra-results]');
    if (!resultsMount) return;

    resultsMount.innerHTML = renderResultsHtml(filterFolhas(filters));
    bindResultCards();
    requestAnimationFrame(() => {
      mount.querySelector('.folha-obra-tab')?.classList.add('folha-obra-tab--ready');
    });
  }

  function renderShell(filters = {}) {
    const query = filters.query || '';
    const estado = filters.estado || 'all';
    const dataMin = filters.dataMin || '';
    const dataMax = filters.dataMax || '';

    mount.innerHTML = `
      <div class="folha-obra-tab">
        <div class="folha-obra-filter-bar glass-card">
          <div class="folha-obra-filter-grid">
            <div class="form-group">
              <label class="form-label" for="folha-obra-search">Pesquisar</label>
              <input type="search" class="form-input" id="folha-obra-search" placeholder="Cliente, ETQ, série, marca/modelo…" value="${escapeHtml(query)}">
            </div>
            <div class="form-group">
              <label class="form-label" for="folha-obra-estado-filter">Estado</label>
              <select class="form-select" id="folha-obra-estado-filter">
                ${ESTADO_FILTER_OPTIONS.map((opt) => `<option value="${opt.value}"${estado === opt.value ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="folha-obra-data-min">Entrada de</label>
              <input type="date" class="form-input" id="folha-obra-data-min" value="${escapeHtml(dataMin)}">
            </div>
            <div class="form-group">
              <label class="form-label" for="folha-obra-data-max">até</label>
              <input type="date" class="form-input" id="folha-obra-data-max" value="${escapeHtml(dataMax)}">
            </div>
          </div>
          ${
            showCreateButton
              ? `<div class="folha-obra-tab__actions"><button type="button" class="btn-primary" id="folha-obra-new">+ Nova folha de obra</button></div>`
              : ''
          }
        </div>
        <div data-folha-obra-results></div>
      </div>
    `;

    mount.querySelector('#folha-obra-new')?.addEventListener('click', () => {
      (onCreateRequest || defaultCreate)();
    });

    if (!mount.dataset.folhaObraFiltersBound) {
      mount.dataset.folhaObraFiltersBound = '1';
      mount.addEventListener('input', (e) => {
        if (e.target.id !== 'folha-obra-search') return;
        renderResults();
      });
      mount.addEventListener('change', (e) => {
        if (!e.target.matches('#folha-obra-estado-filter, #folha-obra-data-min, #folha-obra-data-max')) return;
        renderResults();
      });
    }
  }

  function render(filters = {}) {
    const shellExists = Boolean(mount.querySelector('[data-folha-obra-results]'));
    if (!shellExists) {
      renderShell(filters);
    }
    renderResults(shellExists ? readFilters() : filters);
  }

  render();
}
