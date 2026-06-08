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

/* ─── PDF: cabeçalho (Informações da Máquina → Periodicidade) ─── */

const PDF_TEXT_DARK = [30, 41, 59];

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
  'numero_de_serie',
  'data_fabrico',
]);

/** Campos desenhados no bloco dedicado (o loop genérico do PDF ignora-os) */
export const INSPECAO_DL50_PDF_SKIP_FIELD_IDS = new Set([
  'data_de_conclusao',
  ...INSPECAO_DL50_MACHINE_FIELD_IDS,
  'periodicidade_inspecao',
  'declaracao_seguranca',
]);

const MACHINE_TABLE_LINE = [226, 232, 240];
const MACHINE_TABLE_FILL = [248, 250, 252];

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

  return { marca, modelo, numero_de_serie: numeroSerie, data_fabrico: dataFabrico };
}

/** Corpo da tabela autoTable — 2 colunas × 2 linhas */
export function buildInspecaoDl50MachineTableBody(machine) {
  return [
    [machinePdfCell('Marca', machine.marca), machinePdfCell('Modelo', machine.modelo)],
    [
      machinePdfCell('N.º Série', machine.numero_de_serie),
      machinePdfCell('Data Fabrico', machine.data_fabrico),
    ],
  ];
}

/**
 * Cabeçalho PDF DL 50/2005 — ordem fixa antes da matriz de pontos.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} y
 * @param {Record<string, unknown>} values
 * @param {{ ensureSpace: Function, drawSectionTitle: Function, drawDivider: Function, drawKeyValueLine: Function, loadAutoTable: Function, margin: number, contentW: number, pdfContext?: object }} helpers
 */
export async function drawInspecaoDl50HeaderBlock(doc, y, values, helpers) {
  const {
    ensureSpace,
    drawSectionTitle,
    drawDivider,
    drawKeyValueLine,
    loadAutoTable,
    margin,
    contentW,
    pdfContext = {},
  } = helpers;
  const Y = INSPECAO_DL50_PDF_Y;
  const machine = resolveInspecaoDl50MachineFields(values, pdfContext);

  const machineBlockH = Y.SECTION_TITLE + Y.DIVIDER + 16 + Y.AFTER_MACHINE_BLOCK;
  const headerBlockH =
    (values.data_de_conclusao && String(values.data_de_conclusao).trim() ? 10 + Y.AFTER_CONCLUSAO : 0) +
    machineBlockH +
    Y.PERIODICITY_BLOCK;

  y = ensureSpace(doc, y, headerBlockH);

  if (values.data_de_conclusao && String(values.data_de_conclusao).trim()) {
    y = drawKeyValueLine(doc, y, 'Data de Conclusão', values.data_de_conclusao, 'date');
    y += Y.AFTER_CONCLUSAO;
  }

  y = drawSectionTitle(doc, y, 'Informações da Máquina', { skipEnsure: true });
  y = drawDivider(doc, y - 4);

  await loadAutoTable();
  pdfSetFont(doc, 'normal');
  const colW = contentW / 2;
  const machineBody = buildInspecaoDl50MachineTableBody(machine);
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin, bottom: 30 },
    tableWidth: contentW,
    body: machineBody,
    theme: 'plain',
    styles: {
      font: pdfAutoTableFont(doc),
      fontSize: 8.5,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: MACHINE_TABLE_LINE,
      lineWidth: 0.12,
      textColor: PDF_TEXT_DARK,
      fontStyle: 'normal',
      valign: 'middle',
      overflow: 'ellipsize',
    },
    bodyStyles: {
      fillColor: MACHINE_TABLE_FILL,
    },
    columnStyles: {
      0: { cellWidth: colW },
      1: { cellWidth: colW },
    },
  });

  y = doc.lastAutoTable.finalY + Y.AFTER_MACHINE_BLOCK;

  if (values.periodicidade_inspecao && String(values.periodicidade_inspecao).trim()) {
    y = drawKeyValueLine(doc, y, 'Periodicidade Inspeção', values.periodicidade_inspecao, 'status_pills');
  }

  return y;
}
