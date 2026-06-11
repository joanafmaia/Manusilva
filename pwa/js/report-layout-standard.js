/**
 * Layout rígido partilhado — ecrã do técnico e PDF (todos os relatórios oficiais).
 */

import { MATERIAL_FIELD_IDS } from './material-table-field.js';
import {
  DESLOCACAO_BASE_FIELD_ID,
  STANDARD_DESLOCACAO_FIELD,
  STANDARD_VISITAS_FIELD,
  VISITAS_FIELD_ID,
  OFFICIAL_REPORT_SERVICE_IDS,
} from './deslocacao-field.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const RESUMO_INTERVENCAO_FIELD_ID = 'resumo_intervencao';
export const PEDIDO_ORCAMENTO_FIELD_ID = 'pedido_orcamento';
export const PEDIDO_ORCAMENTO_DETALHE_FIELD_ID = 'pedido_orcamento_detalhe';

const WORK_TEXT_FIELD_SPECS = [
  { id: 'detecao_de_avaria', label: 'Deteção de avaria', rows: 3 },
  { id: 'resolucao_da_avaria', label: 'Resolução de avaria', rows: 3 },
];

/** Campos do bloco máquina (ordem fixa). */
export const STANDARD_MACHINE_FIELD_SPECS = [
  { id: 'marca', label: 'Marca', type: 'text' },
  { id: 'modelo', label: 'Modelo', type: 'text' },
  {
    id: 'numero_de_serie',
    label: 'Número de Série',
    type: 'text',
    aliases: ['num_serie', 'numero_serie', 'n_serie'],
  },
  { id: 'n_interno', label: 'Nº Interno', type: 'text', aliases: ['num_interno'] },
  {
    id: 'horas',
    label: 'Horas',
    type: 'number',
    min: 0,
    step: 1,
    inputMode: 'numeric',
    hint: 'Horas indicadas no painel da máquina',
  },
];

export const STANDARD_MACHINE_FIELD_IDS = new Set(
  STANDARD_MACHINE_FIELD_SPECS.flatMap((s) => [s.id, ...(s.aliases || [])]),
);

/** Campos retirados do fluxo normal — renderizados nos blocos standard. */
export const STANDARD_LAYOUT_SKIP_FIELD_IDS = new Set([
  ...STANDARD_MACHINE_FIELD_IDS,
  ...MATERIAL_FIELD_IDS,
  ...WORK_TEXT_FIELD_SPECS.map((s) => s.id),
  RESUMO_INTERVENCAO_FIELD_ID,
  PEDIDO_ORCAMENTO_FIELD_ID,
  PEDIDO_ORCAMENTO_DETALHE_FIELD_ID,
  'data_1',
  'data_2',
  'data_3',
  'data_4',
  'data_5',
  'data_de_conclusao',
  VISITAS_FIELD_ID,
  'visitas',
  'deslocacao',
  DESLOCACAO_BASE_FIELD_ID,
  'horas_gastas',
  'detecao_de_avaria',
  'resolucao_da_avaria',
  'observacoes',
  'observacao',
  'estado_maquina',
  'pedir_orcamento_adicional',
  'datas_visitas',
  'data_fabrico',
]);

const RESUMO_LEGACY_TEXT_IDS = [
  'detecao_de_avaria',
  'resolucao_da_avaria',
  'observacoes',
  'observacao',
];

const STANDARD_DATA_RETORNO_FIELDS = [
  { id: 'data_1', label: 'Data 1', type: 'date' },
  { id: 'data_2', label: 'Data 2', type: 'date' },
];

const STANDARD_LOGISTICS_FIELDS = [
  STANDARD_VISITAS_FIELD,
  { ...STANDARD_DESLOCACAO_FIELD, label: 'Deslocação' },
  { type: 'number', id: 'horas_gastas', label: 'Horas Gastas', min: 0, step: 0.5, inputMode: 'decimal' },
];

export function isOfficialReportService(service) {
  return Boolean(service?.id && OFFICIAL_REPORT_SERVICE_IDS.has(service.id));
}

export function isStandardLayoutReservedField(field) {
  return Boolean(field?.id && STANDARD_LAYOUT_SKIP_FIELD_IDS.has(field.id));
}

export function formatOrdemTechnicianLine(numeroOrdem, techName) {
  const ordem =
    numeroOrdem != null && numeroOrdem !== ''
      ? `Ordem Nº OP-2026-${String(numeroOrdem).padStart(2, '0')}`
      : 'Ordem Nº —';
  const tech = String(techName || '').trim() || '—';
  return `${ordem} — Técnico: ${tech}`;
}

