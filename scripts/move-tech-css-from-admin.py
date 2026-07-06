#!/usr/bin/env python3
"""Move estilos do técnico de admin.css para tech.css (dashboard: base + tech)."""
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "pwa" / "css"


def find_line(lines: list[str], needle: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i + 1
    raise ValueError(f"Marcador não encontrado: {needle!r}")


def slice_lines(lines: list[str], start: int, end: int) -> str:
    return "".join(lines[start - 1 : end])


def remove_ranges(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    keep = [True] * len(lines)
    for start, end in sorted(ranges):
        for i in range(start - 1, min(end, len(lines))):
            keep[i] = False
    return [ln for i, ln in enumerate(lines) if keep[i]]


def main() -> None:
    admin_path = CSS / "admin.css"
    tech_path = CSS / "tech.css"
    admin_lines = admin_path.read_text(encoding="utf-8").splitlines(keepends=True)
    tech_text = tech_path.read_text(encoding="utf-8")

    if "Estilos movidos de admin.css" in tech_text:
        raise SystemExit("tech.css já contém bloco movido — restaura admin.css/tech.css do git antes de repetir.")

    rh_start = find_line(admin_lines, "/* RH — secção interna")
    rh_end = find_line(admin_lines, ".admin-panel .rh-register-form {") - 1

    typo_start = find_line(admin_lines, "/* ─── Tipografia Tailwind slate")
    clients_hub = find_line(admin_lines, "/* Clientes — hub, lista e histórico */")

    clients_start = clients_hub
    grandes = find_line(admin_lines, "/* Clientes Grandes")
    employee = find_line(admin_lines, "/* Employee Cards */")
    review = find_line(admin_lines, "/* Review Detail — modal RH")
    modal = find_line(admin_lines, "/* Modal */ .modal-overlay")
    admin_mobile = find_line(admin_lines, "/* Responsive — admin mobile")
    form_481 = find_line(admin_lines, "@media (min-width: 481px) {", admin_mobile - 1)
    ds_start = find_line(admin_lines, "/* ═══ Manusilva Design System — Unificação global UI ═══ */")
    rh_guia = find_line(admin_lines, "/* ═══ Painel RH / Administração — guia Tailwind slate ═══ */")
    tech_v2 = find_line(admin_lines, "/* ═══ Painel do técnico v2 ═══ */")
    fat_extra = find_line(admin_lines, "/* Faturação — filtros e destaque */")

    ranges = [
        (rh_start, rh_end),
        (typo_start, clients_start - 1),
        (clients_start, grandes - 1),
        (grandes, employee - 1),
        (modal, admin_mobile - 1),
        (form_481, rh_guia - 1),
        (tech_v2, fat_extra - 1),
    ]

    chunks: list[str] = []
    for start, end in ranges:
        if start > end:
            raise SystemExit(f"Intervalo inválido {start}-{end}")
        chunk = slice_lines(admin_lines, start, end)
        if not chunk.strip():
            raise SystemExit(f"Bloco vazio: {start}-{end}")
        chunks.append(chunk)

    header = (
        "\n\n/* ═══ Estilos movidos de admin.css — dashboard técnico (base + tech) ═══ */\n\n"
    )
    tech_path.write_text(tech_text.rstrip() + header + "\n\n".join(chunks), encoding="utf-8")
    admin_path.write_text("".join(remove_ranges(admin_lines, ranges)), encoding="utf-8")

    moved = sum(end - start + 1 for start, end in ranges)
    print(f"OK — {moved} linhas movidas; review RH mantido em admin.css (linha {review})")


if __name__ == "__main__":
    main()
