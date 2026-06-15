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
  columnKey,
  columnLabel,
  emptyMaterialRow,
  isMaterialTableField,
  normalizeMaterialRows,
  MATERIAL_FIELD_IDS,
} from './material-table-field.js';
import { EMPILHADORES_MATERIAL_SECTION } from './mock_data.js';
import {
  renderGrandesBatterySection,
  collect as collectGrandesBatteryRows,
  GRANDES_BATTERY_FIELD_ID,
  getColumnLabels,
  getColumnKeys,
} from './views/relatorio-grandes.js';
import {
  isDeslocacaoField,
  isDeslocacaoMetaField,
  isVisitasField,
  SERVICES_WITH_SECTION_VISITAS,
  STANDARD_VISITAS_FIELD,
  VISITAS_FIELD_ID,
} from './deslocacao-field.js';
import { splitDl50MatrixCategories } from './inspecao-dl50-categories.js';

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

const DATE_FIELD_ID_RE =
  /^(data_|data_de_|data_fabrico|data_fabricacao|data_rececao|concluido_testado_em|data_1|data_2)/i;
const TIME_FIELD_ID_RE = /^(hora_|hora_inicio|hora_fim|hora_de_)/i;
const DATETIME_FIELD_ID_RE = /^(data_hora|datetime)/i;

