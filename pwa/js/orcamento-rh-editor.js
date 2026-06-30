/**
 * Editor RH — linhas de orçamento MS.015 (artigos, preços, e-mail da proposta).
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
import { resolveOrcamentoCabecalho } from './orcamento-cabecalho.js';
import {
  getReportOrcamentoPdfUrl,
  openOrcamentoStorageUrl,
} from './pedido-orcamento.js';
import { escapeHtml } from './html-utils.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_MATRICULA,
} from './field-labels.js';

function defaultOrcamentoEmail(report, client) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.emailDestinatario) return String(meta.emailDestinatario).trim();
  return '';
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

export function renderOrcamentoEditor(report, { client } = {}) {
  const meta = getReportOrcamentoMeta(report) || buildOrcamentoMetaDraft(report);
  const linhas = suggestOrcamentoLinhas(report);
  const numeroLabel =
    meta.numeroFormatado ||
    (meta.numeroSequencial
      ? formatOrcamentoNumeroLabel(meta.numeroSequencial, meta.ano)
      : 'Atribuído ao guardar');
  const totals = renderTotals({ ...meta, linhas });
  const taxaSaida = meta.taxaSaida != null ? String(meta.taxaSaida) : '';
  const prazoEntrega = escapeHtml(meta.prazoEntrega || '');
  const emailDestinatario = escapeHtml(defaultOrcamentoEmail(report, client));
  const clienteEmailHint = escapeHtml(client?.email || client?.['E-mail'] || '');
  const cab = resolveOrcamentoCabecalho(report);

  return `
    <div class="review-orcamento-editor" id="orcamento-editor">
      <div class="review-orcamento-editor__head">
        <p class="review-orcamento-editor__numero">
          Orçamento nº
          <strong data-orc-numero-formatado>${escapeHtml(numeroLabel)}</strong>
          <span class="sr-only" data-orc-numero-sequencial>${escapeHtml(String(meta.numeroSequencial || ''))}</span>
          <span class="sr-only" data-orc-numero-ano>${escapeHtml(String(meta.ano || new Date().getFullYear()))}</span>
        </p>
      </div>

      <section class="review-orc-cabecalho" aria-label="Dados da proposta MS.015">
        <h4 class="review-orc-cabecalho__title">Dados da proposta</h4>
        <div class="review-orc-cabecalho__grid">
          <div class="review-orc-field review-orc-field--readonly">
            <span>Para (cliente)</span>
            <p class="review-orc-readonly" aria-readonly="true">${escapeHtml(cab.clienteNome) || '—'}</p>
            <span class="review-orc-field-hint text-muted">Sempre o cliente deste relatório.</span>
          </div>
          <label class="review-orc-field">
            <span>A/C.</span>
            <input type="text" class="review-orc-input" data-orc-field="clienteAc" value="${escapeHtml(cab.clienteAc)}" placeholder="Destinatário / contacto" />
          </label>
          <label class="review-orc-field">
            <span>${LABEL_MARCA}</span>
            <input type="text" class="review-orc-input" data-orc-field="marca" value="${escapeHtml(cab.marca)}" placeholder="${LABEL_MARCA}" />
          </label>
          <label class="review-orc-field">
            <span>${LABEL_MODELO}</span>
            <input type="text" class="review-orc-input" data-orc-field="modelo" value="${escapeHtml(cab.modelo)}" placeholder="${LABEL_MODELO}" />
          </label>
          <label class="review-orc-field">
            <span>${LABEL_TIPO}</span>
            <input type="text" class="review-orc-input" data-orc-field="tipo" value="${escapeHtml(cab.tipo)}" placeholder="${LABEL_TIPO}" />
          </label>
          <label class="review-orc-field">
            <span>${LABEL_NUMERO_SERIE}</span>
            <input type="text" class="review-orc-input" data-orc-field="numeroSerie" value="${escapeHtml(cab.numeroSerie)}" placeholder="${LABEL_NUMERO_SERIE}" />
          </label>
          <label class="review-orc-field">
            <span>${LABEL_N_INTERNO}</span>
            <input type="text" class="review-orc-input" data-orc-field="numeroInterno" value="${escapeHtml(cab.numeroInterno)}" placeholder="${LABEL_N_INTERNO} / ${LABEL_MATRICULA}" />
            <span class="review-orc-field-hint text-muted">Sugerido a partir do relatório técnico — pode editar.</span>
          </label>
        </div>
        <label class="review-orc-field review-orc-field--full">
          <span>Apoio do orçamento</span>
          <textarea class="review-orc-input review-orc-textarea" data-orc-field="observacoesTecnico" rows="3" placeholder="O que é necessário (relatório técnico)">${escapeHtml(cab.observacoesTecnico)}</textarea>
          <span class="review-orc-field-hint text-muted">Preenchido a partir de «O que é necessário» no relatório — apoio interno à faturação, não incluído no PDF da proposta.</span>
        </label>
      </section>

      <label class="review-orc-field review-orc-field--email">
        <span>Enviar proposta para</span>
        <input
          type="email"
          class="review-orc-input"
          data-orc-field="emailDestinatario"
          value="${emailDestinatario}"
          autocomplete="email"
          placeholder="compras@empresa.pt"
        />
        <span class="review-orc-field-hint text-muted">
          E-mail da proposta comercial — pode ser diferente do relatório técnico${clienteEmailHint ? ` (ficha cliente: ${clienteEmailHint})` : ''}.
        </span>
      </label>

      <div class="review-orc-table-wrap">
        <table class="review-orc-table">
          <thead>
            <tr>
              <th>Na reparação precisa</th>
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
        <label class="review-orc-field">
          <span>Forma de pagamento</span>
          <input type="text" class="review-orc-input" data-orc-field="formaPagamento" value="${escapeHtml(cab.formaPagamento)}" placeholder="Pronto Pagamento" />
        </label>
        <label class="review-orc-field">
          <span>Validade do orçamento</span>
          <input type="text" class="review-orc-input" data-orc-field="validadeOrcamento" value="${escapeHtml(cab.validadeOrcamento)}" placeholder="10 Dias" />
        </label>
      </div>

      <div class="review-orcamento-editor__totals" aria-live="polite">
        <div><span>Subtotal (s/ IVA)</span><strong data-orc-subtotal>${totals.subtotal} €</strong></div>
        <div><span>IVA (23%)</span><strong data-orc-iva>${totals.iva} €</strong></div>
        <div class="review-orcamento-editor__total-line"><span>Total</span><strong data-orc-total>${totals.total} €</strong></div>
      </div>

      <div class="review-orcamento-editor__actions review-orcamento-editor__actions--split">
        <button type="button" class="btn-primary btn-touch" id="review-orc-save">Guardar proposta</button>
        <button type="button" class="btn-outline btn-touch" id="orcamento-pdf">Ver PDF</button>
        <button type="button" class="btn-success btn-touch" id="orcamento-send-email">Enviar proposta por e-mail</button>
      </div>
      <p class="text-muted review-orcamento-editor__hint">Guarde antes de enviar. O e-mail inclui apenas a proposta MS.015, não o relatório técnico.</p>
    </div>`;
}

/** @deprecated usar renderOrcamentoEditor */
export function renderReviewOrcamentoEditor(report) {
  return renderOrcamentoEditor(report);
}

