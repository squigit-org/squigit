#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def _read_json_output(stdout: str, stderr: str, mode: str) -> list:
    try:
        payload = json.loads(stdout.strip())
    except Exception as exc:
        raise RuntimeError(
            f"{mode}: invalid JSON stdout ({exc})\\nstdout={stdout}\\nstderr={stderr}"
        ) from exc

    if isinstance(payload, dict) and "error" in payload:
        raise RuntimeError(f"{mode}: sidecar returned error: {payload['error']}")
    if not isinstance(payload, list):
        raise RuntimeError(f"{mode}: expected list payload, got {type(payload).__name__}")
    return payload


def _write_ppm_image(path: Path, width: int, height: int, mode: str) -> None:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(header)
        if mode == "normal":
            # Light gradient pattern (small file) to avoid trivial parser edge cases.
            row = bytearray()
            for x in range(width):
                row.extend((x % 256, 255 - (x % 256), 180))
            for _ in range(height):
                f.write(row)
        else:
            # Dense alternating pattern to make processing non-trivial for cancel smoke.
            row_a = bytes([20, 20, 20]) * width
            row_b = bytes([240, 240, 240]) * width
            for y in range(height):
                f.write(row_a if y % 2 == 0 else row_b)


def smoke_cli(sidecar: Path, image_path: Path) -> None:
    proc = subprocess.run(
        [str(sidecar), str(image_path)],
        capture_output=True,
        text=True,
        timeout=240,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"cli: non-zero exit {proc.returncode}\\nstdout={proc.stdout}\\nstderr={proc.stderr}"
        )
    _read_json_output(proc.stdout, proc.stderr, "cli")


def smoke_ipc(sidecar: Path, image_path: Path) -> None:
    payload = json.dumps({"type": "path", "data": str(image_path)}).encode("utf-8")
    proc = subprocess.Popen(
        [str(sidecar)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout and proc.stderr
    proc.stdin.write(f"{len(payload)}\n".encode("ascii"))
    proc.stdin.write(payload)
    proc.stdin.close()
    stdout_b, stderr_b = proc.communicate(timeout=240)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ipc: non-zero exit {proc.returncode}\\nstdout={stdout_b!r}\\nstderr={stderr_b!r}"
        )
    _read_json_output(
        stdout_b.decode("utf-8", errors="replace"),
        stderr_b.decode("utf-8", errors="replace"),
        "ipc",
    )


def smoke_cancel(sidecar: Path, image_path: Path) -> None:
    payload = json.dumps({"type": "path", "data": str(image_path)}).encode("utf-8")
    proc = subprocess.Popen(
        [str(sidecar)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout and proc.stderr

    proc.stdin.write(f"{len(payload)}\n".encode("ascii"))
    proc.stdin.write(payload)
    proc.stdin.flush()
    proc.stdin.write(b"CANCEL\n")
    proc.stdin.flush()
    proc.stdin.close()

    try:
        stdout_b, stderr_b = proc.communicate(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout_b, stderr_b = proc.communicate(timeout=5)
        raise RuntimeError(
            f"cancel: timeout waiting for exit\\nstdout={stdout_b!r}\\nstderr={stderr_b!r}"
        )

    if proc.returncode != 2:
        raise RuntimeError(
            f"cancel: expected exit code 2, got {proc.returncode}\\n"
            f"stdout={stdout_b!r}\\nstderr={stderr_b!r}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test packaged OCR sidecar.")
    parser.add_argument("--sidecar", required=True, help="Path to ocr-engine executable")
    parser.add_argument(
        "--skip-cancel",
        action="store_true",
        help="Skip cancel-path smoke test",
    )
    args = parser.parse_args()

    sidecar = Path(args.sidecar).resolve()
    if not sidecar.exists():
        raise SystemExit(f"Sidecar executable not found: {sidecar}")

    with tempfile.TemporaryDirectory(prefix="ocr-smoke-") as tmpdir:
        tmp = Path(tmpdir)
        normal_image = tmp / "normal.ppm"
        cancel_image = tmp / "cancel.ppm"
        _write_ppm_image(normal_image, width=960, height=240, mode="normal")
        _write_ppm_image(cancel_image, width=4200, height=4200, mode="cancel")

        smoke_cli(sidecar, normal_image)
        smoke_ipc(sidecar, normal_image)
        if not args.skip_cancel:
            smoke_cancel(sidecar, cancel_image)

    print("OCR sidecar smoke passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"OCR sidecar smoke failed: {exc}", file=sys.stderr)
        raise
