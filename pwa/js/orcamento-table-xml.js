/**
 * Geração de tabela Word (OOXML) para linhas de orçamento MS.015.
 */

import { escapeXmlText } from './orcamento-fill-data.js';
import {
  formatEuro,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
} from './orcamento-linhas.js';
import { formatOrcamentoMaquinaPdfTableLabel } from './orcamento-maquinas.js';

const COL_WIDTHS_SINGLE = [5200, 900, 1700, 1700];
const COL_WIDTHS_MULTI = [1400, 3800, 900, 1700, 1700];

function cellWithWidth(text, width, opts = {}) {
  const jc =
    opts.align === 'right'
      ? '<w:jc w:val="right"/>'
      : opts.align === 'center'
        ? '<w:jc w:val="center"/>'
        : '';
  const bold = opts.bold ? '<w:b/>' : '';
  return `<w:tc>
    <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${jc}</w:tcPr>
    <w:p><w:r><w:rPr>${bold}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>
  </w:tc>`;
}

function rowXml(cells) {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

/**
 * @param {Array<{ descricao?: string, qtd?: string, precoUnit?: string, total?: string, equipamentoIndex?: number }>} linhas
 * @param {{ maquinas?: Array<object> }} [options]
 */
export function buildOrcamentoWordTableXml(linhas, { maquinas = [] } = {}) {
  const multi = Array.isArray(maquinas) && maquinas.length > 1;
  const COL_WIDTHS = multi ? COL_WIDTHS_MULTI : COL_WIDTHS_SINGLE;
  const rows = normalizeOrcamentoLinhas(linhas, { machineCount: maquinas.length || 1 }).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  const dataRows = rows.length ? rows : [{ descricao: '—', qtd: '1', precoUnit: '', total: '' }];

  const headerCells = multi
    ? [
        cellWithWidth('Equipamento', COL_WIDTHS[0], { bold: true }),
        cellWithWidth('Na reparação precisa', COL_WIDTHS[1], { bold: true }),
        cellWithWidth('Qtd.', COL_WIDTHS[2], { bold: true, align: 'center' }),
        cellWithWidth('Preço Unit. (€)', COL_WIDTHS[3], { bold: true, align: 'right' }),
        cellWithWidth('Total (€)', COL_WIDTHS[4], { bold: true, align: 'right' }),
      ]
    : [
        cellWithWidth('Na reparação precisa', COL_WIDTHS[0], { bold: true }),
        cellWithWidth('Qtd.', COL_WIDTHS[1], { bold: true, align: 'center' }),
        cellWithWidth('Preço Unit. (€)', COL_WIDTHS[2], { bold: true, align: 'right' }),
        cellWithWidth('Total (€)', COL_WIDTHS[3], { bold: true, align: 'right' }),
      ];
  const header = rowXml(headerCells);

  const body = dataRows
    .map((row) => {
      const cells = multi
        ? [
            cellWithWidth(
              formatOrcamentoMaquinaPdfTableLabel(
                normalizeEquipamentoIndex(row.equipamentoIndex, maquinas.length),
              ),
              COL_WIDTHS[0],
            ),
            cellWithWidth(row.descricao || '—', COL_WIDTHS[1]),
            cellWithWidth(row.qtd || '1', COL_WIDTHS[2], { align: 'center' }),
            cellWithWidth(
              row.precoUnit ? formatEuro(row.precoUnit, { blankIfZero: true }) : '',
              COL_WIDTHS[3],
              { align: 'right' },
            ),
            cellWithWidth(row.total || '', COL_WIDTHS[4], { align: 'right' }),
          ]
        : [
            cellWithWidth(row.descricao || '—', COL_WIDTHS[0]),
            cellWithWidth(row.qtd || '1', COL_WIDTHS[1], { align: 'center' }),
            cellWithWidth(
              row.precoUnit ? formatEuro(row.precoUnit, { blankIfZero: true }) : '',
              COL_WIDTHS[2],
              { align: 'right' },
            ),
            cellWithWidth(row.total || '', COL_WIDTHS[3], { align: 'right' }),
          ];
      return rowXml(cells);
    })
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