function refreshLineTotals(root, report = null) {
  root.querySelectorAll('[data-orcamento-linha]').forEach((row) => {
    const qtd = row.querySelector('[data-orc-field="qtd"]')?.value || '1';
    const preco = row.querySelector('[data-orc-field="precoUnit"]')?.value || '';
    const total = computeLinhaTotal({ qtd, precoUnit: preco });
    const cell = row.querySelector('[data-orc-line-total]');
    if (cell) cell.textContent = total > 0 ? formatEuro(total) : '';
  });

  const meta = readOrcamentoFormFromDom(root, report);
  const totals = computeOrcamentoTotals(meta.linhas, meta.taxaSaida);
  root.querySelector('[data-orc-subtotal]')?.replaceChildren(
    document.createTextNode(`${formatEuro(totals.subtotal)} €`),
  );
  root.querySelector('[data-orc-iva]')?.replaceChildren(
    document.createTextNode(`${formatEuro(totals.iva)} €`),
  );
  root.querySelector('[data-orc-total]')?.replaceChildren(
    document.createTextNode(`${formatEuro(totals.total)} €`),
  );
}

function bindLinhaEvents(root, report) {
  const tbody = root.querySelector('#review-orc-linhas-body');
  if (!tbody) return;

  tbody.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-field]')) refreshLineTotals(root, report);
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
    refreshLineTotals(root, report);
  });

  root.querySelector('#review-orc-add-linha')?.addEventListener('click', () => {
    const index = tbody.querySelectorAll('[data-orcamento-linha]').length;
    tbody.insertAdjacentHTML('beforeend', renderLinhaRow(emptyOrcamentoLinha(), index));
    refreshLineTotals(root, report);
  });

  root.querySelector('[data-orc-field="taxaSaida"]')?.addEventListener('input', () => {
    refreshLineTotals(root, report);
  });
}

