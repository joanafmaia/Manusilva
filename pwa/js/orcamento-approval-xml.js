/**
 * Caixa de aprovação do cliente — MS.015 (Word OOXML).
 */

/** Tabela Word com borda — área para assinatura e carimbo do cliente. */
export function buildOrcamentoApprovalBoxXml() {
  const inner =
    '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    '<w:t>Aprovação</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:spacing w:before="80" w:after="120"/></w:pPr>' +
    '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
    '<w:t>Declaro que aceito o presente orçamento e valores apresentados</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:spacing w:before="320"/></w:pPr>' +
    '<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="64748B"/></w:rPr>' +
    '<w:t>Assinatura e carimbo do cliente</w:t></w:r></w:p>';

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="1E293B"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="1E293B"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="1E293B"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="1E293B"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="120" w:type="dxa"/>
        <w:left w:w="160" w:type="dxa"/>
        <w:bottom w:w="120" w:type="dxa"/>
        <w:right w:w="160" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>
        ${inner}
      </w:tc>
    </w:tr>
  </w:tbl>`;
}

export const ORCAMENTO_PAGE_BREAK_XML =
  '<w:p w14:paraId="MS015PB1" w14:textId="MS015PB1" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">' +
  '<w:r><w:br w:type="page"/></w:r></w:p>';
