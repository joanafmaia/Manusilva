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
import { mergeOrcamentoMetaWithCabecalho, resolveOrcamentoCabecalho } from './orcamento-cabecalho.js';
import {
  bindOrcamentoMaquinasSection,
  readOrcamentoMaquinasFromDom,
  renderOrcamentoLinhaRow,
  renderOrcamentoLinhasTableBody,
  renderOrcamentoLinhasTableHead,
  renderOrcamentoMaquinasSection,
  shouldGroupOrcamentoLinhasByEquipamento,
  shouldShowLinhaEquipamentoColumn,
  syncOrcamentoLinhaEquipamentoColumn,
  syncOrcamentoGroupedEquipHeaders,
  syncOrcamentoLinhasColunaTitulo,
  formatOrcamentoCatalogHint,
} from './orcamento-maquinas.js';
import {
  renderTituloColunaArtigosControl,
  resolveTituloColunaArtigos,
  resolveTituloColunaArtigosState,
  tituloColunaArtigosForPreset,
  TITULO_COLUNA_ARTIGOS_PRESET,
} from './orcamento-coluna-artigos.js';
import {
  getReportOrcamentoPdfUrl,
  openOrcamentoStorageUrl,
} from './pedido-orcamento.js';
import {
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  normalizeOrcamentoTipoProposta,
  ORCAMENTO_TIPO_PROPOSTA,
  renderOrcamentoTipoPropostaSelect,
} from './orcamento-tipo-proposta.js';
import {
  applyManutencaoBateriaTemplateMeta,
  applyManutencaoMaquinaTemplateMeta,
  buildManutencaoBateriaParagrafos,
  formatLinhasValorManutencaoBateria,
  isManutencaoBateriaTipo,
  isManutencaoMaquinaTipo,
  renderManutencaoBateriaTemplatePreview,
  renderManutencaoMaquinaIdentPreviewHtml,
  renderManutencaoMaquinaPrecoPreviewHtml,
  renderManutencaoMaquinaTemplatePreview,
  resolveManutencaoMaquinaIntro,
} from './orcamento-templates.js';
import {
  bindTemplateBateriasValoresSection,
  bindTemplateMaquinasSection,
  readTemplateMaquinasFromDom,
  renderTemplateEquipValoresSection,
  renderTemplateMaquinasSection,
  resolveTemplateEquipamentos,
  syncTemplateEquipValoresList,
} from './orcamento-template-equipamentos.js';
import {
  isOrcamentoDedicatedPage,
  returnToOrcamentosMenu,
} from './orcamento-modal.js';
import { bindOrcamentoCatalogoComboboxes } from './orcamento-catalogo-combobox.js';
import { escapeHtml } from './html-utils.js';
import { reportIsStandaloneOrcamento, reportUsesFreeformOrcamentoCliente } from './orcamento-standalone.js';
import {
  formatOrcamentoRespostaDataLabel,
  ORCAMENTO_RESPOSTA,
  resolveOrcamentoWorkflowClass,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  setOrcamentoRespostaCliente,
  todayLocalDateInputValue,
  toLocalDateInputValue,
} from './orcamento-workflow.js';
import { formatInterventionDatePt } from './report-intervention-date.js';
import {
  formatReclamacaoGarantiaLabel,
  getReportReclamacaoGarantia,
  normalizeReclamacaoGarantia,
  readReclamacaoGarantiaFromDom,
  renderReclamacaoGarantiaField,
  suggestReclamacaoGarantia,
} from './orcamento-reclamacao-garantia.js';

function shouldReturnToOrcamentosMenu() {
  return isOrcamentoDedicatedPage() || Boolean(window.__orcamentoReturnUrl);
}

function finishOrcamentoEditingAndReturn({ onSaved, onSent, saved, action }) {
  if (action === 'save') onSaved?.(saved);
  if (action === 'send') onSent?.(saved);
  if (shouldReturnToOrcamentosMenu()) {
    returnToOrcamentosMenu();
  }
}

function defaultOrcamentoEmail(report, client) {
  const meta = getReportOrcamentoMeta(report);
  if (meta?.emailDestinatario) return String(meta.emailDestinatario).trim();
  return String(client?.email || client?.['E-mail'] || '').trim();
}

