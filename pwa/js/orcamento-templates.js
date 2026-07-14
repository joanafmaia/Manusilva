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
import {
  countTemplateEquipamentosComDados,
  formatTemplateMaquinaNome,
  resolveEquipamentoIncluirDl50,
  resolveEquipamentoValorGeral,
  resolveEquipamentoValorInspecaoDl50,
  resolveEquipamentoValorVisita,
  resolveTemplateEquipamentos,
  syncLegacyTemplateFieldsFromMaquinas,
} from './orcamento-template-equipamentos.js';

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

export const MANUTENCAO_BATERIA_PARAGRAFOS_FIXOS = [
  'Efetuando este trabalho nas baterias, as baterias tem uma autonomia mais elevada e uma duração de vida mais prolongada.',
  'Este procedimento de trabalho, evita a passagem de correntes aos chassis das máquinas.',
];

/** @deprecated usar MANUTENCAO_BATERIA_PARAGRAFOS_FIXOS + buildManutencaoBateriaPeriodicidadeParagrafo */
export const MANUTENCAO_BATERIA_PARAGRAFOS = MANUTENCAO_BATERIA_PARAGRAFOS_FIXOS;

export function buildManutencaoBateriaPeriodicidadeParagrafo(periodicidadeValue) {
  const label = formatPeriodicidadeManutencaoBateria(periodicidadeValue);
  return `Estes trabalhos mantém as baterias limpas e secas (que é como tem que andar) e a periodicidade para um bom funcionamento da bateria será a manutenção ${label}.`;
}

export function buildManutencaoBateriaParagrafos(metaOrPeriodicidade = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(
    typeof metaOrPeriodicidade === 'object' ? metaOrPeriodicidade : {},
    cabecalho,
    'bateria',
  );
  let paragrafoPeriodicidade;
  if (equipamentos.length > 1) {
    paragrafoPeriodicidade =
      'Estes trabalhos mantém as baterias limpas e secas (que é como tem que andar). A periodicidade de manutenção de cada bateria está indicada nos valores abaixo.';
  } else {
    const periodicidade =
      typeof metaOrPeriodicidade === 'string'
        ? metaOrPeriodicidade
        : equipamentos[0]?.periodicidadeManutencao;
    paragrafoPeriodicidade = buildManutencaoBateriaPeriodicidadeParagrafo(periodicidade);
  }
  return [...MANUTENCAO_BATERIA_PARAGRAFOS_FIXOS, paragrafoPeriodicidade];
}

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
  const raw = String(value || '').trim();
  if (!raw) return MANUTENCAO_BATERIA_PERIODICIDADE_DEFAULT;
  const byKey = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.find((opt) => opt.value === raw);
  if (byKey) return byKey.value;
  const byLabel = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.find(
    (opt) => opt.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byLabel) return byLabel.label;
  return raw;
}

export function formatPeriodicidadeManutencaoBateria(value) {
  const resolved = resolvePeriodicidadeManutencaoBateria(value);
  const byKey = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.find((opt) => opt.value === resolved);
  if (byKey) return byKey.label;
  if (resolved) return resolved;
  return 'de 3 em 3 meses';
}

export function periodicidadeManutencaoBateriaInputValue(value) {
  return formatPeriodicidadeManutencaoBateria(value);
}

export function resolveManutencaoBateriaValor(meta = {}) {
  const parsed = parseOrcamentoNumber(meta.valorManutencaoVisita);
  if (parsed > 0) return parsed;
  return MANUTENCAO_BATERIA_VALOR_DEFAULT;
}

export function formatValorManutencaoBateriaInput(meta = {}) {
  return formatEuro(resolveManutencaoBateriaValor(meta));
}

