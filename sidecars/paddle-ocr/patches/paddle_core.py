# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Patch paddle/base/core.py for PyInstaller frozen executables.

This inserts an early _MEIPASS-aware lib lookup in set_paddle_lib_path().
Compatible with PaddlePaddle 3.x.
"""

from __future__ import annotations

import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
PY_VERSION = f"python{sys.version_info.major}.{sys.version_info.minor}"

if sys.platform == "win32":
    path = (
        SCRIPT_DIR
        / "venv"
        / "Lib"
        / "site-packages"
        / "paddle"
        / "base"
        / "core.py"
    )
else:
    path = (
        SCRIPT_DIR
        / "venv"
        / "lib"
        / PY_VERSION
        / "site-packages"
        / "paddle"
        / "base"
        / "core.py"
    )

print(f"Patching {path}")

with open(path, "r", encoding="utf-8", newline="") as file:
    content = file.read()

marker = "# Patched: handle PyInstaller frozen executable"
if marker in content:
    print("- Already patched.")
    raise SystemExit(0)

signature = "def set_paddle_lib_path():"
idx = content.find(signature)
if idx == -1:
    print("[ERROR] Could not find set_paddle_lib_path(). Manual fix may be needed.")
    raise SystemExit(1)

line_end = content.find("\n", idx)
if line_end == -1:
    line_end = len(content)

injection = """
    # Patched: handle PyInstaller frozen executable
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        lib_dir = os.path.join(sys._MEIPASS, "paddle", "libs")
        if os.path.exists(lib_dir):
            _set_paddle_lib_path(lib_dir)
            set_paddle_custom_device_lib_path(
                os.path.join(sys._MEIPASS, "paddle_custom_device")
            )
            return
"""

patched = content[: line_end + 1] + injection + content[line_end + 1 :]

with open(path, "w", encoding="utf-8", newline="") as file:
    file.write(patched)

print("[OK] Patch applied successfully.")
