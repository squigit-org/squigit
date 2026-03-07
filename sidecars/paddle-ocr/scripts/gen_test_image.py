#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def _pick_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate OCR smoke image.")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument(
        "--text",
        default="SQUIGIT MACOS OCR SMOKE",
        help="Main text rendered into the image",
    )
    args = parser.parse_args()

    out_path = Path(args.output).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    width, height = 1600, 420
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    title_font = _pick_font(72)
    subtitle_font = _pick_font(46)

    draw.text((80, 90), args.text, fill="black", font=title_font)
    draw.text(
        (80, 210),
        "CLI VALIDATION PATH",
        fill="black",
        font=subtitle_font,
    )

    image.save(out_path, format="PNG")
    print(f"Generated image: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
