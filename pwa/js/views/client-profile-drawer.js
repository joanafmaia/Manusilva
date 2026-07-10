/**
 * Ficha do Cliente — painel lateral dinâmico (RH/Admin).
 */

import {
  getClientFromCatalog,
  getProductionClientsCatalog,
  ensureProductionCatalog,
} from '../clients-catalog.js';
import { getClient, escapeHtml, showToast } from '../app.js';
import { putClient } from '../clients-api.js';
import {
  buildClientAlteracoesCsv,
  fetchClientAlteracoes,
  formatClientAlteracaoDate,
} from '../client-audit.js';
import { mapClientToLegacy, DEMO_CLIENT_FORKLIFTS } from '../mock_data.js';
import { formatEquipamentoLabel } from '../cliente-equipamentos.js';

const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

let activeDrawer = null;

function enrichLegacyClient(clientId, catalogRecord) {
  let legacy = getClient(clientId);
  if (!legacy && catalogRecord) {
    legacy = mapClientToLegacy(catalogRecord);
  }
  const demo = DEMO_CLIENT_FORKLIFTS[clientId];
  if (demo?.forklifts?.length && legacy && !legacy.forklifts?.length) {
    legacy.forklifts = demo.forklifts;
  }

  const morada = legacy?.Morada || legacy?.morada || catalogRecord?.Morada || '';
  const cp =
    legacy?.['Código postal'] ||
    legacy?.codigoPostal ||
    catalogRecord?.['Código postal'] ||
    '';
  const localidade = legacy?.Localidade || legacy?.localidade || catalogRecord?.Localidade || '';
  const pais =
    legacy?.['País/Região'] || legacy?.pais || catalogRecord?.['País/Região'] || 'Portugal';
  const addressParts = [morada, cp, localidade, pais].filter(Boolean);
  const fullAddress = addressParts.join(', ') || legacy?.address || '—';

  const email = legacy?.email || legacy?.['E-mail'] || catalogRecord?.['E-mail'] || '';
  const phone =
    legacy?.phone ||
    legacy?.Telemovel ||
    legacy?.telemovel ||
    catalogRecord?.Telemovel ||
    catalogRecord?.telemovel ||
    '';

  const plusCode =
    legacy?.plusCode || legacy?.plus_code || catalogRecord?.plusCode || catalogRecord?.plus_code || '';
  const zonaRota =
    legacy?.zonaRota || legacy?.zona_rota || catalogRecord?.zonaRota || catalogRecord?.zona_rota || '';

  return {
    id: clientId,
    nome: legacy?.name || legacy?.Nome || catalogRecord?.Nome || '—',
    nif: legacy?.nif || legacy?.NIF || catalogRecord?.NIF || '—',
    email: email || '—',
    phone: phone || '—',
    morada: fullAddress,
    moradaRaw: morada || '',
    cpRaw: cp || '',
    localidadeRaw: localidade || '',
    emailRaw: email,
    phoneRaw: phone,
    plusCode: plusCode || '—',
    plusCodeRaw: plusCode || '',
    zonaRota: zonaRota || '—',
    zonaRotaRaw: zonaRota || '',
    forklifts: legacy?.forklifts || [],
    equipamentos: [],
  };
}

function renderLoadingPanel() {
  return `
    <div class="client-ficha-panel client-ficha-panel--loading" role="dialog" aria-busy="true" aria-label="A carregar ficha">
      <header class="client-ficha-header">
        <div class="client-ficha-skeleton client-ficha-skeleton--title"></div>
        <button type="button" class="btn-ghost client-ficha-close" data-client-ficha-close aria-label="Fechar">&times;</button>
      </header>
      <div class="client-ficha-body">
        <div class="client-ficha-skeleton"></div>
        <div class="client-ficha-skeleton"></div>
        <div class="client-ficha-skeleton client-ficha-skeleton--short"></div>
      </div>
    </div>
  `;
}

