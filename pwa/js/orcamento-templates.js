/**
 * Textos fixos das propostas comerciais por tipo (Manutenção Baterias, …).
 */

import {
  ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
  ORCAMENTO_VALIDADE_DEFAULT,
} from './orcamento-cabecalho.js';
import {
  computeLinhaTotal,
  formatEuro,
  getReportOrcamentoMeta,
  parseOrcamentoNumber,
} from './orcamento-linhas.js';
import {
  ORCAMENTO_TIPO_PROPOSTA,
  getOrcamentoTipoProposta,
} from './orcamento-tipo-proposta.js';

export const MANUTENCAO_BATERIA_VALOR_DEFAULT = 85;
export const MANUTENCAO_BATERIA_PERIODICIDADE_DEFAULT = '3_em_3';

export const MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES = [
  { value: 'mensal', label: 'mensal' },
  { value: '2_em_2', label: 'de 2 em 2 meses' },
  { value: '3_em_3', label: 'de 3 em 3 meses' },
];

export const MANUTENCAO_BATERIA_INTRO =
  'Vimos por este meio enviar a nossa melhor proposta para a manutenção do parque das baterias na vossa firma:';

export const MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO = 'ESPECIFICAÇÃO DOS SERVIÇOS:';

export const MANUTENCAO_BATERIA_TRABALHOS_INTRO =
  'Os trabalhos a efetuar em cada uma das visitas correspondem:';

export const MANUTENCAO_BATERIA_TRABALHOS = [
  'Limpeza de Baterias;',
  'Verificação do estado geral das uniões e terminais;',
  'Verificação do estado das fichas;',
  'Verificação do nível de eletrólito;',
  'Leitura de tensões e densidades;',
  'Verificação dos níveis de água;',
  'Colocação de água nas baterias;',
  'Drenagem do líquido das baterias;',
  'Lavagem com produtos para eliminar o derrame do eletrólito;',
  'Fazer teste do enchimento automático.',
];

export const MANUTENCAO_BATERIA_PARAGRAFOS = [
  'Efetuando este trabalho nas baterias, as baterias tem uma autonomia mais elevada e uma duração de vida mais prolongada.',
  'Este procedimento de trabalho, evita a passagem de correntes aos chassis das máquinas.',
  'Estes trabalhos mantém as baterias limpas e secas (que é como tem que andar) e a periodicidade para um bom funcionamento da bateria será a manutenção mensal; de 2 em 2 meses ou de 3 em 3 meses.',
];

export const MANUTENCAO_BATERIA_MO_OBS = 'Este valor já tem mão-de-obra incluída.';

export const MANUTENCAO_BATERIA_NOTA_PECAS =
  'Nota: Nesta proposta de serviços não estão incluídas peças novas.';

export const MANUTENCAO_BATERIA_PDF_SUBTITULO = 'MANUTENÇÃO BATERIAS';

export function isManutencaoBateriaTipo(value) {
  return String(value || '').trim() === ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA;
}

export function isManutencaoBateriaOrcamento(report) {
  return isManutencaoBateriaTipo(getOrcamentoTipoProposta(report));
}

export function resolvePeriodicidadeManutencaoBateria(value) {
  const key = String(value || '').trim();
  const found = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.find((opt) => opt.value === key);
  return found?.value || MANUTENCAO_BATERIA_PERIODICIDADE_DEFAULT;
}

export function formatPeriodicidadeManutencaoBateria(value) {
  const key = resolvePeriodicidadeManutencaoBateria(value);
  const found = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.find((opt) => opt.value === key);
  return found?.label || 'de 3 em 3 meses';
}

export function resolveManutencaoBateriaValor(meta = {}) {
  const parsed = parseOrcamentoNumber(meta.valorManutencaoVisita);
  if (parsed > 0) return parsed;
  return MANUTENCAO_BATERIA_VALOR_DEFAULT;
}

export function formatValorManutencaoBateriaInput(meta = {}) {
  return formatEuro(resolveManutencaoBateriaValor(meta));
}

export function formatLinhaValorManutencaoBateria(meta = {}) {
  const valor = formatValorManutencaoBateriaInput(meta);
  const periodicidade = formatPeriodicidadeManutencaoBateria(meta.periodicidadeManutencao);
  return `Valor de manutenção por visita para a bateria ${periodicidade} fica – ${valor} €`;
}

