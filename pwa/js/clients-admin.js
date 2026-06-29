/**
 * CRUD de clientes (Supabase) — apenas RH/Admin.
 */

import { getSupabaseClient } from './supabase-client.js';
import { showToast } from './toast-modal.js';
import { isRhOrAdminSession } from './auth-roles-core.js';
import { getSession } from './session.js';
import { updateDB } from './local-db.js';
import {
  ensureProductionCatalog,
  getProductionClientsCatalog,
  getClientFromCatalog,
  registerClientInCatalog,
  normalizeClientRecord,
  formatClientInsertError,
  formatClientUpdateError,
  resetProductionCatalogCache,
} from './clients-catalog.js';

export async function addClient(payload) {
  if (!isRhOrAdminSession(getSession())) {
    showToast('Apenas RH pode criar clientes.', 'error');
    return null;
  }

  const nome = String(
    payload?.nome_empresa ?? payload?.Nome ?? payload?.nome ?? '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!nome) {
    showToast('O nome do cliente é obrigatório.', 'error');
    return null;
  }

  const nif = String(payload?.nif ?? payload?.NIF ?? '')
    .replace(/\s+/g, '')
    .trim();

  try {
    await ensureProductionCatalog();
    const catalog = getProductionClientsCatalog({ warn: false });
    const nomeKey = nome.toLowerCase();
    const existing = catalog.find(
      (c) =>
        (nif && c.NIF === nif) || String(c.Nome || '').toLowerCase() === nomeKey,
    );
    if (existing) {
      showToast('Já existe um cliente com este NIF ou nome.', 'error');
      return null;
    }

    const row = {
      nome_empresa: nome,
      nif: nif || null,
      email: String(payload?.email ?? payload?.['E-mail'] ?? '').trim() || null,
      morada: String(payload?.morada ?? payload?.Morada ?? '').trim() || null,
      codigo_postal:
        String(
          payload?.codigo_postal ??
            payload?.['Código postal'] ??
            payload?.codigoPostal ??
            '',
        ).trim() || null,
      localidade:
        String(payload?.localidade ?? payload?.Localidade ?? '').trim() || null,
      telemovel:
        String(payload?.telemovel ?? payload?.Telemovel ?? payload?.phone ?? '').trim() ||
        null,
    };

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('clientes').insert(row).select();

    if (error) {
      console.error('[ManuSilva] Erro ao gravar cliente no Supabase:', error);
      showToast(formatClientInsertError(error), 'error', 9000);
      return null;
    }

    let inserted = Array.isArray(data) ? data[0] : data;
    if (!inserted) {
      resetProductionCatalogCache();
      await ensureProductionCatalog();
      inserted =
        getProductionClientsCatalog({ warn: false }).find(
          (c) =>
            String(c.Nome || '').toLowerCase() === nomeKey &&
            (!nif || c.NIF === nif),
        ) || null;
    }

    if (!inserted) {
      showToast(
        'Cliente pode ter sido gravado, mas a resposta do Supabase veio vazia. Recarregue a página.',
        'error',
        9000,
      );
      return null;
    }

    const record = normalizeClientRecord(inserted);
    record.forklifts = Array.isArray(payload?.forklifts) ? payload.forklifts : [];

    updateDB((d) => {
      if (!Array.isArray(d.clients)) d.clients = [];
      d.clients.push(record);
    });

    registerClientInCatalog(record);

    showToast(`Cliente «${nome}» adicionado na base de dados.`, 'success');
    return record;
  } catch (err) {
    console.error('[ManuSilva] addClient:', err);
    showToast(formatClientInsertError(err), 'error', 9000);
    return null;
  }
}

/**
 * @param {string|number} clientId
 * @param {{ email?: string, morada?: string, telemovel?: string, codigo_postal?: string, localidade?: string, condicao_pagamento?: string, plus_code?: string, zona_rota?: string }} patch
 * @param {{ origem?: string, silent?: boolean }} [options]
 */
