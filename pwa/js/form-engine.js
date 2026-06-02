/**
 * Motor de renderização dinâmica — relatórios Manusilva
 */

import {
  renderClientCombobox,
  renderHeaderClientCombobox,
  bindClientComboboxes,
  collectClientComboboxValues,
} from './client-combobox.js';
import {
  renderGrandesBatterySection,
  collect as collectGrandesBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  getColumnLabels,
  getColumnKeys,
} from './views/relatorio-grandes.js';

export { renderClientCombobox, renderHeaderClientCombobox, bindClientComboboxes, collectClientComboboxValues };

const STATUS_PILL_CLASS = {
  'Apta a Trabalhar': 'status-pill--green',
  'Aguardar Intervenção': 'status-pill--amber',
  'Pedido de Orçamento': 'status-pill--red',
  Normal: 'status-pill--green',
  Irregular: 'status-pill--red',
  Baixo: 'status-pill--amber',
  Alto: 'status-pill--amber',
  Anual: 'status-pill--green',
  Outra: 'status-pill--amber',
  Operacional: 'status-pill--green',
  'Inoperacional por Segurança': 'status-pill--red',
  'Aguardar Peças': 'status-pill--amber',
  'Reparação Concluída': 'status-pill--green',
  'Necessita Elementos Novos': 'status-pill--amber',
  Inoperacional: 'status-pill--red',
};

const LEGAL_VERDICT_CLASS = {
  'Equipamento reúne as condições adequadas de segurança (Colocar etiqueta)': 'legal-verdict--green',
  'Conveniente realizar as reparações especificadas nas observações': 'legal-verdict--amber',
  'O empilhador NÃO deve ser utilizado até se efetuarem as reparações': 'legal-verdict--red',
};

const MATRIX_OPTION_CLASS = {
  B: 'matrix-opt--b',
  N: 'matrix-opt--n',
  D: 'matrix-opt--d',
  'N.A.': 'matrix-opt--na',
};

function getStatusPillClass(opt) {
  if (STATUS_PILL_CLASS[opt]) return STATUS_PILL_CLASS[opt];
  if (/normal|correto|operacional/i.test(opt)) return 'status-pill--green';
  if (/baixo|irregular|alto|aviso/i.test(opt)) return 'status-pill--amber';
  if (/danific|rejeit|urgent/i.test(opt)) return 'status-pill--red';
  return '';
}

