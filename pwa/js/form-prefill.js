/**
 * Pré-preenchimento de formulários e cabeçalho do cliente no ecrã técnico.
 */

import { emptyMaterialRow, emptyMaterialRowForField, isMaterialTableField, normalizeMaterialRows, columnKey } from './material-table-field.js';
import {
  GRANDES_BATTERY_FIELD_ID,
} from './views/relatorio-grandes.js';
import {
  EMPILHADORES_MAQUINAS_FIELD_ID,
  emptyEmpilhadoresMaquinaRow,
} from './views/relatorio-empilhadores-maquinas.js';
import { escapeHtml } from './html-utils.js';

const SERVICE_FORM_TITLES = {
  manutencao_baterias_grandes: 'Relatório de Manutenção de Baterias',
  manutencao_preventiva_bateria: 'Relatório de Manutenção Preventiva de Bateria',
  manutencao_preventiva_empilhadores: 'Relatório de Manutenção Preventiva de Empilhadores',
  manutencao_corretiva_maquinas: 'Relatório de Manutenção Corretiva',
  folha_intervencao_avarias: 'Folha de Intervenção de Avarias',
  reparacao_avarias_bateria: 'Relatório de Reparação de Baterias',
  reparacao_carregador: 'Relatório de Reparação de Carregador',
  inspecao_dl50_2005: 'Inspeção da Máquina Decreto-Lei 50/2005',
  movimento_material_cliente: 'Registo de Recolha / Entrega no Cliente',
};

export function isOfficialTemplate(service) {
  return Boolean(service?.companyName && (service?.title || service?.label));
}

export function getServiceFormTitle(service) {
  if (!service) return 'Relatório';
  if (isOfficialTemplate(service) && service.title) return service.title;
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

function normalizeVerifyItem(item) {
  if (typeof item === 'string') return { id: columnKey(item), label: item };
  return { id: item.id || columnKey(item.label), label: item.label };
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

export function buildFormPrefill(service, job, _forklift, context = {}) {
  if (!service) return {};

  const { tech, client } = context;

  if (service.id === 'reparacao_avarias_bateria') {
    return {
      data_de_conclusao: job?.date || '',
      numero_de_serie: job?.forkliftSerial || '',
      visitas_realizadas: 1,
      pedido_orcamento: 'Não',
      estado_final: 'Reparação Concluída',
      consumiveis: [emptyMaterialRow()],
    };
  }

  if (service.id === 'reparacao_carregador') {
    const interventionRow = resolveDynamicRowDefaults(
      service.fields?.find((f) => f.id === 'registo_intervencao'),
      { job, tech, client },
    );
    const nome = client?.Nome ?? client?.name ?? '';
    return {
      data_rececao: job?.date || '',
      concluido_testado_em: '',
      cliente: nome,
      cliente_id: client?.Nome || client?.name || '',
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
      consumiveis_utilizados: [emptyMaterialRowForField({ columns: [{ id: 'maquina' }, { id: 'artigo' }, { id: 'qtd' }] })],
      visitas_realizadas: 1,
      estado_maquina: 'Operacional',
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
      numero_de_serie: job?.forkliftSerial || '',
      consumiveis: [emptyMaterialRow()],
      visitas_realizadas: 1,
      estado_final: 'Operacional',
      ...toggles,
    };
  }

  if (service.id === 'manutencao_preventiva_empilhadores') {
    return {
      data_de_conclusao: job?.date || '',
      [EMPILHADORES_MAQUINAS_FIELD_ID]: [emptyEmpilhadoresMaquinaRow()],
    };
  }

  if (service.id === 'inspecao_dl50_2005') {
    return {
      data_de_conclusao: job?.date || '',
      periodicidade_inspecao: 'Anual',
      pedido_orcamento: 'Não',
    };
  }

  if (service.id === 'movimento_material_cliente') {
    return {
      tipo_movimento: 'Recolha',
      data_movimento: job?.date || '',
      tipo: 'Empilhador',
      tipo_outro: '',
      n_interno: '',
      observacoes: '',
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
      horas: '',
      estado_maquina: 'Operacional',
      [verField?.id || 'lista_de_verificacoes']: verifications,
    };
  }

  return {};
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