export function resolveStandardFieldValue(values, spec) {
  const pools = [values, values?.maquina, values?.machine].filter(Boolean);
  for (const pool of pools) {
    if (pool[spec.id] != null && String(pool[spec.id]).trim() !== '') return pool[spec.id];
    for (const alias of spec.aliases || []) {
      if (pool[alias] != null && String(pool[alias]).trim() !== '') return pool[alias];
    }
  }
  return '';
}

/** Texto unificado do resumo (novo campo ou legado). */
export function resolveResumoIntervencaoValue(values = {}) {
  const direct = String(values[RESUMO_INTERVENCAO_FIELD_ID] || '').trim();
  if (direct) return direct;

  const parts = [];
  if (values.deteccao_de_avaria) {
    parts.push(String(values.deteccao_de_avaria).trim());
  }
  if (values.resolucao_da_avaria) {
    parts.push(String(values.resolucao_da_avaria).trim());
  }
  for (const id of ['observacoes', 'observacao']) {
    const t = String(values[id] || '').trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return parts.join('\n\n');
}

export function resolvePedidoOrcamentoValue(values = {}) {
  const raw = values[PEDIDO_ORCAMENTO_FIELD_ID];
  if (raw === true || raw === 'Sim' || raw === 'sim') return true;
  if (raw === false || raw === 'Não' || raw === 'Nao' || raw === 'nao') return false;
  if (values.estado_maquina === 'Pedido de Orçamento') return true;
  if (values.pedir_orcamento_adicional === 'Sim') return true;
  return false;
}

export function resolvePedidoOrcamentoDetalhe(values = {}) {
  return String(values[PEDIDO_ORCAMENTO_DETALHE_FIELD_ID] || '').trim();
}

/** Pré-preenche campos standard a partir de dados guardados. */
export function mergeStandardLayoutValues(values = {}, _service = null) {
  const merged = { ...values };

  if (!String(merged.deteccao_de_avaria || '').trim() && merged[RESUMO_INTERVENCAO_FIELD_ID]) {
    merged.deteccao_de_avaria = String(merged[RESUMO_INTERVENCAO_FIELD_ID]).split('\n\n')[0] || '';
  }

  if (merged[PEDIDO_ORCAMENTO_FIELD_ID] == null || merged[PEDIDO_ORCAMENTO_FIELD_ID] === '') {
    merged[PEDIDO_ORCAMENTO_FIELD_ID] = resolvePedidoOrcamentoValue(merged) ? 'Sim' : 'Não';
  } else if (merged[PEDIDO_ORCAMENTO_FIELD_ID] === true) {
    merged[PEDIDO_ORCAMENTO_FIELD_ID] = 'Sim';
  } else if (merged[PEDIDO_ORCAMENTO_FIELD_ID] === false) {
    merged[PEDIDO_ORCAMENTO_FIELD_ID] = 'Não';
  }

  if (!String(merged[RESUMO_INTERVENCAO_FIELD_ID] || '').trim()) {
    const legacy = resolveResumoIntervencaoValue(merged);
    if (legacy) merged[RESUMO_INTERVENCAO_FIELD_ID] = legacy;
  }

  return merged;
}

function numberInputAttrs(field) {
  const step = field.step ?? 1;
  const mode = field.inputMode || (Number(step) === 1 ? 'numeric' : 'decimal');
  const attrs = [`step="${step}"`, `inputmode="${mode}"`];
  if (field.min != null) attrs.push(`min="${field.min}"`);
  if (field.max != null) attrs.push(`max="${field.max}"`);
  return attrs.join(' ');
}

function renderStandardScalarField(field, value, extraClass = '') {
  const val = value ?? '';
  const wrapClass = extraClass ? `form-group field-block ${extraClass}` : 'form-group field-block';

  if (field.type === 'number') {
    const unit = field.unit ? `<span class="field-unit">${escapeHtml(field.unit)}</span>` : '';
    return `
      <div class="${wrapClass}" data-field-wrap="${field.id}">
        <label class="form-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
        ${field.hint ? `<p class="field-hint text-muted">${escapeHtml(field.hint)}</p>` : ''}
        <div class="field-with-unit">
          <input type="number" id="field-${field.id}" class="form-input" data-field-id="${field.id}"
            data-field-kind="number" value="${escapeHtml(String(val))}" placeholder="0"
            ${numberInputAttrs(field)}>
          ${unit}
        </div>
      </div>`;
  }
  if (field.type === 'date') {
    return `
      <div class="${wrapClass}" data-field-wrap="${field.id}">
        <label class="form-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
        <input type="date" id="field-${field.id}" class="form-input form-input-date" data-field-id="${field.id}"
          data-field-kind="date" value="${escapeHtml(String(val))}">
      </div>`;
  }
  return `
    <div class="${wrapClass}" data-field-wrap="${field.id}">
      <label class="form-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
      <input type="text" id="field-${field.id}" class="form-input" data-field-id="${field.id}"
        data-field-kind="text" value="${escapeHtml(String(val))}">
    </div>`;
}

function renderStandardTextareaField(spec, value) {
  return `
    <div class="form-group field-block report-work-text-field" data-field-wrap="${spec.id}">
      <label class="form-label" for="field-${spec.id}">${escapeHtml(spec.label)}</label>
      <textarea id="field-${spec.id}" class="form-input form-textarea report-work-textarea" rows="${spec.rows || 3}"
        data-field-id="${spec.id}" data-field-kind="textarea"
        placeholder="">${escapeHtml(String(value ?? ''))}</textarea>
    </div>`;
}

function renderPedidoOrcamentoField(values = {}) {
  const pedido = resolvePedidoOrcamentoValue(values);
  const detalhe = resolvePedidoOrcamentoDetalhe(values);
  const simChecked = pedido ? 'checked' : '';
  const naoChecked = !pedido ? 'checked' : '';

  return `
    <div class="form-group field-block report-pedido-orcamento-field">
      <span class="form-label">Pedido de Orçamento</span>
      <div class="report-pedido-orcamento-options" role="radiogroup" aria-label="Pedido de Orçamento">
        <label class="report-pedido-orcamento-option">
          <input type="radio" name="pedido_orcamento_radio" value="sim" ${simChecked}>
          <span>Sim</span>
        </label>
        <label class="report-pedido-orcamento-option">
          <input type="radio" name="pedido_orcamento_radio" value="nao" ${naoChecked}>
          <span>Não</span>
        </label>
      </div>
      <input type="hidden" id="field-${PEDIDO_ORCAMENTO_FIELD_ID}" data-field-id="${PEDIDO_ORCAMENTO_FIELD_ID}"
        data-field-kind="text" value="${pedido ? 'Sim' : 'Não'}">
      <div class="report-pedido-orcamento-detalhe" data-pedido-detalhe-wrap ${pedido ? '' : 'hidden'}>
        <label class="form-label" for="field-${PEDIDO_ORCAMENTO_DETALHE_FIELD_ID}">O que é necessário</label>
        <textarea id="field-${PEDIDO_ORCAMENTO_DETALHE_FIELD_ID}" class="form-input form-textarea report-work-textarea" rows="2"
          data-field-id="${PEDIDO_ORCAMENTO_DETALHE_FIELD_ID}" data-field-kind="textarea"
          placeholder="Descreva o que é necessário…">${escapeHtml(detalhe)}</textarea>
      </div>
    </div>`;
}

export function renderCompanyIntroBlock(service) {
  const name = service?.companyName || 'ManuSilva Manutenção Industrial, Unipessoal, Lda';
  const address =
    service?.companyAddress || 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF';

  return `
    <div class="report-company-intro">
      <div class="report-company-intro-logo" aria-hidden="true">MS</div>
      <div class="report-company-intro-meta">
        <p class="report-company-intro-name">${escapeHtml(name)}</p>
        <p class="report-company-intro-address">${escapeHtml(address)}</p>
      </div>
    </div>`;
}

export function renderOrdemTechnicianLine(job, tech) {
  const line = formatOrdemTechnicianLine(job?.numeroOrdem, tech?.name);
  return `<p class="form-ordem-tecnico-line">${escapeHtml(line)}</p>`;
}

export function renderStandardMachineBlock(values = {}, _context = {}) {
  const fieldsHtml = STANDARD_MACHINE_FIELD_SPECS.map((spec) => {
    const extraClass =
      spec.id === 'horas' ? 'field-block--horas' : `field-block--machine-${spec.id}`;
    return renderStandardScalarField(spec, resolveStandardFieldValue(values, spec), extraClass);
  }).join('');

  return `
    <section class="form-section-card report-standard-block report-standard-block--machine" aria-labelledby="report-machine-heading">
      <h3 class="section-title report-standard-section-title" id="report-machine-heading">Informações da Máquina</h3>
      <div class="report-standard-grid report-standard-grid--machine">
        ${fieldsHtml}
      </div>
    </section>`;
}

/**
 * Bloco de trabalho: deteção, resolução e tabela de consumíveis (HTML injectado).
 * @param {string} [materialTableHtml='']
 */
export function renderStandardWorkBlock(values = {}, _context = {}, materialTableHtml = '') {
  const fieldsHtml = WORK_TEXT_FIELD_SPECS.map((spec) =>
    renderStandardTextareaField(spec, values[spec.id]),
  ).join('');

  return `
    <section class="form-section-card report-standard-block report-standard-block--work" aria-labelledby="report-work-heading">
      <div class="report-work-fields">
        ${fieldsHtml}
        ${materialTableHtml}
      </div>
    </section>`;
}

export function renderStandardClosingBlock(values = {}, context = {}, estadoMaquinaHtml = '') {
  const pedido = resolvePedidoOrcamentoValue(values);
  const visitas = values[VISITAS_FIELD_ID] ?? values.visitas ?? 1;
  const baseKm = values[DESLOCACAO_BASE_FIELD_ID] ?? '';

  const datesHtml = STANDARD_DATA_RETORNO_FIELDS.map((field) =>
    renderStandardScalarField(field, values[field.id]),
  ).join('');

  const logisticsHtml = STANDARD_LOGISTICS_FIELDS.map((field) => {
    if (field.id === VISITAS_FIELD_ID) {
      return renderStandardScalarField({ ...field, label: 'Nº de Visitas' }, visitas);
    }
    if (field.id === 'deslocacao') {
      return renderStandardScalarField(field, values.deslocacao);
    }
    return renderStandardScalarField(field, values[field.id]);
  }).join('');

  return `
    <section class="form-section-card report-standard-block report-standard-block--closing" aria-labelledby="report-closing-heading">
      ${renderPedidoOrcamentoField({ ...values, [PEDIDO_ORCAMENTO_FIELD_ID]: pedido ? 'Sim' : 'Não' })}
      ${estadoMaquinaHtml}
      <div class="report-standard-subsection report-standard-subsection--intervention">
        <p class="report-standard-subtitle">Intervenção (Datas e Custos)</p>
        <div class="report-standard-grid report-standard-grid--intervention">
          ${datesHtml}
          ${logisticsHtml}
        </div>
        <input type="hidden" data-field-id="${DESLOCACAO_BASE_FIELD_ID}" data-field-kind="number"
          value="${escapeHtml(String(baseKm))}">
      </div>
    </section>`;
}

export function bindStandardLayoutInteractions(overlay, onDirty) {
  const hidden = overlay.querySelector(`#field-${PEDIDO_ORCAMENTO_FIELD_ID}`);
  const detalheWrap = overlay.querySelector('[data-pedido-detalhe-wrap]');
  const radios = overlay.querySelectorAll('[name="pedido_orcamento_radio"]');

  const syncPedidoOrcamento = () => {
    const simSelected = overlay.querySelector('[name="pedido_orcamento_radio"][value="sim"]')?.checked;
    if (hidden) hidden.value = simSelected ? 'Sim' : 'Não';
    if (detalheWrap) detalheWrap.hidden = !simSelected;
    onDirty?.();
  };

  overlay.querySelectorAll('[data-status-pills="estado_maquina"] .status-pill').forEach((pill) => {
    pill.addEventListener('click', () => onDirty?.());
  });

  radios.forEach((radio) => {
    radio.addEventListener('change', syncPedidoOrcamento);
  });
  syncPedidoOrcamento();
}

/** PDF — specs espelhadas */
export const PDF_STANDARD_MACHINE_SPECS = STANDARD_MACHINE_FIELD_SPECS.map(({ id, label, aliases }) => ({
  id,
  label,
  aliases,
}));

export const PDF_STANDARD_WORK_SPECS = WORK_TEXT_FIELD_SPECS.map(({ id, label }) => ({ id, label }));

export const PDF_CLOSING_SUMMARY_SPECS = {
  pedidoFieldId: PEDIDO_ORCAMENTO_FIELD_ID,
  pedidoDetalheFieldId: PEDIDO_ORCAMENTO_DETALHE_FIELD_ID,
  estadoFieldId: 'estado_maquina',
  retornoDateIds: ['data_1', 'data_2'],
  logistics: [
    { id: VISITAS_FIELD_ID, label: 'Nº de Visitas', aliases: ['visitas'] },
    { id: 'deslocacao', label: 'Deslocação' },
    { id: 'horas_gastas', label: 'Horas Gastas' },
  ],
};

export function getPdfLayoutSkipFieldIds() {
  return new Set([
    ...STANDARD_LAYOUT_SKIP_FIELD_IDS,
    ...RESUMO_LEGACY_TEXT_IDS,
  ]);
}
