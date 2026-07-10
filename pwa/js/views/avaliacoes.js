/**
 * Painel RH — avaliações do cliente por visita.
 */

import { escapeHtml, getClient, showToast } from '../app.js';
import { formatDateLong } from '../date-utils.js';
import { fetchAllAvaliacoes, formatAvaliacaoBadge } from '../avaliacoes-db.js';
import { getServico } from '../servicos-db.js';

let mountRoot = null;
let activeFilter = 'todas';
let rowsCache = [];

function scoreClass(score) {
  if (score === 3) return 'avaliacao-score--good';
  if (score === 2) return 'avaliacao-score--mid';
  if (score === 1) return 'avaliacao-score--bad';
  return '';
}

function formatOrdemLabel(numeroOrdem) {
  if (numeroOrdem == null || !Number.isFinite(Number(numeroOrdem))) return '';
  return `OP-2026-${String(numeroOrdem).padStart(2, '0')}`;
}

function enrichRow(avaliacao) {
  const client = avaliacao.clienteId ? getClient(avaliacao.clienteId) : null;
  const servico = avaliacao.servicoId ? getServico(avaliacao.servicoId) : null;
  const visitDate = avaliacao.servicoDate || servico?.date || '';
  const opLabel = formatOrdemLabel(avaliacao.numeroOrdem ?? servico?.numeroOrdem);
  const visitSummary = visitDate
    ? `${formatDateLong(visitDate)}${opLabel ? ` · ${opLabel}` : ''}`
    : 'Data da visita indisponível';
  return {
    ...avaliacao,
    clientName: client?.name || client?.Nome || 'Cliente',
    visitDate,
    visitDateLabel: visitDate ? formatDateLong(visitDate) : '—',
    visitSummary,
    opLabel,
    respondedAtLabel: avaliacao.criadoEm
      ? formatDateLong(String(avaliacao.criadoEm).slice(0, 10))
      : '—',
  };
}

function filterRows(rows) {
  if (activeFilter === 'todas') return rows;
  const target = Number(activeFilter);
  return rows.filter((row) => row.score === target);
}

function renderFilterBar(counts) {
  const chips = [
    { id: 'todas', label: 'Todas', count: counts.total },
    { id: '3', label: '😊 Satisfeito', count: counts.good },
    { id: '2', label: '😐 Regular', count: counts.mid },
    { id: '1', label: '😞 Insatisfeito', count: counts.bad },
  ];

  return `
    <div class="rh-filter-bar avaliacoes-filter-bar" role="tablist" aria-label="Filtrar avaliações">
      ${chips
        .map(
          (chip) => `
        <button type="button"
          class="rh-filter-chip${activeFilter === chip.id ? ' is-active' : ''}"
          data-avaliacao-filter="${chip.id}">
          ${escapeHtml(chip.label)}${chip.count ? ` <span class="rh-filter-chip__count">${chip.count}</span>` : ''}
        </button>`,
        )
        .join('')}
    </div>`;
}

function renderRows(rows) {
  if (!rows.length) {
    return `<p class="avaliacoes-panel-empty text-muted">Nenhuma avaliação neste filtro.</p>`;
  }

  return `
    <div class="avaliacoes-list" role="list">
      ${rows
        .map(
          (row) => `
        <article class="avaliacoes-list-item ${scoreClass(row.score)}" role="listitem">
          <div class="avaliacoes-list-item__score" aria-hidden="true">${row.emoji}</div>
          <div class="avaliacoes-list-item__body">
            <h3 class="avaliacoes-list-item__title">${escapeHtml(row.clientName)}</h3>
            <p class="avaliacoes-list-item__meta text-muted">
              Visita: <strong>${escapeHtml(row.visitSummary)}</strong> · Resposta: ${escapeHtml(row.respondedAtLabel)}
            </p>
            <p class="avaliacoes-list-item__label">${escapeHtml(formatAvaliacaoBadge(row))}</p>
          </div>
          ${
            row.servicoId
              ? `<button type="button" class="btn-outline btn-sm" data-open-servico="${escapeHtml(row.servicoId)}" data-visit-date="${escapeHtml(row.visitDate)}" data-client-name="${escapeHtml(row.clientName)}" data-visit-summary="${escapeHtml(row.visitSummary)}">Ver no calendário</button>`
              : ''
          }
        </article>`,
        )
        .join('')}
    </div>`;
}

function summarizeCounts(rows) {
  return {
    total: rows.length,
    good: rows.filter((r) => r.score === 3).length,
    mid: rows.filter((r) => r.score === 2).length,
    bad: rows.filter((r) => r.score === 1).length,
  };
}

function renderPanel() {
  if (!mountRoot) return;
  const enriched = rowsCache.map(enrichRow);
  const visible = filterRows(enriched);
  const counts = summarizeCounts(enriched);

  mountRoot.innerHTML = `
    <div class="avaliacoes-panel-inner">
      <div class="panel-header">
        <div>
          <h2>Avaliações dos Clientes</h2>
          <p class="text-muted avaliacoes-panel-lead">Feedback após o e-mail da visita — um registo por serviço.</p>
        </div>
      </div>
      ${renderFilterBar(counts)}
      ${renderRows(visible)}
    </div>`;

  mountRoot.querySelectorAll('[data-avaliacao-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.avaliacaoFilter || 'todas';
      renderPanel();
    });
  });

  mountRoot.querySelectorAll('[data-open-servico]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const servicoId = btn.dataset.openServico;
      if (!servicoId) return;
      window.dispatchEvent(
        new CustomEvent('admin-open-calendar-item', {
          detail: {
            jobId: servicoId,
            visitDate: btn.dataset.visitDate || '',
            clientName: btn.dataset.clientName || '',
            visitSummary: btn.dataset.visitSummary || '',
          },
        }),
      );
    });
  });
}

export async function refreshAvaliacoesPanel() {
  if (!mountRoot) return;
  try {
    const { ensureServicosLoadedSafe } = await import('../servicos-db.js');
    await ensureServicosLoadedSafe();
    rowsCache = await fetchAllAvaliacoes();
    renderPanel();
  } catch (err) {
    console.error('[Avaliações] refresh:', err);
    showToast('Não foi possível carregar as avaliações.', 'error');
  }
}

export function initAvaliacoesPanel(root) {
  mountRoot = root;
  refreshAvaliacoesPanel().catch(console.error);
}

export function countAvaliacoesInsatisfeitas(rows = rowsCache) {
  return rows.filter((row) => row.score === 1).length;
}
