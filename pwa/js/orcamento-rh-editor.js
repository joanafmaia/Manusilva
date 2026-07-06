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
  MAX_TAXAS_SAIDA,
  readOrcamentoFormFromDom,
  suggestOrcamentoLinhas,
  taxasSaidaSlotsFromMeta,
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
import { formatInterventionDatePt } from './report-intervention-date.js';
import {
  MAX_ORCAMENTO_FOTOS,
  normalizeOrcamentoFotos,
  ORCAMENTO_FOTOS_POSICOES,
  readOrcamentoFotosPosicaoFromDom,
} from './orcamento-fotos.js';

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
  const totals = computeOrcamentoTotals(linhas, meta);
  return {
    subtotal: formatEuro(totals.subtotal),
    iva: formatEuro(totals.iva),
    total: formatEuro(totals.total),
  };
}

function renderTaxasSaidaFields(meta) {
  const slots = taxasSaidaSlotsFromMeta(meta);
  return `
    <fieldset class="review-orc-field review-orc-field--taxas-saida">
      <legend>Taxas de saída (€)</legend>
      <div class="review-orc-taxas-saida__grid">
        ${slots
          .map(
            (value, index) => `
          <label class="review-orc-taxa-saida-slot">
            <span>Taxa ${index + 1}</span>
            <input
              type="text"
              class="review-orc-input"
              data-orc-field="taxaSaida"
              data-taxa-index="${index}"
              value="${escapeHtml(value)}"
              inputmode="decimal"
              placeholder="0,00"
            />
          </label>`,
          )
          .join('')}
      </div>
      <span class="review-orc-field-hint text-muted">Até ${MAX_TAXAS_SAIDA} taxas; em branco ignora. A soma entra no subtotal.</span>
    </fieldset>`;
}

function renderOrcamentoFotosSlots(fotos = []) {
  return Array.from({ length: MAX_ORCAMENTO_FOTOS }, (_, index) => {
    const foto = fotos[index];
    const preview = foto?.dataUrl
      ? `<img src="${foto.dataUrl}" alt="" class="review-orc-fotos__preview-img" />`
      : '<span class="review-orc-fotos__placeholder">Sem foto</span>';
    const removeBtn = foto
      ? `<button type="button" class="btn-outline btn-sm btn-touch review-orc-fotos__remove" data-orc-foto-remove="${index}">Remover</button>`
      : '';
    return `
      <div class="review-orc-fotos__slot" data-orc-foto-slot="${index}">
        <div class="review-orc-fotos__preview">${preview}</div>
        <label class="review-orc-fotos__upload btn-outline btn-sm btn-touch">
          ${foto ? 'Substituir foto' : 'Carregar foto'}
          <input type="file" accept="image/*" class="review-orc-fotos__file" data-orc-foto-input="${index}" hidden />
        </label>
        <input
          type="text"
          class="review-orc-input review-orc-fotos__legenda"
          data-orc-foto-legenda="${index}"
          value="${escapeHtml(foto?.legenda || '')}"
          placeholder="Legenda (opcional)"
          ${foto ? '' : 'disabled'}
        />
        ${removeBtn}
      </div>`;
  }).join('');
}

function renderOrcamentoFotosSection(meta) {
  const slots = fotoSlotsFromMeta(meta);
  const fotosPosicao = normalizeOrcamentoFotos(meta).fotosPosicao;
  const posOptions = ORCAMENTO_FOTOS_POSICOES.map(
    (row) =>
      `<option value="${row.id}"${fotosPosicao === row.id ? ' selected' : ''}>${escapeHtml(row.label)}</option>`,
  ).join('');

  return `
    <section class="review-orc-fotos" aria-label="Fotos na proposta">
      <h4 class="review-orc-cabecalho__title">Fotos no PDF</h4>
      <p class="text-muted review-orc-field-hint">Opcional — até ${MAX_ORCAMENTO_FOTOS} fotografias na proposta comercial.</p>
      <label class="review-orc-field">
        <span>Posição no PDF</span>
        <select class="review-orc-input" data-orc-field="fotosPosicao">${posOptions}</select>
      </label>
      <div class="review-orc-fotos__grid">${renderOrcamentoFotosSlots(slots)}</div>
    </section>`;
}

