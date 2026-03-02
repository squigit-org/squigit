#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import argparse
import json
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Iterable


def iter_files(path: Path) -> Iterable[Path]:
    if path.is_file():
        yield path
        return

    for file_path in sorted(path.rglob("*")):
        if file_path.is_file():
            yield file_path


def calc_raw_bytes(path: Path) -> tuple[int, int]:
    files = list(iter_files(path))
    return sum(p.stat().st_size for p in files), len(files)


def add_zip_entry(zf: zipfile.ZipFile, src: Path, arcname: str) -> None:
    data = src.read_bytes()
    info = zipfile.ZipInfo(arcname)
    # Stable metadata for deterministic output size.
    info.date_time = (1980, 1, 1, 0, 0, 0)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def calc_compressed_bytes(path: Path) -> int:
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        zip_path = Path(tmp.name)

    try:
        with zipfile.ZipFile(zip_path, mode="w") as zf:
            if path.is_file():
                add_zip_entry(zf, path, path.name)
            else:
                root = path.resolve()
                for file_path in iter_files(path):
                    arcname = file_path.resolve().relative_to(root).as_posix()
                    add_zip_entry(zf, file_path, arcname)
        return zip_path.stat().st_size
    finally:
        try:
            os.unlink(zip_path)
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Measure raw and compressed OCR runtime payload size."
    )
    parser.add_argument("--input", required=True, help="Input file or directory path")
    parser.add_argument("--output", help="Optional output JSON path")
    parser.add_argument("--label", default="", help="Optional metric label")
    args = parser.parse_args()

    in_path = Path(args.input).resolve()
    if not in_path.exists():
        raise SystemExit(f"Input path does not exist: {in_path}")

    raw_bytes, file_count = calc_raw_bytes(in_path)
    compressed_bytes = calc_compressed_bytes(in_path)
    payload = {
        "label": args.label,
        "input_path": str(in_path),
        "file_count": file_count,
        "raw_bytes": raw_bytes,
        "compressed_bytes": compressed_bytes,
        "raw_mb": round(raw_bytes / (1024 * 1024), 2),
        "compressed_mb": round(compressed_bytes / (1024 * 1024), 2),
    }

    rendered = json.dumps(payload, indent=2)
    print(rendered)

    if args.output:
        out_path = Path(args.output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(rendered + "\n", encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