async function openOrcamentoPdf(report, { saveMeta }) {
  const { showToast } = await import('./app.js');
  showToast('A atualizar proposta MS.015…', 'info', 2500);
  const saved = await saveMeta();
  const url = getReportOrcamentoPdfUrl(saved);
  if (!url) {
    showToast('Não foi possível gerar o PDF.', 'error');
    return null;
  }
  openOrcamentoStorageUrl(url);
  return saved;
}

/**
 * @param {HTMLElement} container
 * @param {{ report: object, onUpdated?: (report: object) => void }} ctx
 */
export function bindOrcamentoEditor(container, { report, onUpdated } = {}) {
  const root = container?.querySelector('#orcamento-editor');
  if (!root) return;

  let currentReport = report;

  bindLinhaEvents(root, currentReport);
  refreshLineTotals(root, currentReport);

  const saveMeta = async () => {
    const meta = readOrcamentoFormFromDom(root, currentReport);
    const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
    const saved = await saveAndRegenerateOrcamento(currentReport, meta);
    if (!saved) throw new Error('Não foi possível guardar a proposta.');
    currentReport = saved;
    onUpdated?.(saved);
    const formatado = saved.data?.orcamento?.numeroFormatado;
    if (formatado) {
      root.querySelector('[data-orc-numero-formatado]')?.replaceChildren(
        document.createTextNode(formatado),
      );
    }
    return saved;
  };

  root.querySelector('#review-orc-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast } = await import('./app.js');
      showToast('A guardar proposta MS.015…', 'info', 3000);
      await saveMeta();
      showToast('Proposta MS.015 guardada.', 'success');
    } catch (err) {
      console.error('[RH] Guardar orçamento:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar a proposta.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#orcamento-pdf')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const saved = await openOrcamentoPdf(currentReport, { saveMeta });
      if (saved) {
        currentReport = saved;
        onUpdated?.(saved);
      }
    } catch (err) {
      console.error('[Orçamento] Abrir PDF:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao abrir o PDF.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#orcamento-send-email')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast, getClient, getJob, getTechnician, sendOrcamentoProposalEmail } =
        await import('./app.js');
      const { resolveReportInterventionDatePt } = await import('./report-intervention-date.js');
      const { isValidEmail } = await import('./validators.js');

      const meta = readOrcamentoFormFromDom(root, currentReport);
      const email = String(meta.emailDestinatario || '').trim();
      if (!email) {
        showToast('Indique o e-mail para envio da proposta.', 'error');
        return;
      }
      if (!isValidEmail(email)) {
        showToast('E-mail da proposta inválido.', 'error');
        return;
      }

      showToast('A preparar envio da proposta…', 'info', 3000);
      const saved = await saveMeta();
      currentReport = saved;
      onUpdated?.(saved);

      const pdfUrl = getReportOrcamentoPdfUrl(saved);
      if (!pdfUrl) {
        showToast('Gere o PDF da proposta antes de enviar.', 'error');
        return;
      }

      const values = saved.data?.values || {};
      const client = getClient(saved.clientId);
      const job = saved.jobId ? getJob(saved.jobId) : null;
      const tech = getTechnician(saved.technicianId);

      await sendOrcamentoProposalEmail({
        to: email,
        reportId: saved.id,
        clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
        tecnico: values.tecnico || tech?.name || '',
        dataConclusao: resolveReportInterventionDatePt(saved, job),
        orcamentoNumero: saved.data?.orcamento?.numeroFormatado || '',
        numeroOrdem: job?.numeroOrdem ?? null,
        pdfUrl,
      });

      const { updateRelatorio, mergeReportInCache } = await import('./relatorios-db.js');
      const withSent = await updateRelatorio(saved.id, {
        data: {
          orcamento: {
            ...(saved.data?.orcamento || {}),
            emailDestinatario: email,
            enviadoEm: new Date().toISOString(),
          },
        },
      });
      if (withSent) {
        mergeReportInCache(withSent);
        currentReport = withSent;
        onUpdated?.(withSent);
      }

      showToast(`Proposta enviada para ${email}.`, 'success', 6000);
    } catch (err) {
      console.error('[Orçamento] Envio e-mail:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Falha ao enviar a proposta.', 'error', 8000);
    } finally {
      btn.disabled = false;
    }
  });
}

/** @deprecated usar bindOrcamentoEditor */
export function bindReviewOrcamentoEditor(overlay, ctx) {
  bindOrcamentoEditor(overlay, ctx);
}
