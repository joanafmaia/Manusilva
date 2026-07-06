#!/usr/bin/env python3
"""Reconstrói app.css (entry point @import) a partir dos módulos em pwa/css/."""
from pathlib import Path

CSS_DIR = Path(__file__).resolve().parents[1] / "pwa" / "css"

APP_ENTRY = """\
/*
 * Manusilva PWA — ponto de entrada CSS.
 * Ordem de cascata preservada: base → tech → admin.
 */
@import url('base.css');
@import url('tech.css');
@import url('admin.css');
"""


def main() -> None:
    for name in ("base.css", "tech.css", "admin.css"):
        if not (CSS_DIR / name).exists():
            raise SystemExit(f"Falta {name} em pwa/css/")
    (CSS_DIR / "app.css").write_text(APP_ENTRY, encoding="utf-8")
    sizes = {n: (CSS_DIR / n).stat().st_size // 1024 for n in ("base.css", "tech.css", "admin.css")}
    print(f"app.css atualizado — base {sizes['base.css']}KB, tech {sizes['tech.css']}KB, admin {sizes['admin.css']}KB")


if __name__ == "__main__":
    main()