export function buildManutencaoBateriaLinha(meta = {}) {
  const valor = resolveManutencaoBateriaValor(meta);
  const periodicidade = formatPeriodicidadeManutencaoBateria(meta.periodicidadeManutencao);
  const precoUnit = formatEuro(valor);
  const linha = {
    descricao: `Manutenção de baterias por visita (${periodicidade})`,
    qtd: '1',
    precoUnit,
    equipamentoIndex: 0,
  };
  const totalNum = computeLinhaTotal(linha);
  return {
    ...linha,
    total: totalNum > 0 ? formatEuro(totalNum) : '',
  };
}

/** Preenche meta com texto fixo e linha única para faturação. */
export function applyManutencaoBateriaTemplateMeta(meta = {}, report = null) {
  const periodicidade = resolvePeriodicidadeManutencaoBateria(meta.periodicidadeManutencao);
  const valorManutencaoVisita = formatValorManutencaoBateriaInput({
    ...meta,
    periodicidadeManutencao: periodicidade,
  });
  const linha = buildManutencaoBateriaLinha({
    ...meta,
    periodicidadeManutencao: periodicidade,
    valorManutencaoVisita,
  });

  return {
    ...meta,
    tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA,
    textoIntro: MANUTENCAO_BATERIA_INTRO,
    observacoesCliente: '',
    periodicidadeManutencao: periodicidade,
    valorManutencaoVisita,
    prazoEntrega: '',
    taxasSaida: [],
    taxaSaida: '',
    formaPagamento: String(meta.formaPagamento || '').trim() || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: String(meta.validadeOrcamento || '').trim() || ORCAMENTO_VALIDADE_DEFAULT,
    linhas: [linha],
  };
}

export function resolveManutencaoBateriaMetaFromReport(report) {
  const meta = getReportOrcamentoMeta(report) || {};
  if (!isManutencaoBateriaOrcamento(report)) return meta;
  return applyManutencaoBateriaTemplateMeta(meta, report);
}

export function renderManutencaoBateriaPeriodicidadeSelect(value) {
  const current = resolvePeriodicidadeManutencaoBateria(value);
  const options = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.map(
    ({ value: v, label }) =>
      `<option value="${v}"${v === current ? ' selected' : ''}>${label}</option>`,
  ).join('');
  return `
    <label class="review-orc-field">
      <span>Periodicidade da visita</span>
      <select class="review-orc-input" data-orc-field="periodicidadeManutencao">${options}</select>
    </label>`;
}

export function renderManutencaoBateriaTemplatePreview() {
  const trabalhos = MANUTENCAO_BATERIA_TRABALHOS.map((item) => `<li>${item}</li>`).join('');
  const paragrafos = MANUTENCAO_BATERIA_PARAGRAFOS.map((p) => `<p>${p}</p>`).join('');
  return `
    <section class="review-orc-template-preview" aria-label="Texto fixo da proposta">
      <h4 class="review-orc-cabecalho__title">Texto da proposta (fixo no PDF)</h4>
      <div class="review-orc-template-preview__body">
        <p>${MANUTENCAO_BATERIA_INTRO}</p>
        <p><strong>${MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO}</strong></p>
        <p>${MANUTENCAO_BATERIA_TRABALHOS_INTRO}</p>
        <ul>${trabalhos}</ul>
        ${paragrafos}
        <p class="text-muted">${MANUTENCAO_BATERIA_NOTA_PECAS}</p>
      </div>
    </section>`;
}

/* ─── Manutenção Máquinas (empilhadores) ─── */

export const MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT = 40;
export const MANUTENCAO_MAQUINA_PDF_SUBTITULO = 'MANUTENÇÃO MÁQUINAS';

export const MANUTENCAO_MAQUINA_INTRO =
  'Vimos por este meio enviar a nossa melhor proposta para a manutenção da vossa máquina:';

export const MANUTENCAO_MAQUINA_PLANO_TITULO = 'PLANO DE MANUTENÇÃO AOS EMPILHADORES:';

export const MANUTENCAO_MAQUINA_PLANO_DETALHE = 'Anual ou as 500 horas';

export const MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO = 'ESPECIFICAÇÃO DOS SERVIÇOS:';

export const MANUTENCAO_MAQUINA_TRABALHOS_INTRO =
  'Os trabalhos a efetuar ao empilhador em cada uma das visitas correspondem:';

