/**
 * Ficha do Cliente — painel lateral / modal de consulta rápida (RH/Admin).
 */

import {
  getClientFromCatalog,
  getProductionClientsCatalog,
  ensureProductionCatalog,
} from '../clients-catalog.js';
import { getClient, escapeHtml, showToast } from '../app.js';
import { mapClientToLegacy, DEMO_CLIENT_FORKLIFTS } from '../mock_data.js';

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

  const email = legacy?.email || legacy?.['E-mail'] || catalogRecord?.['E-mail'] || '—';
  const phone =
    legacy?.phone ||
    legacy?.Telemovel ||
    legacy?.telemovel ||
    catalogRecord?.Telemovel ||
    catalogRecord?.telemovel ||
    '';

  return {
    id: clientId,
    nome: legacy?.name || legacy?.Nome || catalogRecord?.Nome || '—',
    nif: legacy?.nif || legacy?.NIF || catalogRecord?.NIF || '—',
    email,
    phone: phone || '—',
    morada: fullAddress,
    moradaRaw: morada || '—',
    forklifts: legacy?.forklifts || [],
  };
}

export async function resolveClientProfile(clientId) {
  await ensureProductionCatalog();
  const catalog = getProductionClientsCatalog({ warn: false });
  const catalogRecord = getClientFromCatalog(clientId, catalog);
  return enrichLegacyClient(clientId, catalogRecord);
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

function renderForkliftsList(forklifts) {
  if (!forklifts?.length) {
    return '<p class="client-ficha-muted">Sem máquinas registadas para este cliente.</p>';
  }
  return `
    <ul class="client-ficha-machines" role="list">
      ${forklifts
        .map(
          (f) => `
        <li class="client-ficha-machine">
          <span class="client-ficha-machine-serial">${escapeHtml(f.serial || '—')}</span>
          <span class="client-ficha-machine-meta text-muted">${escapeHtml([f.brand, f.model].filter(Boolean).join(' · ') || 'Empilhador')}</span>
        </li>
      `,
        )
        .join('')}
    </ul>
  `;
}

export function renderClientProfilePanel(profile) {
  return `
    <div class="client-ficha-panel" role="dialog" aria-labelledby="client-ficha-title" aria-modal="true">
      <header class="client-ficha-header">
        <div>
          <h2 id="client-ficha-title" class="client-ficha-title">${escapeHtml(profile.nome)}</h2>
          <p class="client-ficha-subtitle text-muted">Ficha cadastral</p>
        </div>
        <button type="button" class="btn-ghost client-ficha-close" data-client-ficha-close aria-label="Fechar ficha">&times;</button>
      </header>

      <div class="client-ficha-body">
        <section class="client-ficha-block">
          <h3 class="client-ficha-label">NIF</h3>
          <div class="client-ficha-value-row">
            <p class="client-ficha-value">${escapeHtml(profile.nif)}</p>
            ${renderCopyButton(profile.nif, 'NIF')}
          </div>
        </section>

        <section class="client-ficha-block">
          <h3 class="client-ficha-label">Morada completa</h3>
          <div class="client-ficha-value-row">
            <p class="client-ficha-value">${escapeHtml(profile.morada)}</p>
            ${renderCopyButton(profile.morada !== '—' ? profile.morada : '', 'morada')}
          </div>
        </section>

        <section class="client-ficha-block">
          <h3 class="client-ficha-label">E-mail</h3>
          <p class="client-ficha-value">
            ${profile.email !== '—' ? `<a href="mailto:${escapeHtml(profile.email)}" class="client-ficha-link">${escapeHtml(profile.email)}</a>` : '—'}
          </p>
        </section>

        <section class="client-ficha-block">
          <h3 class="client-ficha-label">Contacto telefónico</h3>
          <p class="client-ficha-value">
            ${profile.phone !== '—' ? `<a href="tel:${escapeHtml(String(profile.phone).replace(/[^\d+]/g, ''))}" class="client-ficha-link">${escapeHtml(profile.phone)}</a>` : '—'}
          </p>
        </section>

        <section class="client-ficha-block">
          <h3 class="client-ficha-label">Máquinas associadas</h3>
          ${renderForkliftsList(profile.forklifts)}
        </section>
      </div>

      <footer class="client-ficha-footer">
        <button type="button" class="btn-secondary client-ficha-history-btn" data-client-ficha-history>
          Ver histórico de relatórios
        </button>
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

/**
 * Abre painel lateral (tablet/PC) ou modal (mobile) com ficha do cliente.
 * @param {string} clientId
 * @param {{ onHistory?: (clientId: string) => void }} [options]
 */
export async function openClientProfilePanel(clientId, options = {}) {
  if (!clientId) return;

  closeClientProfilePanel();
  const profile = await resolveClientProfile(clientId);

  const shell = document.createElement('div');
  shell.className = 'client-ficha-drawer';
  shell.innerHTML = `
    <div class="client-ficha-backdrop" data-client-ficha-close tabindex="-1" aria-hidden="true"></div>
    ${renderClientProfilePanel(profile)}
  `;

  document.body.appendChild(shell);
  activeDrawer = shell;
  document.body.classList.add('client-ficha-open');
  document.body.style.overflow = 'hidden';

  shell.querySelectorAll('[data-client-ficha-close]').forEach((el) => {
    el.addEventListener('click', closeClientProfilePanel);
  });

  shell.querySelectorAll('[data-copy-value]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.copyValue);
    });
  });

  shell.querySelector('[data-client-ficha-history]')?.addEventListener('click', () => {
    closeClientProfilePanel();
    options.onHistory?.(clientId);
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeClientProfilePanel();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  shell.querySelector('.client-ficha-close')?.focus();
}

export { closeClientProfilePanel };