function renderGarantiaField(report, meta) {
  return renderReclamacaoGarantiaField(meta, {
    suggested: suggestReclamacaoGarantia(report),
  });
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

function renderOrcamentoRespostaSection(report) {
  const workflow = resolveOrcamentoWorkflowStatus(report);
  const meta = getReportOrcamentoMeta(report) || {};
  const hasResposta =
    workflow === 'aceite' || workflow === 'recusada';
  const dateValue =
    toLocalDateInputValue(meta.respostaClienteEm) || todayLocalDateInputValue();
  const dateLabel = formatOrcamentoRespostaDataLabel(meta);
  const dateTitle =
    workflow === 'aceite'
      ? 'Data de aceite'
      : workflow === 'recusada'
        ? 'Data de recusa'
        : 'Data da resposta';

  return `
    <section class="review-orc-resposta" aria-label="Resposta do cliente">
      <h4 class="review-orc-cabecalho__title">Resposta do cliente</h4>
      <p class="review-orc-resposta__status">
        Estado:
        <span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span>
        ${
          hasResposta && dateLabel
            ? `<span class="review-orc-resposta__data-text">· ${escapeHtml(dateTitle)}: <strong>${escapeHtml(dateLabel)}</strong></span>`
            : ''
        }
      </p>
      <label class="review-orc-field review-orc-resposta__date">
        <span>${escapeHtml(dateTitle)}</span>
        <input type="date" class="review-orc-input" data-orc-field="respostaClienteEm" value="${escapeHtml(dateValue)}" />
        <span class="review-orc-field-hint text-muted">Pode indicar a data real da resposta do cliente (não só a do registo no sistema).</span>
      </label>
      <div class="review-orc-resposta__actions">
        <button type="button" class="btn-success btn-sm btn-touch" data-orc-mark-aceite>Marca aceite</button>
        <button type="button" class="btn-danger btn-sm btn-touch" data-orc-mark-recusada>Marca recusada</button>
        ${
          hasResposta
            ? '<button type="button" class="btn-outline btn-sm btn-touch" data-orc-save-resposta-data>Guardar data</button>'
            : ''
        }
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
        Os valores comerciais ficam bloqueados — pode reenviar o e-mail, corrigir a garantia de auditoria e registar a resposta.
      </p>
      <dl class="review-orcamento-sent-meta">
        <div><dt>Tipo</dt><dd>${escapeHtml(formatOrcamentoTipoPropostaLabel(getOrcamentoTipoProposta(report)))}</dd></div>
        <div><dt>Estado</dt><dd><span class="orcamentos-status ${resolveOrcamentoWorkflowClass(workflow)}">${escapeHtml(resolveOrcamentoWorkflowLabel(workflow))}</span></dd></div>
        <div><dt>Em garantia</dt><dd>${escapeHtml(formatReclamacaoGarantiaLabel(getReportReclamacaoGarantia(report), { empty: 'Não indicado' }))}</dd></div>
        ${
          workflow === 'aceite' || workflow === 'recusada'
            ? `<div><dt>${workflow === 'aceite' ? 'Data de aceite' : 'Data de recusa'}</dt><dd>${escapeHtml(formatOrcamentoRespostaDataLabel(meta, { empty: '—' }))}</dd></div>`
            : ''
        }
        <div><dt>Enviada para</dt><dd>${email}</dd></div>
      </dl>
      <section class="review-orc-sent-tools" aria-label="Ações após envio">
        ${renderGarantiaField(report, meta)}
        <label class="review-orc-field">
          <span>Reenviar proposta para</span>
          <input
            type="text"
            class="review-orc-input"
            data-orc-field="emailDestinatario"
            value="${email === '—' ? '' : email}"
            placeholder="email@empresa.pt"
            inputmode="email"
            autocomplete="email"
          />
          <span class="review-orc-field-hint text-muted">Reenvia o PDF atual sem alterar preços nem número da proposta.</span>
        </label>
        <div class="review-orcamento-editor__actions review-orcamento-editor__actions--sent-tools">
          <button type="button" class="btn-outline btn-sm btn-touch" id="orcamento-garantia-save">Guardar garantia</button>
          <button type="button" class="btn-success btn-sm btn-touch" id="orcamento-resend-email">Reenviar e-mail</button>
          ${
            pdfUrl
              ? '<button type="button" class="btn-outline btn-sm btn-touch" id="orcamento-pdf-open">Ver PDF da proposta</button>'
              : ''
          }
        </div>
      </section>
      ${renderOrcamentoRespostaSection(report)}
    </div>`;
}

function refreshTemplateTotals(root, report = null) {
  const meta = readOrcamentoFormFromDom(root, report);
  if (root.dataset.orcTemplate === 'manutencao_maquina') {
    const preview = root.querySelector('[data-orc-maquina-precos-preview]');
    if (preview) {
      preview.innerHTML = renderManutencaoMaquinaPrecoPreviewHtml(meta, meta);
    }
    const identPreview = root.querySelector('[data-orc-maquina-ident-preview]');
    if (identPreview) {
      identPreview.innerHTML = renderManutencaoMaquinaIdentPreviewHtml(meta, meta);
    }
    const introPreview = root.querySelector('[data-orc-maquina-intro-preview]');
    if (introPreview) {
      introPreview.textContent = resolveManutencaoMaquinaIntro(meta, meta);
    }
  } else {
    const preview = root.querySelector('[data-orc-valor-linha-preview]');
    if (preview) {
      preview.innerHTML = formatLinhasValorManutencaoBateria(meta, meta)
        .map((line) => `<p><strong>${escapeHtml(line)}</strong></p>`)
        .join('');
    }
    const paragrafos = buildManutencaoBateriaParagrafos(meta, meta);
    root.querySelector('[data-orc-periodicidade-paragrafo-preview]')?.replaceChildren(
      document.createTextNode(paragrafos[paragrafos.length - 1] || ''),
    );
  }
  root.querySelector('[data-orc-subtotal]')?.replaceChildren(
    document.createTextNode(`${meta.subtotal} €`),
  );
  root.querySelector('[data-orc-iva]')?.replaceChildren(document.createTextNode(`${meta.iva} €`));
  root.querySelector('[data-orc-total]')?.replaceChildren(document.createTextNode(`${meta.total} €`));
}

function refreshTemplateBateriaTotals(root, report = null) {
  refreshTemplateTotals(root, report);
}

function renderManutencaoBateriaOrcamentoEditor(report, ctx) {
  const {
    meta,
    numeroLabel,
    emailDestinatario,
    clienteEmailHint,
    cab,
    clienteField,
    totals,
  } = ctx;

  const equipamentos = resolveTemplateEquipamentos(meta, cab, 'bateria');

  return `
    <div class="review-orcamento-editor review-orcamento-editor--template" id="orcamento-editor" data-orc-template="manutencao_bateria">
      <div class="review-orcamento-editor__head">
        <p class="review-orcamento-editor__numero">
          Orçamento nº
          <strong data-orc-numero-formatado>${escapeHtml(numeroLabel)}</strong>
          <span class="sr-only" data-orc-numero-sequencial>${escapeHtml(String(meta.numeroSequencial || ''))}</span>
          <span class="sr-only" data-orc-numero-ano>${escapeHtml(String(meta.ano || new Date().getFullYear()))}</span>
        </p>
        <p class="review-orc-template-badge">Modelo: Proposta Manutenção Baterias</p>
      </div>

      <section class="review-orc-cabecalho" aria-label="Dados da proposta comercial">
        <h4 class="review-orc-cabecalho__title">Dados da proposta</h4>
        <div class="review-orc-cabecalho__grid">
          ${renderOrcamentoTipoPropostaSelect(getOrcamentoTipoProposta(report))}
          ${clienteField}
          <label class="review-orc-field">
            <span>A/C.</span>
            <input type="text" class="review-orc-input" data-orc-field="clienteAc" value="${escapeHtml(cab.clienteAc)}" placeholder="Destinatário / contacto" />
          </label>
        </div>
      </section>

      ${renderManutencaoBateriaTemplatePreview(meta)}

      ${renderTemplateEquipValoresSection(equipamentos, [], meta, 'bateria')}

      <section class="review-orc-template-fields" aria-label="Condições da proposta">
        <h4 class="review-orc-cabecalho__title">Condições</h4>
        <div class="review-orc-cabecalho__grid">
          <label class="review-orc-field">
            <span>Forma de pagamento</span>
            <input type="text" class="review-orc-input" data-orc-field="formaPagamento" value="${escapeHtml(cab.formaPagamento)}" placeholder="Pronto Pagamento" />
          </label>
          <label class="review-orc-field">
            <span>Validade do orçamento</span>
            <input type="text" class="review-orc-input" data-orc-field="validadeOrcamento" value="${escapeHtml(cab.validadeOrcamento)}" placeholder="10 Dias" />
          </label>
          ${renderGarantiaField(report, meta)}
        </div>
        <div class="review-orc-template-valor-preview" data-orc-valor-linha-preview>
          ${formatLinhasValorManutencaoBateria(meta, cab)
            .map((line) => `<p><strong>${escapeHtml(line)}</strong></p>`)
            .join('')}
        </div>
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
      <p class="text-muted review-orcamento-editor__hint">O PDF usa o texto fixo da Manutenção Baterias — indique periodicidade e valor por visita.
        <span class="orcamento-autosave-status" data-orc-autosave-status aria-live="polite"></span>
      </p>
    </div>`;
}

function renderManutencaoMaquinaOrcamentoEditor(report, ctx) {
  const {
    meta,
    numeroLabel,
    emailDestinatario,
    clienteEmailHint,
    cab,
    clienteField,
    totals,
  } = ctx;
  const equipamentos = resolveTemplateEquipamentos(meta, cab, 'maquina');
  const valorDeslocacao = escapeHtml(meta.valorDeslocacao || '');
  const prazoEntrega = escapeHtml(meta.prazoEntrega || '');

  return `
    <div class="review-orcamento-editor review-orcamento-editor--template" id="orcamento-editor" data-orc-template="manutencao_maquina">
      <div class="review-orcamento-editor__head">
        <p class="review-orcamento-editor__numero">
          Orçamento nº
          <strong data-orc-numero-formatado>${escapeHtml(numeroLabel)}</strong>
          <span class="sr-only" data-orc-numero-sequencial>${escapeHtml(String(meta.numeroSequencial || ''))}</span>
          <span class="sr-only" data-orc-numero-ano>${escapeHtml(String(meta.ano || new Date().getFullYear()))}</span>
        </p>
        <p class="review-orc-template-badge">Modelo: Proposta Manutenção Máquina</p>
      </div>

      <section class="review-orc-cabecalho" aria-label="Dados da proposta comercial">
        <h4 class="review-orc-cabecalho__title">Dados da proposta</h4>
        <div class="review-orc-cabecalho__grid">
          ${renderOrcamentoTipoPropostaSelect(getOrcamentoTipoProposta(report))}
          ${clienteField}
          <label class="review-orc-field">
            <span>A/C.</span>
            <input type="text" class="review-orc-input" data-orc-field="clienteAc" value="${escapeHtml(cab.clienteAc)}" placeholder="Destinatário / contacto" />
          </label>
        </div>
      </section>

      ${renderManutencaoMaquinaTemplatePreview(meta, meta)}

      ${renderTemplateMaquinasSection(equipamentos, meta)}

      <section class="review-orc-template-fields" aria-label="Condições da proposta">
        <h4 class="review-orc-cabecalho__title">Condições</h4>
        <div class="review-orc-cabecalho__grid">
          <label class="review-orc-field">
            <span>Deslocação (€) — única para a proposta</span>
            <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorDeslocacao" value="${valorDeslocacao}" inputmode="decimal" placeholder="0,00" />
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
          ${renderGarantiaField(report, meta)}
        </div>
        <div class="review-orc-template-valor-preview" data-orc-maquina-precos-preview>
          ${renderManutencaoMaquinaPrecoPreviewHtml(meta, cab)}
        </div>
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
      <p class="text-muted review-orcamento-editor__hint">Identifique cada máquina, preços por máquina e uma deslocação única para a proposta.
        <span class="orcamento-autosave-status" data-orc-autosave-status aria-live="polite"></span>
      </p>
    </div>`;
}

export function renderOrcamentoEditor(report, { client } = {}) {
  const tipo = getOrcamentoTipoProposta(report);
  const cab = resolveOrcamentoCabecalho(report);
  const rawMeta = getReportOrcamentoMeta(report) || buildOrcamentoMetaDraft(report);
  const meta = isManutencaoBateriaTipo(tipo)
    ? applyManutencaoBateriaTemplateMeta(mergeOrcamentoMetaWithCabecalho(rawMeta, cab, { template: true }), report)
    : isManutencaoMaquinaTipo(tipo)
      ? applyManutencaoMaquinaTemplateMeta(mergeOrcamentoMetaWithCabecalho(rawMeta, cab, { template: true }), report)
      : { ...rawMeta, ...cab };
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
  const isStandalone = reportIsStandaloneOrcamento(report);
  const freeformCliente = reportUsesFreeformOrcamentoCliente(report);
  const clienteField = freeformCliente
    ? `
          <label class="review-orc-field">
            <span>Para (cliente)</span>
            <input type="text" class="review-orc-input" data-orc-field="clienteNome" value="${escapeHtml(cab.clienteNome === '—' ? '' : cab.clienteNome)}" placeholder="Nome da empresa / cliente" required />
            <span class="review-orc-field-hint text-muted">Cliente ainda não está na ficha — pode corrigir o nome aqui.</span>
          </label>`
    : `
          <div class="review-orc-field review-orc-field--readonly">
            <span>Para (cliente)</span>
            <p class="review-orc-readonly" aria-readonly="true">${escapeHtml(cab.clienteNome) || '—'}</p>
            <span class="review-orc-field-hint text-muted">Sempre o cliente deste relatório.</span>
          </div>`;
  const apoioOrcamentoField = isStandalone
    ? ''
    : `
        <div class="review-orc-field review-orc-field--full review-orc-field--readonly">
          <span>Apoio do orçamento</span>
          <p class="review-orc-readonly review-orc-readonly--multiline" aria-readonly="true">${escapeHtml(cab.observacoesTecnico) || '—'}</p>
          <span class="review-orc-field-hint text-muted">Vem do técnico («O que é necessário» no relatório). Apoio interno à faturação — não editável aqui e não entra no PDF. Para notas ao cliente, use «Observações ao cliente» abaixo.</span>
        </div>`;

  if (isManutencaoBateriaTipo(tipo)) {
    return renderManutencaoBateriaOrcamentoEditor(report, {
      meta,
      numeroLabel,
      emailDestinatario,
      clienteEmailHint,
      cab,
      clienteField,
      totals,
    });
  }

  if (isManutencaoMaquinaTipo(tipo)) {
    return renderManutencaoMaquinaOrcamentoEditor(report, {
      meta,
      numeroLabel,
      emailDestinatario,
      clienteEmailHint,
      cab,
      clienteField,
      totals,
    });
  }

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
          ${renderOrcamentoTipoPropostaSelect(getOrcamentoTipoProposta(report))}
          ${clienteField}
          <label class="review-orc-field">
            <span>A/C.</span>
            <input type="text" class="review-orc-input" data-orc-field="clienteAc" value="${escapeHtml(cab.clienteAc)}" placeholder="Destinatário / contacto" />
          </label>
        </div>
        <label class="review-orc-field review-orc-field--full">
          <span>Texto introdutório (PDF)</span>
          <textarea class="review-orc-input review-orc-textarea" data-orc-field="textoIntro" rows="2" placeholder="Ex.: Vimos por este meio apresentar a nossa proposta comercial para o seguinte equipamento:">${escapeHtml(cab.textoIntro)}</textarea>
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
        ${renderTituloColunaArtigosControl(meta)}
        <p class="review-orc-catalog-hint text-muted" data-orc-coluna-artigos-hint>${
          escapeHtml(
            formatOrcamentoCatalogHint(
              cab.maquinas,
              cab.equipamentoCampos,
              resolveTituloColunaArtigos(meta),
            ),
          )
        }</p>
        <table class="review-orc-table${
          shouldGroupOrcamentoLinhasByEquipamento(cab.maquinas, cab.equipamentoCampos)
            ? ' review-orc-table--grouped-equip'
            : shouldShowLinhaEquipamentoColumn(cab.maquinas, cab.equipamentoCampos)
              ? ' review-orc-table--multi-equip'
              : ''
        }">
          <thead>
            ${renderOrcamentoLinhasTableHead(
              cab.maquinas,
              cab.equipamentoCampos,
              resolveTituloColunaArtigos(meta),
            )}
          </thead>
          <tbody id="review-orc-linhas-body">
            ${renderOrcamentoLinhasTableBody(linhas, cab.maquinas, cab.equipamentoCampos)}
          </tbody>
        </table>
      </div>

      <div class="review-orcamento-editor__toolbar${
        shouldGroupOrcamentoLinhasByEquipamento(cab.maquinas, cab.equipamentoCampos)
          ? ' review-orcamento-editor__toolbar--hidden'
          : ''
      }">
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
        ${renderGarantiaField(report, meta)}
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
      <p class="text-muted review-orcamento-editor__hint">
        Guarde antes de enviar. O e-mail inclui apenas a proposta comercial, não o relatório técnico.
        <span class="orcamento-autosave-status" data-orc-autosave-status aria-live="polite"></span>
      </p>
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