function refreshOrcamentoFotosGrid(root) {
  const grid = root.querySelector('.review-orc-fotos__grid');
  if (!grid || !root._orcamentoFotosState) return;
  grid.innerHTML = renderOrcamentoFotosSlots(fotoSlotsFromMeta(root._orcamentoFotosState));
}

function fotoSlotsFromMeta(meta) {
  const list = Array.isArray(meta?.fotos) ? meta.fotos : [];
  return Array.from({ length: MAX_ORCAMENTO_FOTOS }, (_, index) => {
    const row = list[index];
    return row?.dataUrl?.startsWith('data:image') ? row : null;
  });
}

function bindOrcamentoFotosSection(root, report) {
  const meta = getReportOrcamentoMeta(report) || {};
  root._orcamentoFotosState = {
    ...normalizeOrcamentoFotos(meta),
    fotos: fotoSlotsFromMeta(meta),
  };

  const syncPosicao = () => {
    root._orcamentoFotosState = {
      ...root._orcamentoFotosState,
      fotosPosicao: readOrcamentoFotosPosicaoFromDom(root),
    };
  };

  root.querySelector('[data-orc-field="fotosPosicao"]')?.addEventListener('change', syncPosicao);

  root.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-orc-foto-input]');
    if (!input || !root.contains(input)) return;
    const index = Number(input.dataset.orcFotoInput);
    const file = input.files?.[0];
    input.value = '';
    if (!file || !Number.isInteger(index) || index < 0 || index >= MAX_ORCAMENTO_FOTOS) return;

    try {
      const { compressImageFile } = await import('./image-compress.js');
      const { dataUrl } = await compressImageFile(file);
      const slots = fotoSlotsFromMeta(root._orcamentoFotosState);
      slots[index] = { dataUrl, legenda: slots[index]?.legenda || '' };
      root._orcamentoFotosState = {
        ...root._orcamentoFotosState,
        fotos: slots,
      };
      refreshOrcamentoFotosGrid(root);
    } catch (err) {
      console.error('[Orçamento] Carregar foto:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Não foi possível carregar a foto.', 'error');
    }
  });

  root.addEventListener('input', (e) => {
    const field = e.target.closest('[data-orc-foto-legenda]');
    if (!field || !root.contains(field)) return;
    const index = Number(field.dataset.orcFotoLegenda);
    const slots = fotoSlotsFromMeta(root._orcamentoFotosState);
    if (!slots[index]) return;
    slots[index] = { ...slots[index], legenda: field.value.trim() };
    root._orcamentoFotosState = { ...root._orcamentoFotosState, fotos: slots };
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-orc-foto-remove]');
    if (!btn || !root.contains(btn)) return;
    const index = Number(btn.dataset.orcFotoRemove);
    const slots = fotoSlotsFromMeta(root._orcamentoFotosState);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_ORCAMENTO_FOTOS) return;
    slots[index] = null;
    root._orcamentoFotosState = {
      ...root._orcamentoFotosState,
      fotos: slots,
    };
    refreshOrcamentoFotosGrid(root);
  });
}

function renderOrcamentoRespostaSection(report) {
  const workflow = resolveOrcamentoWorkflowStatus(report);
  return `
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
    </section>`;
}

