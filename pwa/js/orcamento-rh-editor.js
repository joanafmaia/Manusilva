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
  bindOrcamentoMaquinasSection,
  readOrcamentoMaquinasFromDom,
  renderOrcamentoEquipamentoSelect,
  renderOrcamentoMaquinasSection,
  shouldShowLinhaEquipamentoColumn,
  syncOrcamentoLinhaEquipamentoColumn,
} from './orcamento-maquinas.js';
import {
  getReportOrcamentoPdfUrl,
  openOrcamentoStorageUrl,
} from './pedido-orcamento.js';
import { bindOrcamentoCatalogoComboboxes } from './orcamento-catalogo-combobox.js';
import { escapeHtml } from './html-utils.js';
import { reportIsStandaloneOrcamento } from './orcamento-standalone.js';
import {
  resolveOrcamentoWorkflowClass,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  setOrcamentoRespostaCliente,
} from './orcamento-workflow.js';

function defaultOrcamentoEmail(report, client) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.emailDestinatario) return String(meta.emailDestinatario).trim();
  return '';
}

function renderLinhaRow(row, index, maquinas = []) {
  const descricao = escapeHtml(row.descricao || '');
  const qtd = escapeHtml(row.qtd || '1');
  const precoUnit = escapeHtml(row.precoUnit || '');
  const total = computeLinhaTotal(row);
  const totalLabel = total > 0 ? formatEuro(total) : '';
  const multi = shouldShowLinhaEquipamentoColumn(maquinas);
  const equipCell = multi
    ? `<td class="review-orc-equip-cell" data-orc-equip-td>${renderOrcamentoEquipamentoSelect(maquinas, row.equipamentoIndex ?? 0)}</td>`
    : '';
  return `
    <tr data-orcamento-linha data-index="${index}" data-equipamento-index="${Number(row.equipamentoIndex) || 0}">
      ${equipCell}
      <td><input type="text" class="review-orc-input review-orc-input--descricao" data-orc-field="descricao" value="${descricao}" placeholder="Artigo / descrição" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--qty" data-orc-field="qtd" value="${qtd}" inputmode="decimal" /></td>
      <td><input type="text" class="review-orc-input review-orc-input--money" data-orc-field="precoUnit" value="${precoUnit}" inputmode="decimal" placeholder="0,00" /></td>
      <td class="review-orc-total" data-orc-line-total>${totalLabel}</td>
      <td class="review-orc-row-actions">
        <button type="button" class="btn-icon review-orc-remove" title="Remover linha" aria-label="Remover linha">×</button>
      </td>
    </tr>`;
}