export function formatLinhasValorManutencaoBateria(meta = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(meta, cabecalho, 'bateria');
  return equipamentos.map((row, index) => {
    const valor = formatEuro(resolveEquipamentoValorVisita(row));
    const periodicidade = formatPeriodicidadeManutencaoBateria(row.periodicidadeManutencao);
    if (equipamentos.length > 1) {
      return `Valor de manutenção por visita para a bateria ${index + 1} (${periodicidade}) fica – ${valor} €`;
    }
    return `Valor de manutenção por visita para a bateria ${periodicidade} fica – ${valor} €`;
  });
}

export function formatLinhaValorManutencaoBateria(meta = {}, cabecalho = {}) {
  const linhas = formatLinhasValorManutencaoBateria(meta, cabecalho);
  return linhas[0] || '';
}

function buildManutencaoBateriaLinhaForEquip(row, index, meta = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(meta, cabecalho, 'bateria');
  const valor = resolveEquipamentoValorVisita(row);
  const periodicidade = formatPeriodicidadeManutencaoBateria(row.periodicidadeManutencao);
  const precoUnit = formatEuro(valor);
  const descricao =
    equipamentos.length > 1
      ? `Manutenção de bateria ${index + 1} por visita (${periodicidade})`
      : `Manutenção de baterias por visita (${periodicidade})`;
  const linha = {
    descricao,
    qtd: '1',
    precoUnit,
    equipamentoIndex: index,
  };
  const totalNum = computeLinhaTotal(linha);
  return {
    ...linha,
    total: totalNum > 0 ? formatEuro(totalNum) : '',
  };
}

export function buildManutencaoBateriaLinhas(meta = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(meta, cabecalho, 'bateria');
  return equipamentos.map((row, index) =>
    buildManutencaoBateriaLinhaForEquip(row, index, meta, cabecalho),
  );
}

/** Preenche meta com texto fixo e linhas por bateria para faturação. */
export function applyManutencaoBateriaTemplateMeta(meta = {}, report = null) {
  const synced = syncLegacyTemplateFieldsFromMaquinas(meta, 'bateria');
  const equipamentos = resolveTemplateEquipamentos(synced, synced, 'bateria');
  const linhas = buildManutencaoBateriaLinhas(synced, synced);
  const first = equipamentos[0] || {};

  return {
    ...synced,
    tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_BATERIA,
    textoIntro: MANUTENCAO_BATERIA_INTRO,
    observacoesCliente: '',
    periodicidadeManutencao: first.periodicidadeManutencao,
    valorManutencaoVisita: first.valorManutencaoVisita || formatValorManutencaoBateriaInput(first),
    prazoEntrega: '',
    taxasSaida: [],
    taxaSaida: '',
    formaPagamento: String(synced.formaPagamento || '').trim() || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: String(synced.validadeOrcamento || '').trim() || ORCAMENTO_VALIDADE_DEFAULT,
    linhas: linhas.length ? linhas : [buildManutencaoBateriaLinhaForEquip(first, 0, synced, synced)],
  };
}

/** @deprecated usar buildManutencaoBateriaLinhas */
export function buildManutencaoBateriaLinha(meta = {}) {
  return buildManutencaoBateriaLinhaForEquip(meta, 0, meta, meta);
}

export function resolveManutencaoBateriaMetaFromReport(report) {
  const meta = getReportOrcamentoMeta(report) || {};
  if (!isManutencaoBateriaOrcamento(report)) return meta;
  return applyManutencaoBateriaTemplateMeta(meta, report);
}

export function renderManutencaoBateriaPeriodicidadeInput(value) {
  const current = periodicidadeManutencaoBateriaInputValue(value);
  const datalistId = 'periodicidadeManutencaoOpcoes';
  const options = MANUTENCAO_BATERIA_PERIODICIDADE_OPCOES.map(
    ({ label }) => `<option value="${label}"></option>`,
  ).join('');
  return `
    <label class="review-orc-field">
      <span>Periodicidade da visita</span>
      <input
        type="text"
        class="review-orc-input"
        data-orc-field="periodicidadeManutencao"
        list="${datalistId}"
        value="${current.replace(/"/g, '&quot;')}"
        placeholder="de 3 em 3 meses"
      />
      <datalist id="${datalistId}">${options}</datalist>
      <span class="review-orc-field-hint text-muted">Ex.: mensal, de 2 em 2 meses, de 3 em 3 meses — ou outro intervalo.</span>
    </label>`;
}

