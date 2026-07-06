#!/usr/bin/env python3
"""Gera ícones PWA com fundo clínico (#f7f6f3) a partir de pwa/js/logo_data.js."""

from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO_DATA = ROOT / "pwa" / "js" / "logo_data.js"
OUT_DIR = ROOT / "pwa" / "assets" / "icons"
BG = (247, 246, 243, 255)  # --bg-page / manifest background_color


def load_logo_png() -> Image.Image:
    text = LOGO_DATA.read_text(encoding="utf-8")
    match = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", text)
    if not match:
        raise SystemExit("logo_data.js não contém PNG Base64 válido.")
    raw = base64.b64decode(match.group(1))
    return Image.open(__import__("io").BytesIO(raw)).convert("RGBA")


def render_icon(logo: Image.Image, size: int, logo_scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    max_side = max(1, int(size * logo_scale))
    fitted = logo.copy()
    fitted.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas.convert("RGB")


def main() -> None:
    logo = load_logo_png()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    outputs = {
        "manusilva-icon.png": render_icon(logo, 512, 0.78),
        "icon-192.png": render_icon(logo, 192, 0.78),
        "icon-512.png": render_icon(logo, 512, 0.78),
        "icon-192-maskable.png": render_icon(logo, 192, 0.58),
        "icon-512-maskable.png": render_icon(logo, 512, 0.58),
        "favicon.png": render_icon(logo, 64, 0.82),
    }

    for name, image in outputs.items():
        path = OUT_DIR / name
        image.save(path, format="PNG", optimize=True)
        print(f"  {path.relative_to(ROOT)} ({image.size[0]}x{image.size[1]})")

    print(f"Ícones gerados em {OUT_DIR}.")


if __name__ == "__main__":
    main()