function renderLinhasTableHead(maquinas = []) {
  const equipTh = shouldShowLinhaEquipamentoColumn(maquinas)
    ? '<th class="review-orc-equip-th" data-orc-equip-th scope="col">Equipamento</th>'
    : '';
  return `
    <tr>
      ${equipTh}
      <th>Na reparação precisa</th>
      <th>Qtd.</th>
      <th>Preço unit. (€)</th>
      <th>Total (€)</th>
      <th></th>
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
  const isStandalone = reportIsStandaloneOrcamento(report);
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const metaEnviado = Boolean(meta?.enviadoEm);
  const respostaSection = metaEnviado
    ? `
      <section class="review-orc-resposta" aria-label="Resposta do cliente">
        <h4 class="review-orc-cabecalho__title">Resposta do cliente</h4>
        <p class="review-orc-resposta__status">
          Estado:
          <span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span>
        </p>
        <div class="review-orc-resposta__actions">
          <button type="button" class="btn-success btn-sm btn-touch" data-orc-mark-aceite>Marca aceite</button>
          <button type="button" class="btn-danger btn-sm btn-touch" data-orc-mark-recusada>Marca recusada</button>
        </div>
        <p class="text-muted review-orcamento-editor__hint">Registe aqui se o cliente aceitou ou recusou a proposta enviada.</p>
      </section>`
    : '';
  const apoioOrcamentoField = isStandalone
    ? ''
    : `
        <label class="review-orc-field review-orc-field--full">
          <span>Apoio do orçamento</span>
          <textarea class="review-orc-input review-orc-textarea" data-orc-field="observacoesTecnico" rows="3" placeholder="O que é necessário (relatório técnico)">${escapeHtml(cab.observacoesTecnico)}</textarea>
          <span class="review-orc-field-hint text-muted">Preenchido a partir de «O que é necessário» no relatório — apoio interno à faturação, não incluído no PDF da proposta.</span>
        </label>`;

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

      <section class="review-orc-cabecalho" aria-label="Dados da proposta comercial">
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
        </div>
        <label class="review-orc-field review-orc-field--full">
          <span>Texto introdutório (PDF)</span>
          <textarea class="review-orc-input review-orc-textarea" data-orc-field="textoIntro" rows="2" placeholder="Frase antes dos dados da máquina">${escapeHtml(cab.textoIntro)}</textarea>
          <span class="review-orc-field-hint text-muted">Aparece no início da proposta, antes dos equipamentos.</span>
        </label>
        ${renderOrcamentoMaquinasSection(cab.maquinas, cab.equipamentoCampos)}
        <label class="review-orc-field review-orc-field--full">
          <span>Observações ao cliente</span>
          <textarea class="review-orc-input review-orc-textarea" data-orc-field="observacoesCliente" rows="3" placeholder="Texto explicativo para o cliente (aparece no PDF da proposta)">${escapeHtml(cab.observacoesCliente)}</textarea>
          <span class="review-orc-field-hint text-muted">Incluído no PDF da proposta enviado ao cliente.</span>
        </label>
        ${apoioOrcamentoField}
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
        <p class="review-orc-catalog-hint text-muted">Na coluna «Na reparação precisa», escreva para pesquisar no catálogo. Com várias máquinas, indique o equipamento em cada linha.</p>
        <table class="review-orc-table${shouldShowLinhaEquipamentoColumn(cab.maquinas) ? ' review-orc-table--multi-equip' : ''}">
          <thead>
            ${renderLinhasTableHead(cab.maquinas)}
          </thead>
          <tbody id="review-orc-linhas-body">
            ${linhas.map((row, i) => renderLinhaRow(row, i, cab.maquinas)).join('')}
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

      ${respostaSection}

      <div class="review-orcamento-editor__actions review-orcamento-editor__actions--split">
        <button type="button" class="btn-primary btn-touch" id="review-orc-save">Guardar proposta</button>
        <button type="button" class="btn-outline btn-touch" id="orcamento-pdf">Ver PDF</button>
        <button type="button" class="btn-success btn-touch" id="orcamento-send-email">Enviar proposta por e-mail</button>
      </div>
      <p class="text-muted review-orcamento-editor__hint">Guarde antes de enviar. O e-mail inclui apenas a proposta comercial, não o relatório técnico.</p>
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

  const onCatalogChange = () => refreshLineTotals(root, report);

  const bindCatalog = () => {
    bindOrcamentoCatalogoComboboxes(root, { onChange: onCatalogChange });
  };

  bindCatalog();

  tbody.addEventListener('input', (e) => {
    if (e.target.matches('[data-orc-field]')) refreshLineTotals(root, report);
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.matches('[data-orc-field="equipamentoIndex"]')) {
      const tr = e.target.closest('[data-orcamento-linha]');
      if (tr) tr.dataset.equipamentoIndex = e.target.value;
    }
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
      row.querySelectorAll('select').forEach((select) => {
        select.value = '0';
      });
    } else {
      row.remove();
    }
    refreshLineTotals(root, report);
  });

  root.querySelector('#review-orc-add-linha')?.addEventListener('click', () => {
    const maquinas = readOrcamentoMaquinasFromDom(root);
    const index = tbody.querySelectorAll('[data-orcamento-linha]').length;
    tbody.insertAdjacentHTML('beforeend', renderLinhaRow(emptyOrcamentoLinha(), index, maquinas));
    syncOrcamentoLinhaEquipamentoColumn(root);
    bindCatalog();
    refreshLineTotals(root, report);
  });

  root.querySelector('[data-orc-field="taxaSaida"]')?.addEventListener('input', () => {
    refreshLineTotals(root, report);
  });
}

async function openOrcamentoPdf(report, { saveMeta }) {
  const { showToast } = await import('./app.js');
  showToast('A atualizar proposta comercial…', 'info', 2500);
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

  const syncEquipColumn = () => syncOrcamentoLinhaEquipamentoColumn(root);

  bindLinhaEvents(root, currentReport);
  bindOrcamentoMaquinasSection(root, { onChange: syncEquipColumn });
  syncEquipColumn();
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
      showToast('A guardar proposta comercial…', 'info', 3000);
      await saveMeta();
      showToast('Proposta comercial guardada.', 'success');
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

  root.querySelector('[data-orc-mark-aceite]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const saved = await setOrcamentoRespostaCliente(currentReport.id, 'aceite');
      if (!saved) throw new Error('Não foi possível guardar.');
      currentReport = saved;
      onUpdated?.(saved);
      showToast('Proposta marcada como aceite.', 'success');
    } catch (err) {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar.', 'error');
    }
  });

  root.querySelector('[data-orc-mark-recusada]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const saved = await setOrcamentoRespostaCliente(currentReport.id, 'recusada');
      if (!saved) throw new Error('Não foi possível guardar.');
      currentReport = saved;
      onUpdated?.(saved);
      showToast('Proposta marcada como recusada.', 'info');
    } catch (err) {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar.', 'error');
    }
  });

  root.querySelector('#orcamento-send-email')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast, getClient, getJob, getTechnician, sendOrcamentoProposalEmail } =
        await import('./app.js');
      const { resolveOrcamentoDocumentDate } = await import('./orcamento-fill-data.js');
      const { formatInterventionDatePt } = await import('./report-intervention-date.js');
      const { mergeReportInCache } = await import('./relatorios-db.js');
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

      const sentAt = new Date().toISOString();
      meta.emailDestinatario = email;
      meta.enviadoEm = sentAt;
      meta.respostaCliente = null;
      meta.respostaClienteEm = null;

      showToast('A preparar envio da proposta…', 'info', 3000);
      const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
      const saved = await saveAndRegenerateOrcamento(currentReport, meta);
      if (!saved) throw new Error('Não foi possível guardar a proposta.');
      currentReport = saved;
      onUpdated?.(saved);

      const pdfUrl = getReportOrcamentoPdfUrl(saved);
      if (!pdfUrl) {
        showToast('Não foi possível gerar o PDF da proposta.', 'error');
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
        dataConclusao: formatInterventionDatePt(resolveOrcamentoDocumentDate(saved)),
        orcamentoNumero: saved.data?.orcamento?.numeroFormatado || '',
        numeroOrdem: job?.numeroOrdem ?? null,
        pdfUrl,
      });

      mergeReportInCache(saved);
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