export async function resolveClientProfile(clientId) {
  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog({ warn: false });
  const catalogRecord = getClientFromCatalog(clientId, catalog);
  const profile = enrichLegacyClient(clientId, catalogRecord);

  try {
    const { fetchClienteEquipamentos } = await import('../cliente-equipamentos-db.js');
    const equipamentos = await fetchClienteEquipamentos(clientId);
    if (equipamentos.length) {
      profile.equipamentos = equipamentos;
    }
  } catch (err) {
    console.warn('[ClientProfile] Equipamentos:', err);
  }

  return profile;
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function renderCopyButton(value, label) {
  if (!value || value === '—') return '';
  return `
    <button type="button" class="client-ficha-copy" data-copy-value="${escapeAttr(value)}"
      title="Copiar ${escapeHtml(label)}" aria-label="Copiar ${escapeHtml(label)}">
      ${COPY_ICON_SVG}
    </button>
  `;
}

function renderEquipamentosList(profile) {
  const equipamentos = Array.isArray(profile?.equipamentos)
    ? [...profile.equipamentos].sort((a, b) => {
        const aLabel = String(
          a?.numero_serie || a?.maquina || a?.matricula || a?.n_interno || a?.tipo || '',
        ).toLowerCase();
        const bLabel = String(
          b?.numero_serie || b?.maquina || b?.matricula || b?.n_interno || b?.tipo || '',
        ).toLowerCase();
        return aLabel.localeCompare(bLabel, 'pt');
      })
    : [];
  if (equipamentos.length) {
    return `
      <ul class="client-ficha-machines" role="list">
        ${equipamentos
          .map((equipamento) => {
            const heading =
              equipamento.numero_serie ||
              equipamento.maquina ||
              equipamento.matricula ||
              equipamento.n_interno ||
              equipamento.tipo ||
              '—';
            const categoria =
              equipamento.categoria === 'bateria'
                ? 'Bateria'
                : equipamento.categoria === 'carregador'
                  ? 'Carregador'
                  : 'Empilhador';
            return `
        <li class="client-ficha-machine">
          <span class="client-ficha-machine-serial">${escapeHtml(heading)}</span>
          <span class="client-ficha-machine-meta ms-label">${escapeHtml(categoria)} · ${escapeHtml(formatEquipamentoLabel(equipamento) || 'Equipamento')}</span>
        </li>
      `;
          })
          .join('')}
      </ul>
    `;
  }

  const forklifts = Array.isArray(profile?.forklifts)
    ? [...profile.forklifts].sort((a, b) => {
        const aLabel = String(a?.serial || a?.brand || a?.model || '').toLowerCase();
        const bLabel = String(b?.serial || b?.brand || b?.model || '').toLowerCase();
        return aLabel.localeCompare(bLabel, 'pt');
      })
    : [];
  if (!forklifts.length) {
    return '<p class="client-ficha-muted ms-label">Sem equipamentos registados para este cliente.</p>';
  }

  return `
    <ul class="client-ficha-machines" role="list">
      ${forklifts
        .map(
          (f) => `
        <li class="client-ficha-machine">
          <span class="client-ficha-machine-serial">${escapeHtml(f.serial || '—')}</span>
          <span class="client-ficha-machine-meta ms-label">${escapeHtml([f.brand, f.model].filter(Boolean).join(' · ') || 'Empilhador')}</span>
        </li>
      `,
        )
        .join('')}
    </ul>
  `;
}

function renderEditableField(label, inputId, value, inputType = 'text') {
  return `
    <section class="client-ficha-block">
      <label class="client-ficha-label ms-label" for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
      <input type="${escapeHtml(inputType)}" class="form-input client-profile-edit-input" id="${escapeHtml(inputId)}"
        value="${escapeAttr(value)}" autocomplete="off">
    </section>
  `;
}

function renderAddressEditBlock(profile) {
  return `
    ${renderEditableField('Morada', 'client-ficha-morada', profile.moradaRaw, 'text')}
    <div class="client-ficha-edit-row">
      ${renderEditableField('Código postal', 'client-ficha-cp', profile.cpRaw, 'text')}
      ${renderEditableField('Localidade', 'client-ficha-localidade', profile.localidadeRaw, 'text')}
    </div>
    ${renderEditableField('Plus Code', 'client-ficha-plus-code', profile.plusCodeRaw, 'text')}
    ${renderEditableField('Zona / Rota', 'client-ficha-zona-rota', profile.zonaRotaRaw, 'text')}
  `;
}

function renderViewField(label, valueHtml, { copyValue = '', copyLabel = '' } = {}) {
  return `
    <section class="client-ficha-block">
      <h3 class="client-ficha-label ms-label">${escapeHtml(label)}</h3>
      <div class="client-ficha-value-row">
        <p class="client-ficha-value">${valueHtml}</p>
        ${copyValue && copyValue !== '—' ? renderCopyButton(copyValue, copyLabel || label) : ''}
      </div>
    </section>
  `;
}

function renderAlteracoesSection(profile) {
  const rows = Array.isArray(profile.alteracoes) ? profile.alteracoes : [];
  if (!rows.length) {
    return `
      <section class="client-ficha-block client-ficha-block--audit">
        <h3 class="client-ficha-label ms-label">Histórico de alterações</h3>
        <p class="client-ficha-muted">Sem alterações registadas nesta ficha.</p>
      </section>
    `;
  }

  return `
    <section class="client-ficha-block client-ficha-block--audit">
      <div class="client-ficha-audit-header">
        <h3 class="client-ficha-label ms-label">Histórico de alterações</h3>
        <button type="button" class="btn-outline btn-sm" data-client-ficha-export-audit>
          Exportar CSV
        </button>
      </div>
      <div class="client-ficha-audit-list-wrap">
        <ul class="client-ficha-audit-list" role="list">
          ${rows
            .map(
              (row) => `
            <li class="client-ficha-audit-item" role="listitem">
              <p class="client-ficha-audit-meta text-muted">
                ${escapeHtml(formatClientAlteracaoDate(row.criadoEm))} · ${escapeHtml(row.alteradoPor)}
              </p>
              <p class="client-ficha-audit-field"><strong>${escapeHtml(row.campo)}</strong></p>
              <p class="client-ficha-audit-diff">
                <span class="client-ficha-audit-old">${escapeHtml(row.valorAnterior || '—')}</span>
                <span class="client-ficha-audit-arrow" aria-hidden="true">→</span>
                <span class="client-ficha-audit-new">${escapeHtml(row.valorNovo || '—')}</span>
              </p>
            </li>
          `,
            )
            .join('')}
        </ul>
      </div>
    </section>
  `;
}

export function renderClientProfilePanel(profile, { editing = false } = {}) {
  const moradaBlock = editing
    ? renderAddressEditBlock(profile)
    : `
        ${renderViewField(
          'Morada completa',
          escapeHtml(profile.morada),
          { copyValue: profile.morada, copyLabel: 'morada' },
        )}
        ${renderViewField(
          'Plus Code',
          escapeHtml(profile.plusCode),
          { copyValue: profile.plusCode !== '—' ? profile.plusCode : '', copyLabel: 'Plus Code' },
        )}
        ${renderViewField('Zona / Rota', escapeHtml(profile.zonaRota))}
      `;

  const emailBlock = editing
    ? renderEditableField('E-mail de contacto', 'client-ficha-email', profile.emailRaw || '', 'email')
    : renderViewField(
        'E-mail de contacto',
        profile.email !== '—'
          ? `<a href="mailto:${escapeHtml(profile.email)}" class="client-ficha-link">${escapeHtml(profile.email)}</a>`
          : '—',
      );

  const phoneBlock = editing
    ? renderEditableField('Contacto telefónico', 'client-ficha-phone', profile.phoneRaw || '', 'tel')
    : renderViewField(
        'Contacto telefónico',
        profile.phone !== '—'
          ? `<a href="tel:${escapeHtml(String(profile.phone).replace(/[^\d+]/g, ''))}" class="client-ficha-link">${escapeHtml(profile.phone)}</a>`
          : '—',
      );

  const footer = editing
    ? `
        <button type="button" class="btn-ghost client-ficha-cancel-btn" data-client-ficha-cancel>Cancelar</button>
        <button type="button" class="btn-primary client-ficha-save-btn" data-client-ficha-save>Guardar alterações</button>
      `
    : `
        <button type="button" class="btn-primary client-ficha-edit-btn" data-client-ficha-edit>Editar Dados</button>
        <button type="button" class="btn-secondary client-ficha-history-btn" data-client-ficha-history>
          Ver histórico de relatórios
        </button>
      `;

  return `
    <div class="client-ficha-panel" role="dialog" aria-labelledby="client-ficha-title" aria-modal="true" data-editing="${editing ? 'true' : 'false'}">
      <header class="client-ficha-header">
        <div>
          <p class="client-ficha-eyebrow ms-label">Ficha cadastral</p>
          <h2 id="client-ficha-title" class="client-ficha-title ms-h2">${escapeHtml(profile.nome)}</h2>
          <p class="client-ficha-subtitle ms-label">${editing ? 'Edição de dados cadastrais' : 'Consulta rápida — dados da empresa'}</p>
        </div>
        <button type="button" class="btn-ghost client-ficha-close" data-client-ficha-close aria-label="Fechar ficha">&times;</button>
      </header>

      <div class="client-ficha-body">
        ${renderViewField('Nome da empresa', escapeHtml(profile.nome))}

        <section class="client-ficha-block">
          <h3 class="client-ficha-label ms-label">NIF</h3>
          <div class="client-ficha-value-row">
            <p class="client-ficha-value">${escapeHtml(profile.nif)}</p>
            ${editing ? '' : renderCopyButton(profile.nif !== '—' ? profile.nif : '', 'NIF')}
          </div>
        </section>

        ${moradaBlock}
        ${emailBlock}
        ${phoneBlock}

        <section class="client-ficha-block client-ficha-block--machines">
          <h3 class="client-ficha-label ms-label">Equipamentos associados</h3>
          ${renderEquipamentosList(profile)}
        </section>

        ${editing ? '' : renderAlteracoesSection(profile)}
      </div>

      <footer class="client-ficha-footer client-ficha-footer--actions">
        ${footer}
      </footer>
    </div>
  `;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copiado para a área de transferência.', 'success', 2200);
  } catch {
    showToast('Não foi possível copiar. Selecione o texto manualmente.', 'warning');
  }
}

