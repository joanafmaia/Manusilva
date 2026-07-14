/**
 * Geração de tabela Word (OOXML) para linhas de orçamento MS.015.
 */

import { escapeXmlText } from './orcamento-fill-data.js';
import { normalizeEquipamentoCampos } from './orcamento-equipamento-campos.js';
import {
  formatEuro,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';
import {
  formatOrcamentoMaquinaPdfTableLabel,
  groupOrcamentoLinhasByEquipamento,
  shouldGroupOrcamentoLinhasByEquipamento,
} from './orcamento-maquinas.js';

const COL_WIDTHS_SINGLE = [5200, 900, 1700, 1700];
const COL_WIDTHS_MULTI = [1400, 3800, 900, 1700, 1700];
const COL_SPAN_SINGLE = COL_WIDTHS_SINGLE.length;

function cellWithWidth(text, width, opts = {}) {
  const jc =
    opts.align === 'right'
      ? '<w:jc w:val="right"/>'
      : opts.align === 'center'
        ? '<w:jc w:val="center"/>'
        : '';
  const bold = opts.bold ? '<w:b/>' : '';
  const gridSpan = opts.colSpan > 1 ? `<w:gridSpan w:val="${opts.colSpan}"/>` : '';
  const fill = opts.fill
    ? '<w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/>'
    : opts.headerFill
      ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>'
      : '';
  return `<w:tc>
    <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}${jc}${fill}</w:tcPr>
    <w:p><w:r><w:rPr>${bold}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>
  </w:tc>`;
}

function rowXml(cells) {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function mergedCell(text, totalWidth, colSpan, opts = {}) {
  return cellWithWidth(text, totalWidth, { ...opts, colSpan });
}

function dataRowCells(row, colWidths, { multi = false, machineCount = 1 } = {}) {
  if (multi) {
    return [
      cellWithWidth(
        formatOrcamentoMaquinaPdfTableLabel(
          normalizeEquipamentoIndex(row.equipamentoIndex, machineCount),
        ),
        colWidths[0],
      ),
      cellWithWidth(row.descricao || '—', colWidths[1]),
      cellWithWidth(row.qtd || '1', colWidths[2], { align: 'center' }),
      cellWithWidth(
        row.precoUnit ? formatEuro(row.precoUnit, { blankIfZero: true }) : '',
        colWidths[3],
        { align: 'right' },
      ),
      cellWithWidth(row.total || '', colWidths[4], { align: 'right' }),
    ];
  }
  return [
    cellWithWidth(row.descricao || '—', colWidths[0]),
    cellWithWidth(row.qtd || '1', colWidths[1], { align: 'center' }),
    cellWithWidth(
      row.precoUnit ? formatEuro(row.precoUnit, { blankIfZero: true }) : '',
      colWidths[2],
      { align: 'right' },
    ),
    cellWithWidth(row.total || '', colWidths[3], { align: 'right' }),
  ];
}

function columnHeaderRow(colWidths, { multi = false } = {}) {
  const cells = multi
    ? [
        cellWithWidth('Equipamento', colWidths[0], { bold: true, headerFill: true }),
        cellWithWidth('Na reparação precisa', colWidths[1], { bold: true, headerFill: true }),
        cellWithWidth('Qtd.', colWidths[2], { bold: true, align: 'center', headerFill: true }),
        cellWithWidth('Preço Unit. (€)', colWidths[3], { bold: true, align: 'right', headerFill: true }),
        cellWithWidth('Total (€)', colWidths[4], { bold: true, align: 'right', headerFill: true }),
      ]
    : [
        cellWithWidth('Na reparação precisa', colWidths[0], { bold: true, headerFill: true }),
        cellWithWidth('Qtd.', colWidths[1], { bold: true, align: 'center', headerFill: true }),
        cellWithWidth('Preço Unit. (€)', colWidths[2], { bold: true, align: 'right', headerFill: true }),
        cellWithWidth('Total (€)', colWidths[3], { bold: true, align: 'right', headerFill: true }),
      ];
  return rowXml(cells);
}

function groupedTableBody(groups, colWidths) {
  const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
  return groups
    .map((group) => {
      const machineHeader = rowXml([
        mergedCell(group.label, totalWidth, COL_SPAN_SINGLE, { bold: true, fill: true }),
      ]);
      const subHeader = columnHeaderRow(colWidths);
      const lines = group.linhas
        .map((row) => rowXml(dataRowCells(row, colWidths)))
        .join('');
      return machineHeader + subHeader + lines;
    })
    .join('');
}

/**
 * @param {Array<{ descricao?: string, qtd?: string, precoUnit?: string, total?: string, equipamentoIndex?: number }>} linhas
 * @param {{ maquinas?: Array<object>, equipamentoCampos?: Array<object> }} [options]
 */
export function buildOrcamentoWordTableXml(linhas, { maquinas = [], equipamentoCampos = null } = {}) {
  const campos = normalizeEquipamentoCampos(equipamentoCampos);
  const grouped = shouldGroupOrcamentoLinhasByEquipamento(maquinas, campos);
  const multi = !grouped && Array.isArray(maquinas) && maquinas.length > 1;
  const COL_WIDTHS = multi ? COL_WIDTHS_MULTI : COL_WIDTHS_SINGLE;
  const machineCount = Math.max(maquinas.length || 0, 1);

  if (grouped) {
    const groups = groupOrcamentoLinhasByEquipamento(linhas, maquinas, campos);
    const body = groupedTableBody(groups, COL_WIDTHS);
    const gridCols = COL_WIDTHS.map((w) => `<w:gridCol w:w="${w}"/>`).join('');

    return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      ${gridCols}
    </w:tblGrid>
    ${body}
  </w:tbl>`;
  }

  const rows = normalizeOrcamentoLinhas(linhas, { machineCount }).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  const dataRows = rows.length ? rows : [{ descricao: '—', qtd: '1', precoUnit: '', total: '' }];
  const header = columnHeaderRow(COL_WIDTHS, { multi });
  const body = dataRows
    .map((row) => rowXml(dataRowCells(row, COL_WIDTHS, { multi, machineCount })))
    .join('');

  const gridCols = COL_WIDTHS.map((w) => `<w:gridCol w:w="${w}"/>`).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      ${gridCols}
    </w:tblGrid>
    ${header}
    ${body}
  </w:tbl>`;
}