/** Valor para input type="date" (YYYY-MM-DD) */
export function toHtmlDateValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(text.includes('T') ? text : `${text}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/** Valor guardado — data ISO (YYYY-MM-DD) */
export function normalizeDateForStorage(val) {
  return toHtmlDateValue(val) || String(val ?? '').trim();
}

/** Valor para input type="time" (HH:mm) */
export function toHtmlTimeValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  const hm = text.match(/(\d{1,2}):(\d{2})/);
  if (hm) return `${String(hm[1]).padStart(2, '0')}:${hm[2]}`;
  return '';
}

export function normalizeTimeForStorage(val) {
  return toHtmlTimeValue(val) || String(val ?? '').trim();
}

/** Valor para input type="datetime-local" (YYYY-MM-DDTHH:mm) */
export function toHtmlDatetimeLocalValue(val) {
  const text = String(val ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/);
  if (iso) {
    const hm = iso[2].match(/(\d{1,2}):(\d{2})/);
    const time = hm ? `${String(hm[1]).padStart(2, '0')}:${hm[2]}` : '00:00';
    return `${iso[1]}T${time}`;
  }
  const datePart = toHtmlDateValue(text);
  const timePart = toHtmlTimeValue(text);
  if (datePart && timePart) return `${datePart}T${timePart}`;
  if (datePart) return `${datePart}T00:00`;
  return '';
}

export function normalizeDatetimeForStorage(val) {
  return toHtmlDatetimeLocalValue(val) || String(val ?? '').trim();
}

function resolveFieldInputType(field) {
  const type = field?.type;
  if (type === 'date' || type === 'time' || type === 'datetime' || type === 'datetime-local') {
    return type === 'datetime' ? 'datetime-local' : type;
  }
  const id = field?.id || '';
  if (DATETIME_FIELD_ID_RE.test(id)) return 'datetime-local';
  if (TIME_FIELD_ID_RE.test(id)) return 'time';
  if (DATE_FIELD_ID_RE.test(id) || /fabrico|rececao|conclusao/i.test(id)) return 'date';
  return type;
}

function normalizeDynamicCellValue(inputType, val) {
  if (inputType === 'date') return normalizeDateForStorage(val);
  if (inputType === 'time') return normalizeTimeForStorage(val);
  if (inputType === 'datetime-local' || inputType === 'datetime') return normalizeDatetimeForStorage(val);
  return String(val ?? '').trim();
}

export function isOfficialTemplate(service) {
  return Boolean(service?.companyName && (service?.title || service?.label));
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

/** Serviços onde o técnico identifica a máquina no ecrã (Marca/Modelo/Nº Série). */
const SERVICES_WITH_MACHINE_FIELDS = new Set([
  'inspecao_dl50_2005',
  'folha_intervencao_avarias',
  'manutencao_preventiva_empilhadores',
  'manutencao_corretiva_maquinas',
  'reparacao_carregador',
]);

const SERVICE_MACHINE_FIELD_SECTIONS = {
  reparacao_carregador: 'Identificação Do Carregador',
};

const EMPILHADORES_SERVICE_ID = 'manutencao_preventiva_empilhadores';
const EMPILHADORES_MACHINE_SECTION = 'Informações da Máquina';

/** Relatórios com Nr de Visitas na secção dedicada do formulário (não no intro) */

function filterReportFields(fields, service) {
  return (fields || []).filter((f) => {
    if (isDeslocacaoField(f) || isDeslocacaoMetaField(f)) return false;
    if (isVisitasField(f) && !SERVICES_WITH_SECTION_VISITAS.has(service?.id)) return false;
    const machineSection = SERVICE_MACHINE_FIELD_SECTIONS[service?.id];
    if (
      SERVICES_WITH_MACHINE_FIELDS.has(service?.id) &&
      (f.section === 'Informações da Máquina' ||
        (machineSection && f.section === machineSection))
    ) {
      return true;
    }
    return !isMachineTrackingField(f);
  });
}

/** Visitas no bloco intro — Informações Gerais / Dados da Intervenção */
export function renderDeslocacaoIntroBlock(values = {}, context = {}) {
  const service = context?.service;
  const visitas = values[VISITAS_FIELD_ID] ?? values.visitas ?? 1;
  const showVisitasInIntro = !SERVICES_WITH_SECTION_VISITAS.has(service?.id);
  if (!showVisitasInIntro) return '';

  return `
    <div class="form-intro-deslocacao-grid">
      <div class="form-intro-visitas">${renderField(STANDARD_VISITAS_FIELD, visitas, context)}</div>
    </div>
  `;
}

/** @deprecated — usar renderDeslocacaoIntroBlock */
export function renderDeslocacaoIntroField(values = {}, context = {}) {
  return renderDeslocacaoIntroBlock(values, context);
}

const SERVICE_FORM_TITLES = {
  manutencao_baterias_grandes: 'Relatório de Manutenção de Baterias',
  manutencao_preventiva_bateria: 'Relatório de Manutenção Preventiva de Bateria',
  manutencao_preventiva_empilhadores: 'Relatório de Manutenção Preventiva de Empilhadores',
  manutencao_corretiva_maquinas: 'Relatório de Manutenção Corretiva',
  folha_intervencao_avarias: 'Folha de Intervenção de Avarias',
  reparacao_avarias_bateria: 'Relatório de Reparação de Baterias',
  reparacao_carregador: 'Relatório de Reparação de Carregador',
  inspecao_dl50_2005: 'Inspeção DL 50/2005',
};

/** Título curto do formulário (ecrã técnico) */
export function getServiceFormTitle(service) {
  if (!service) return 'Relatório';
  return SERVICE_FORM_TITLES[service.id] || service.label || service.title || 'Relatório';
}

export function resolveClientDisplayMeta(client) {
  const nome = client?.name || client?.Nome || 'Cliente não indicado';
  const morada = client?.Morada || client?.morada || '';
  const cp = client?.['Código postal'] || client?.codigoPostal || '';
  const loc = client?.Localidade || client?.localidade || '';
  const addressParts = [morada, [cp, loc].filter(Boolean).join(' ')].filter(Boolean);
  const address = client?.address || addressParts.join(', ') || '';
  const phone =
    client?.phone ||
    client?.telemovel ||
    client?.Telemovel ||
    client?.telefone ||
    client?.Telefone ||
    '';
  const email = client?.email || client?.['E-mail'] || '';
  return { nome, address, phone, email };
}

/** Cabeçalho com dados do cliente (destino da intervenção) */
export function renderJobClientHeader(client) {
  const { nome, address, phone, email } = resolveClientDisplayMeta(client);

  const addressHtml = address
    ? `<p class="job-client-header-address">${escapeHtml(address)}</p>`
    : `<p class="job-client-header-address job-client-header-address--muted">Morada não registada</p>`;

  let contactHtml = '';
  if (phone) {
    const telHref = phone.replace(/[^\d+]/g, '');
    contactHtml = `
      <p class="job-client-header-contact">
        <span class="job-client-header-label">Contacto</span>
        <a href="tel:${escapeHtml(telHref)}" class="job-client-header-link">${escapeHtml(phone)}</a>
      </p>`;
  } else if (email) {
    contactHtml = `
      <p class="job-client-header-contact">
        <span class="job-client-header-label">E-mail</span>
        <a href="mailto:${escapeHtml(email)}" class="job-client-header-link">${escapeHtml(email)}</a>
      </p>`;
  }

  return `
    <div class="job-client-header glass-card-inner">
      <p class="job-client-header-name">${escapeHtml(nome)}</p>
      ${addressHtml}
      ${contactHtml}
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
      visitas_realizadas: 1,
      estado_final: 'Reparação Concluída',
      consumiveis: [emptyMaterialRow()],
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
      etiqueta: '',
      responsavel: '',
      registo_intervencao: [interventionRow],
      resultado_teste: [{ valor_da_amperagem_debitado: '', equipamento: '' }],
      consumiveis_material: [emptyMaterialRow()],
    };
  }

  if (service.id === 'folha_intervencao_avarias') {
    return {
      data_1: job?.date || '',
      visitas_realizadas: 1,
      pedido_orcamento: 'Não',
      material_utilizado: [emptyMaterialRow()],
    };
  }

  if (service.id === 'manutencao_baterias_grandes') {
    return {
      data_de_conclusao: job?.date || '',
      [GRANDES_BATTERY_FIELD_ID]: [{}],
      consumiveis_utilizados: [emptyMaterialRow()],
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
      consumiveis: [emptyMaterialRow()],
      visitas_realizadas: 1,
      ...toggles,
    };
  }

  if (service.id === 'manutencao_preventiva_empilhadores') {
    const prefill = {
      data_de_conclusao: job?.date || '',
      estado_maquina: 'Operacional',
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

export function mergeFormValues(existing = {}, prefill = {}, service = null) {
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

  (service?.fields || []).forEach((field) => {
    if (!isMaterialTableField(field)) return;
    if (merged[field.id] !== undefined) {
      merged[field.id] = normalizeMaterialRows(merged[field.id]);
    }
  });
  return merged;
}

const REPORT_TAB_CHECKLIST_TYPES = new Set(['verification_toggles', 'matrix_4options']);
const REPORT_TAB_FINAL_TYPES = new Set(['legal_verdict']);

/** Secção do formulário em abas — Geral | Checklist | Finalização */
export function getReportFieldTab(field, service = null) {
  if (REPORT_TAB_FINAL_TYPES.has(field?.type)) return 'finalizacao';
  if (REPORT_TAB_CHECKLIST_TYPES.has(field?.type)) return 'checklist';
  if (
    service?.id === 'manutencao_preventiva_empilhadores' &&
    field?.section === EMPILHADORES_MATERIAL_SECTION
  ) {
    return 'checklist';
  }
  return 'geral';
}

export function analyzeReportFormTabs(service) {
  const fields = filterReportFields(service?.fields, service);
  const tabs = { geral: true, checklist: false, finalizacao: true };
  fields.forEach((field) => {
    const tab = getReportFieldTab(field, service);
    if (tab === 'checklist') tabs.checklist = true;
    if (tab === 'finalizacao') tabs.finalizacao = true;
  });
  return tabs;
}

export function renderReportFormTabsNav(service, activeTab = 'geral') {
  const tabs = analyzeReportFormTabs(service);
  const items = [
    { id: 'geral', label: 'Geral', icon: '📋' },
    { id: 'checklist', label: 'Checklist', icon: '🔧' },
    { id: 'finalizacao', label: 'Finalização', icon: '📸' },
  ].filter((item) => tabs[item.id]);

  return `
    <nav class="report-form-tabs" role="tablist" aria-label="Secções do relatório">
      ${items
        .map(
          (item) => `
        <button type="button" class="report-form-tab${activeTab === item.id ? ' is-active' : ''}"
          role="tab" data-report-tab="${item.id}" aria-selected="${activeTab === item.id ? 'true' : 'false'}"
          id="report-tab-${item.id}" aria-controls="report-panel-${item.id}" tabindex="${activeTab === item.id ? '0' : '-1'}">
          <span class="report-form-tab-icon" aria-hidden="true">${item.icon}</span>
          <span class="report-form-tab-label">${item.label}</span>
        </button>`,
        )
        .join('')}
    </nav>
  `;
}

export function bindReportFormTabs(overlay, options = {}) {
  const tabButtons = overlay.querySelectorAll('[data-report-tab]');
  const panels = overlay.querySelectorAll('[data-report-panel]');
  if (!tabButtons.length || !panels.length) return;

  const activate = (tabId) => {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.reportTab === tabId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.dataset.reportPanel === tabId;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (tabId) {
      requestAnimationFrame(() => options.onTabActivate?.(tabId));
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.reportTab));
  });
}

const EMPILHADORES_VERIFY_DUAL_SECTION = '__empilhadores_verifications_dual__';

