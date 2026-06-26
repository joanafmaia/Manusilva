/**
 * Editor RH — linhas de orçamento MS.015 (artigos, preços, taxa de saída).
 */

import {
  buildOrcamentoMetaDraft,
  computeLinhaTotal,
  computeOrcamentoTotals,
  emptyOrcamentoLinha,
  formatEuro,
  formatOrcamentoNumeroLabel,
  getReportOrcamentoMeta,
  readOrcamentoFormFromDom,
  suggestOrcamentoLinhas,
} from './orcamento-linhas.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLinhaRow(row, index) {
  const descricao = escapeHtml(row.descricao || '');
  const qtd = escapeHtml(row.qtd || '1');
  const precoUnit = escapeHtml(row.precoUnit || '');
  const total = computeLinhaTotal(row);
  const totalLabel = total > 0 ? formatEuro(total) : '';
  return `
    <tr data-orcamento-linha data-index="${index}">
      <td><input type="text" class="review-orc-input" data-orc-field="descricao" value="${descricao}" placeholder="Artigo / descrição" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--qty" data-orc-field="qtd" value="${qtd}" inputmode="decimal" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--money" data-orc-field="precoUnit" value="${precoUnit}" inputmode="decimal" placeholder="0,00" /></td>
      <td class="review-orc-total" data-orc-line-total>${totalLabel}</td>
      <td class="review-orc-row-actions">
        <button type="button" class="btn-icon review-orc-remove" title="Remover linha" aria-label="Remover linha">×</button>
      </td>
    </tr>`;
}

function renderTotals(meta) {
  const linhas = meta?.linhas || [];
  const totals = computeOrcamentoTotals(linhas, meta?.taxaSaida ?? '');
  return {
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
  };
}

export function renderReviewOrcamentoEditor(report) {
  const meta = getReportOrcamentoMeta(report) || buildOrcamentoMetaDraft(report);
  const linhas = suggestOrcamentoLinhas(report);
  const numeroLabel =
    meta.numeroFormatado ||
    (meta.numeroSequencial
      ? formatOrcamentoNumeroLabel(meta.numeroSequencial, meta.ano)
      : 'Atribuído ao gerar');
  const totals = renderTotals({ ...meta, linhas });
  const taxaSaida = meta.taxaSaida != null ? String(meta.taxaSaida) : '';
  const prazoEntrega = escapeHtml(meta.prazoEntrega || '');

  return `
    <div class="review-orcamento-editor" id="review-orcamento-editor">
      <div class="review-orcamento-editor__head">
        <h4 class="review-orcamento-editor__title">Proposta MS.015 — valores</h4>
        <p class="review-orcamento-editor__numero">
          Orçamento nº
          <strong data-orc-numero-formatado>${escapeHtml(numeroLabel)}</strong>
          <span class="sr-only" data-orc-numero-sequencial>${escapeHtml(String(meta.numeroSequencial || ''))}</span>
          <span class="sr-only" data-orc-numero-ano>${escapeHtml(String(meta.ano || new Date().getFullYear()))}</span>
        </p>
      </div>

      <div class="review-orc-table-wrap">
        <table class="review-orc-table">
          <thead>
            <tr>
              <th>Descrição / Artigo</th>
              <th>Qtd.</th>
              <th>Preço unit. (€)</th>
              <th>Total (€)</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="review-orc-linhas-body">
            ${linhas.map((row, i) => renderLinhaRow(row, i)).join('')}
          </tbody>
        </table>
      </div>

      <div class="review-orcamento-editor__toolbar">
        <button type="button" class="btn-outline btn-touch" id="review-orc-add-linha">+ Linha</button>
      </div>

      <div class="review-orcamento-editor__extras">
        <label class="review-orc-field">
          <span>Taxa de saída (€)</span>
          <input type="text" class="review-orc-input" data-orc-field="taxaSaida" value="${escapeHtml(taxaSaida)}" inputmode="decimal" placeholder="0,00" />
        </label>
        <label class="review-orc-field">
          <span>Prazo de entrega</span>
          <input type="text" class="review-orc-input" data-orc-field="prazoEntrega" value="${prazoEntrega}" placeholder="ex.: 5 dias úteis" />
        </label>
      </div>

      <div class="review-orcamento-editor__totals" aria-live="polite">
        <div><span>Subtotal (s/ IVA)</span><strong data-orc-subtotal>${totals.subtotal} €</strong></div>
        <div><span>IVA (23%)</span><strong data-orc-iva>${totals.iva} €</strong></div>
        <div class="review-orcamento-editor__total-line"><span>Total</span><strong data-orc-total>${totals.total} €</strong></div>
      </div>

      <div class="review-orcamento-editor__actions">
        <button type="button" class="btn-primary btn-touch" id="review-orc-save">Guardar e atualizar proposta</button>
      </div>
      <p class="text-muted review-orcamento-editor__hint">Preencha os preços e guarde — o Word e o PDF serão regenerados com o número de orçamento oficial.</p>
    </div>`;
}

