import { pdfSetFont, pdfSafeText, pdfSplitText } from './pdf-font.js';

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

const PDF_MARGIN = 14;
const PDF_CONTENT_W = 210 - PDF_MARGIN * 2;
const PDF_TEXT_DARK = [30, 41, 59];
const PDF_TEXT_MUTED = [100, 116, 139];

/** Alturas (mm) — estrutura Y do cabeçalho no PDF */
const INSPECAO_DL50_PDF_Y = {
  ROW_H: 11,
  AFTER_CONCLUSAO: 3,
  SECTION_TITLE: 6,
  DIVIDER: 7,
  AFTER_MACHINE_BLOCK: 5,
  PERIODICITY_BLOCK: 12,
};

/** Campos desenhados no bloco dedicado (o loop genérico do PDF ignora-os) */
export const INSPECAO_DL50_PDF_SKIP_FIELD_IDS = new Set([
  'data_de_conclusao',
  'marca',
  'modelo',
  'numero_de_serie',
  'data_fabrico',
  'periodicidade_inspecao',
  'declaracao_seguranca',
]);

function drawPdfLabelValueCell(doc, x, y, colW, label, value) {
  pdfSetFont(doc, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_TEXT_MUTED);
  doc.text(String(label).toUpperCase(), x, y);

  pdfSetFont(doc, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_TEXT_DARK);
  const text = pdfSafeText(value) || '—';
  const lines = pdfSplitText(doc, text, colW - 2);
  doc.text(lines, x, y + 3.8, { lineHeightFactor: 1.25 });
}

/**
 * Cabeçalho PDF DL 50/2005 — ordem fixa antes da matriz de pontos.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} y
 * @param {Record<string, unknown>} values
 * @param {{ ensureSpace: Function, drawSectionTitle: Function, drawDivider: Function, drawKeyValueLine: Function }} helpers
 */
export function drawInspecaoDl50HeaderBlock(doc, y, values, helpers) {
  const { ensureSpace, drawSectionTitle, drawDivider, drawKeyValueLine } = helpers;
  const Y = INSPECAO_DL50_PDF_Y;

  const machineBlockH = Y.SECTION_TITLE + Y.DIVIDER + Y.ROW_H * 2 + Y.AFTER_MACHINE_BLOCK;
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

  const colW = (PDF_CONTENT_W - 8) / 2;
  const row1Y = y;
  const row2Y = y + Y.ROW_H;

  drawPdfLabelValueCell(doc, PDF_MARGIN, row1Y, colW, 'Marca', values.marca);
  drawPdfLabelValueCell(doc, PDF_MARGIN + colW + 8, row1Y, colW, 'Modelo', values.modelo);
  drawPdfLabelValueCell(doc, PDF_MARGIN, row2Y, colW, 'N.º Série', values.numero_de_serie);
  drawPdfLabelValueCell(doc, PDF_MARGIN + colW + 8, row2Y, colW, 'Data Fabrico', values.data_fabrico);

  y = row2Y + Y.ROW_H + Y.AFTER_MACHINE_BLOCK;

  if (values.periodicidade_inspecao && String(values.periodicidade_inspecao).trim()) {
    y = drawKeyValueLine(doc, y, 'Periodicidade Inspeção', values.periodicidade_inspecao, 'status_pills');
  }

  return y;
}
