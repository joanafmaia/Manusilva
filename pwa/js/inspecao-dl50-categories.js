import {
  buildPdfAutoTableStyles,
  mergePdfTableDidParseCell,
  PDF_MACHINE_SECTION,
} from './pdf-design-system.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_HORAS,
  LABEL_ANO_FABRICO,
  formatAnoFabricoDisplay,
} from './field-labels.js';
import { pdfAutoTableFont, pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';

/** Pontos de inspeção DL 50/2005 — MS. 061 */
export const INSPECAO_DL50_CATEGORIES = [
  {
    name: 'Chassis',
    items: [
      'Aspeto geral da cabine e chassis',
      'Teto protetor',
      'Pilares do teto',
      'Golpes, roturas, soldaduras do chassis',
      'Plataforma',
      'Limpa Vidros',
      'Vidros',
      'Portas',
      'Lona',
    ],
  },
  {
    name: 'Mastro',
    items: [
      'Aspeto, oxidação das correntes',
      'Alongamento das correntes',
      'Grade de encosto de carga',
      'Aspeto do porta garfos',
      'Desgaste/deformação dos garfos',
      'Sistema de fixação dos garfos',
      'Fugas/desgaste em tubos',
      'Aspeto da soldadura dos garfos',
      'Válvula de segurança de descida',
      'Suporte do cilindro de inclinação',
      'Batentes',
      'Lubrificação e estado dos rolamentos',
      'Funcionamento mastro',
      'Outros acessórios',
    ],
  },
  {
    name: 'Motor',
    items: [
      'Escape e emissão de gases',
      'Fugas em tubos de combustível',
      'Depósito, fugas, danos, deformações',
      'Sistemas G.P.L',
      'Filtro de ar',
    ],
  },
  {
    name: 'Bateria',
    items: ['Aspeto geral', 'Limpeza', 'Densidade do eletrólito', 'Outros acessórios'],
  },
  {
    name: 'Direção',
    items: [
      'Operação do volante, folgas, dureza',
      'Reação das rodas',
      'Estado das correntes',
      'Estado dos tubos e cilindro',
      'Fugas',
      'Movimento, ajuste do eixo direcional',
      'Sistema de inversão',
    ],
  },
  {
    name: 'Sistema de travões',
    items: [
      'Movimento, ajuste pedal',
      'Fugas em tubos',
      'Desgaste em tubos',
      'Prestações',
      'Funcionamento travão de mão',
      'Ajuste travão de mão',
      'Nível do líquido travões',
      'Funcionamento luz de travão',
      'Funcionamento do travão neutro',
      'Funcionamento do travão de inversão',
      'Estado dos calços de travão',
    ],
  },
  {
    name: 'Rodas',
    items: ['Estado do piso das rodas', 'Estado das jantes', 'Aperto dos parafusos'],
  },
  {
    name: 'Sistemas de segurança',
    items: [
      'Funcionamento das luzes',
      'Pedal de homem morto',
      'Funcionamento da buzina',
      'Avisador de marcha atrás',
      'Arranque em ponto morto',
      'Movimento em marcha sem acelerar',
      'Interruptor do assento',
      'Paragem do motor com abertura do capot',
      'Interruptor emergência',
      'Cinto de segurança no assento',
      'Funcionamento das fechaduras',
      'Estado dos espelhos',
      'Funcionamento dos indicadores de painel',
      'Funcionamento do bluespot',
      'Funcionamento do pirilampo',
    ],
  },
  {
    name: 'Outros',
    items: [
      'Instalação elétrica',
      'Fugas no sistema hidráulico',
      'Certificação CE',
      'Documentação',
      'Placa de caraterística',
      'Diagrama de carga',
      'Registos de manutenção',
      'Autocolantes/Sinaléticas',
    ],
  },
];

export const INSPECAO_DL50_LEGAL_OPTIONS = [
  'Equipamento reúne as condições adequadas de segurança (Colocar etiqueta)',
  'Conveniente realizar as reparações especificadas nas observações',
  'O empilhador NÃO deve ser utilizado até se efetuarem as reparações',
];

/** Coluna esquerda da matriz DL50 (ordem fixa no formulário e PDF) */
export const DL50_MATRIX_LEFT_NAMES = [
  'Chassis',
  'Motor',
  'Direção',
  'Rodas',
  'Sistemas de segurança',
];

/** Coluna direita da matriz DL50 */
export const DL50_MATRIX_RIGHT_NAMES = ['Mastro', 'Bateria', 'Sistema de travões', 'Outros'];

function findDl50Category(categories, name) {
  const target = String(name).toLowerCase();
  return (categories || []).find((cat) => String(cat?.name || '').toLowerCase() === target) || null;
}

/** Divide categorias DL50 em duas colunas com distribuição manual fixa */
export function splitDl50MatrixCategories(categories) {
  const left = DL50_MATRIX_LEFT_NAMES.map((name) => findDl50Category(categories, name)).filter(Boolean);
  const right = DL50_MATRIX_RIGHT_NAMES.map((name) => findDl50Category(categories, name)).filter(Boolean);
  return [left, right];
}

/* ─── PDF: cabeçalho (Informações da Máquina → Periodicidade) ─── */

/** Alturas (mm) — estrutura Y do cabeçalho no PDF */
const INSPECAO_DL50_PDF_Y = {
  AFTER_CONCLUSAO: 3,
  SECTION_TITLE: 6,
  DIVIDER: 7,
  AFTER_MACHINE_BLOCK: 5,
  PERIODICITY_BLOCK: 12,
};

/** Campos da grelha «Informações da Máquina» no PDF DL50 */
export const INSPECAO_DL50_MACHINE_FIELD_IDS = new Set([
  'marca',
  'modelo',
  'tipo',
  'numero_de_serie',
  'n_interno',
  'horas',
  'data_fabrico',
]);

/** Campos desenhados no bloco dedicado (o loop genérico do PDF ignora-os) */
export const INSPECAO_DL50_PDF_SKIP_FIELD_IDS = new Set([
  'data_de_conclusao',
  ...INSPECAO_DL50_MACHINE_FIELD_IDS,
  'periodicidade_inspecao',
  'declaracao_seguranca',
]);

function pickFirstNonEmpty(...candidates) {
  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text && text !== 'null' && text !== 'undefined') return text;
  }
  return '';
}