function closeClientProfilePanel() {
  activeDrawer?.remove();
  activeDrawer = null;
  document.body.classList.remove('client-ficha-open');
  document.body.style.overflow = '';
}

function readEditForm(shell) {
  return {
    morada: shell.querySelector('#client-ficha-morada')?.value?.trim() ?? '',
    codigo_postal: shell.querySelector('#client-ficha-cp')?.value?.trim() ?? '',
    localidade: shell.querySelector('#client-ficha-localidade')?.value?.trim() ?? '',
    plus_code: shell.querySelector('#client-ficha-plus-code')?.value?.trim() ?? '',
    zona_rota: shell.querySelector('#client-ficha-zona-rota')?.value?.trim() ?? '',
    email: shell.querySelector('#client-ficha-email')?.value?.trim() ?? '',
    telemovel: shell.querySelector('#client-ficha-phone')?.value?.trim() ?? '',
  };
}

function editFormDirty(shell, snapshot) {
  if (!snapshot) return false;
  const current = readEditForm(shell);
  return Object.keys(snapshot).some((k) => String(snapshot[k] ?? '') !== String(current[k] ?? ''));
}

async function confirmDiscardEdits() {
  return window.confirm('Existem alterações por guardar. Deseja descartá-las?');
}

function bindClientProfilePanel(shell, profile, options = {}) {
  const clientId = profile.id;
  const state = shell._fichaState || (shell._fichaState = { editSnapshot: null });

  const snapshotFromProfile = (p) => ({
    morada: p.moradaRaw || '',
    codigo_postal: p.cpRaw || '',
    localidade: p.localidadeRaw || '',
    plus_code: p.plusCodeRaw || '',
    zona_rota: p.zonaRotaRaw || '',
    email: p.emailRaw || '',
    telemovel: p.phoneRaw || '',
  });

  const repaint = async (editing) => {
    const fresh = editing ? profile : await resolveClientProfile(clientId);
    if (!editing) {
      fresh.alteracoes = await fetchClientAlteracoes(clientId);
    }
    if (!editing) Object.assign(profile, fresh);
    const panel = shell.querySelector('.client-ficha-panel');
    if (panel) {
      panel.outerHTML = renderClientProfilePanel(fresh, { editing });
    }
    state.editSnapshot = editing ? snapshotFromProfile(fresh) : null;
    bindClientProfilePanel(shell, fresh, options);
  };

  const tryClose = async () => {
    const isEditing = shell.querySelector('.client-ficha-panel')?.dataset.editing === 'true';
    if (isEditing && editFormDirty(shell, state.editSnapshot)) {
      const discard = await confirmDiscardEdits();
      if (!discard) return;
    }
    closeClientProfilePanel();
  };

  shell.querySelectorAll('[data-client-ficha-close]').forEach((el) => {
    el.addEventListener('click', () => {
      tryClose();
    });
  });

  shell.querySelectorAll('[data-copy-value]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.copyValue);
    });
  });

  shell.querySelector('[data-client-ficha-export-audit]')?.addEventListener('click', () => {
    const rows = Array.isArray(profile.alteracoes) ? profile.alteracoes : [];
    if (!rows.length) {
      showToast('Não há alterações para exportar.', 'info');
      return;
    }
    const { content, filename } = buildClientAlteracoesCsv(rows, profile.nome);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Histórico exportado.', 'success', 3000);
  });

  shell.querySelector('[data-client-ficha-history]')?.addEventListener('click', () => {
    closeClientProfilePanel();
    options.onHistory?.(clientId);
  });

  shell.querySelector('[data-client-ficha-edit]')?.addEventListener('click', () => {
    repaint(true);
  });

  shell.querySelector('[data-client-ficha-cancel]')?.addEventListener('click', async () => {
    if (editFormDirty(shell, state.editSnapshot)) {
      const discard = await confirmDiscardEdits();
      if (!discard) return;
    }
    await repaint(false);
  });

  shell.querySelector('[data-client-ficha-save]')?.addEventListener('click', async () => {
    const btn = shell.querySelector('[data-client-ficha-save]');
    const patch = readEditForm(shell);
    btn.disabled = true;
    btn.textContent = 'A guardar…';

    try {
      await putClient(clientId, patch);
      showToast('Dados do cliente atualizados com sucesso.', 'success', 3500);
      await repaint(false);
    } catch (err) {
      console.error('[Ficha Cliente] Guardar:', err);
      showToast(err?.message || 'Não foi possível guardar as alterações.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar alterações';
    }
  });
}