/** @deprecated usar renderManutencaoBateriaPeriodicidadeInput */
export function renderManutencaoBateriaPeriodicidadeSelect(value) {
  return renderManutencaoBateriaPeriodicidadeInput(value);
}

export function renderManutencaoBateriaTemplatePreview(meta = {}) {
  const trabalhos = MANUTENCAO_BATERIA_TRABALHOS.map((item) => `<li>${item}</li>`).join('');
  const paragrafos = buildManutencaoBateriaParagrafos(meta, meta);
  const periodicidadeParagrafo = paragrafos[paragrafos.length - 1] || '';
  return `
    <section class="review-orc-template-preview" aria-label="Texto fixo da proposta">
      <h4 class="review-orc-cabecalho__title">Texto da proposta (fixo no PDF)</h4>
      <div class="review-orc-template-preview__body">
        <p>${MANUTENCAO_BATERIA_INTRO}</p>
        <p><strong>${MANUTENCAO_BATERIA_ESPECIFICACAO_TITULO}</strong></p>
        <p>${MANUTENCAO_BATERIA_TRABALHOS_INTRO}</p>
        <ul>${trabalhos}</ul>
        ${MANUTENCAO_BATERIA_PARAGRAFOS_FIXOS.map((p) => `<p>${p}</p>`).join('')}
        <p data-orc-periodicidade-paragrafo-preview>${periodicidadeParagrafo}</p>
        <p class="text-muted">${MANUTENCAO_BATERIA_NOTA_PECAS}</p>
      </div>
    </section>`;
}

/* ─── Manutenção Máquinas (empilhadores) ─── */

export const MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT = 40;
export const MANUTENCAO_MAQUINA_PDF_SUBTITULO = 'MANUTENÇÃO MÁQUINAS';

export const MANUTENCAO_MAQUINA_INTRO =
  'Vimos por este meio enviar a nossa melhor proposta para a manutenção da vossa máquina:';

export const MANUTENCAO_MAQUINA_INTRO_PLURAL =
  'Vimos por este meio enviar a nossa melhor proposta para a manutenção das vossas máquinas:';

export function resolveManutencaoMaquinaIntro(meta = {}, cabecalho = {}) {
  const count = countTemplateEquipamentosComDados(meta, cabecalho, 'maquina');
  return count > 1 ? MANUTENCAO_MAQUINA_INTRO_PLURAL : MANUTENCAO_MAQUINA_INTRO;
}

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

function resolveMaquinaTemplateNome(row, index, meta = {}, cabecalho = {}) {
  const nome = formatTemplateMaquinaNome(row, index);
  if (!/^Máquina \d+$/.test(nome)) return nome;
  if (index === 0) {
    const legacy = resolveMaquinaManutencaoNome(meta, cabecalho);
    if (legacy && legacy !== '—') return legacy;
  }
  return nome;
}

function buildTemplateLinha(descricao, valor, equipamentoIndex = 0) {
  const precoUnit = formatEuro(valor);
  const linha = { descricao, qtd: '1', precoUnit, equipamentoIndex };
  const totalNum = computeLinhaTotal(linha);
  return { ...linha, total: totalNum > 0 ? formatEuro(totalNum) : '' };
}