function renderOrcamentoSentSummary(report, { client } = {}) {
  const meta = getReportOrcamentoMeta(report) || {};
  const numeroLabel =
    meta.numeroFormatado ||
    (meta.numeroSequencial
      ? formatOrcamentoNumeroLabel(meta.numeroSequencial, meta.ano)
      : '—');
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const enviadoEm = formatInterventionDatePt(meta.enviadoEm) || '—';
  const email = escapeHtml(meta.emailDestinatario || defaultOrcamentoEmail(report, client) || '—');
  const pdfUrl = getReportOrcamentoPdfUrl(report);

  return `
    <div class="review-orcamento-editor review-orcamento-editor--sent" id="orcamento-editor" data-orc-sent="1">
      <div class="review-orcamento-editor__head">
        <p class="review-orcamento-editor__numero">
          Orçamento nº <strong>${escapeHtml(numeroLabel)}</strong>
        </p>
      </div>
      <p class="review-orcamento-sent-notice">
        Esta proposta já foi enviada ao cliente em <strong>${escapeHtml(enviadoEm)}</strong>.
        Não é possível alterá-la — use a lista de orçamentos para consultar o PDF ou registar a resposta.
      </p>
      <dl class="review-orcamento-sent-meta">
        <div><dt>Estado</dt><dd><span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span></dd></div>
        <div><dt>Enviada para</dt><dd>${email}</dd></div>
      </dl>
      ${renderOrcamentoRespostaSection(report)}
      <div class="review-orcamento-editor__actions">
        ${
          pdfUrl
            ? '<button type="button" class="btn-outline btn-touch" id="orcamento-pdf-open">Ver PDF da proposta</button>'
            : ''
        }
      </div>
    </div>`;
}

export function renderOrcamentoEditor(report, { client } = {}) {
  const meta = getReportOrcamentoMeta(report) || buildOrcamentoMetaDraft(report);
  if (meta?.enviadoEm) {
    return renderOrcamentoSentSummary(report, { client });
  }

  const linhas = suggestOrcamentoLinhas(report);
  const numeroLabel =
    meta.numeroFormatado ||
    (meta.numeroSequencial
      ? formatOrcamentoNumeroLabel(meta.numeroSequencial, meta.ano)
      : 'Atribuído ao guardar');
  const totals = renderTotals({ ...meta, linhas });
  const prazoEntrega = escapeHtml(meta.prazoEntrega || '');
  const emailDestinatario = escapeHtml(defaultOrcamentoEmail(report, client));
  const clienteEmailHint = escapeHtml(client?.email || client?.['E-mail'] || '');
  const cab = resolveOrcamentoCabecalho(report);
  const isStandalone = reportIsStandaloneOrcamento(report);
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
        ${renderOrcamentoFotosSection(meta)}
      </section>

      <label class="review-orc-field review-orc-field--email">
        <span>Enviar proposta para</span>
        <input
          type="text"
          class="review-orc-input"
          data-orc-field="emailDestinatario"
          value="${emailDestinatario}"
          autocomplete="email"
          placeholder="compras@empresa.pt; contabilidade@empresa.pt"
        />
        <span class="review-orc-field-hint text-muted">
          Um ou vários e-mails, separados por ponto e vírgula ou vírgula${clienteEmailHint ? ` (ficha cliente: ${clienteEmailHint})` : ''}.
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
        ${renderTaxasSaidaFields(meta)}
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
        <button type="button" class="btn-outline btn-touch" id="orcamento-pdf">Ver PDF da proposta</button>
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
  const totals = computeOrcamentoTotals(meta.linhas, meta);
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

  root.querySelectorAll('[data-orc-field="taxaSaida"]').forEach((input) => {
    input.addEventListener('input', () => {
      refreshLineTotals(root, report);
    });
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

function bindOrcamentoRespostaActions(root, { getReport, onUpdated }) {
  root.querySelector('[data-orc-mark-aceite]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const current = getReport();
      const saved = await setOrcamentoRespostaCliente(current.id, 'aceite');
      if (!saved) throw new Error('Não foi possível guardar.');
      onUpdated?.(saved);
      showToast('Proposta marcada como aceite.', 'success');
      window.location.reload();
    } catch (err) {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar.', 'error');
    }
  });

  root.querySelector('[data-orc-mark-recusada]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const current = getReport();
      const saved = await setOrcamentoRespostaCliente(current.id, 'recusada');
      if (!saved) throw new Error('Não foi possível guardar.');
      onUpdated?.(saved);
      showToast('Proposta marcada como recusada.', 'info');
      window.location.reload();
    } catch (err) {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar.', 'error');
    }
  });
}