/**
 * Abre painel lateral (tablet/PC) ou modal (mobile) com ficha do cliente.
 * @param {string} clientId
 * @param {{ onHistory?: (clientId: string) => void }} [options]
 */
export async function openClientProfilePanel(clientId, options = {}) {
  if (!clientId) return;

  closeClientProfilePanel();

  const shell = document.createElement('div');
  shell.className = 'client-ficha-drawer';
  shell.innerHTML = `
    <div class="client-ficha-backdrop" data-client-ficha-close tabindex="-1" aria-hidden="true"></div>
    ${renderLoadingPanel()}
  `;

  document.body.appendChild(shell);
  activeDrawer = shell;
  document.body.classList.add('client-ficha-open');
  document.body.style.overflow = 'hidden';

  shell.querySelectorAll('[data-client-ficha-close]').forEach((el) => {
    el.addEventListener('click', closeClientProfilePanel);
  });

  let profile;
  try {
    profile = await resolveClientProfile(clientId);
    profile.alteracoes = await fetchClientAlteracoes(clientId);
  } catch (err) {
    console.error('[Ficha Cliente]', err);
    showToast('Não foi possível carregar a ficha do cliente.', 'error');
    closeClientProfilePanel();
    return;
  }

  const panel = shell.querySelector('.client-ficha-panel');
  if (panel) {
    panel.outerHTML = renderClientProfilePanel(profile);
  }

  bindClientProfilePanel(shell, profile, options);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      shell.querySelector('[data-client-ficha-close]')?.click();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  shell.querySelector('.client-ficha-close')?.focus();
}

export { closeClientProfilePanel };
