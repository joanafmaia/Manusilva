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
