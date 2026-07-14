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
import {
  formatOrcamentoTipoPropostaLabel,
  getOrcamentoTipoProposta,
  renderOrcamentoTipoPropostaSelect,
} from './orcamento-tipo-proposta.js';
import {
  buildManutencaoBateriaPeriodicidadeParagrafo,
  formatLinhaValorManutencaoBateria,
  formatValorManutencaoBateriaInput,
  isManutencaoBateriaTipo,
  isManutencaoMaquinaTipo,
  MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT,
  renderManutencaoBateriaPeriodicidadeInput,
  renderManutencaoBateriaTemplatePreview,
  renderManutencaoMaquinaPrecoPreviewHtml,
  renderManutencaoMaquinaTemplatePreview,
  suggestMaquinaManutencaoNome,
} from './orcamento-templates.js';
import {
  exitOrcamentoPageAfterSend,
  isOrcamentoDedicatedPage,
} from './orcamento-modal.js';
import { bindOrcamentoCatalogoComboboxes } from './orcamento-catalogo-combobox.js';
import { escapeHtml } from './html-utils.js';
import { reportIsStandaloneOrcamento, reportUsesFreeformOrcamentoCliente } from './orcamento-standalone.js';
import {
  resolveOrcamentoWorkflowClass,
  resolveOrcamentoWorkflowLabel,
  resolveOrcamentoWorkflowStatus,
  setOrcamentoRespostaCliente,
} from './orcamento-workflow.js';
import { formatInterventionDatePt } from './report-intervention-date.js';