export async function updateClient(clientId, patch = {}, options = {}) {
  if (!isRhOrAdminSession(getSession())) {
    showToast('Apenas RH pode alterar clientes.', 'error');
    return null;
  }

  const id = String(clientId ?? '').trim();
  if (!id) {
    showToast('Cliente inválido.', 'error');
    return null;
  }

  const row = {};
  if (patch.email !== undefined) {
    row.email = String(patch.email ?? '').trim() || null;
  }
  if (patch.morada !== undefined) {
    row.morada = String(patch.morada ?? '').trim() || null;
  }
  if (patch.telemovel !== undefined) {
    row.telemovel = String(patch.telemovel ?? '').trim() || null;
  }
  if (patch.codigo_postal !== undefined) {
    row.codigo_postal = String(patch.codigo_postal ?? '').trim() || null;
  }
  if (patch.localidade !== undefined) {
    row.localidade = String(patch.localidade ?? '').trim() || null;
  }
  if (patch.condicao_pagamento !== undefined) {
    row.condicao_pagamento = String(patch.condicao_pagamento ?? '').trim() || null;
  }
  if (patch.plus_code !== undefined) {
    row.plus_code = String(patch.plus_code ?? '').trim() || null;
  }
  if (patch.zona_rota !== undefined) {
    row.zona_rota = String(patch.zona_rota ?? '').trim() || null;
  }

  if (!Object.keys(row).length) {
    if (!options.silent) showToast('Nenhum dado para atualizar.', 'warning');
    return null;
  }

  try {
    const { ensureSupabaseAuthSession } = await import('./supabase-client.js');
    await ensureSupabaseAuthSession();
    await ensureProductionCatalog();
    const existing = getClientFromCatalog(id);
    const before = {
      email: existing?.['E-mail'] || '',
      morada: existing?.Morada || '',
      telemovel: existing?.Telemovel || '',
      codigo_postal: existing?.['Código postal'] || '',
      localidade: existing?.Localidade || '',
      condicao_pagamento: existing?.condicao_pagamento || '',
      plus_code: existing?.plusCode || '',
      zona_rota: existing?.zonaRota || '',
    };

    const supabase = await getSupabaseClient();
    const numericId = /^\d+$/.test(id) ? Number(id) : id;
    const { data, error } = await supabase
      .from('clientes')
      .update(row)
      .eq('id', numericId)
      .select();

    if (error) {
      console.error('[ManuSilva] Erro ao atualizar cliente no Supabase:', error);
      showToast(formatClientUpdateError(error), 'error', 9000);
      return null;
    }

    const updated = Array.isArray(data) ? data[0] : data;
    if (!updated) {
      showToast('Cliente não encontrado na base de dados.', 'error');
      return null;
    }

    const record = normalizeClientRecord(updated);
    if (existing?.forklifts?.length) {
      record.forklifts = existing.forklifts;
    }

    const { logClientChanges } = await import('./client-audit.js');
    await logClientChanges(
      id,
      before,
      {
        email: record['E-mail'] || '',
        morada: record.Morada || '',
        telemovel: record.Telemovel || '',
        codigo_postal: record['Código postal'] || '',
        localidade: record.Localidade || '',
        condicao_pagamento: record.condicao_pagamento || '',
        plus_code: record.plusCode || '',
        zona_rota: record.zonaRota || '',
      },
      { origem: options.origem || 'rh_ficha' },
    );

    registerClientInCatalog(record);

    updateDB((d) => {
      if (!Array.isArray(d.clients)) d.clients = [];
      const idx = d.clients.findIndex((c) => String(c.id) === id);
      if (idx >= 0) {
        Object.assign(d.clients[idx], record);
      } else {
        d.clients.push(record);
      }
    });

    window.dispatchEvent(new CustomEvent('db-updated'));
    return record;
  } catch (err) {
    console.error('[ManuSilva] updateClient:', err);
    showToast(formatClientUpdateError(err), 'error', 9000);
    return null;
  }
}

/** @returns {Promise<boolean>} true se houve update na base de dados */
export async function syncClientEmailIfChanged(clientId, newEmail) {
  const { isValidEmail, normalizeEmail } = await import('./validators.js');
  const email = String(newEmail ?? '').trim();
  if (!email || !clientId) return false;
  if (!isValidEmail(email)) return false;

  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog({ warn: false });
  const record = getClientFromCatalog(clientId, catalog);
  const current = normalizeEmail(record?.['E-mail'] || record?.email || '');

  if (current === normalizeEmail(email)) return false;

  const updated = await updateClient(clientId, { email }, { origem: 'aprovacao_relatorio', silent: true });
  return !!updated;
}