function pickFromPools(pools, key, altKeys = []) {
  for (const pool of pools) {
    if (!pool || typeof pool !== 'object') continue;
    const hit = pickFirstNonEmpty(
      pool[key],
      ...altKeys.map((alt) => pool[alt]),
    );
    if (hit) return hit;
  }
  return '';
}

function formatDl50PdfDate(raw) {
  const text = pickFirstNonEmpty(raw);
  if (!text) return '—';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return text;
}

function machinePdfCell(label, value) {
  const text = pdfSafeText(value) || '—';
  return `${label}: ${text}`;
}

/**
 * Resolve marca/modelo/série/data — mesmas fontes que o ecrã de revisão.
 * @param {Record<string, unknown>} values
 * @param {{ forkliftSerial?: string, report?: object, data?: object }} [ctx]
 */
export function resolveInspecaoDl50MachineFields(values = {}, ctx = {}) {
  const report = ctx.report || {};
  const data = ctx.data || report.data || {};
  const storedValues =
    data.values && typeof data.values === 'object' ? data.values : {};

  const nestedPools = [
    values.maquina,
    values.machine,
    values.informacoes_maquina,
    storedValues.maquina,
    storedValues.machine,
    data.maquina,
    data.machine,
    report.maquina,
    report.machine,
  ].filter((pool) => pool && typeof pool === 'object');

  const flatPools = [values, storedValues, data, report];

  const marca = pickFromPools(flatPools, 'marca', ['Marca']) ||
    pickFromPools(nestedPools, 'marca', ['Marca']) ||
    '—';

  const modelo = pickFromPools(flatPools, 'modelo', ['Modelo']) ||
    pickFromPools(nestedPools, 'modelo', ['Modelo']) ||
    '—';

  const tipo = pickFromPools(flatPools, 'tipo', ['Tipo']) ||
    pickFromPools(nestedPools, 'tipo', ['Tipo']) ||
    '—';

  const numeroSerie =
    pickFromPools(flatPools, 'numero_de_serie', [
      'num_serie',
      'numero_serie',
      'n_serie',
      'nº_serie',
      'serie',
    ]) ||
    pickFromPools(nestedPools, 'numero_de_serie', [
      'num_serie',
      'numero_serie',
      'n_serie',
      'nº_serie',
      'serie',
    ]) ||
    ctx.forkliftSerial ||
    '—';

  const dataFabrico = formatDl50PdfDate(
    pickFromPools(flatPools, 'data_fabrico', ['data_de_fabrico', 'data_fabricacao']) ||
      pickFromPools(nestedPools, 'data_fabrico', ['data_de_fabrico', 'data_fabricacao']),
  );

  const nInterno =
    pickFromPools(flatPools, 'n_interno', ['num_interno', 'numero_interno']) ||
    pickFromPools(nestedPools, 'n_interno', ['num_interno', 'numero_interno']) ||
    '—';

  const horasRaw =
    pickFromPools(flatPools, 'horas', ['horas_gastas', 'numero_horas']) ||
    pickFromPools(nestedPools, 'horas', ['horas_gastas', 'numero_horas']);
  const horas =
    horasRaw !== '' && horasRaw != null && String(horasRaw).trim() !== '' ? String(horasRaw).trim() : '—';

  return {
    marca,
    modelo,
    tipo,
    numero_de_serie: numeroSerie,
    n_interno: nInterno,
    horas,
    data_fabrico: dataFabrico,
  };
}

/** Corpo da tabela autoTable — 2 colunas */
export function buildInspecaoDl50MachineTableBody(machine) {
  return [
    [machinePdfCell(LABEL_MARCA, machine.marca), machinePdfCell(LABEL_MODELO, machine.modelo)],
    [machinePdfCell(LABEL_TIPO, machine.tipo), machinePdfCell(LABEL_NUMERO_SERIE, machine.numero_de_serie)],
    [
      machinePdfCell(LABEL_N_INTERNO, machine.n_interno),
      machinePdfCell(LABEL_HORAS, machine.horas),
    ],
    [machinePdfCell(LABEL_ANO_FABRICO, formatAnoFabricoDisplay(machine.data_fabrico)), ''],
  ];
}

/**
 * Bloco específico DL 50/2005 — periodicidade integrada no subcabeçalho global.
 */
export async function drawInspecaoDl50HeaderBlock(doc, y, values, helpers) {
  void doc;
  void values;
  void helpers;
  return y;
}