export function buildManutencaoMaquinaLinhas(meta = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(meta, cabecalho, 'maquina');
  const linhas = [];
  equipamentos.forEach((row, index) => {
    const nome = resolveMaquinaTemplateNome(row, index, meta, cabecalho);
    const valorGeral = resolveEquipamentoValorGeral(row);
    if (valorGeral > 0) {
      linhas.push(buildTemplateLinha(`Manutenção geral a máquina ${nome}`, valorGeral, index));
    }
    if (resolveEquipamentoIncluirDl50(row)) {
      const dl50Desc =
        equipamentos.length > 1
          ? `Inspeção segundo o DL50/2005 (${nome})`
          : 'Inspeção segundo o DL50/2005';
      linhas.push(
        buildTemplateLinha(dl50Desc, resolveEquipamentoValorInspecaoDl50(row), index),
      );
    }
  });
  const deslocacao = resolveValorDeslocacaoMaquina(meta);
  if (deslocacao > 0) {
    linhas.push(buildTemplateLinha('Deslocação', deslocacao, 0));
  }
  return linhas;
}

export function formatManutencaoMaquinaPrecoLinhas(meta = {}, cabecalho = {}) {
  const equipamentos = resolveTemplateEquipamentos(meta, cabecalho, 'maquina');
  const lines = [];
  equipamentos.forEach((row, index) => {
    const nome = resolveMaquinaTemplateNome(row, index, meta, cabecalho);
    const valorGeral = resolveEquipamentoValorGeral(row);
    lines.push(
      valorGeral > 0
        ? `Manutenção geral a máquina ${nome} – ${formatEuro(valorGeral)} €`
        : `Manutenção geral a máquina ${nome} – €`,
    );
    if (resolveEquipamentoIncluirDl50(row)) {
      const dl50Line =
        equipamentos.length > 1
          ? `Inspeção segundo o DL50/2005 (${nome}) – ${formatEuro(resolveEquipamentoValorInspecaoDl50(row))} €`
          : `Inspeção segundo o DL50/2005 – ${formatEuro(resolveEquipamentoValorInspecaoDl50(row))} €`;
      lines.push(dl50Line);
    }
  });
  const deslocacao = resolveValorDeslocacaoMaquina(meta);
  lines.push(
    deslocacao > 0 ? `Deslocação – ${formatEuro(deslocacao)} €` : 'Deslocação – €',
  );
  return lines;
}

export function applyManutencaoMaquinaTemplateMeta(meta = {}, report = null) {
  const synced = syncLegacyTemplateFieldsFromMaquinas(meta, 'maquina');
  const equipamentos = resolveTemplateEquipamentos(synced, synced, 'maquina');
  const first = equipamentos[0] || {};
  const valorDeslocacao = String(synced.valorDeslocacao || '').trim()
    ? formatEuro(resolveValorDeslocacaoMaquina(synced))
    : '';
  const linhas = buildManutencaoMaquinaLinhas(synced, synced);

  return {
    ...synced,
    tipoProposta: ORCAMENTO_TIPO_PROPOSTA.MANUTENCAO_MAQUINA,
    textoIntro: resolveManutencaoMaquinaIntro(synced, synced),
    observacoesCliente: '',
    taxasSaida: [],
    taxaSaida: '',
    prazoEntrega: String(synced.prazoEntrega || '').trim(),
    formaPagamento: String(synced.formaPagamento || '').trim() || ORCAMENTO_FORMA_PAGAMENTO_DEFAULT,
    validadeOrcamento: String(synced.validadeOrcamento || '').trim() || ORCAMENTO_VALIDADE_DEFAULT,
    valorDeslocacao,
    maquinaManutencaoNome:
      String(synced.maquinaManutencaoNome || '').trim() || formatTemplateMaquinaNome(first, 0),
    valorManutencaoGeral: first.valorManutencaoGeral || '',
    incluirInspecaoDl50: first.incluirInspecaoDl50 ?? false,
    valorInspecaoDl50: first.valorInspecaoDl50 || formatEuro(MANUTENCAO_MAQUINA_VALOR_INSPECAO_DL50_DEFAULT),
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