export const MANUTENCAO_MAQUINA_TRABALHOS = [
  'Revisão do sistema;',
  'Verificação do estado das rodas;',
  'Verificação do sistema hidráulico;',
  'Verificação do sistema de elevação;',
  'Limpeza;',
  'Lubrificação de todo o sistema de torre e eixos;',
  'Colocação de massas;',
  'Substituição dos óleos;',
  'Substituição de filtros (caso a máquina gaste);',
  'Verificação de garfos;',
  'Verificação do estado do banco;',
  'Verificação de fuga de óleos;',
  'Verificação de rolamentos da torre;',
  'Verificação de correntes;',
  'Verificação de faróis e pirilampo;',
  'Reapertos;',
  'Afinações;',
  'Mão-de-obra;',
];

export function isManutencaoMaquinaTipo(value) {
  return String(value || '').trim() === ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA;
}

export function isManutencaoMaquinaOrcamento(report) {
  return isManutencaoMaquinaTipo(getOrcamentoTipoProposta(report));
}

export function isOrcamentoPropostaTemplateTipo(value) {
  return isManutencaoBateriaTipo(value) || isManutencaoMaquinaTipo(value);
}

export function resolveOrcamentoTemplateMode(tipoOrReport) {
  if (typeof tipoOrReport === 'object' && tipoOrReport !== null) {
    return resolveOrcamentoTemplateMode(getOrcamentoTipoProposta(tipoOrReport));
  }
  const tipo = String(tipoOrReport || '').trim();
  if (isManutencaoBateriaTipo(tipo)) return 'manutencao_bateria';
  if (isManutencaoMaquinaTipo(tipo)) return 'manutencao_maquina';
  return null;
}

export function suggestMaquinaManutencaoNome(cabecalho = {}) {
  const marca = String(cabecalho.marca || '').trim();
  const modelo = String(cabecalho.modelo || '').trim();
  const tipo = String(cabecalho.tipo || '').trim();
  return [marca, modelo, tipo].filter(Boolean).join(' ').trim();
}

export function resolveMaquinaManutencaoNome(meta = {}, cabecalho = {}) {
  const saved = String(meta.maquinaManutencaoNome || '').trim();
  if (saved) return saved;
  const suggested = suggestMaquinaManutencaoNome({ ...cabecalho, ...meta });
  return suggested || '—';
}

export function resolveManutencaoMaquinaValorGeral(meta = {}) {
  return parseOrcamentoNumber(meta.valorManutencaoGeral);
}

export function resolveIncluirInspecaoDl50(meta = {}) {
  if (meta.incluirInspecaoDl50 === true || meta.incluirInspecaoDl50 === 'true') return true;
  if (meta.incluirInspecaoDl50 === false || meta.incluirInspecaoDl50 === 'false') return false;
  return Boolean(meta.incluirInspecaoDl50);
}

export function resolveValorInspecaoDl50(meta = {}) {
  const parsed = parseOrcamentoNumber(meta.valorInspecaoDl50);
  if (parsed > 0) return parsed;
  return MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT;
}

export function resolveValorDeslocacaoMaquina(meta = {}) {
  return parseOrcamentoNumber(meta.valorDeslocacao);
}

function buildTemplateLinha(descricao, valor) {
  const precoUnit = formatEuro(valor);
  const linha = { descricao, qtd: '1', precoUnit, equipamentoIndex: 0 };
  const totalNum = computeLinhaTotal(linha);
  return { ...linha, total: totalNum > 0 ? formatEuro(totalNum) : '' };
}

export function buildManutencaoMaquinaLinhas(meta = {}, cabecalho = {}) {
  const linhas = [];
  const nome = resolveMaquinaManutencaoNome(meta, cabecalho);
  const valorGeral = resolveManutencaoMaquinaValorGeral(meta);
  if (valorGeral > 0) {
    linhas.push(buildTemplateLinha(`Manutenção geral a máquina ${nome}`, valorGeral));
  }
  if (resolveIncluirInspecaoDl50(meta)) {
    linhas.push(
      buildTemplateLinha('Inspeção segundo o DL50/2005', resolveValorInspecaoDl50(meta)),
    );
  }
  const deslocacao = resolveValorDeslocacaoMaquina(meta);
  if (deslocacao > 0) {
    linhas.push(buildTemplateLinha('Deslocação', deslocacao));
  }
  return linhas;
}