function defaultOrcamentoEmail(report, _client) {
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
        <div><dt>Tipo</dt><dd>${escapeHtml(formatOrcamentoTipoPropostaLabel(getOrcamentoTipoProposta(report)))}</dd></div>
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

function refreshTemplateTotals(root, report = null) {
  const meta = readOrcamentoFormFromDom(root, report);
  if (root.dataset.orcTemplate === 'manutencao_maquina') {
    const preview = root.querySelector('[data-orc-maquina-precos-preview]');
    if (preview) {
      preview.innerHTML = renderManutencaoMaquinaPrecoPreviewHtml(meta);
    }
  } else {
    root.querySelector('[data-orc-valor-linha-preview]')?.replaceChildren(
      document.createTextNode(formatLinhaValorManutencaoBateria(meta)),
    );
    root.querySelector('[data-orc-periodicidade-paragrafo-preview]')?.replaceChildren(
      document.createTextNode(buildManutencaoBateriaPeriodicidadeParagrafo(meta.periodicidadeManutencao)),
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
  const valorVisita = escapeHtml(meta.valorManutencaoVisita || formatValorManutencaoBateriaInput(meta));

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

      ${renderManutencaoBateriaTemplatePreview(meta.periodicidadeManutencao)}

      <section class="review-orc-template-fields" aria-label="Valores editáveis">
        <h4 class="review-orc-cabecalho__title">Valores da proposta</h4>
        <div class="review-orc-cabecalho__grid">
          ${renderManutencaoBateriaPeriodicidadeInput(meta.periodicidadeManutencao)}
          <label class="review-orc-field">
            <span>Valor por visita (€)</span>
            <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorManutencaoVisita" value="${valorVisita}" inputmode="decimal" placeholder="85,00" />
            <span class="review-orc-field-hint text-muted">Predefinição: 85 € (mão-de-obra incluída).</span>
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
        <p class="review-orc-template-valor-preview"><strong data-orc-valor-linha-preview>${escapeHtml(formatLinhaValorManutencaoBateria(meta))}</strong></p>
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
      <p class="text-muted review-orcamento-editor__hint">O PDF usa o texto fixo da Manutenção Baterias — só precisa de indicar o valor e a periodicidade.</p>
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
  const maquinaNome = escapeHtml(
    meta.maquinaManutencaoNome || suggestMaquinaManutencaoNome(cab) || '',
  );
  const valorGeral = escapeHtml(meta.valorManutencaoGeral || '');
  const valorInspecao = escapeHtml(
    meta.valorInspecaoDl50 || formatEuro(MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT),
  );
  const valorDeslocacao = escapeHtml(meta.valorDeslocacao || '');
  const incluirDl50 = meta.incluirInspecaoDl50 ? ' checked' : '';
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

      ${renderManutencaoMaquinaTemplatePreview()}

      <section class="review-orc-template-fields" aria-label="Valores editáveis">
        <h4 class="review-orc-cabecalho__title">Valores da proposta</h4>
        <div class="review-orc-cabecalho__grid">
          <label class="review-orc-field">
            <span>Máquina (marca / modelo)</span>
            <input type="text" class="review-orc-input" data-orc-field="maquinaManutencaoNome" value="${maquinaNome}" placeholder="ex.: Toyota 8FBMT16" />
            <span class="review-orc-field-hint text-muted">Aparece na linha «Manutenção geral a máquina …».</span>
          </label>
          <label class="review-orc-field">
            <span>Manutenção geral (€)</span>
            <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorManutencaoGeral" value="${valorGeral}" inputmode="decimal" placeholder="0,00" />
          </label>
          <label class="review-orc-field review-orc-field--checkbox">
            <span>Incluir inspeção DL50/2005</span>
            <input type="checkbox" class="review-orc-checkbox" data-orc-field="incluirInspecaoDl50"${incluirDl50} />
            <span class="review-orc-field-hint text-muted">Opcional — o cliente pode querer ou não.</span>
          </label>
          <label class="review-orc-field">
            <span>Valor inspeção DL50/2005 (€)</span>
            <input type="text" class="review-orc-input review-orc-input--money" data-orc-field="valorInspecaoDl50" value="${valorInspecao}" inputmode="decimal" placeholder="40,00" />
          </label>
          <label class="review-orc-field">
            <span>Deslocação (€)</span>
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
      <p class="text-muted review-orcamento-editor__hint">O PDF usa o texto fixo de Manutenção Máquina — preencha máquina, valores e condições.</p>
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
  const freeformCliente = reportUsesFreeformOrcamentoCliente(report);
  const tipo = getOrcamentoTipoProposta(report);
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
export function bindOrcamentoEditor(container, { report, onUpdated, onSent, onTipoChange } = {}) {
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
    const refreshTemplate = () => refreshTemplateTotals(root, currentReport);
    root
      .querySelectorAll(
        '[data-orc-field="valorManutencaoVisita"], [data-orc-field="periodicidadeManutencao"], [data-orc-field="maquinaManutencaoNome"], [data-orc-field="valorManutencaoGeral"], [data-orc-field="valorInspecaoDl50"], [data-orc-field="valorDeslocacao"], [data-orc-field="incluirInspecaoDl50"]',
      )
      .forEach((el) => {
        el.addEventListener('input', refreshTemplate);
        el.addEventListener('change', refreshTemplate);
      });
    refreshTemplate();
  } else {
    const syncEquipColumn = () => syncOrcamentoLinhaEquipamentoColumn(root);
    bindLinhaEvents(root, currentReport);
    bindOrcamentoMaquinasSection(root, { onChange: syncEquipColumn });
    syncEquipColumn();
    refreshLineTotals(root, currentReport);
  }

  root.querySelector('[data-orc-field="tipoProposta"]')?.addEventListener('change', () => {
    const meta = readOrcamentoFormFromDom(root, currentReport);
    const nextReport = {
      ...currentReport,
      data: {
        ...(currentReport.data || {}),
        orcamento: meta,
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
        pdfFilename: saved.data?.orcamentoPdfFilename || undefined,
      });

      mergeReportInCache(saved);
      showToast(`Proposta enviada para ${recipients.join(', ')}.`, 'success', 2500);
      if (isOrcamentoDedicatedPage()) {
        exitOrcamentoPageAfterSend();
      } else {
        onSent?.(saved);
      }
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