function isDamagedComponentValue(val) {
  return /danificad/i.test(String(val || ''));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function isOfficialTemplate(service) {
  return Boolean(service?.code);
}

/** Campos de rastreamento de máquina — suspensos no fluxo de relatórios */
export const MACHINE_TRACKING_FIELD_IDS = new Set([
  'marca',
  'modelo',
  'numero_de_serie',
  'marca_modelo',
]);

export function isMachineTrackingField(field) {
  return Boolean(field?.id && MACHINE_TRACKING_FIELD_IDS.has(field.id));
}

function filterReportFields(fields, service) {
  return (fields || []).filter((f) => {
    if (service?.id === 'inspecao_dl50_2005' && f.section === 'Informações da Máquina') {
      return true;
    }
    return !isMachineTrackingField(f);
  });
}

/** Cabeçalho do formulário oficial (ex.: MS. 061) */
export function renderOfficialTemplateHeader(service) {
  if (!service?.code) return '';

  return `
    <div class="official-form-header glass-card-inner">
      <div class="official-form-code">${escapeHtml(service.code)}</div>
      <h3 class="official-form-title">${escapeHtml(service.title || service.label)}</h3>
      <p class="official-form-company">${escapeHtml(service.companyName || '')}</p>
      <p class="official-form-address">${escapeHtml(service.companyAddress || '')}</p>
    </div>
  `;
}

/** Pré-preenchimento automático a partir do trabalho / técnico / cliente */
export function buildFormPrefill(service, job, _forklift, context = {}) {
  if (!service) return {};

  const { tech, client } = context;

  if (service.id === 'reparacao_avarias_bateria') {
    return {
      data_de_conclusao: job?.date || '',
      estado_final: 'Reparação Concluída',
      consumiveis: [{}],
    };
  }

  if (service.id === 'reparacao_carregador') {
    const interventionRow = resolveDynamicRowDefaults(
      service.fields?.find((f) => f.id === 'registo_intervencao'),
      { job, tech, client }
    );
    const nome = client?.Nome ?? client?.name ?? '';
    return {
      data_rececao: job?.date || '',
      concluido_testado_em: '',
      cliente: nome,
      cliente_id: client?.NIF || client?.id || '',
      nif: client?.NIF ?? client?.nif ?? '',
      morada: client?.Morada ?? client?.morada ?? client?.address ?? '',
      localidade: client?.Localidade ?? client?.localidade ?? '',
      etiqueta: '',
      responsavel: '',
      registo_intervencao: [interventionRow],
      consumiveis_material: [{}],
    };
  }

  if (service.id === 'folha_intervencao_avarias') {
    return {
      data_1: job?.date || '',
    };
  }

  if (service.id === 'manutencao_baterias_grandes') {
    return {
      data_de_conclusao: job?.date || '',
      [GRANDES_BATTERY_FIELD_ID]: [{}],
    };
  }

  if (service.id === 'manutencao_preventiva_bateria') {
    const toggles = {};
    service.fields
      ?.filter((f) => f.type === 'toggle_component')
      .forEach((f) => {
        toggles[f.id] = f.options?.[0] || 'Operacional';
      });
    return {
      data_de_conclusao: job?.date || '',
      ...toggles,
    };
  }

  if (service.id === 'manutencao_preventiva_empilhadores') {
    const prefill = {
      data_de_conclusao: job?.date || '',
      estado_maquina: 'Operacional',
      pedir_orcamento_adicional: 'Não',
    };
    service.fields
      ?.filter((f) => f.type === 'verification_toggles')
      .forEach((f) => {
        const verifications = {};
        (f.items || []).forEach((item) => {
          verifications[normalizeVerifyItem(item).id] = 'OK';
        });
        prefill[f.id] = verifications;
      });
    return prefill;
  }

  if (service.id === 'inspecao_dl50_2005') {
    return {
      data_de_conclusao: job?.date || '',
      periodicidade_inspecao: 'Anual',
    };
  }

  if (service.id === 'manutencao_corretiva_maquinas') {
    const verField = service.fields?.find((f) => f.type === 'verification_toggles');
    const verifications = {};
    (verField?.items || []).forEach((item) => {
      const spec = normalizeVerifyItem(item);
      verifications[spec.id] = 'OK';
    });
    return {
      data_de_conclusao: job?.date || '',
      [verField?.id || 'lista_de_verificacoes']: verifications,
    };
  }

  return {};
}

function normalizeVerifyItem(item) {
  if (typeof item === 'string') return { id: columnKey(item), label: item };
  return { id: item.id || columnKey(item.label), label: item.label };
}

export function mergeFormValues(existing = {}, prefill = {}) {
  const merged = { ...prefill };
  Object.entries(existing).forEach(([key, val]) => {
    if (val === undefined || val === null) return;
    if (typeof val === 'object' && !Array.isArray(val) && merged[key] && typeof merged[key] === 'object') {
      merged[key] = { ...merged[key], ...val };
      return;
    }
    if (Array.isArray(val) ? val.length > 0 : String(val).trim() !== '') {
      merged[key] = val;
    }
  });
  return merged;
}

export function renderReportFields(service, values = {}, context = {}) {
  const fields = filterReportFields(service?.fields, service);
  if (!fields.length) return '<p class="text-muted">Sem campos definidos.</p>';

  const groups = groupFieldsBySection(fields).filter(({ fields: sectionFields }) => sectionFields.length);
  return groups
    .map(({ section, fields }) => {
      const hideSectionTitle =
        section &&
        fields.every(
          (f) => f.type === 'verification_toggles' && f.collapsible && f.section === section
        );
      const sectionTitle =
        section && !hideSectionTitle
          ? `<h4 class="form-section-subtitle">${escapeHtml(section)}</h4>`
          : '';
      let fieldsHtml = fields.map((f) => renderField(f, values[f.id], context)).join('');
      if (section === 'Substituição de Material') {
        fieldsHtml = `<div class="material-substitution-grid">${fieldsHtml}</div>`;
      }
      if (section === 'Diagnóstico Técnico') {
        fieldsHtml = `<div class="diagnostic-section-highlight">${fieldsHtml}</div>`;
      }
      return `
        <div class="form-field-section${section === 'Substituição de Material' ? ' form-field-section--material' : ''}${section === 'Diagnóstico Técnico' ? ' form-field-section--diagnostic' : ''}">
          ${sectionTitle}
          ${fieldsHtml}
        </div>
      `;
    })
    .join('');
}

function groupFieldsBySection(fields) {
  const groups = [];
  let currentSection = null;
  let bucket = [];

  fields.forEach((field) => {
    const section = field.section || null;
    if (section !== currentSection && bucket.length) {
      groups.push({ section: currentSection, fields: bucket });
      bucket = [];
    }
    currentSection = section;
    bucket.push(field);
  });
  if (bucket.length) groups.push({ section: currentSection, fields: bucket });
  return groups;
}

function columnKey(col) {
  return col
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveDynamicRowDefaults(field, context = {}) {
  const { job, tech } = context;
  const raw = field?.newRowDefaults || {};
  const resolved = {};
  Object.entries(raw).forEach(([key, val]) => {
    if (val === '$technician') resolved[key] = tech?.name || '';
    else if (val === '$jobDate') resolved[key] = job?.date || '';
    else resolved[key] = val;
  });
  return resolved;
}

function getDynamicColumnInputType(field, key) {
  if (field?.columnTypes?.[key]) return field.columnTypes[key];
  if (key.includes('data') || key.startsWith('data_')) return 'date';
  if (key === 'horas' || key === 'quantidade') return 'number';
  return 'text';
}

function renderDynamicTableCell(field, col, key, row) {
  const val = row[key] ?? '';
  const inputType = getDynamicColumnInputType(field, key);
  const placeholder = col;

  if (inputType === 'date') {
    return `<input type="date" class="form-input form-input-sm form-input-date" data-col="${key}"
      value="${escapeHtml(String(val))}">`;
  }
  if (inputType === 'number') {
    return `<input type="number" class="form-input form-input-sm" data-col="${key}"
      value="${escapeHtml(String(val))}" placeholder="0" min="0" step="${key === 'horas' ? '0.5' : '1'}">`;
  }
  return `<input type="text" class="form-input form-input-sm" data-col="${key}"
    value="${escapeHtml(String(val))}" placeholder="${escapeHtml(placeholder)}">`;
}

function renderField(field, value = '', context = {}) {
  let html = '';
  switch (field.type) {
    case 'client_combobox':
      html = renderClientCombobox({
        fieldId: field.id,
        label: field.label,
        value: value || context.client?.Nome || context.client?.name || '',
        selectedId: context.selectedClientId || context.client?.NIF || context.client?.id || '',
      });
      break;
    case 'text':
      if (field.id === 'cliente' || (field.label === 'Cliente' && field.section?.includes('Cliente'))) {
        html = renderClientCombobox({
          fieldId: field.id,
          label: field.label,
          value: value || context.client?.Nome || context.client?.name || '',
          selectedId: context.selectedClientId || context.client?.NIF || context.client?.id || '',
        });
        break;
      }
      html = renderTextField(field, value);
      break;
    case 'textarea':
    case 'longtext':
      html = renderTextareaField(field, value);
      break;
    case 'number':
      html = renderNumberField(field, value);
      break;
    case 'date':
      html = renderDateField(field, value);
      break;
    case 'dropdown':
      html = renderDropdownField(field, value);
      break;
    case 'choice':
      html = renderChoiceField(field, value);
      break;
    case 'toggle':
      html = renderToggleField(field, value);
      break;
    case 'status_pills':
      html = renderStatusPillsField(field, value);
      break;
    case 'multi_checkbox':
      html = renderMultiCheckboxField(field, value);
      break;
    case 'toggle_component':
      html = renderToggleComponentField(field, value);
      break;
    case 'grid':
      html = renderGridField(field, value);
      break;
    case 'dynamic_table':
      html = renderDynamicTableField(field, value, context);
      break;
    case 'grandes_identificacao_baterias':
      html = renderGrandesBatterySection(field, value);
      break;
    case 'verification_toggles':
      html = renderVerificationTogglesField(field, value);
      break;
    case 'matrix_4options':
      html = renderMatrix4OptionsField(field, value);
      break;
    case 'legal_verdict':
      html = renderLegalVerdictField(field, value);
      break;
    default:
      html = '';
  }
  return wrapConditionalField(html, field);
}

function wrapConditionalField(html, field) {
  if (!field.dependency || !html) return html;
  return `
    <div class="field-conditional is-hidden" data-dependency="${escapeHtml(field.dependency)}">
      ${html}
    </div>
  `;
}

export function collectReportValues(overlay) {
  const values = {};

  overlay.querySelectorAll('[data-field-id]').forEach((el) => {
    const id = el.dataset.fieldId;
    const kind = el.dataset.fieldKind;
    if (['text', 'textarea', 'longtext', 'number', 'date', 'dropdown', 'grid'].includes(kind)) {
      values[id] = el.value;
    }
  });

  overlay.querySelectorAll('[data-choice-group]').forEach((group) => {
    const selected = group.querySelector('.choice-btn.selected');
    if (selected) values[group.dataset.choiceGroup] = selected.dataset.value;
  });

  overlay.querySelectorAll('[data-status-pills]').forEach((group) => {
    const selected = group.querySelector('.status-pill.selected');
    if (selected) values[group.dataset.statusPills] = selected.dataset.value;
  });

  overlay.querySelectorAll('[data-toggle-field]').forEach((input) => {
    const field = input.closest('[data-toggle-wrap]');
    const onVal = field?.dataset.onValue || 'Conforme';
    const offVal = field?.dataset.offValue || 'Não Conforme';
    values[input.dataset.toggleField] = input.checked ? onVal : offVal;
  });

  overlay.querySelectorAll('[data-verification-field]').forEach((wrap) => {
    const fieldId = wrap.dataset.verificationField;
    const items = {};
    wrap.querySelectorAll('[data-verify-item]').forEach((input) => {
      items[input.dataset.verifyItem] = input.checked ? 'Não OK' : 'OK';
    });
    values[fieldId] = items;
  });

  overlay.querySelectorAll('[data-dynamic-table]').forEach((wrap) => {
    const fieldId = wrap.dataset.dynamicTable;
    const columns = JSON.parse(wrap.dataset.columns || '[]');
    const rows = [];
    wrap.querySelectorAll('.dynamic-table-row').forEach((rowEl) => {
      const row = {};
      columns.forEach((col) => {
        const key = columnKey(col);
        row[key] = rowEl.querySelector(`[data-col="${key}"]`)?.value?.trim() || '';
      });
      if (Object.values(row).some((v) => v)) rows.push(row);
    });
    values[fieldId] = rows;
  });

  if (overlay.querySelector('[data-grandes-baterias]')) {
    values[GRANDES_BATTERY_FIELD_ID] = collectGrandesBatteryRows(overlay);
  }

  overlay.querySelectorAll('[data-multi-checkbox]').forEach((group) => {
    const fieldId = group.dataset.multiCheckbox;
    const selected = [];
    group.querySelectorAll('.multi-check-input:checked').forEach((input) => {
      selected.push(input.value);
    });
    values[fieldId] = selected;
  });

  overlay.querySelectorAll('[data-component-toggle]').forEach((group) => {
    const fieldId = group.dataset.componentToggle;
    const selected = group.querySelector('.component-toggle-btn.selected');
    if (selected) values[fieldId] = selected.dataset.value;
  });

  overlay.querySelectorAll('[data-matrix-field]').forEach((wrap) => {
    values[wrap.dataset.matrixField] = collectMatrixValues(wrap);
  });

  overlay.querySelectorAll('[data-legal-verdict]').forEach((group) => {
    const selected = group.querySelector('.legal-verdict-card.selected');
    if (selected) values[group.dataset.legalVerdict] = selected.dataset.value;
  });

  collectClientComboboxValues(overlay, values);

  return values;
}

function collectMatrixValues(wrap) {
  const data = {};
  wrap.querySelectorAll('.matrix-accordion-item').forEach((catEl) => {
    const catKey = catEl.dataset.matrixCategory;
    data[catKey] = {};
    catEl.querySelectorAll('.matrix-row').forEach((row) => {
      const itemKey = row.dataset.matrixItem;
      const selected = row.querySelector('.matrix-opt.selected');
      if (selected) data[catKey][itemKey] = selected.dataset.value;
    });
  });
  return data;
}

export function countMatrixProgress(field, matrixValue) {
  let filled = 0;
  let total = 0;
  (field.categories || []).forEach((cat) => {
    const catKey = columnKey(cat.name);
    cat.items.forEach((item) => {
      total += 1;
      const itemKey = columnKey(item);
      if (matrixValue?.[catKey]?.[itemKey]) filled += 1;
    });
  });
  return { filled, total };
}

export function evaluateFieldDependencies(overlay) {
  overlay.querySelectorAll('[data-dependency]').forEach((wrap) => {
    const dep = wrap.dataset.dependency;
    const [compId, expected] = dep.split(':');
    const group = overlay.querySelector(`[data-component-toggle="${compId}"]`);
    const selected = group?.querySelector('.component-toggle-btn.selected')?.dataset.value;
    const show = selected === expected;
    wrap.classList.toggle('is-hidden', !show);
  });
}

export function renderReportValuesForReview(service, values = {}) {
  if (!service?.fields?.length) return '<p class="text-muted">—</p>';

  const groups = groupFieldsBySection(service.fields);
  const html = groups
    .map(({ section, fields }) => {
      const items = fields
        .map((field) => {
          if (!shouldShowFieldInReview(field, values)) return '';
          const val = values[field.id];
          if (isEmptyFieldValue(field, val)) return '';

          if (field.type === 'verification_toggles' && val && typeof val === 'object') {
            const rows = (field.items || []).map((item) => {
              const spec = normalizeVerifyItem(item);
              const state = val[spec.id] || 'OK';
              const cls = state === 'OK' ? 'verification-badge--ok' : 'verification-badge--fail';
              return `
                <div class="review-verify-row">
                  <span>${escapeHtml(spec.label)}</span>
                  <span class="verification-badge ${cls}">${escapeHtml(state)}</span>
                </div>
              `;
            }).join('');
            return `
              <div class="review-field">
                <strong>${escapeHtml(field.label)}</strong>
                <div class="review-verification-list">${rows}</div>
              </div>
            `;
          }

          if (field.type === 'multi_checkbox' && Array.isArray(val) && val.length) {
            const tags = val.map((v) => `<span class="review-tag">${escapeHtml(v)}</span>`).join('');
            return `
              <div class="review-field">
                <strong>${escapeHtml(field.label)}</strong>
                <div class="review-tag-list">${tags}</div>
              </div>
            `;
          }

          if (field.type === 'matrix_4options' && val && typeof val === 'object') {
            const { filled, total } = countMatrixProgress(field, val);
            const categories = (field.categories || [])
              .map((cat) => {
                const catKey = columnKey(cat.name);
                const catFilled = cat.items.filter((item) => val[catKey]?.[columnKey(item)]).length;
                return `<li><strong>${escapeHtml(cat.name)}</strong> — ${catFilled}/${cat.items.length}</li>`;
              })
              .join('');
            return `
              <div class="review-field">
                <strong>${escapeHtml(field.label)}</strong>
                <p class="text-muted review-matrix-summary">${filled}/${total} pontos avaliados</p>
                <ul class="review-matrix-categories">${categories}</ul>
              </div>
            `;
          }

          if (field.type === 'legal_verdict' && val) {
            const cls = getLegalVerdictClass(val);
            return `
              <div class="review-field">
                <strong>${escapeHtml(field.label)}</strong>
                <p class="legal-verdict-review ${cls}">${escapeHtml(String(val))}</p>
              </div>
            `;
          }

          if (field.type === 'toggle_component' && val) {
            const damaged = isDamagedComponentValue(val);
            const cls = damaged ? 'component-review--bad' : 'component-review--good';
            return `
              <div class="review-field review-component-row">
                <strong>${escapeHtml(field.label)}</strong>
                <span class="component-review-badge ${cls}">${escapeHtml(String(val))}</span>
              </div>
            `;
          }

          if (field.dependency && !isDependencyMet(field, values)) return '';

          if (
            (field.type === 'dynamic_table' || field.type === 'grandes_identificacao_baterias') &&
            Array.isArray(val)
          ) {
            const labels =
              field.type === 'grandes_identificacao_baterias' ? getColumnLabels() : field.columns || [];
            const keys =
              field.type === 'grandes_identificacao_baterias'
                ? getColumnKeys()
                : labels.map((c) => columnKey(c));
            const head = labels.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
            const body = val
              .map(
                (row) =>
                  `<tr>${keys.map((k) => `<td>${escapeHtml(row[k] || '—')}</td>`).join('')}</tr>`,
              )
              .join('');
            return `
              <div class="review-field">
                <strong>${escapeHtml(field.label)}</strong>
                <table class="review-dynamic-table"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="99" class="text-muted">Sem linhas</td></tr>'}</tbody></table>
              </div>
            `;
          }

          const pillClass = field.type === 'status_pills' ? getStatusPillClass(val) : '';
          return `
            <div class="review-field">
              <strong>${escapeHtml(field.label)}:</strong>
              <p class="${pillClass ? `review-status ${pillClass}` : ''}">${escapeHtml(String(val))}</p>
            </div>
          `;
        })
        .filter(Boolean)
        .join('');
      if (!items) return '';
      return section
        ? `<div class="review-section"><h5>${escapeHtml(section)}</h5>${items}</div>`
        : items;
    })
    .filter(Boolean)
    .join('');

  return html || '<p class="text-muted">Sem dados preenchidos.</p>';
}

function isDependencyMet(field, values) {
  if (!field.dependency) return true;
  const [depId, expected] = field.dependency.split(':');
  return values[depId] === expected;
}

function isEmptyFieldValue(field, val) {
  if (val === undefined || val === null) return true;
  if (field.type === 'dynamic_table' || field.type === 'grandes_identificacao_baterias') {
    return !Array.isArray(val) || val.length === 0;
  }
  if (field.type === 'multi_checkbox') return !Array.isArray(val) || val.length === 0;
  if (field.type === 'verification_toggles') {
    return !val || typeof val !== 'object' || !Object.keys(val).length;
  }
  if (field.type === 'matrix_4options') {
    if (!val || typeof val !== 'object') return true;
    return countMatrixProgress(field, val).filled === 0;
  }
  return String(val).trim() === '';
}

function getLegalVerdictClass(val) {
  if (LEGAL_VERDICT_CLASS[val]) return LEGAL_VERDICT_CLASS[val];
  if (/reúne|adequadas|etiqueta/i.test(String(val))) return 'legal-verdict--green';
  if (/conveniente|reparações especificadas/i.test(String(val))) return 'legal-verdict--amber';
  if (/não deve|nao deve/i.test(String(val))) return 'legal-verdict--red';
  return '';
}

export function shouldShowFieldInReview(field, values) {
  if (field.dependency && !isDependencyMet(field, values)) return false;
  return true;
}

export function countFilledFields(service, values = {}) {
  if (!service?.fields) return 0;
  return service.fields.filter((f) => {
    if (f.dependency && !isDependencyMet(f, values)) return false;
    return !isEmptyFieldValue(f, values[f.id]);
  }).length;
}

function renderTextField(field, value = '') {
  return `
    <div class="form-group field-block">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="text" class="form-input" data-field-id="${field.id}" data-field-kind="text"
        value="${escapeHtml(String(value))}" placeholder="${escapeHtml(field.placeholder || '')}">
    </div>
  `;
}

function renderTextareaField(field, value = '') {
  const prominent = field.prominent || field.uiVariant === 'diagnostic';
  const rows = field.rows || (prominent ? 10 : 4);
  const blockClass = prominent
    ? 'form-group field-block field-block--diagnostic-text'
    : 'form-group field-block';

  return `
    <div class="${blockClass}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      ${prominent ? '<p class="field-hint diagnostic-field-hint">Registe o diagnóstico completo da bateria — sintomas, medições e conclusões técnicas.</p>' : ''}
      <textarea class="form-textarea${prominent ? ' form-textarea--diagnostic' : ''}"
        data-field-id="${field.id}" data-field-kind="textarea"
        rows="${rows}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(String(value))}</textarea>
    </div>
  `;
}

function getMaterialUnit(label) {
  if (/litros/i.test(label)) return 'L';
  if (/quantidade/i.test(label)) return 'un';
  return '';
}

function isMaterialQtyField(field) {
  return field.uiVariant === 'material' || field.section === 'Substituição de Material';
}

function renderNumberField(field, value = '') {
  const material = isMaterialQtyField(field);
  const unit = material ? getMaterialUnit(field.label) : '';
  const hasValue = value !== '' && value !== null && value !== undefined;
  const materialClasses = material
    ? `material-qty-field${hasValue ? ' has-value' : ''}`
    : '';

  if (!material) {
    return `
      <div class="form-group field-block">
        <label class="form-label">${escapeHtml(field.label)}</label>
        <input type="number" class="form-input" data-field-id="${field.id}" data-field-kind="number"
          value="${escapeHtml(String(value))}" placeholder="${escapeHtml(field.placeholder || '0')}"
          ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''}
          ${field.step != null ? `step="${field.step}"` : ''}>
      </div>
    `;
  }

  return `
    <div class="form-group field-block ${materialClasses}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="material-qty-input-wrap">
        <input type="number" class="form-input material-qty-input" data-field-id="${field.id}" data-field-kind="number"
          value="${escapeHtml(String(value))}" placeholder="0"
          ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''}
          ${field.step != null ? `step="${field.step}"` : ''}>
        ${unit ? `<span class="material-qty-unit">${escapeHtml(unit)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderDateField(field, value = '') {
  return `
    <div class="form-group field-block">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="date" class="form-input form-input-date" data-field-id="${field.id}" data-field-kind="date"
        value="${escapeHtml(String(value))}">
    </div>
  `;
}

function renderDropdownField(field, value = '') {
  const options = (field.options || [])
    .map(
      (o) =>
        `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`
    )
    .join('');
  return `
    <div class="form-group field-block">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <select class="form-select" data-field-id="${field.id}" data-field-kind="dropdown">
        <option value="">Selecionar...</option>
        ${options}
      </select>
    </div>
  `;
}

function renderChoiceField(field, value = '') {
  const buttons = (field.options || [])
    .map(
      (opt) => `
      <button type="button" class="choice-btn ${opt === value ? 'selected' : ''}"
        data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
    `
    )
    .join('');

  return `
    <div class="form-group field-block choice-field" data-choice-group="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="choice-options">${buttons}</div>
    </div>
  `;
}

function renderMultiCheckboxField(field, value) {
  const selected = Array.isArray(value) ? value : [];
  const items = (field.options || [])
    .map(
      (opt) => `
      <label class="multi-check-item">
        <input type="checkbox" class="multi-check-input" value="${escapeHtml(opt)}"
          ${selected.includes(opt) ? 'checked' : ''}>
        <span class="multi-check-box" aria-hidden="true"></span>
        <span class="multi-check-label">${escapeHtml(opt)}</span>
      </label>
    `
    )
    .join('');

  return `
    <div class="form-group field-block multi-checkbox-field" data-multi-checkbox="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="multi-check-grid">${items}</div>
    </div>
  `;
}

function renderToggleComponentField(field, value = '') {
  const opts = field.options || ['Operacional', 'Danificada'];
  const good = opts[0];
  const bad = opts[1];
  const selected = value || good;

  return `
    <div class="form-group field-block component-toggle-field" data-component-toggle="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="component-toggle-options" role="group" aria-label="${escapeHtml(field.label)}">
        <button type="button"
          class="component-toggle-btn component-toggle--good ${selected === good ? 'selected' : ''}"
          data-value="${escapeHtml(good)}">${escapeHtml(good)}</button>
        <button type="button"
          class="component-toggle-btn component-toggle--bad ${selected === bad ? 'selected' : ''}"
          data-value="${escapeHtml(bad)}">${escapeHtml(bad)}</button>
      </div>
    </div>
  `;
}

function renderStatusPillsField(field, value = '') {
  const pills = (field.options || []).map((opt) => {
    const colorClass = getStatusPillClass(opt);
    const selected = opt === value ? 'selected' : '';
    return `
      <button type="button"
        class="status-pill ${colorClass} ${selected}"
        data-value="${escapeHtml(opt)}"
        aria-pressed="${opt === value}">
        <span class="status-pill-dot"></span>
        ${escapeHtml(opt)}
      </button>
    `;
  }).join('');

  return `
    <div class="form-group field-block status-pills-field" data-status-pills="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="status-pills-group">${pills}</div>
    </div>
  `;
}

function renderToggleField(field, value = '') {
  const onVal = field.onValue || 'Conforme';
  const offVal = field.offValue || 'Não Conforme';
  const isOn = value === onVal || value === true || value === 'true';
  const checked = isOn ? 'checked' : '';

  return `
    <div class="form-group field-block toggle-field-row" data-toggle-wrap="${field.id}"
      data-on-value="${escapeHtml(onVal)}" data-off-value="${escapeHtml(offVal)}">
      <div class="toggle-field-header">
        <label class="form-label">${escapeHtml(field.label)}</label>
        <span class="toggle-state-label" data-state-label="${field.id}">${isOn ? escapeHtml(onVal) : escapeHtml(offVal)}</span>
      </div>
      <label class="toggle-switch-wrap toggle-field-control">
        <input type="checkbox" class="sr-only" data-toggle-field="${field.id}" ${checked}>
        <span class="toggle-track"></span>
      </label>
      <div class="toggle-legend">
        <span>${escapeHtml(offVal)}</span>
        <span>${escapeHtml(onVal)}</span>
      </div>
    </div>
  `;
}

function countVerificationProgress(items, states) {
  let ok = 0;
  let fail = 0;
  items.forEach((item) => {
    const spec = normalizeVerifyItem(item);
    if (states[spec.id] === 'Não OK') fail += 1;
    else ok += 1;
  });
  return { ok, fail, total: items.length };
}

function updateVerificationAccordionProgress(wrap) {
  const progressEl = wrap.querySelector('[data-verify-progress]');
  const failEl = wrap.querySelector('[data-verify-fail-count]');
  if (!progressEl) return;

  const items = wrap.querySelectorAll('[data-verify-item]');
  let ok = 0;
  let fail = 0;
  items.forEach((input) => {
    if (input.checked) fail += 1;
    else ok += 1;
  });
  const total = items.length;
  progressEl.textContent = `${ok}/${total} OK`;
  if (failEl) {
    failEl.textContent = fail > 0 ? `${fail} Não OK` : '';
    failEl.classList.toggle('is-visible', fail > 0);
  }
}

function renderVerificationTogglesField(field, value) {
  const items = field.items || [];
  const states = value && typeof value === 'object' ? value : {};
  const useAccordion = field.collapsible || items.length >= 8;

  const cards = items.map((item) => {
    const spec = normalizeVerifyItem(item);
    const isFail = states[spec.id] === 'Não OK';
    const stateClass = isFail ? 'verification-card--fail' : 'verification-card--ok';
    const badgeClass = isFail ? 'verification-badge--fail' : 'verification-badge--ok';
    const badgeText = isFail ? 'Não OK' : 'OK';
    const checked = isFail ? 'checked' : '';

    return `
      <div class="verification-card ${stateClass}" data-verify-card="${spec.id}" role="button" tabindex="0"
        aria-label="${escapeHtml(spec.label)} — ${badgeText}">
        <span class="verification-card-label">${escapeHtml(spec.label)}</span>
        <div class="verification-card-control">
          <span class="verification-badge ${badgeClass}" data-verify-badge="${spec.id}">${badgeText}</span>
          <label class="verification-switch" aria-label="Alternar estado ${escapeHtml(spec.label)}">
            <input type="checkbox" class="sr-only" data-verify-item="${spec.id}" ${checked}>
            <span class="verify-track"><span class="verify-thumb"></span></span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  const listHtml = `<div class="verification-list">${cards}</div>`;

  if (!useAccordion) {
    return `
      <div class="form-group field-block verification-toggles-field" data-verification-field="${field.id}">
        <label class="form-label">${escapeHtml(field.label)}</label>
        ${listHtml}
      </div>
    `;
  }

  const { ok, fail, total } = countVerificationProgress(items, states);
  const openClass = field.defaultOpen !== false ? 'is-open' : '';
  const accordionTitle = field.section || field.label;

  return `
    <div class="form-group field-block verification-toggles-field verification-accordion-item ${openClass}"
      data-verification-field="${field.id}" data-collapsible="true">
      <button type="button" class="verification-accordion-header" aria-expanded="${field.defaultOpen !== false}">
        <span class="verification-accordion-title">${escapeHtml(accordionTitle)}</span>
        <span class="verification-accordion-meta">
          <span class="verify-progress-ok" data-verify-progress>${ok}/${total} OK</span>
          <span class="verify-progress-fail${fail ? ' is-visible' : ''}" data-verify-fail-count>${fail ? `${fail} Não OK` : ''}</span>
          <span class="matrix-chevron" aria-hidden="true"></span>
        </span>
      </button>
      <div class="verification-accordion-panel">
        <p class="verification-group-subtitle">${escapeHtml(field.label)}</p>
        ${listHtml}
      </div>
    </div>
  `;
}

function renderDynamicTableField(field, value, context = {}) {
  const columns = field.columns || [];
  const colKeys = columns.map((c) => columnKey(c));
  const defaultRow = resolveDynamicRowDefaults(field, context);
  const rows =
    Array.isArray(value) && value.length
      ? value
      : [Object.keys(defaultRow).length ? { ...defaultRow } : {}];

  const variantClass = field.tableVariant
    ? `dynamic-table-field--${field.tableVariant}`
    : '';
  const addLabel = field.addButtonLabel || 'Adicionar Material';
  const headerCells = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');

  const bodyRows = rows
    .map((row, idx) => {
      const cells = colKeys
        .map((key, colIdx) => {
          const colLabel = columns[colIdx];
          return `<td data-col-label="${escapeHtml(colLabel)}">${renderDynamicTableCell(field, colLabel, key, row)}</td>`;
        })
        .join('');
      return `
        <tr class="dynamic-table-row" data-row-index="${idx}">
          ${cells}
          <td class="dynamic-table-actions">
            <button type="button" class="btn-row-remove" title="Remover linha" aria-label="Remover">&times;</button>
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div class="form-group field-block dynamic-table-field ${variantClass}"
      data-dynamic-table="${field.id}"
      data-columns='${JSON.stringify(columns)}'
      data-default-row='${JSON.stringify(defaultRow)}'>
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="dynamic-table-wrap glass-card-inner">
        <table class="dynamic-table">
          <thead><tr>${headerCells}<th class="dynamic-table-actions-th"></th></tr></thead>
          <tbody class="dynamic-table-body">${bodyRows}</tbody>
        </table>
        <button type="button" class="btn-outline btn-add-material dynamic-table-add">
          <span>+</span> ${escapeHtml(addLabel)}
        </button>
      </div>
    </div>
  `;
}

function matrixOptionDisplay(opt) {
  return opt === 'N.A.' ? 'NA' : opt;
}

function syncMatrixRowState(row) {
  const selected = row.querySelector('.matrix-opt.selected');
  const isDefect = selected?.dataset.value === 'D';
  row.classList.toggle('matrix-row--defect', Boolean(isDefect));
}

function updateMatrixCategoryProgress(catEl) {
  const rows = catEl.querySelectorAll('.matrix-row');
  const filled = catEl.querySelectorAll('.matrix-opt.selected').length;
  const progress = catEl.querySelector('[data-matrix-progress]');
  if (progress) progress.textContent = `${filled}/${rows.length}`;
}

function renderMatrix4OptionsField(field, value) {
  const options = field.options || ['B', 'N', 'D', 'N.A.'];
  const states = value && typeof value === 'object' ? value : {};
  const categories = field.categories || [];

  const accordion = categories
    .map((cat, catIndex) => {
      const catKey = columnKey(cat.name);
      const catStates = states[catKey] || {};
      const filled = cat.items.filter((item) => catStates[columnKey(item)]).length;
      const openClass = catIndex === 0 ? 'is-open' : '';

      const rows = cat.items
        .map((item) => {
          const itemKey = columnKey(item);
          const selected = catStates[itemKey] || '';
          const segments = options
            .map((opt) => {
              const optClass = MATRIX_OPTION_CLASS[opt] || '';
              const isSelected = selected === opt ? 'selected' : '';
              return `
                <button type="button"
                  class="matrix-opt ${optClass} ${isSelected}"
                  data-value="${escapeHtml(opt)}"
                  aria-label="${escapeHtml(item)} — ${escapeHtml(opt)}"
                  title="${escapeHtml(opt)}">
                  ${escapeHtml(matrixOptionDisplay(opt))}
                </button>
              `;
            })
            .join('');

          const defectClass = selected === 'D' ? 'matrix-row--defect' : '';
          return `
            <div class="matrix-row ${defectClass}" data-matrix-item="${itemKey}">
              <p class="matrix-item-label">${escapeHtml(item)}</p>
              <div class="matrix-segmented" role="group" aria-label="${escapeHtml(item)}">
                ${segments}
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="matrix-accordion-item ${openClass}" data-matrix-category="${catKey}">
          <button type="button" class="matrix-accordion-header" aria-expanded="${catIndex === 0}">
            <span class="matrix-accordion-title">${escapeHtml(cat.name)}</span>
            <span class="matrix-accordion-meta">
              <span class="matrix-cat-progress" data-matrix-progress>${filled}/${cat.items.length}</span>
              <span class="matrix-chevron" aria-hidden="true"></span>
            </span>
          </button>
          <div class="matrix-accordion-panel">
            <div class="matrix-legend">
              ${options.map((o) => `<span><strong>${escapeHtml(matrixOptionDisplay(o))}</strong> = ${escapeHtml(matrixLegendLabel(o))}</span>`).join('')}
            </div>
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="form-group field-block matrix-inspection-field" data-matrix-field="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <p class="field-hint">Toque numa categoria para expandir. Avalie cada ponto com B, N, D ou NA.</p>
      <div class="matrix-accordion">${accordion}</div>
    </div>
  `;
}

function matrixLegendLabel(opt) {
  const map = { B: 'Bom', N: 'Mau', D: 'Danificado', 'N.A.': 'Não aplicável' };
  return map[opt] || opt;
}

function renderLegalVerdictField(field, value = '') {
  const options = field.options || [];
  const cards = options
    .map((opt, idx) => {
      const cls = getLegalVerdictClass(opt);
      const selected = opt === value ? 'selected' : '';
      const workflow = idx === 0 ? 'Apta' : idx === 1 ? 'Reparações' : 'Interdição';
      return `
        <button type="button"
          class="legal-verdict-card ${cls} ${selected}"
          data-value="${escapeHtml(opt)}"
          aria-pressed="${opt === value}">
          <span class="legal-verdict-workflow">${escapeHtml(workflow)}</span>
          <span class="legal-verdict-text">${escapeHtml(opt)}</span>
        </button>
      `;
    })
    .join('');

  return `
    <div class="form-group field-block legal-verdict-field" data-legal-verdict="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="legal-verdict-options">${cards}</div>
    </div>
  `;
}

function renderGridField(field, value = '') {
  const rows = field.rows || 6;
  const cols = field.cols || 4;

  return `
    <div class="form-group field-block">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <p class="field-hint">${escapeHtml(field.hint || `Grelha ${cols}×${rows}`)}</p>
      <div class="voltage-grid-preview" aria-hidden="true">
        ${Array.from({ length: rows }, (_, r) => `
          <div class="voltage-grid-row">
            ${Array.from({ length: cols }, (_, c) => `
              <span class="voltage-cell">C${r * cols + c + 1}</span>
            `).join('')}
          </div>
        `).join('')}
      </div>
      <textarea class="form-textarea grid-textarea" data-field-id="${field.id}" data-field-kind="grid"
        rows="6" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(String(value))}</textarea>
    </div>
  `;
}

export async function bindFormFieldInteractions(overlay) {
  try {
    await bindClientComboboxes(overlay);
  } catch (err) {
    console.error('[Form] Combobox de cliente:', err);
  }

  overlay.querySelectorAll('[data-choice-group]').forEach((group) => {
    group.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.choice-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  });

  overlay.querySelectorAll('[data-status-pills]').forEach((group) => {
    group.querySelectorAll('.status-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        group.querySelectorAll('.status-pill').forEach((p) => {
          p.classList.remove('selected');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('selected');
        pill.setAttribute('aria-pressed', 'true');
      });
    });
  });

  overlay.querySelectorAll('[data-toggle-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const wrap = input.closest('[data-toggle-wrap]');
      const label = overlay.querySelector(`[data-state-label="${input.dataset.toggleField}"]`);
      if (label && wrap) {
        label.textContent = input.checked ? wrap.dataset.onValue : wrap.dataset.offValue;
      }
    });
  });

  overlay.querySelectorAll('.verification-accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.verification-accordion-item');
      const isOpen = item?.classList.toggle('is-open');
      header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  overlay.querySelectorAll('[data-verification-field]').forEach((wrap) => {
    const pulseCard = (card) => {
      if (!card) return;
      card.classList.remove('verification-card--pulse');
      void card.offsetWidth;
      card.classList.add('verification-card--pulse');
      card.addEventListener('animationend', () => card.classList.remove('verification-card--pulse'), { once: true });
    };

    wrap.querySelectorAll('[data-verify-item]').forEach((input) => {
      const syncCard = () => {
        const card = input.closest('.verification-card');
        const badge = wrap.querySelector(`[data-verify-badge="${input.dataset.verifyItem}"]`);
        const isFail = input.checked;
        if (card) {
          card.classList.toggle('verification-card--ok', !isFail);
          card.classList.toggle('verification-card--fail', isFail);
          card.setAttribute('aria-label', `${card.querySelector('.verification-card-label')?.textContent || ''} — ${isFail ? 'Não OK' : 'OK'}`);
        }
        if (badge) {
          badge.textContent = isFail ? 'Não OK' : 'OK';
          badge.classList.toggle('verification-badge--ok', !isFail);
          badge.classList.toggle('verification-badge--fail', isFail);
        }
        updateVerificationAccordionProgress(wrap);
      };

      const card = input.closest('.verification-card');
      card?.addEventListener('click', (e) => {
        if (e.target.closest('.verification-switch')) return;
        input.checked = !input.checked;
        pulseCard(card);
        syncCard();
      });
      card?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.checked = !input.checked;
          pulseCard(card);
          syncCard();
        }
      });

      input.addEventListener('change', () => {
        pulseCard(input.closest('.verification-card'));
        syncCard();
      });
      syncCard();
    });
    updateVerificationAccordionProgress(wrap);
  });

  overlay.querySelectorAll('.material-qty-input').forEach((input) => {
    const fieldWrap = input.closest('.material-qty-field');
    const syncMaterial = () => {
      fieldWrap?.classList.toggle('has-value', String(input.value).trim() !== '');
    };
    input.addEventListener('focus', () => fieldWrap?.classList.add('is-focused'));
    input.addEventListener('blur', () => fieldWrap?.classList.remove('is-focused'));
    input.addEventListener('input', syncMaterial);
    syncMaterial();
  });

  overlay.querySelectorAll('[data-dynamic-table]').forEach((wrap) => {
    const columns = JSON.parse(wrap.dataset.columns || '[]');
    const colKeys = columns.map((c) => columnKey(c));
    const defaultRow = JSON.parse(wrap.dataset.defaultRow || '{}');
    const tbody = wrap.querySelector('.dynamic-table-body');
    const fieldId = wrap.dataset.dynamicTable;
    const fieldDef = { id: fieldId, columnTypes: {}, columns };
    colKeys.forEach((key, i) => {
      const colLabel = columns[i];
      if (key.includes('data') || key.startsWith('data_')) fieldDef.columnTypes[key] = 'date';
      else if (key === 'horas' || key === 'quantidade') fieldDef.columnTypes[key] = 'number';
    });

    const buildRow = (rowData = defaultRow) => {
      const tr = document.createElement('tr');
      tr.className = 'dynamic-table-row';
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement('td');
        td.dataset.colLabel = columns[colIdx];
        td.innerHTML = renderDynamicTableCell(fieldDef, columns[colIdx], key, rowData);
        tr.appendChild(td);
      });
      const tdAct = document.createElement('td');
      tdAct.className = 'dynamic-table-actions';
      tdAct.innerHTML = '<button type="button" class="btn-row-remove" title="Remover" aria-label="Remover linha">&times;</button>';
      tdAct.querySelector('.btn-row-remove')?.addEventListener('click', () => {
        if (tbody.querySelectorAll('.dynamic-table-row').length > 1) tr.remove();
      });
      tr.appendChild(tdAct);
      tr.classList.add('dynamic-table-row--enter');
      requestAnimationFrame(() => tr.classList.remove('dynamic-table-row--enter'));
      return tr;
    };

    const addRow = () => {
      tbody.appendChild(buildRow({ ...defaultRow }));
    };

    wrap.querySelector('.dynamic-table-add')?.addEventListener('click', (e) => {
      e.preventDefault();
      addRow();
    });

    wrap.querySelectorAll('.btn-row-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const row = btn.closest('.dynamic-table-row');
        if (tbody.querySelectorAll('.dynamic-table-row').length > 1) row?.remove();
      });
    });
  });

  overlay.querySelectorAll('[data-multi-checkbox]').forEach((group) => {
    group.querySelectorAll('.multi-check-item').forEach((item) => {
      const input = item.querySelector('.multi-check-input');
      if (!input) return;
      const syncChecked = () => item.classList.toggle('is-checked', input.checked);
      syncChecked();
      input.addEventListener('change', syncChecked);
    });
  });

  overlay.querySelectorAll('[data-component-toggle]').forEach((group) => {
    group.querySelectorAll('.component-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.component-toggle-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        evaluateFieldDependencies(overlay);
      });
    });
  });

  evaluateFieldDependencies(overlay);

  overlay.querySelectorAll('.matrix-accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.matrix-accordion-item');
      const isOpen = item?.classList.toggle('is-open');
      header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  overlay.querySelectorAll('[data-matrix-field]').forEach((wrap) => {
    wrap.querySelectorAll('.matrix-row').forEach((row) => {
      syncMatrixRowState(row);
      row.querySelectorAll('.matrix-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.matrix-opt').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          syncMatrixRowState(row);
          const catEl = row.closest('.matrix-accordion-item');
          if (catEl) updateMatrixCategoryProgress(catEl);
        });
      });
    });
    wrap.querySelectorAll('.matrix-accordion-item').forEach(updateMatrixCategoryProgress);
  });

  overlay.querySelectorAll('[data-legal-verdict]').forEach((group) => {
    group.querySelectorAll('.legal-verdict-card').forEach((card) => {
      card.addEventListener('click', () => {
        group.querySelectorAll('.legal-verdict-card').forEach((c) => {
          c.classList.remove('selected');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
      });
    });
  });
}