function refreshOrcamentoLinhaCatalog(root, report) {
  const onCatalogChange = () => refreshLineTotals(root, report);
  bindOrcamentoCatalogoComboboxes(root, { onChange: onCatalogChange });
}

function bindLinhaEvents(root, report) {
  if (!root.querySelector('#review-orc-linhas-body')) return;

  refreshOrcamentoLinhaCatalog(root, report);

  if (root.dataset.orcLinhasBound === '1') return;
  root.dataset.orcLinhasBound = '1';

  root.addEventListener('input', (e) => {
    if (!e.target.closest('#review-orc-linhas-body')) return;
    if (e.target.matches('[data-orc-field]')) refreshLineTotals(root, report);
  });

  root.addEventListener('change', (e) => {
    if (!e.target.closest('#review-orc-linhas-body')) return;
    if (e.target.matches('[data-orc-field="equipamentoIndex"]')) {
      const tr = e.target.closest('[data-orcamento-linha]');
      if (tr) tr.dataset.equipamentoIndex = e.target.value;
    }
  });

  root.addEventListener('click', (e) => {
    const tbody = root.querySelector('#review-orc-linhas-body');
    if (!tbody) return;

    const addEquipBtn = e.target.closest('[data-orc-add-linha-equip]');
    if (addEquipBtn && tbody.contains(addEquipBtn)) {
      const maquinas = readOrcamentoMaquinasFromDom(root);
      const equipIndex = Number(addEquipBtn.dataset.orcAddLinhaEquip) || 0;
      const groupLines = [
        ...tbody.querySelectorAll(
          `[data-orcamento-linha][data-equipamento-index="${equipIndex}"]`,
        ),
      ];
      const insertAfter =
        groupLines.length > 0
          ? groupLines[groupLines.length - 1]
          : addEquipBtn.closest('[data-orc-equip-group]');
      const index = tbody.querySelectorAll('[data-orcamento-linha]').length;
      insertAfter?.insertAdjacentHTML(
        'afterend',
        renderOrcamentoLinhaRow(emptyOrcamentoLinha(equipIndex), index, {
          equipamentoIndex: equipIndex,
          grouped: true,
          maquinas,
        }),
      );
      refreshOrcamentoLinhaCatalog(root, report);
      refreshLineTotals(root, report);
      return;
    }

    const removeBtn = e.target.closest('.review-orc-remove');
    if (removeBtn && tbody.contains(removeBtn)) {
      const row = removeBtn.closest('[data-orcamento-linha]');
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
      return;
    }

    if (e.target.closest('#review-orc-add-linha')) {
      const maquinas = readOrcamentoMaquinasFromDom(root);
      const index = tbody.querySelectorAll('[data-orcamento-linha]').length;
      tbody.insertAdjacentHTML(
        'beforeend',
        renderOrcamentoLinhaRow(emptyOrcamentoLinha(), index, { maquinas }),
      );
      syncOrcamentoLinhaEquipamentoColumn(root);
      refreshOrcamentoLinhaCatalog(root, report);
      refreshLineTotals(root, report);
    }
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
  const readRespostaDate = () =>
    root.querySelector('[data-orc-field="respostaClienteEm"]')?.value?.trim() || '';

  root.querySelector('[data-orc-mark-aceite]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const current = getReport();
      if (!getReportReclamacaoGarantia(current)) {
        const ok = window.confirm(
          'A garantia de auditoria ainda não está indicada (Sim/Não).\n\nQuer marcar como aceite na mesma?',
        );
        if (!ok) return;
      }
      const saved = await setOrcamentoRespostaCliente(current.id, ORCAMENTO_RESPOSTA.ACEITE, {
        respostaClienteEm: readRespostaDate(),
      });
      if (!saved) throw new Error('Não foi possível guardar.');
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
      const current = getReport();
      const saved = await setOrcamentoRespostaCliente(current.id, ORCAMENTO_RESPOSTA.RECUSADA, {
        respostaClienteEm: readRespostaDate(),
      });
      if (!saved) throw new Error('Não foi possível guardar.');
      onUpdated?.(saved);
      showToast('Proposta marcada como recusada.', 'info');
    } catch (err) {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar.', 'error');
    }
  });

  root.querySelector('[data-orc-save-resposta-data]')?.addEventListener('click', async () => {
    try {
      const { showToast } = await import('./app.js');
      const current = getReport();
      const workflow = resolveOrcamentoWorkflowStatus(current);
      if (workflow !== 'aceite' && workflow !== 'recusada') {
        showToast('Marque primeiro aceite ou recusada.', 'warning');
        return;
      }
      const saved = await setOrcamentoRespostaCliente(current.id, workflow, {
        respostaClienteEm: readRespostaDate(),
      });
      if (!saved) throw new Error('Não foi possível guardar.');
      onUpdated?.(saved);
      showToast('Data da resposta atualizada.', 'success');
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

  root.querySelector('#orcamento-garantia-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast } = await import('./app.js');
      const { upsertRelatorio, mergeReportInCache } = await import('./relatorios-db.js');
      const garantia = readReclamacaoGarantiaFromDom(root);
      if (!garantia) {
        showToast('Indique Sim ou Não para a garantia (auditoria).', 'warning');
        return;
      }
      const meta = {
        ...(getReportOrcamentoMeta(currentReport) || {}),
        reclamacaoGarantia: garantia,
      };
      const next = {
        ...currentReport,
        data: {
          ...(currentReport.data || {}),
          orcamento: meta,
        },
      };
      const saved = await upsertRelatorio(next);
      if (!saved) throw new Error('Não foi possível guardar a garantia.');
      mergeReportInCache(saved);
      currentReport = saved;
      onUpdated?.(saved);
      showToast('Garantia de auditoria atualizada.', 'success');
    } catch (err) {
      console.error('[Orçamento] Guardar garantia:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Erro ao guardar a garantia.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#orcamento-resend-email')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast, getClient, getJob, getTechnician, sendOrcamentoProposalEmail } =
        await import('./app.js');
      const { resolveOrcamentoDocumentDate } = await import('./orcamento-fill-data.js');
      const { formatInterventionDatePt } = await import('./report-intervention-date.js');
      const { mergeReportInCache, upsertRelatorio } = await import('./relatorios-db.js');
      const { isValidEmailList, formatEmailListForStorage, normalizeEmailList } =
        await import('./validators.js');

      const emailRaw = String(root.querySelector('[data-orc-field="emailDestinatario"]')?.value || '').trim();
      const recipients = normalizeEmailList(emailRaw);
      if (!recipients.length) {
        showToast('Indique pelo menos um e-mail para reenvio.', 'error');
        return;
      }
      if (!isValidEmailList(emailRaw)) {
        showToast('Um ou mais e-mails são inválidos.', 'error');
        return;
      }

      let saved = currentReport;
      let pdfUrl = getReportOrcamentoPdfUrl(saved);
      if (!pdfUrl) {
        const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
        saved = await saveAndRegenerateOrcamento(saved, getReportOrcamentoMeta(saved) || {});
        pdfUrl = getReportOrcamentoPdfUrl(saved);
      }
      if (!pdfUrl) {
        showToast('Não foi possível obter o PDF da proposta.', 'error');
        return;
      }

      const emailStored = formatEmailListForStorage(recipients);
      const meta = {
        ...(getReportOrcamentoMeta(saved) || {}),
        emailDestinatario: emailStored,
      };
      const next = {
        ...saved,
        data: { ...(saved.data || {}), orcamento: meta },
      };
      saved = (await upsertRelatorio(next)) || next;
      mergeReportInCache(saved);
      currentReport = saved;
      onUpdated?.(saved);

      const values = saved.data?.values || {};
      const client = getClient(saved.clientId);
      const job = saved.jobId ? getJob(saved.jobId) : null;
      const tech = getTechnician(saved.technicianId);

      showToast('A reenviar a proposta…', 'info', 2500);
      await sendOrcamentoProposalEmail({
        to: recipients,
        reportId: saved.id,
        clienteNome: values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
        tecnico: values.tecnico || tech?.name || '',
        dataConclusao: formatInterventionDatePt(resolveOrcamentoDocumentDate(saved)),
        orcamentoNumero: saved.data?.orcamento?.numeroFormatado || '',
        numeroOrdem: job?.numeroOrdem ?? null,
        pdfUrl,
        pdfFilename: saved.data?.orcamentoPdfFilename || undefined,
      });

      showToast(`Proposta reenviada para ${recipients.join(', ')}.`, 'success', 2500);
    } catch (err) {
      console.error('[Orçamento] Reenvio e-mail:', err);
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Falha ao reenviar a proposta.', 'error', 8000);
    } finally {
      btn.disabled = false;
    }
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
export function bindOrcamentoEditor(container, { report, onUpdated, onSaved, onSent, onTipoChange } = {}) {
  const root = container?.querySelector('#orcamento-editor');
  if (!root) return;

  let currentReport = report;

  if (root.dataset.orcSent === '1' || getReportOrcamentoMeta(currentReport)?.enviadoEm) {
    bindOrcamentoSentView(root, { report: currentReport, onUpdated });
    return;
  }

  const isBateriaTemplate = root.dataset.orcTemplate === 'manutencao_bateria';
  const isMaquinaTemplate = root.dataset.orcTemplate === 'manutencao_maquina';

  if (isBateriaTemplate || isMaquinaTemplate) {
    const templateMode = isBateriaTemplate ? 'bateria' : 'maquina';
    const refreshTemplate = () => refreshTemplateTotals(root, currentReport);
    const onTemplateEquipChange = () => {
      const snapshot = readTemplateMaquinasFromDom(root, templateMode);
      syncTemplateEquipValoresList(root, templateMode, snapshot);
      refreshTemplate();
    };
    if (isMaquinaTemplate) {
      bindTemplateMaquinasSection(root, { onChange: refreshTemplate });
    } else {
      bindTemplateBateriasValoresSection(root, { onChange: onTemplateEquipChange });
    }
    const templateFieldSelector =
      '[data-orc-template-equip-valores] [data-orc-field], [data-template-maquina-card] [data-orc-field], [data-orc-field="valorDeslocacao"], [data-orc-field="formaPagamento"], [data-orc-field="validadeOrcamento"], [data-orc-field="prazoEntrega"], [data-orc-field="reclamacaoGarantia"]';
    const onTemplateFieldChange = (e) => {
      if (e.target.matches(templateFieldSelector)) refreshTemplate();
    };
    root.addEventListener('input', onTemplateFieldChange);
    root.addEventListener('change', onTemplateFieldChange);
    refreshTemplate();
  } else {
    const syncEquipStructure = () => {
      syncOrcamentoLinhaEquipamentoColumn(root);
      refreshOrcamentoLinhaCatalog(root, currentReport);
      refreshLineTotals(root, currentReport);
    };
    const syncEquipFieldValue = () => syncOrcamentoGroupedEquipHeaders(root);
    bindLinhaEvents(root, currentReport);
    bindOrcamentoMaquinasSection(root, {
      onChange: syncEquipStructure,
      onFieldChange: syncEquipFieldValue,
    });
    const onTituloColunaChange = (e) => {
      const presetEl = e.target?.matches?.('[data-orc-field="tituloColunaArtigosPreset"]')
        ? e.target
        : null;
      if (presetEl) {
        const preset = presetEl.value;
        const customInput = root.querySelector('[data-orc-field="tituloColunaArtigos"]');
        if (preset !== TITULO_COLUNA_ARTIGOS_PRESET.OUTRO && customInput) {
          customInput.value = tituloColunaArtigosForPreset(preset);
        } else if (preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO && customInput && !customInput.value.trim()) {
          const prev = resolveTituloColunaArtigosState(
            getReportOrcamentoMeta(currentReport) || {},
          );
          if (prev.preset === TITULO_COLUNA_ARTIGOS_PRESET.OUTRO) {
            customInput.value = prev.titulo;
          }
        }
      }
      if (
        e.target?.matches?.('[data-orc-field="tituloColunaArtigosPreset"]') ||
        e.target?.matches?.('[data-orc-field="tituloColunaArtigos"]')
      ) {
        syncOrcamentoLinhasColunaTitulo(root, getReportOrcamentoMeta(currentReport));
      }
    };
    root.addEventListener('change', onTituloColunaChange);
    root.addEventListener('input', onTituloColunaChange);
    syncEquipStructure();
    refreshLineTotals(root, currentReport);
  }

  root.querySelector('[data-orc-field="tipoProposta"]')?.addEventListener('change', () => {
    const tipoRaw = root.querySelector('[data-orc-field="tipoProposta"]')?.value?.trim() || '';
    const meta = readOrcamentoFormFromDom(root, currentReport);
    const prevTipo = getOrcamentoTipoProposta(currentReport);
    const tipoProposta = normalizeOrcamentoTipoProposta(tipoRaw || meta.tipoProposta, currentReport);
    const prevIsFreeform = prevTipo === ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
    const nextIsTemplate = tipoProposta !== ORCAMENTO_TIPO_PROPOSTA.ORCAMENTO;
    const hasFreeformLinhas = (meta.linhas || []).some((row) => String(row?.descricao || '').trim());
    if (prevIsFreeform && nextIsTemplate && hasFreeformLinhas) {
      const ok = window.confirm(
        'Ao mudar para um modelo de manutenção, as linhas livres atuais são substituídas pelo modelo.\n\nContinuar?',
      );
      if (!ok) {
        const select = root.querySelector('[data-orc-field="tipoProposta"]');
        if (select) select.value = prevTipo;
        return;
      }
    }
    const nextReport = {
      ...currentReport,
      data: {
        ...(currentReport.data || {}),
        // Garante o tipo escolhido mesmo ao mudar de modelo máquina/bateria ↔ orçamento.
        orcamento: { ...meta, tipoProposta },
      },
    };
    onTipoChange?.(nextReport);
  });

  const saveMeta = async () => {
    const meta = readOrcamentoFormFromDom(root, currentReport);
    const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
    const { updateRelatorio } = await import('./relatorios-db.js');
    let saved = await saveAndRegenerateOrcamento(currentReport, meta);
    if (!saved) throw new Error('Não foi possível guardar a proposta.');

    if (reportUsesFreeformOrcamentoCliente(currentReport)) {
      const nome = String(meta.clienteNome || '').trim();
      if (nome) {
        const withValues = await updateRelatorio(saved.id, {
          data: {
            values: {
              ...(saved.data?.values || {}),
              nome_empresa: nome,
              cliente: nome,
            },
          },
        });
        if (withValues) saved = withValues;
      }
    }

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

  let autosaveTimer = null;
  const setAutosaveStatus = (text) => {
    const el = root.querySelector('[data-orc-autosave-status]');
    if (el) el.textContent = text ? ` · ${text}` : '';
  };
  const scheduleAutosaveMeta = () => {
    if (root.dataset.orcSent === '1' || getReportOrcamentoMeta(currentReport)?.enviadoEm) return;
    clearTimeout(autosaveTimer);
    setAutosaveStatus('A guardar rascunho…');
    autosaveTimer = setTimeout(async () => {
      try {
        const meta = readOrcamentoFormFromDom(root, currentReport);
        const { updateRelatorio, mergeReportInCache } = await import('./relatorios-db.js');
        const saved = await updateRelatorio(currentReport.id, {
          data: {
            orcamento: meta,
          },
        });
        if (!saved) return;
        mergeReportInCache(saved);
        currentReport = saved;
        onUpdated?.(saved);
        setAutosaveStatus('Rascunho guardado');
      } catch (err) {
        console.warn('[Orçamento] autosave:', err);
        setAutosaveStatus('Falha ao guardar rascunho');
      }
    }, 2000);
  };
  root.addEventListener('input', (e) => {
    if (e.target?.closest?.('[data-orc-field]')) scheduleAutosaveMeta();
  });
  root.addEventListener('change', (e) => {
    if (e.target?.closest?.('[data-orc-field]')) scheduleAutosaveMeta();
  });

  root.querySelector('#review-orc-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { showToast } = await import('./app.js');
      showToast('A guardar proposta comercial…', 'info', 3000);
      await saveMeta();
      showToast('Proposta comercial guardada.', 'success');
      finishOrcamentoEditingAndReturn({ onSaved, saved: currentReport, action: 'save' });
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
    let savedForRollback = null;
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
      if (!normalizeReclamacaoGarantia(readReclamacaoGarantiaFromDom(root) || meta.reclamacaoGarantia)) {
        showToast('Indique se é avaria / reclamação em garantia (Sim ou Não).', 'warning', 6000);
        root.querySelector('[data-orc-field="reclamacaoGarantia"]')?.focus();
        return;
      }

      meta.emailDestinatario = formatEmailListForStorage(recipients);
      // Só marca enviada após e-mail OK — evita bloquear a proposta se SMTP/PDF falhar.
      const previousEnviadoEm = getReportOrcamentoMeta(currentReport)?.enviadoEm || null;
      meta.enviadoEm = null;
      meta.respostaCliente = null;
      meta.respostaClienteEm = null;

      showToast('A preparar envio da proposta…', 'info', 3000);
      const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
      const saved = await saveAndRegenerateOrcamento(currentReport, meta);
      if (!saved) throw new Error('Não foi possível guardar a proposta.');
      savedForRollback = { report: saved, previousEnviadoEm };
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
        pdfFilename: saved.data?.orcamentoPdfFilename || undefined,
      });

      const sentAt = new Date().toISOString();
      const metaSent = {
        ...(getReportOrcamentoMeta(saved) || {}),
        emailDestinatario: formatEmailListForStorage(recipients),
        enviadoEm: sentAt,
        respostaCliente: null,
        respostaClienteEm: null,
      };
      const confirmed = await saveAndRegenerateOrcamento(saved, metaSent);
      if (!confirmed) throw new Error('Proposta enviada, mas não foi possível registar a data de envio.');
      mergeReportInCache(confirmed);
      currentReport = confirmed;
      onUpdated?.(confirmed);

      showToast(`Proposta enviada para ${recipients.join(', ')}.`, 'success', 2500);
      finishOrcamentoEditingAndReturn({ onSent, saved: confirmed, action: 'send' });
    } catch (err) {
      console.error('[Orçamento] Envio e-mail:', err);
      if (savedForRollback?.report) {
        try {
          const { saveAndRegenerateOrcamento } = await import('./orcamento-pdf-service.js');
          const rolledMeta = {
            ...(getReportOrcamentoMeta(savedForRollback.report) || {}),
            enviadoEm: savedForRollback.previousEnviadoEm || null,
          };
          const rolled = await saveAndRegenerateOrcamento(savedForRollback.report, rolledMeta);
          if (rolled) {
            currentReport = rolled;
            onUpdated?.(rolled);
          }
        } catch (rollbackErr) {
          console.error('[Orçamento] Rollback enviadoEm:', rollbackErr);
        }
      }
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Falha ao enviar a proposta. A proposta continua editável.', 'error', 8000);
    } finally {
      btn.disabled = false;
    }
  });
}

/** @deprecated usar bindOrcamentoEditor */
export function bindReviewOrcamentoEditor(overlay, ctx) {
  bindOrcamentoEditor(overlay, ctx);
}
