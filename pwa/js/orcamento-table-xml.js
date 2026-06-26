/**
 * Geração de tabela Word (OOXML) para linhas de orçamento MS.015.
 */

import { escapeXmlText } from './orcamento-fill-data.js';
import { formatEuro, normalizeOrcamentoLinhas } from './orcamento-linhas.js';

const COL_WIDTHS = [5200, 900, 1700, 1700];

function cellXml(text, { bold = false, align = 'left' } = {}) {
  const jc =
    align === 'right'
      ? '<w:jc w:val="right"/>'
      : align === 'center'
        ? '<w:jc w:val="center"/>'
        : '';
  const rPr = bold ? '<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' : '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
  return `<w:tc>
    <w:tcPr><w:tcW w:w="${COL_WIDTHS[0]}" w:type="dxa"/>${jc}</w:tcPr>
    <w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>
  </w:tc>`.replace(`w:w="${COL_WIDTHS[0]}"`, (m, i) => {
    void i;
    return m;
  });
}

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
 * @param {Array<{ descricao?: string, qtd?: string, precoUnit?: string, total?: string }>} linhas
 */
export function buildOrcamentoWordTableXml(linhas) {
  const rows = normalizeOrcamentoLinhas(linhas).filter(
    (r) => r.descricao || r.precoUnit || r.qtd !== '1',
  );
  const dataRows = rows.length ? rows : [{ descricao: '—', qtd: '1', precoUnit: '', total: '' }];

  const header = rowXml([
    cellWithWidth('Descrição / Artigo', COL_WIDTHS[0], { bold: true }),
    cellWithWidth('Qtd.', COL_WIDTHS[1], { bold: true, align: 'center' }),
    cellWithWidth('Preço Unit. (€)', COL_WIDTHS[2], { bold: true, align: 'right' }),
    cellWithWidth('Total (€)', COL_WIDTHS[3], { bold: true, align: 'right' }),
  ]);

  const body = dataRows
    .map((row) =>
      rowXml([
        cellWithWidth(row.descricao || '—', COL_WIDTHS[0]),
        cellWithWidth(row.qtd || '1', COL_WIDTHS[1], { align: 'center' }),
        cellWithWidth(
          row.precoUnit ? formatEuro(row.precoUnit, { blankIfZero: true }) : '',
          COL_WIDTHS[2],
          { align: 'right' },
        ),
        cellWithWidth(row.total || '', COL_WIDTHS[3], { align: 'right' }),
      ]),
    )
    .join('');

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
      <w:gridCol w:w="${COL_WIDTHS[0]}"/>
      <w:gridCol w:w="${COL_WIDTHS[1]}"/>
      <w:gridCol w:w="${COL_WIDTHS[2]}"/>
      <w:gridCol w:w="${COL_WIDTHS[3]}"/>
    </w:tblGrid>
    ${header}
    ${body}
  </w:tbl>`;
}