function refreshLineTotals(root) {
  root.querySelectorAll('[data-orcamento-linha]').forEach((row) => {
    const qtd = row.querySelector('[data-orc-field="qtd"]')?.value || '1';
    const preco = row.querySelector('[data-orc-field="precoUnit"]')?.value || '';
    const total = computeLinhaTotal({ qtd, precoUnit: preco });
    const cell = row.querySelector('[data-orc-line-total]');
    if (cell) cell.textContent = total > 0 ? formatEuro(total) : '';
  });

  const meta = readOrcamentoFormFromDom(root);
  const totals = computeOrcamentoTotals(meta.linhas, meta.taxaSaida);
  root.querySelector('[data-orc-subtotal]')?.replaceChildren(document.createTextNode(`${formatEuro(totals.subtotal)} €`));
  root.querySelector('[data-orc-iva]')?.replaceChildren(document.createTextNode(`${formatEuro(totals.iva)} €`));
  root.querySelector('[data-orc-total]')?.replaceChildren(document.createTextNode(`${formatEuro(totals.total)} €`));
}

function bindLinhaEvents(root) {
  const tbody = root.querySelector('#review-orc-linhas-body');
  if (!tbody) return;

  tbody.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-field]')) refreshLineTotals(root);
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.review-orc-remove');
    if (!btn) return;
    const row = btn.closest('[data-orcamento-linha]');
    if (!row) return;
    const rows = tbody.querySelectorAll('[data-orcamento-linha]');
    if (rows.length <= 1) {
      row.querySelectorAll('input').forEach((input) => {
        input.value = input.dataset.orcField === 'qtd' ? '1' : '';
      });
    } else {
      row.remove();
    }
    refreshLineTotals(root);
  });

  root.querySelector('#review-orc-add-linha')?.addEventListener('click', () => {
    const index = tbody.querySelectorAll('[data-orcamento-linha]').length;
    tbody.insertAdjacentHTML('beforeend', renderLinhaRow(emptyOrcamentoLinha(), index));
    refreshLineTotals(root);
  });

  root.querySelector('[data-orc-field="taxaSaida"]')?.addEventListener('input', () => {
    refreshLineTotals(root);
  });
}

/**
 * @param {HTMLElement} overlay
 * @param {{ report: object, onUpdated?: (report: object) => void }} ctx
 */
export function bindReviewOrcamentoEditor(overlay, { report, onUpdated } = {}) {
  const root = overlay.querySelector('#review-orcamento-editor');
  if (!root) return;

  bindLinhaEvents(root);
  refreshLineTotals(root);

  root.querySelector('#review-orc-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast } = await import('./app.js');
      const meta = readOrcamentoFormFromDom(root);
      showToast('A guardar proposta MS.015…', 'info', 3000);
      const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
      const saved = await saveAndRegenerateOrcamento(report, meta);
      if (!saved) {
        showToast('Não foi possível guardar a proposta.', 'error');
        return;
      }
      onUpdated?.(saved);
      const formatado = saved.data?.orcamento?.numeroFormatado;
      if (formatado) {
        root.querySelector('[data-orc-numero-formatado]')?.replaceChildren(
          document.createTextNode(formatado),
        );
      }
      showToast('Proposta MS.015 atualizada.', 'success');
    } catch (err) {
      console.error('[RH] Guardar orçamento:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar a proposta.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
