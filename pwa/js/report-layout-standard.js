/**
 * Layout rígido partilhado — ecrã do técnico e PDF (todos os relatórios oficiais).
 */

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
    step: 0.1,
    inputMode: 'decimal',
    hint: 'Horas indicadas no painel da máquina',
  },
];

export const STANDARD_MACHINE_FIELD_IDS = new Set(
  STANDARD_MACHINE_FIELD_SPECS.flatMap((s) => [s.id, ...(s.aliases || [])]),
);

/** Campos retirados do fluxo normal — renderizados nos blocos standard. */
export const STANDARD_LAYOUT_SKIP_FIELD_IDS = new Set([
  ...STANDARD_MACHINE_FIELD_IDS,
  RESUMO_INTERVENCAO_FIELD_ID,
  PEDIDO_ORCAMENTO_FIELD_ID,
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
  { ...STANDARD_DESLOCACAO_FIELD, label: 'Deslocações' },
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
  if (values[PEDIDO_ORCAMENTO_FIELD_ID] === true || values[PEDIDO_ORCAMENTO_FIELD_ID] === 'Sim') {
    return true;
  }
  if (values[PEDIDO_ORCAMENTO_FIELD_ID] === false || values[PEDIDO_ORCAMENTO_FIELD_ID] === 'Não') {
    return false;
  }
  if (values.estado_maquina === 'Pedido de Orçamento') return true;
  if (values.pedir_orcamento_adicional === 'Sim') return true;
  return false;
}

/** Pré-preenche resumo e pedido de orçamento a partir de dados guardados. */
export function mergeStandardLayoutValues(values = {}, _service = null) {
  const merged = { ...values };
  if (!String(merged[RESUMO_INTERVENCAO_FIELD_ID] || '').trim()) {
    const legacy = resolveResumoIntervencaoValue(merged);
    if (legacy) merged[RESUMO_INTERVENCAO_FIELD_ID] = legacy;
  }
  if (merged[PEDIDO_ORCAMENTO_FIELD_ID] == null || merged[PEDIDO_ORCAMENTO_FIELD_ID] === '') {
    merged[PEDIDO_ORCAMENTO_FIELD_ID] = resolvePedidoOrcamentoValue(merged);
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

function renderStandardScalarField(field, value) {
  const val = value ?? '';
  if (field.type === 'number') {
    const unit = field.unit ? `<span class="field-unit">${escapeHtml(field.unit)}</span>` : '';
    return `
      <div class="form-group field-block" data-field-wrap="${field.id}">
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
      <div class="form-group field-block" data-field-wrap="${field.id}">
        <label class="form-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
        <input type="date" id="field-${field.id}" class="form-input form-input-date" data-field-id="${field.id}"
          data-field-kind="date" value="${escapeHtml(String(val))}">
      </div>`;
  }
  return `
    <div class="form-group field-block" data-field-wrap="${field.id}">
      <label class="form-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
      <input type="text" id="field-${field.id}" class="form-input" data-field-id="${field.id}"
        data-field-kind="text" value="${escapeHtml(String(val))}">
    </div>`;
}

export function renderOrdemTechnicianLine(job, tech) {
  const line = formatOrdemTechnicianLine(job?.numeroOrdem, tech?.name);
  return `<p class="form-ordem-tecnico-line">${escapeHtml(line)}</p>`;
}

export function renderStandardMachineBlock(values = {}, _context = {}) {
  const fieldsHtml = STANDARD_MACHINE_FIELD_SPECS.map((spec) =>
    renderStandardScalarField(spec, resolveStandardFieldValue(values, spec)),
  ).join('');

  return `
    <section class="form-section-card report-standard-block report-standard-block--machine" aria-labelledby="report-machine-heading">
      <h3 class="section-title" id="report-machine-heading">Informações da Máquina</h3>
      <div class="report-standard-grid report-standard-grid--machine">
        ${fieldsHtml}
      </div>
    </section>`;
}

export function renderStandardClosingBlock(values = {}, context = {}) {
  const resumo = resolveResumoIntervencaoValue(values);
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
      <h3 class="section-title" id="report-closing-heading">Resumo da Intervenção</h3>
      <div class="form-group field-block">
        <label class="form-label" for="field-${RESUMO_INTERVENCAO_FIELD_ID}">Diagnóstico e trabalho efetuado</label>
        <textarea id="field-${RESUMO_INTERVENCAO_FIELD_ID}" class="form-input form-textarea" rows="5"
          data-field-id="${RESUMO_INTERVENCAO_FIELD_ID}" data-field-kind="textarea"
          placeholder="Descreva o diagnóstico e o trabalho efetuado…">${escapeHtml(resumo)}</textarea>
      </div>
      <div class="form-group field-block report-pedido-orcamento-field">
        <label class="form-check-label report-pedido-orcamento-label">
          <input type="checkbox" class="form-check-input" id="field-${PEDIDO_ORCAMENTO_FIELD_ID}"
            data-field-id="${PEDIDO_ORCAMENTO_FIELD_ID}" data-field-kind="checkbox"
            ${pedido ? 'checked' : ''}>
          Pedido de Orçamento
        </label>
      </div>
      <div class="report-standard-subsection">
        <p class="report-standard-subtitle">Datas de retorno</p>
        <div class="report-standard-grid report-standard-grid--dates">
          ${datesHtml}
        </div>
      </div>
      <div class="report-standard-subsection">
        <p class="report-standard-subtitle">Logística final</p>
        <div class="report-standard-grid report-standard-grid--logistics">
          ${logisticsHtml}
        </div>
        <input type="hidden" data-field-id="${DESLOCACAO_BASE_FIELD_ID}" data-field-kind="number"
          value="${escapeHtml(String(baseKm))}">
      </div>
    </section>`;
}

/** PDF — specs espelhadas */
export const PDF_STANDARD_MACHINE_SPECS = STANDARD_MACHINE_FIELD_SPECS.map(({ id, label, aliases }) => ({
  id,
  label,
  aliases,
}));

export const PDF_CLOSING_SUMMARY_SPECS = {
  resumoFieldId: RESUMO_INTERVENCAO_FIELD_ID,
  pedidoFieldId: PEDIDO_ORCAMENTO_FIELD_ID,
  retornoDateIds: ['data_1', 'data_2'],
  logistics: [
    { id: VISITAS_FIELD_ID, label: 'Nº de Visitas', aliases: ['visitas'] },
    { id: 'deslocacao', label: 'Deslocações' },
    { id: 'horas_gastas', label: 'Horas Gastas' },
  ],
};

export function getPdfLayoutSkipFieldIds() {
  return new Set([
    ...STANDARD_LAYOUT_SKIP_FIELD_IDS,
    ...RESUMO_LEGACY_TEXT_IDS,
  ]);
}
