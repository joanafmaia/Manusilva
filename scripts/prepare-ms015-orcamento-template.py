#!/usr/bin/env python3
"""Gera MS.015-orcamento-template.docx com placeholders {campo} a partir do MS.015 oficial."""

from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "pwa" / "assets" / "templates" / "MS.015-proposta-comercial-orcamentos.docx"
DST = ROOT / "pwa" / "assets" / "templates" / "MS.015-orcamento-template.docx"


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"Marcador não encontrado no template: {old!r}")
    return text.replace(old, new, 1)


def remove_second_machine_block(xml: str) -> str:
    marker = '<w:t xml:space="preserve">Máquina – </w:t>'
    first = xml.find(marker)
    if first < 0:
        marker = "<w:t>Máquina – </w:t>"
        first = xml.find(marker)
    second = xml.find(marker, first + 1)
    if second < 0:
        return xml
    p_start = xml.rfind("<w:p ", 0, second)
    precisa = xml.find("Na reparação precisa:", second)
    if precisa < 0:
        precisa = xml.find("Na repara\u00e7\u00e3o precisa:", second)
    p_end = xml.find("</w:p>", precisa)
    if p_start < 0 or p_end < 0:
        return xml
    return xml[:p_start] + xml[p_end + len("</w:p>") :]


def replace_paragraph_containing(xml: str, needle: str, replacement: str) -> str:
    for match in re.finditer(r"<w:p\b[^>]*>.*?</w:p>", xml, re.DOTALL):
        block = match.group(0)
        if needle in block:
            return xml[: match.start()] + replacement + xml[match.end() :]
    raise SystemExit(f"Parágrafo com {needle!r} não encontrado.")


def paragraph_start_before(xml: str, idx: int) -> int:
    pos = 0
    last = 0
    for match in re.finditer(r"<w:p\b", xml):
        if match.start() > idx:
            return last
        last = match.start()
    return last


def insert_orcamento_table_marker(xml: str) -> str:
    idx = xml.find("Taxa de Sa")
    if idx < 0:
        raise SystemExit("Taxa de Saída não encontrada no modelo.")
    p_start = paragraph_start_before(xml, idx)
    marker = (
        '<w:p w14:paraId="MS015TBL0" w14:textId="MS015TBL0" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr>'
        '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
        "<w:t>[[TABELA_ORCAMENTO]]</w:t></w:r></w:p>"
    )
    return xml[:p_start] + marker + xml[p_start:]


def patch_taxa_prazo_totais(xml: str) -> str:
    taxa_para = (
        '<w:p w14:paraId="MS015TX1" w14:textId="MS015TX1" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
        "<w:t xml:space=\"preserve\">Taxa de Sa\u00edda \u2013 {taxa_saida} \u20ac</w:t></w:r></w:p>"
    )
    xml = replace_paragraph_containing(xml, "Taxa de Sa", taxa_para)

    prazo_para = (
        '<w:p w14:paraId="MS015PZ1" w14:textId="MS015PZ1" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        '<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/><w:u w:val="single"/></w:rPr>'
        "<w:t xml:space=\"preserve\">Prazo de Entrega: {prazo_entrega}</w:t></w:r></w:p>"
    )
    xml = replace_paragraph_containing(xml, "Prazo de Entrega", prazo_para)

    totais_para = (
        '<w:p w14:paraId="MS015TT1" w14:textId="MS015TT1" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        "<w:t xml:space=\"preserve\">Subtotal (s/ IVA): {subtotal} \u20ac</w:t></w:r></w:p>"
        '<w:p w14:paraId="MS015TT2" w14:textId="MS015TT2" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        "<w:t xml:space=\"preserve\">IVA (23%): {iva} \u20ac</w:t></w:r></w:p>"
        '<w:p w14:paraId="MS015TT3" w14:textId="MS015TT3" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="60"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        "<w:t xml:space=\"preserve\">Total: {total_geral} \u20ac</w:t></w:r></w:p>"
    )
    needle = "A estes valores acresce"
    idx = xml.find(needle)
    if idx < 0:
        raise SystemExit("Linha de IVA não encontrada no modelo.")
    p_start = paragraph_start_before(xml, idx)
    return xml[:p_start] + totais_para + xml[p_start:]


def rebuild_orcamento_header(xml: str) -> str:
    """Substitui número/data de exemplo por placeholders num único bloco."""
    start = xml.find("<w:t>Or")
    if start < 0:
        start = xml.find("<w:t>Or\u00e7")
    if start < 0:
        raise SystemExit("Cabeçalho Orçamento não encontrado.")
    p_start = xml.rfind("<w:p ", 0, start)
    # fim do parágrafo da data (contém 2026)
    date_idx = xml.find("> 2026</w:t>", start)
    if date_idx < 0:
        date_idx = xml.find(">2026</w:t>", start)
    if date_idx < 0:
        raise SystemExit("Data de exemplo não encontrada.")
    p_end = xml.find("</w:p>", date_idx)
    replacement = (
        '<w:p w14:paraId="MS015ORC1" w14:textId="MS015ORC1" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
        "<w:t>Or\u00e7amento n\u00ba {orcamento_numero}</w:t></w:r></w:p>"
        '<w:p w14:paraId="MS015ORC2" w14:textId="MS015ORC2" w:rsidR="00MS0150" w:rsidRDefault="00MS0150">'
        '<w:pPr><w:spacing w:after="0"/></w:pPr>'
        "<w:r><w:rPr><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr>"
        "<w:t>{data_extenso}</w:t></w:r></w:p>"
    )
    return xml[:p_start] + replacement + xml[p_end + len("</w:p>") :]


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Ficheiro fonte em falta: {SRC}")

    shutil.copy2(SRC, DST)

    with zipfile.ZipFile(DST, "r") as zin:
        xml = zin.read("word/document.xml").decode("utf-8")
        xml = replace_once(xml, "VISTA ALEGRE", "{cliente_nome}")
        xml = replace_once(xml, "\u00ba CARLOS LU\u00cdS", "{cliente_ac}")
        xml = rebuild_orcamento_header(xml)
        xml = replace_once(
            xml,
            "a repara\u00e7\u00e3o das seguintes baterias:",
            "{intro_servico}",
        )
        xml = replace_once(
            xml,
            '<w:t xml:space="preserve">M\u00e1quina \u2013 </w:t>',
            '<w:t xml:space="preserve">M\u00e1quina \u2013 {maquina}</w:t>',
        )
        xml = replace_once(
            xml,
            '<w:t xml:space="preserve">Matr\u00edcula: </w:t>',
            '<w:t xml:space="preserve">Matr\u00edcula: {matricula}</w:t>',
        )
        needle = "Na repara\u00e7\u00e3o precisa:</w:t></w:r></w:p>"
        insert = (
            needle
            + '<w:p><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
            '<w:t xml:space="preserve">{reparacao_necessaria}</w:t></w:r></w:p>'
        )
        xml = xml.replace(needle, insert, 1)
        xml = remove_second_machine_block(xml)
        xml = insert_orcamento_table_marker(xml)
        xml = patch_taxa_prazo_totais(xml)

        out_buf = xml.encode("utf-8")
        entries = {name: zin.read(name) for name in zin.namelist()}

    entries["word/document.xml"] = out_buf
    with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in entries.items():
            zout.writestr(name, data)

    print(f"Template gerado: {DST}")


if __name__ == "__main__":
    main()