export function formatManutencaoMaquinaPrecoLinhas(meta = {}, cabecalho = {}) {
  const nome = resolveMaquinaManutencaoNome(meta, cabecalho);
  const lines = [];
  const valorGeral = resolveManutencaoMaquinaValorGeral(meta);
  lines.push(
    valorGeral > 0
      ? `Manutenção geral a máquina ${nome} – ${formatEuro(valorGeral)} €`
      : `Manutenção geral a máquina ${nome} – €`,
  );
  if (resolveIncluirInspecaoDl50(meta)) {
    lines.push(
      `Inspeção segundo o DL50/2005 – ${formatEuro(resolveValorInspecaoDl50(meta))} €`,
    );
  }
  const deslocacao = resolveValorDeslocacaoMaquina(meta);
  lines.push(
    deslocacao > 0 ? `Deslocação – ${formatEuro(deslocacao)} €` : 'Deslocação – €',
  );
  return lines;
}

export function applyManutencaoMaquinaTemplateMeta(meta = {}, report = null) {
  const maquinaManutencaoNome = resolveMaquinaManutencaoNome(meta);
  const incluirInspecaoDl50 = resolveIncluirInspecaoDl50(meta);
  const valorInspecaoDl50 = String(meta.valorInspecaoDl50 || '').trim()
    ? formatEuro(resolveValorInspecaoDl50(meta))
    : formatEuro(MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT);
  const valorManutencaoGeral = String(meta.valorManutencaoGeral || '').trim()
    ? formatEuro(resolveManutencaoMaquinaValorGeral(meta))
    : '';
  const valorDeslocacao = String(meta.valorDeslocacao || '').trim()
    ? formatEuro(resolveValorDeslocacaoMaquina(meta))
    : '';

  const working = {
    ...meta,
    maquinaManutencaoNome,
    incluirInspecaoDl50,
    valorInspecaoDl50,
    valorManutencaoGeral,
    valorDeslocacao,
  };

  const linhas = buildManutencaoMaquinaLinhas(working);

  return {
    ...working,
    tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
    textoIntro: MANUTENCAO_MAQUINA_INTRO,
    observacoesCliente: '',
    taxasSaida: [],
    taxaSaida: '',
    prazoEntrega: String(meta.prazoEntrega || '').trim(),
    formaPagamento: String(meta.formaPagamento || '').trim() || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: String(meta.validadeOrcamento || '').trim() || ORCAMENTO_VALIDADE_DEFAULT,
    linhas: linhas.length ? linhas : [emptyOrcamentoLinhaTemplate()],
  };
}

function emptyOrcamentoLinhaTemplate() {
  return { descricao: '', qtd: '1', precoUnit: '', total: '', equipamentoIndex: 0 };
}

export function renderManutencaoMaquinaTemplatePreview() {
  const trabalhos = MANUTENCAO_MAQUINA_TRABALHOS.map((item) => `<li>${item}</li>`).join('');
  return `
    <section class="review-orc-template-preview" aria-label="Texto fixo da proposta">
      <h4 class="review-orc-cabecalho__title">Texto da proposta (fixo no PDF)</h4>
      <div class="review-orc-template-preview__body">
        <p>${MANUTENCAO_MAQUINA_INTRO}</p>
        <p><strong>${MANUTENCAO_MAQUINA_PLANO_TITULO}</strong></p>
        <p>– ${MANUTENCAO_MAQUINA_PLANO_DETALHE}</p>
        <p><strong>${MANUTENCAO_MAQUINA_ESPECIFICACAO_TITULO}</strong></p>
        <p>${MANUTENCAO_MAQUINA_TRABALHOS_INTRO}</p>
        <ul>${trabalhos}</ul>
      </div>
    </section>`;
}

export function renderManutencaoMaquinaPrecoPreviewHtml(meta = {}, cabecalho = {}) {
  return formatManutencaoMaquinaPrecoLinhas(meta, cabecalho)
    .map((line) => `<p><strong>${line}</strong></p>`)
    .join('');
}

export function applyOrcamentoTemplateMeta(meta = {}, report = null) {
  const tipo = meta.tipoProposta || (report ? getOrcamentoTipoProposta(report) : '');
  if (isManutencaoBateriaTipo(tipo)) return applyManutencaoBateriaTemplateMeta(meta, report);
  if (isManutencaoMaquinaTipo(tipo)) return applyManutencaoMaquinaTemplateMeta(meta, report);
  return meta;
}
