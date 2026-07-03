/**
 * Utilitários UI — painel do técnico
 */

import { escapeHtml } from './app.js';

export function buildClientAddress(client) {
  if (!client) return '';
  const morada = String(client.Morada || client.morada || '').trim();
  const cp = String(client['Código Postal'] || client.codigo_postal || '').trim();
  const localidade = String(client.Localidade || client.localidade || '').trim();
  return [morada, cp, localidade].filter(Boolean).join(', ');
}

/** Plus Code (Google) — preferido para navegação quando existir. */
export function buildClientPlusCode(client) {
  if (!client) return '';
  return String(client.plusCode || client.plus_code || '').trim();
}

/**
 * Destino para Waze: Plus Code se existir (mais preciso em zonas industriais),
 * senão morada completa.
 */
export function buildWazeNavigationQuery(client) {
  const plusCode = buildClientPlusCode(client);
  if (plusCode) return plusCode;
  return buildClientAddress(client);
}

export function buildClientPhone(client) {
  if (!client) return '';
  return String(
    client.Telemovel || client.telemovel || client.phone || client.telefone || '',
  ).trim();
}

export function buildWazeUrl(address) {
  const q = String(address || '').trim();
  if (!q) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

export function filterJobsBySearch(jobs, query, { getClient, getService, getReport } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((job) => {
    const client = getClient?.(job?.clientId);
    const service = getService?.(job?.serviceType);
    const report = getReport?.(job?.id);
    const clientName = String(client?.name || client?.Nome || '').toLowerCase();
    const serviceLabel = String(service?.label || job?.serviceType || '').toLowerCase();
    const rejection = String(report?.rejectionNote || job?.rejectionNote || '').toLowerCase();
    return clientName.includes(q) || serviceLabel.includes(q) || rejection.includes(q);
  });
}

export function filterRealizadosBySearch(items, query, { getClient, getService } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const client = getClient?.(item.report?.clientId || item.job?.clientId);
    const service = getService?.(item.report?.serviceType || item.job?.serviceType);
    const clientName = String(client?.name || client?.Nome || '').toLowerCase();
    const serviceLabel = String(service?.label || '').toLowerCase();
    return clientName.includes(q) || serviceLabel.includes(q);
  });
}

export function renderTechClientInfoSheet(client, { onHistory, onLastPdf, lastIntervention, onClose } = {}) {
  const name = client?.Nome || client?.name || 'Cliente';
  const address = buildClientAddress(client);
  const plusCode = buildClientPlusCode(client);
  const wazeQuery = buildWazeNavigationQuery(client);
  const wazeUrl = buildWazeUrl(wazeQuery);
  const wazeUsesPlusCode = Boolean(plusCode);
  const phone = buildClientPhone(client);
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '';

  const lastHtml = lastIntervention
    ? `
        <div class="tech-client-sheet__row tech-client-sheet__row--last">
          <span class="tech-client-sheet__label">Última intervenção</span>
          <p class="tech-client-sheet__value">
            <span class="tech-client-sheet__last-date">${escapeHtml(lastIntervention.dateStr)}</span>
            — ${escapeHtml(lastIntervention.serviceLabel)}
            ${lastIntervention.ordem && lastIntervention.ordem !== '—' ? `<span class="tech-client-sheet__last-ordem">(${escapeHtml(lastIntervention.ordem)})</span>` : ''}
          </p>
        </div>
      `
    : '';

  const sheet = document.createElement('div');
  sheet.className = 'tech-client-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `Informação de ${name}`);
  sheet.innerHTML = `
    <div class="tech-client-sheet__backdrop" data-close-client-sheet></div>
    <div class="tech-client-sheet__panel">
      <header class="tech-client-sheet__header">
        <h3>${escapeHtml(name)}</h3>
        <button type="button" class="btn-ghost btn-sm" data-close-client-sheet aria-label="Fechar">✕</button>
      </header>
      <div class="tech-client-sheet__body">
        ${lastHtml}
        <div class="tech-client-sheet__row">
          <span class="tech-client-sheet__label">Morada</span>
          <p class="tech-client-sheet__value">${address ? escapeHtml(address) : '—'}</p>
        </div>
        ${
          plusCode
            ? `<div class="tech-client-sheet__row">
          <span class="tech-client-sheet__label">Plus Code</span>
          <p class="tech-client-sheet__value">${escapeHtml(plusCode)}</p>
        </div>`
            : ''
        }
        <div class="tech-client-sheet__row">
          <span class="tech-client-sheet__label">Contacto</span>
          <p class="tech-client-sheet__value">${
            phone
              ? `<a href="${escapeHtml(telHref)}" class="tech-client-sheet__link">${escapeHtml(phone)}</a>`
              : '—'
          }</p>
        </div>
      </div>
      <footer class="tech-client-sheet__footer">
        ${
          wazeUrl
            ? `<a href="${escapeHtml(wazeUrl)}" class="btn-secondary btn-touch tech-client-sheet__waze" target="_blank" rel="noopener noreferrer" title="${wazeUsesPlusCode ? 'Navegação por Plus Code (ponto GPS)' : 'Navegação por morada'}">Abrir no Waze</a>`
            : ''
        }
        ${
          lastIntervention && typeof onLastPdf === 'function'
            ? '<button type="button" class="btn-primary btn-touch" data-client-last-pdf>PDF último relatório</button>'
            : ''
        }
        ${
          typeof onHistory === 'function'
            ? '<button type="button" class="btn-ghost btn-touch" data-client-history>Ver histórico</button>'
            : ''
        }
      </footer>
    </div>
  `;

  sheet.querySelectorAll('[data-close-client-sheet]').forEach((el) => {
    el.addEventListener('click', () => {
      sheet.remove();
      onClose?.();
    });
  });

  sheet.querySelector('[data-client-history]')?.addEventListener('click', () => {
    sheet.remove();
    onHistory?.();
  });

  sheet.querySelector('[data-client-last-pdf]')?.addEventListener('click', () => {
    const reportId = lastIntervention?.report?.id;
    sheet.remove();
    onLastPdf?.(reportId, lastIntervention?.report?.jobId);
  });

  return sheet;
}

export const TECH_ACTION_LABELS = {
  view: 'Ver',
  continue: 'Continuar',
  start: 'Iniciar',
  correct: 'Corrigir',
  edit: 'Editar',
};

export function resolveTechActionLabel(actionType, state) {
  if (state === 'rejected' && actionType === 'continue') return TECH_ACTION_LABELS.correct;
  if (state === 'pending' && actionType === 'continue') return TECH_ACTION_LABELS.edit;
  return TECH_ACTION_LABELS[actionType] || TECH_ACTION_LABELS.view;
}