function bindOrcamentoSentView(root, { report, onUpdated }) {
  let currentReport = report;

  root.querySelector('#orcamento-pdf-open')?.addEventListener('click', async () => {
    const url = getReportOrcamentoPdfUrl(currentReport);
    if (!url) {
      const { showToast } = await import('./app.js');
      showToast('PDF da proposta não disponível.', 'warning');
      return;
    }
    openOrcamentoStorageUrl(url);
  });

  bindOrcamentoRespostaActions(root, {
    getReport: () => currentReport,
    onUpdated: (saved) => {
      currentReport = saved;
      onUpdated?.(saved);
    },
  });
}

/**
 * @param {HTMLElement} container
 * @param {{ report: object, onUpdated?: (report: object) => void, onSent?: (report: object) => void }} ctx
 */
export function bindOrcamentoEditor(container, { report, onUpdated, onSent } = {}) {
  const root = container?.querySelector('#orcamento-editor');
  if (!root) return;

  let currentReport = report;

  if (root.dataset.orcSent === '1' || getReportOrcamentoMeta(currentReport)?.enviadoEm) {
    bindOrcamentoSentView(root, { report: currentReport, onUpdated });
    return;
  }

  const syncEquipColumn = () => syncOrcamentoLinhaEquipamentoColumn(root);

  bindLinhaEvents(root, currentReport);
  bindOrcamentoMaquinasSection(root, { onChange: syncEquipColumn });
  bindOrcamentoFotosSection(root, currentReport);
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
    void import('./catalogo-produtos-db.js').then(async ({ persistOrcamentoLinhasToCatalogo }) => {
      const count = await persistOrcamentoLinhasToCatalogo(meta.linhas);
      if (count > 0) {
        const { invalidateCatalogoProdutosCache } = await import('./catalogo-produtos.js');
        invalidateCatalogoProdutosCache();
      }
    });
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

  root.querySelector('#orcamento-send-email')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast, getClient, getJob, getTechnician, sendOrcamentoProposalEmail } =
        await import('./app.js');
      const { resolveOrcamentoDocumentDate } = await import('./orcamento-fill-data.js');
      const { formatInterventionDatePt } = await import('./report-intervention-date.js');
      const { mergeReportInCache } = await import('./relatorios-db.js');
      const { isValidEmailList, formatEmailListForStorage, normalizeEmailList } =
        await import('./validators.js');

      const meta = readOrcamentoFormFromDom(root, currentReport);
      const emailRaw = String(meta.emailDestinatario || '').trim();
      const recipients = normalizeEmailList(emailRaw);
      if (!recipients.length) {
        showToast('Indique pelo menos um e-mail para envio da proposta.', 'error');
        return;
      }
      if (!isValidEmailList(emailRaw)) {
        showToast('Um ou mais e-mails da proposta são inválidos.', 'error');
        return;
      }

      const sentAt = new Date().toISOString();
      meta.emailDestinatario = formatEmailListForStorage(recipients);
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
        to: recipients,
        reportId: saved.id,
        clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
        tecnico: values.tecnico || tech?.name || '',
        dataConclusao: formatInterventionDatePt(resolveOrcamentoDocumentDate(saved)),
        orcamentoNumero: saved.data?.orcamento?.numeroFormatado || '',
        numeroOrdem: job?.numeroOrdem ?? null,
        pdfUrl,
      });

      mergeReportInCache(saved);
      showToast(`Proposta enviada para ${recipients.join(', ')}.`, 'success', 4000);
      onSent?.(saved);
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