function mergeEmpilhadoresChecklistGroups(groups, service) {
  if (service?.id !== EMPILHADORES_SERVICE_ID) return groups;
  const merged = [];
  let index = 0;
  while (index < groups.length) {
    const current = groups[index];
    const next = groups[index + 1];
    const externField = current.fields.find((f) => f.id === 'componentes_externos');
    const internField = next?.fields.find((f) => f.id === 'componentes_internos');
    if (
      current.section === 'Verificações Externas' &&
      externField &&
      next?.section === 'Verificações Internas' &&
      internField
    ) {
      merged.push({
        section: EMPILHADORES_VERIFY_DUAL_SECTION,
        fields: [externField, internField],
      });
      index += 2;
      continue;
    }
    merged.push(current);
    index += 1;
  }
  return merged;
}

function renderEmpilhadoresVerificationTable(field, value) {
  const items = field.items || [];
  const states = value && typeof value === 'object' ? value : {};
  const title = field.pdfTitle || field.section || field.label;
  const { ok, total } = countVerificationProgress(items, states);

  const rows = items
    .map((item) => {
      const spec = normalizeVerifyItem(item);
      const isFail = states[spec.id] === 'Não OK';
      const stateClass = isFail ? 'verification-card--fail' : 'verification-card--ok';
      const badgeClass = isFail ? 'verification-badge--fail' : 'verification-badge--ok';
      const badgeText = isFail ? 'Não OK' : 'OK';
      const checked = isFail ? 'checked' : '';

      return `
        <tr class="verification-card empilhadores-verify-row ${stateClass}" data-verify-card="${spec.id}" role="button" tabindex="0"
          aria-label="${escapeHtml(spec.label)} — ${badgeText}">
          <th scope="row" class="empilhadores-verify-point verification-card-label">${escapeHtml(spec.label)}</th>
          <td class="empilhadores-verify-state verification-card-control">
            <span class="verification-badge ${badgeClass}" data-verify-badge="${spec.id}">${badgeText}</span>
            <label class="verification-switch" aria-label="Alternar estado ${escapeHtml(spec.label)}">
              <input type="checkbox" class="sr-only" data-verify-item="${spec.id}" ${checked}>
              <span class="verify-track"><span class="verify-thumb"></span></span>
            </label>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="empilhadores-verify-column verification-toggles-field" data-verification-field="${field.id}">
      <div class="empilhadores-verify-column-header">
        <h5 class="empilhadores-verify-column-title">${escapeHtml(title)}</h5>
        <div class="empilhadores-verify-column-meta">
          <span class="matrix-cat-progress" data-verify-progress>${ok}/${total}</span>
          ${verificationBulkOkBtnHtml(title)}
        </div>
      </div>
      <div class="empilhadores-verify-table-wrap">
        <table class="empilhadores-verify-table">
          <thead>
            <tr>
              <th scope="col">Ponto</th>
              <th scope="col">Est.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderEmpilhadoresChecklistSection(section, fields, values, context) {
  if (section === EMPILHADORES_VERIFY_DUAL_SECTION) {
    const fieldsHtml = `
      <div class="empilhadores-verifications-dual">
        ${fields.map((field) => renderEmpilhadoresVerificationTable(field, values[field.id])).join('')}
      </div>
    `;
    return `
      <div class="form-field-section form-section-card form-field-section--empilhadores-verify">
        ${fieldsHtml}
      </div>
    `;
  }

  if (section !== EMPILHADORES_MATERIAL_SECTION) return '';

  const sectionTitle = `<h4 class="form-section-subtitle form-section-subtitle--empilhadores-material">${escapeHtml(section)}</h4>`;
  const fieldsHtml = `<div class="material-substitution-grid material-substitution-grid--empilhadores">${fields
    .map((f) => renderField(f, values[f.id], context))
    .join('')}</div>`;
  return `
    <div class="form-field-section form-section-card form-field-section--material form-field-section--empilhadores-material">
      <div class="empilhadores-material-block">
        ${sectionTitle}
        ${fieldsHtml}
      </div>
    </div>
  `;
}

function mergeGrandesDualFooterGroups(groups) {
  const result = [];
  let i = 0;
  while (i < groups.length) {
    const current = groups[i];
    const next = groups[i + 1];
    const hasMaterial = current.fields.some((f) => isMaterialTableField(f));
    const nextHasObs = next?.fields?.some((f) => f.id === 'observacoes');
    if (hasMaterial && nextHasObs) {
      result.push({
        section: null,
        fields: [...current.fields, ...next.fields],
        _grandesDualFooter: true,
      });
      i += 2;
      continue;
    }
    result.push(current);
    i += 1;
  }
  return result;
}

export function renderReportFields(service, values = {}, context = {}, options = {}) {
  const tabFilter = options.tab || null;
  let fields = filterReportFields(service?.fields, service);
  if (tabFilter) {
    fields = fields.filter((field) => getReportFieldTab(field, service) === tabFilter);
  }
  if (!fields.length) {
    if (tabFilter === 'checklist') {
      return '<p class="report-tab-empty text-muted">Este relatório não inclui checklist de inspeção estruturada.</p>';
    }
    if (tabFilter === 'finalizacao') return '';
    return '<p class="text-muted">Sem campos definidos.</p>';
  }

  let groups = groupFieldsBySection(fields).filter(({ fields: sectionFields }) => sectionFields.length);
  if (service?.id === 'manutencao_baterias_grandes') {
    groups = mergeGrandesDualFooterGroups(groups);
  }
  if (service?.id === EMPILHADORES_SERVICE_ID && tabFilter === 'checklist') {
    groups = mergeEmpilhadoresChecklistGroups(groups, service);
    return groups
      .map(({ section, fields: sectionFields }) =>
        renderEmpilhadoresChecklistSection(section, sectionFields, values, context),
      )
      .join('');
  }

  return groups
    .map(({ section, fields: sectionFields, _grandesDualFooter }) => {
      const hideSectionTitle =
        section &&
        sectionFields.every(
          (f) => f.type === 'verification_toggles' && f.collapsible && f.section === section,
        );
      const sectionTitle =
        section && !hideSectionTitle
          ? `<h4 class="form-section-subtitle">${escapeHtml(section)}</h4>`
          : '';
      let fieldsHtml = sectionFields.map((f) => renderField(f, values[f.id], context)).join('');
      if (
        section === EMPILHADORES_MACHINE_SECTION &&
        service?.id === EMPILHADORES_SERVICE_ID
      ) {
        fieldsHtml = `<div class="empilhadores-machine-grid">${fieldsHtml}</div>`;
      }
      if (section === EMPILHADORES_MATERIAL_SECTION) {
        fieldsHtml = `<div class="material-substitution-grid material-substitution-grid--empilhadores">${fieldsHtml}</div>`;
      }
      if (section === 'Datas de Intervenção') {
        fieldsHtml = `<div class="folha-datas-intervencao-grid">${fieldsHtml}</div>`;
      }
      if (section === 'Pedido de Orçamento') {
        fieldsHtml = `<div class="folha-pedido-orcamento-block">${fieldsHtml}</div>`;
      }
      const isCarregador = service?.id === 'reparacao_carregador';
      if (isCarregador && section === 'Identificação Cliente') {
        fieldsHtml = `<div class="carregador-cliente-grid">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (isCarregador && section === 'Identificação Do Carregador') {
        fieldsHtml = `<div class="carregador-identificacao-bar">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (
        isCarregador &&
        (section === 'Registo de Intervenção' ||
          section === 'Resultado do Teste' ||
          (section && /consum/i.test(section)))
      ) {
        fieldsHtml = `<div class="carregador-dashboard-section">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (isCarregador && section === 'Fecho') {
        fieldsHtml = `<div class="carregador-fecho-fields">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (
        isCarregador &&
        !section &&
        sectionFields.some((f) => f.type === 'dynamic_table' || isMaterialTableField(f))
      ) {
        fieldsHtml = `<div class="carregador-dashboard-section">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      const isCorretiva = service?.id === 'manutencao_corretiva_maquinas';
      if (isCorretiva && section === 'Informações da Máquina') {
        fieldsHtml = `<div class="corretiva-machine-grid">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (isCorretiva && section === 'Verificações') {
        fieldsHtml = `<div class="corretiva-verifications-shell">${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (
        isCorretiva &&
        !section &&
        sectionFields.some((f) => f.id === 'observacoes')
      ) {
        fieldsHtml = `<div class="corretiva-observations-box">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      const isGrandes = service?.id === 'manutencao_baterias_grandes';
      if (isGrandes && section === 'Identificação Bateria') {
        fieldsHtml = `<div class="grandes-battery-shell">${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      if (isGrandes && _grandesDualFooter) {
        const materialHtml = sectionFields
          .filter((f) => isMaterialTableField(f))
          .map((f) => renderField(f, values[f.id], context))
          .join('');
        const obsHtml = sectionFields
          .filter((f) => f.id === 'observacoes')
          .map((f) => renderField(f, values[f.id], context))
          .join('');
        fieldsHtml = `<div class="grandes-footer-dual">
          <div class="grandes-dashboard-section">${materialHtml}</div>
          <div class="grandes-observations-box">${obsHtml}</div>
        </div>`;
        sectionTitle = '';
      } else if (
        isGrandes &&
        sectionFields.some((f) => isMaterialTableField(f))
      ) {
        fieldsHtml = `<div class="grandes-dashboard-section">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      } else if (
        isGrandes &&
        !section &&
        sectionFields.some((f) => f.id === 'observacoes')
      ) {
        fieldsHtml = `<div class="grandes-observations-box">${sectionTitle}${fieldsHtml}</div>`;
        sectionTitle = '';
      }
      return `
        <div class="form-field-section form-section-card${
          section === EMPILHADORES_MACHINE_SECTION && service?.id === EMPILHADORES_SERVICE_ID
            ? ' form-field-section--empilhadores-machine'
            : ''
        }${section === EMPILHADORES_MATERIAL_SECTION ? ' form-field-section--material form-field-section--empilhadores-material' : ''}${section === 'Pedido de Orçamento' ? ' form-field-section--pedido-orcamento' : ''}${isCarregador ? ' form-field-section--carregador' : ''}${isCorretiva ? ' form-field-section--corretiva' : ''}${isGrandes ? ' form-field-section--grandes' : ''}">
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
  if (field?.columnTypes?.[key]) {
    const t = field.columnTypes[key];
    return t === 'datetime' ? 'datetime-local' : t;
  }
  if (key.includes('data_hora') || key.includes('datetime')) return 'datetime-local';
  if (key === 'hora' || key.startsWith('hora_') || key.endsWith('_hora')) return 'time';
  if (key.includes('data') || key.startsWith('data_')) return 'date';
  if (key === 'horas' || key === 'quantidade' || key === 'tensao_v' || key === 'densidade') return 'number';
  return 'text';
}

function numberInputMode(step = 1) {
  const n = Number(step);
  return n === 1 || Number.isInteger(n) ? 'numeric' : 'decimal';
}

function numberInputAttrs(field = {}, stepOverride) {
  const step = stepOverride ?? field.step ?? 1;
  const attrs = [`step="${step}"`, `inputmode="${numberInputMode(step)}"`];
  if (field.min != null) attrs.push(`min="${field.min}"`);
  if (field.max != null) attrs.push(`max="${field.max}"`);
  return attrs.join(' ');
}

function formatDynamicCellDisplayValue(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    const nested =
      val.artigo ??
      val.descricao ??
      val.material ??
      val.equipamento ??
      val.label ??
      val.value ??
      val.qtd ??
      val.quantidade;
    if (nested !== undefined && nested !== null && typeof nested !== 'object') {
      return String(nested).trim();
    }
    return '';
  }
  const text = String(val).trim();
  return text === '[object Object]' ? '' : text;
}

function getFieldUnit(field) {
  if (field?.unit) return String(field.unit);
  if (field?.id === 'deslocacao') return 'Km';
  if (field?.id === 'tensao' || field?.id === 'tensao_media_elementos' || field?.id === 'tensao_v') {
    return 'V';
  }
  return '';
}

function renderDynamicTableCell(field, col, key, row) {
  const val = formatDynamicCellDisplayValue(row[key]);
  const inputType = getDynamicColumnInputType(field, key);
  const colLabel = typeof col === 'object' ? columnLabel(col) : String(col);
  const placeholder = colLabel;

  if (inputType === 'date') {
    return `<input type="date" class="form-input form-input-sm form-input-date" data-col="${key}"
      value="${escapeHtml(toHtmlDateValue(val))}">`;
  }
  if (inputType === 'time') {
    return `<input type="time" class="form-input form-input-sm form-input-time" data-col="${key}"
      value="${escapeHtml(toHtmlTimeValue(val))}">`;
  }
  if (inputType === 'datetime-local') {
    return `<input type="datetime-local" class="form-input form-input-sm form-input-datetime" data-col="${key}"
      value="${escapeHtml(toHtmlDatetimeLocalValue(val))}">`;
  }
  if (inputType === 'number') {
    const step = key === 'horas' ? '0.5' : key === 'densidade' ? '0.01' : '1';
    return `<input type="number" class="form-input form-input-sm" data-col="${key}"
      value="${escapeHtml(val)}" placeholder="0" min="0" ${numberInputAttrs({}, step)}>`;
  }
  return `<input type="text" class="form-input form-input-sm" data-col="${key}"
    value="${escapeHtml(val)}" placeholder="${escapeHtml(placeholder)}">`;
}

function isClientPickerField(field) {
  if (!field) return false;
  if (field.type === 'client_combobox') return true;
  if (field.id === 'cliente') return true;
  return field.label === 'Cliente' && String(field.section || '').includes('Cliente');
}

function renderLockedClientDisplayField(field, value = '', context = {}) {
  const nome =
    value ||
    context.client?.Nome ||
    context.client?.name ||
    '—';
  return `
    <div class="${gridEligibleFieldBlockClass('field-block--readonly')}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="form-readonly-value hf-value" aria-readonly="true">${escapeHtml(nome)}</div>
    </div>
  `;
}

function renderField(field, value = '', context = {}) {
  const lockClient = context.lockClient ?? Boolean(context.job);
  if (lockClient && isClientPickerField(field)) {
    if (context.service?.id === 'reparacao_carregador') {
      return renderLockedClientDisplayField(field, value, context);
    }
    return '';
  }

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
    case 'text': {
      if (field.id === 'cliente' || (field.label === 'Cliente' && field.section?.includes('Cliente'))) {
        html = renderClientCombobox({
          fieldId: field.id,
          label: field.label,
          value: value || context.client?.Nome || context.client?.name || '',
          selectedId: context.selectedClientId || context.client?.NIF || context.client?.id || '',
        });
        break;
      }
      const resolved = resolveFieldInputType(field);
      if (resolved === 'date') {
        html = renderDateField(field, value);
        break;
      }
      if (resolved === 'time') {
        html = renderTimeField(field, value);
        break;
      }
      if (resolved === 'datetime-local') {
        html = renderDatetimeField(field, value);
        break;
      }
      html = renderTextField(field, value);
      break;
    }
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
    case 'time':
      html = renderTimeField(field, value);
      break;
    case 'datetime':
    case 'datetime-local':
      html = renderDatetimeField(field, value);
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
      html = renderVerificationTogglesField(field, value, context.service);
      break;
    case 'matrix_4options':
      html = renderMatrix4OptionsField(field, value, context.service);
      break;
    case 'legal_verdict':
      html = renderLegalVerdictField(field, value, context.service);
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
    if (['text', 'textarea', 'longtext', 'number', 'dropdown', 'grid'].includes(kind)) {
      values[id] = el.value;
    } else if (kind === 'date') {
      values[id] = normalizeDateForStorage(el.value);
    } else if (kind === 'time') {
      values[id] = normalizeTimeForStorage(el.value);
    } else if (kind === 'datetime' || kind === 'datetime-local') {
      values[id] = normalizeDatetimeForStorage(el.value);
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
    const fieldDef = { columnTypes: {} };
    columns.forEach((col) => {
      const key = columnKey(col);
      fieldDef.columnTypes[key] = getDynamicColumnInputType(fieldDef, key);
    });

    wrap.querySelectorAll('.dynamic-table-row').forEach((rowEl) => {
      const row = {};
      columns.forEach((col) => {
        const key = columnKey(col);
        const inputType = fieldDef.columnTypes[key];
        const raw = rowEl.querySelector(`[data-col="${key}"]`)?.value ?? '';
        row[key] = normalizeDynamicCellValue(inputType, raw);
      });
      if (Object.values(row).some((v) => v)) rows.push(row);
    });
    values[fieldId] = MATERIAL_FIELD_IDS.has(fieldId) ? normalizeMaterialRows(rows) : rows;
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

function resolveDependencySelectedValue(overlay, depId) {
  const compGroup = overlay.querySelector(`[data-component-toggle="${depId}"]`);
  if (compGroup) {
    return compGroup.querySelector('.component-toggle-btn.selected')?.dataset.value ?? null;
  }

  const toggleInput = overlay.querySelector(`[data-toggle-field="${depId}"]`);
  if (toggleInput) {
    const toggleWrap = toggleInput.closest('[data-toggle-wrap]');
    return toggleInput.checked ? toggleWrap?.dataset.onValue : toggleWrap?.dataset.offValue;
  }

  const pills = overlay.querySelector(`[data-status-pills="${depId}"]`);
  if (pills) {
    return pills.querySelector('.status-pill.selected')?.dataset.value ?? null;
  }

  const choiceGroup = overlay.querySelector(`[data-choice-group="${depId}"]`);
  if (choiceGroup) {
    return choiceGroup.querySelector('.choice-btn.selected')?.dataset.value ?? null;
  }

  return null;
}

export function evaluateFieldDependencies(overlay) {
  overlay.querySelectorAll('[data-dependency]').forEach((wrap) => {
    const dep = wrap.dataset.dependency;
    const [depId, expected] = dep.split(':');
    const show = resolveDependencySelectedValue(overlay, depId) === expected;
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
            const head = labels.map((c) => `<th>${escapeHtml(columnLabel(c))}</th>`).join('');
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

function gridEligibleFieldBlockClass(extraClasses = '') {
  const base = 'form-group field-block field-block--grid-eligible';
  return extraClasses ? `${base} ${extraClasses}` : base;
}

/** Campos de texto que devem abrir teclado numérico no tablet/telemóvel. */
const NUMERIC_KEYBOARD_FIELD_IDS = new Set(['n_interno']);

function renderTextField(field, value = '') {
  // type="text" + inputmode/pattern: teclado numérico sem as setas do type="number"
  const numericAttrs = NUMERIC_KEYBOARD_FIELD_IDS.has(field.id)
    ? ' inputmode="numeric" pattern="[0-9]*"'
    : '';
  return `
    <div class="${gridEligibleFieldBlockClass()}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="text" class="form-input" data-field-id="${field.id}" data-field-kind="text"${numericAttrs}
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
  return field.uiVariant === 'material' || field.section === EMPILHADORES_MATERIAL_SECTION;
}

function renderNumberField(field, value = '') {
  const material = isMaterialQtyField(field);
  const unit = material ? getMaterialUnit(field.label) : getFieldUnit(field);
  const hasValue = value !== '' && value !== null && value !== undefined;
  const materialClasses = material
    ? `material-qty-field${hasValue ? ' has-value' : ''}`
    : '';
  const unitClasses = unit && !material ? `form-input-unit-field${hasValue ? ' has-value' : ''}` : '';
  const displayValue = formatDynamicCellDisplayValue(value);

  if (!material && !unit) {
    return `
      <div class="${gridEligibleFieldBlockClass()}">
        <label class="form-label">${escapeHtml(field.label)}</label>
        <input type="number" class="form-input" data-field-id="${field.id}" data-field-kind="number"
          value="${escapeHtml(displayValue)}" placeholder="${escapeHtml(field.placeholder || '0')}"
          ${numberInputAttrs(field)}>
      </div>
    `;
  }

  if (!material && unit) {
    return `
      <div class="${gridEligibleFieldBlockClass(unitClasses)}">
        <label class="form-label">${escapeHtml(field.label)}</label>
        <div class="form-input-unit-wrap">
          <input type="number" class="form-input form-input-unit-input" data-field-id="${field.id}" data-field-kind="number"
            value="${escapeHtml(displayValue)}" placeholder="${escapeHtml(field.placeholder || '0')}"
            ${numberInputAttrs(field)}>
          <span class="form-input-unit">${escapeHtml(unit)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="${gridEligibleFieldBlockClass(materialClasses)}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="material-qty-input-wrap">
        <input type="number" class="form-input material-qty-input" data-field-id="${field.id}" data-field-kind="number"
          value="${escapeHtml(String(value))}" placeholder="0"
          ${numberInputAttrs(field)}>
        ${unit ? `<span class="material-qty-unit">${escapeHtml(unit)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderDateField(field, value = '') {
  return `
    <div class="${gridEligibleFieldBlockClass()}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="date" class="form-input form-input-date" data-field-id="${field.id}" data-field-kind="date"
        value="${escapeHtml(toHtmlDateValue(value))}" autocomplete="off">
    </div>
  `;
}

function renderTimeField(field, value = '') {
  return `
    <div class="${gridEligibleFieldBlockClass()}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="time" class="form-input form-input-time" data-field-id="${field.id}" data-field-kind="time"
        value="${escapeHtml(toHtmlTimeValue(value))}" autocomplete="off">
    </div>
  `;
}

function renderDatetimeField(field, value = '') {
  return `
    <div class="${gridEligibleFieldBlockClass()}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <input type="datetime-local" class="form-input form-input-datetime" data-field-id="${field.id}"
        data-field-kind="datetime-local" value="${escapeHtml(toHtmlDatetimeLocalValue(value))}" autocomplete="off">
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
    <div class="${gridEligibleFieldBlockClass()}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <select class="form-select" data-field-id="${field.id}" data-field-kind="dropdown">
        <option value="">Selecionar...</option>
        ${options}
      </select>
    </div>
  `;
}

function renderChoiceField(field, value = '') {
  const current = value || field.options?.[0] || '';
  const yesNo = field.uiVariant === 'yesNo';
  const buttons = (field.options || [])
    .map(
      (opt) => `
      <button type="button" class="choice-btn${yesNo && opt === 'Sim' ? ' choice-btn--yes' : ''}${yesNo && opt === 'Não' ? ' choice-btn--no' : ''} ${opt === current ? 'selected' : ''}"
        data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
    `
    )
    .join('');

  return `
    <div class="form-group field-block choice-field${yesNo ? ' choice-field--yes-no' : ''}" data-choice-group="${field.id}">
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
  progressEl.textContent = `${ok}/${total}`;
  if (failEl) {
    failEl.textContent = fail > 0 ? `${fail} Não OK` : '';
    failEl.classList.toggle('is-visible', fail > 0);
    failEl.hidden = fail <= 0;
  }
  updateVerificationBulkOkBtnState(wrap);
}

function isVerificationFieldAllOk(wrap) {
  const items = wrap?.querySelectorAll('[data-verify-item]');
  if (!items?.length) return false;
  return Array.from(items).every((input) => !input.checked);
}

function syncVerificationItemState(input, wrap) {
  const card = input.closest('.verification-card');
  const badge = wrap.querySelector(`[data-verify-badge="${input.dataset.verifyItem}"]`);
  const isFail = input.checked;
  if (card) {
    card.classList.toggle('verification-card--ok', !isFail);
    card.classList.toggle('verification-card--fail', isFail);
    card.setAttribute(
      'aria-label',
      `${card.querySelector('.verification-card-label')?.textContent || ''} — ${isFail ? 'Não OK' : 'OK'}`,
    );
  }
  if (badge) {
    badge.textContent = isFail ? 'Não OK' : 'OK';
    badge.classList.toggle('verification-badge--ok', !isFail);
    badge.classList.toggle('verification-badge--fail', isFail);
  }
}

function markVerificationAllOk(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('[data-verify-item]').forEach((input) => {
    input.checked = false;
    syncVerificationItemState(input, wrap);
  });
  updateVerificationAccordionProgress(wrap);
  wrap.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearVerificationAllOk(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('[data-verify-item]').forEach((input) => {
    input.checked = true;
    syncVerificationItemState(input, wrap);
  });
  updateVerificationAccordionProgress(wrap);
  wrap.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggleVerificationAllOk(wrap) {
  if (!wrap) return;
  if (isVerificationFieldAllOk(wrap)) {
    clearVerificationAllOk(wrap);
  } else {
    markVerificationAllOk(wrap);
  }
}

function updateVerificationBulkOkBtnState(wrap) {
  const bulkBtn = wrap?.querySelector('[data-verification-bulk-ok]');
  if (!bulkBtn) return;
  const allOk = isVerificationFieldAllOk(wrap);
  bulkBtn.classList.toggle('matrix-bulk-good-btn--active', allOk);
  bulkBtn.setAttribute('aria-pressed', allOk ? 'true' : 'false');
}

function verificationBulkOkBtnHtml(title = '') {
  const scope = title ? ` de ${title}` : '';
  return `
    <button type="button" class="matrix-bulk-good-btn" data-verification-bulk-ok
      aria-pressed="false"
      aria-label="Marcar ou limpar todos os pontos${scope} como OK">✓ Tudo OK</button>
  `;
}

function renderCorretivaVerificationField(field, value) {
  const items = field.items || [];
  const states = value && typeof value === 'object' ? value : {};
  const { ok, total } = countVerificationProgress(items, states);

  const rows = items
    .map((item) => {
      const spec = normalizeVerifyItem(item);
      const isFail = states[spec.id] === 'Não OK';
      const stateClass = isFail ? 'verification-card--fail' : 'verification-card--ok';
      const badgeClass = isFail ? 'verification-badge--fail' : 'verification-badge--ok';
      const badgeText = isFail ? 'Não OK' : 'OK';
      const checked = isFail ? 'checked' : '';
      return `
        <tr class="corretiva-verify-row ${stateClass}" data-verify-card="${spec.id}">
          <th scope="row" class="corretiva-verify-point">${escapeHtml(spec.label)}</th>
          <td class="corretiva-verify-state">
            <span class="verification-badge ${badgeClass}" data-verify-badge="${spec.id}">${badgeText}</span>
            <label class="verification-switch corretiva-verify-switch" aria-label="Alternar ${escapeHtml(spec.label)}">
              <input type="checkbox" class="sr-only" data-verify-item="${spec.id}" ${checked}>
              <span class="verify-track"><span class="verify-thumb"></span></span>
            </label>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="form-group field-block verification-toggles-field corretiva-verifications-field" data-verification-field="${field.id}">
      <div class="corretiva-section-bar corretiva-section-bar--table">
        <span class="corretiva-section-bar-title">${escapeHtml(field.label)}</span>
        <div class="corretiva-section-bar-meta">
          <span class="matrix-cat-progress" data-verify-progress>${ok}/${total}</span>
          ${verificationBulkOkBtnHtml(field.label)}
        </div>
      </div>
      <div class="corretiva-table-wrap">
        <table class="corretiva-verify-table">
          <thead>
            <tr>
              <th scope="col">Ponto</th>
              <th scope="col">Est.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderVerificationTogglesField(field, value, service = null) {
  if (service?.id === 'manutencao_corretiva_maquinas') {
    return renderCorretivaVerificationField(field, value);
  }

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
        <div class="verification-inline-toolbar">
          <label class="matrix-accordion-title verification-inline-title">${escapeHtml(field.label)}</label>
          <div class="matrix-accordion-meta">
            <span class="matrix-cat-progress" data-verify-progress>${Object.keys(states).length ? countVerificationProgress(items, states).ok : items.length}/${items.length}</span>
            ${verificationBulkOkBtnHtml(field.label)}
          </div>
        </div>
        <span class="verify-progress-fail verification-inline-fail" data-verify-fail-count hidden></span>
        ${listHtml}
      </div>
    `;
  }

  const { ok, fail, total } = countVerificationProgress(items, states);
  const openClass = field.defaultOpen !== false ? 'is-open' : '';
  const accordionTitle = field.section || field.label;

  return `
    <div class="form-group field-block verification-toggles-field verification-accordion-item matrix-accordion-item ${openClass}"
      data-verification-field="${field.id}" data-collapsible="true">
      <div class="matrix-accordion-toolbar verification-accordion-toolbar" role="button" tabindex="0"
        aria-expanded="${field.defaultOpen !== false ? 'true' : 'false'}"
        aria-label="Expandir ou recolher ${escapeHtml(accordionTitle)}">
        <span class="matrix-accordion-title">${escapeHtml(accordionTitle)}</span>
        <div class="matrix-accordion-meta">
          <span class="matrix-cat-progress" data-verify-progress>${ok}/${total}</span>
          ${verificationBulkOkBtnHtml(accordionTitle)}
          <span class="matrix-chevron" aria-hidden="true"></span>
        </div>
      </div>
      <div class="matrix-accordion-panel verification-accordion-panel">
        <p class="verification-group-subtitle">${escapeHtml(field.label)}</p>
        <span class="verify-progress-fail verification-panel-fail${fail ? ' is-visible' : ''}" data-verify-fail-count>${fail ? `${fail} Não OK` : ''}</span>
        ${listHtml}
      </div>
    </div>
  `;
}

function renderDynamicTableField(field, value, context = {}) {
  const columns = field.columns || [];
  const colKeys = columns.map((c) => columnKey(c));
  const defaultRow = resolveDynamicRowDefaults(field, context);
  let rows = Array.isArray(value) && value.length ? value : [];
  if (isMaterialTableField(field)) {
    rows = normalizeMaterialRows(rows.length ? rows : [emptyMaterialRow()]);
  } else if (!rows.length) {
    rows = [Object.keys(defaultRow).length ? { ...defaultRow } : {}];
  }

  const variantClass = field.tableVariant
    ? `dynamic-table-field--${field.tableVariant}`
    : '';
  const carregadorClass =
    context.service?.id === 'reparacao_carregador' ? ' dynamic-table-field--carregador' : '';
  const addLabel = field.addButtonLabel || 'Adicionar Material';
  const headerCells = columns.map((c) => `<th>${escapeHtml(columnLabel(c))}</th>`).join('');

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
    <div class="form-group field-block dynamic-table-field ${variantClass}${carregadorClass}"
      data-dynamic-table="${field.id}"
      data-columns='${JSON.stringify(columns)}'
      data-column-types='${JSON.stringify(field.columnTypes || {})}'
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

function isMatrixCategoryAllGood(catEl) {
  const rows = catEl?.querySelectorAll('.matrix-row');
  if (!rows?.length) return false;
  return Array.from(rows).every(
    (row) => row.querySelector('.matrix-opt.selected')?.dataset.value === 'B',
  );
}

function clearMatrixCategorySelection(catEl) {
  if (!catEl) return;
  catEl.querySelectorAll('.matrix-row').forEach((row) => {
    row.querySelectorAll('.matrix-opt').forEach((btn) => btn.classList.remove('selected'));
    syncMatrixRowState(row);
  });
  updateMatrixCategoryProgress(catEl);
  updateMatrixBulkGoodBtnState(catEl);
  catEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function markMatrixCategoryAllGood(catEl) {
  if (!catEl) return;
  catEl.querySelectorAll('.matrix-row').forEach((row) => {
    const goodBtn = row.querySelector('.matrix-opt[data-value="B"]');
    if (!goodBtn) return;
    row.querySelectorAll('.matrix-opt').forEach((btn) => btn.classList.remove('selected'));
    goodBtn.classList.add('selected');
    syncMatrixRowState(row);
  });
  updateMatrixCategoryProgress(catEl);
  updateMatrixBulkGoodBtnState(catEl);
  catEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggleMatrixCategoryAllGood(catEl) {
  if (!catEl) return;
  if (isMatrixCategoryAllGood(catEl)) {
    clearMatrixCategorySelection(catEl);
  } else {
    markMatrixCategoryAllGood(catEl);
  }
}

function updateMatrixBulkGoodBtnState(catEl) {
  const bulkBtn = catEl?.querySelector('[data-matrix-bulk-good]');
  if (!bulkBtn) return;
  const allGood = isMatrixCategoryAllGood(catEl);
  bulkBtn.classList.toggle('matrix-bulk-good-btn--active', allGood);
  bulkBtn.setAttribute('aria-pressed', allGood ? 'true' : 'false');
}

function toggleMatrixAccordionItem(item) {
  if (!item) return;
  const isOpen = item.classList.toggle('is-open');
  const toolbar = item.querySelector('.matrix-accordion-toolbar');
  toolbar?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function renderDl50Matrix4OptionsField(field, value) {
  const options = field.options || ['B', 'N', 'D', 'N.A.'];
  const states = value && typeof value === 'object' ? value : {};
  const categories = field.categories || [];
  const [leftCats, rightCats] = splitDl50MatrixCategories(categories);
  const legend = options
    .map((o) => `<span><strong>${escapeHtml(matrixOptionDisplay(o))}</strong> = ${escapeHtml(matrixLegendLabel(o))}</span>`)
    .join('');

  const renderColumn = (cats) =>
    cats.map((cat) => renderDl50MatrixCategory(cat, states, options)).join('');

  return `
    <div class="form-group field-block matrix-inspection-field dl50-matrix-field" data-matrix-field="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="matrix-legend dl50-matrix-legend">${legend}</div>
      <div class="grid-inspecao">
        <div class="grid-inspecao-col grid-inspecao-col--left">${renderColumn(leftCats)}</div>
        <div class="grid-inspecao-col grid-inspecao-col--right">${renderColumn(rightCats)}</div>
      </div>
    </div>
  `;
}

function renderDl50MatrixCategory(cat, states, options) {
  const catKey = columnKey(cat.name);
  const catStates = states[catKey] || {};
  const filled = cat.items.filter((item) => catStates[columnKey(item)]).length;

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
        <tr class="matrix-row dl50-matrix-row ${defectClass}" data-matrix-item="${itemKey}">
          <th scope="row" class="dl50-matrix-point">${escapeHtml(item)}</th>
          <td class="dl50-matrix-state">
            <div class="matrix-segmented" role="group" aria-label="${escapeHtml(item)}">
              ${segments}
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="dl50-matrix-category matrix-accordion-item is-open" data-matrix-category="${catKey}">
      <div class="dl50-matrix-category-header">
        <h5 class="dl50-matrix-category-title">${escapeHtml(cat.name)}</h5>
        <div class="dl50-matrix-category-meta">
          <span class="matrix-cat-progress" data-matrix-progress>${filled}/${cat.items.length}</span>
          <button type="button" class="matrix-bulk-good-btn" data-matrix-bulk-good
            aria-pressed="false"
            aria-label="Marcar ou limpar todos os pontos de ${escapeHtml(cat.name)} como Bom">✓ Tudo Bom</button>
        </div>
      </div>
      <div class="dl50-matrix-table-wrap">
        <table class="dl50-matrix-table">
          <thead>
            <tr>
              <th scope="col">Ponto</th>
              <th scope="col">Est.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMatrix4OptionsField(field, value, service = null) {
  if (service?.id === 'inspecao_dl50_2005') {
    return renderDl50Matrix4OptionsField(field, value);
  }

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
          <div class="matrix-accordion-toolbar" role="button" tabindex="0"
            aria-expanded="${catIndex === 0 ? 'true' : 'false'}"
            aria-label="Expandir ou recolher ${escapeHtml(cat.name)}">
            <span class="matrix-accordion-title">${escapeHtml(cat.name)}</span>
            <div class="matrix-accordion-meta">
              <span class="matrix-cat-progress" data-matrix-progress>${filled}/${cat.items.length}</span>
              <button type="button" class="matrix-bulk-good-btn" data-matrix-bulk-good
                aria-pressed="false"
                aria-label="Marcar ou limpar todos os pontos de ${escapeHtml(cat.name)} como Bom">✓ Tudo Bom</button>
              <span class="matrix-chevron" aria-hidden="true"></span>
            </div>
          </div>
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
      <p class="field-hint">Toque na barra da categoria para expandir. «✓ Tudo Bom» marca todos como B; volte a clicar para limpar.</p>
      <div class="matrix-accordion">${accordion}</div>
    </div>
  `;
}

function matrixLegendLabel(opt) {
  const map = { B: 'Bom', N: 'Mau', D: 'Danificado', 'N.A.': 'Não aplicável' };
  return map[opt] || opt;
}

function renderLegalVerdictField(field, value = '', service = null) {
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

  const inner = `
    <div class="form-group field-block legal-verdict-field" data-legal-verdict="${field.id}">
      <label class="form-label">${escapeHtml(field.label)}</label>
      <div class="legal-verdict-options">${cards}</div>
    </div>
  `;

  if (service?.id === 'inspecao_dl50_2005') {
    return inner;
  }
  return inner;
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
        evaluateFieldDependencies(overlay);
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
      evaluateFieldDependencies(overlay);
    });
  });

  overlay.querySelectorAll('[data-verification-bulk-ok]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const wrap = btn.closest('[data-verification-field]');
      toggleVerificationAllOk(wrap);
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
        syncVerificationItemState(input, wrap);
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
    updateVerificationBulkOkBtnState(wrap);
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

  overlay.querySelectorAll('.form-input-unit-input').forEach((input) => {
    const fieldWrap = input.closest('.form-input-unit-field');
    const syncUnit = () => {
      fieldWrap?.classList.toggle('has-value', String(input.value).trim() !== '');
    };
    input.addEventListener('focus', () => fieldWrap?.classList.add('is-focused'));
    input.addEventListener('blur', () => fieldWrap?.classList.remove('is-focused'));
    input.addEventListener('input', syncUnit);
    syncUnit();
  });

  overlay.querySelectorAll('[data-dynamic-table]').forEach((wrap) => {
    const columns = JSON.parse(wrap.dataset.columns || '[]');
    const colKeys = columns.map((c) => columnKey(c));
    const defaultRow = JSON.parse(wrap.dataset.defaultRow || '{}');
    const storedColumnTypes = JSON.parse(wrap.dataset.columnTypes || '{}');
    const tbody = wrap.querySelector('.dynamic-table-body');
    const fieldId = wrap.dataset.dynamicTable;
    const fieldDef = { id: fieldId, columnTypes: { ...storedColumnTypes }, columns };
    colKeys.forEach((key) => {
      if (!fieldDef.columnTypes[key]) {
        fieldDef.columnTypes[key] = getDynamicColumnInputType(fieldDef, key);
      }
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
      const seed = MATERIAL_FIELD_IDS.has(fieldId) ? emptyMaterialRow() : { ...defaultRow };
      tbody.appendChild(buildRow(seed));
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

  overlay.querySelectorAll('.matrix-accordion-toolbar').forEach((toolbar) => {
    const toggle = () => {
      toggleMatrixAccordionItem(toolbar.closest('.matrix-accordion-item'));
    };
    toolbar.addEventListener('click', (e) => {
      if (e.target.closest('[data-matrix-bulk-good]') || e.target.closest('[data-verification-bulk-ok]')) return;
      toggle();
    });
    toolbar.addEventListener('keydown', (e) => {
      if (e.target.closest('[data-matrix-bulk-good]') || e.target.closest('[data-verification-bulk-ok]')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  overlay.querySelectorAll('[data-matrix-bulk-good]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const catEl = btn.closest('.matrix-accordion-item');
      toggleMatrixCategoryAllGood(catEl);
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
          if (catEl) {
            updateMatrixCategoryProgress(catEl);
            updateMatrixBulkGoodBtnState(catEl);
          }
        });
      });
    });
    wrap.querySelectorAll('.matrix-accordion-item').forEach((catEl) => {
      updateMatrixCategoryProgress(catEl);
      updateMatrixBulkGoodBtnState(catEl);
    });
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
