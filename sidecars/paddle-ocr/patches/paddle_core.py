# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Patch paddle/base/core.py for PyInstaller frozen executables.

This inserts a check at the START of set_paddle_lib_path() to use _MEIPASS.

@author a7mddra
@version 1.0.0
"""
import pathlib
import sys

# Resolve path relative to this script's location (patches/ -> paddle-ocr/)
SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
path = SCRIPT_DIR / 'venv' / 'lib' / 'python3.12' / 'site-packages' / 'paddle' / 'base' / 'core.py'

print(f"Patching {path}")

with open(path, 'r') as f:
    content = f.read()

# The original function looks like:
# def set_paddle_lib_path():
#     site_dirs = (
#         site.getsitepackages()
#         ...

# We want to insert our frozen check right after the function def, before site_dirs

old_pattern = '''def set_paddle_lib_path():
    site_dirs = ('''

new_pattern = '''def set_paddle_lib_path():
    # Patched: handle PyInstaller frozen executable
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        lib_dir = os.path.join(sys._MEIPASS, "paddle", "libs")
        if os.path.exists(lib_dir):
            _set_paddle_lib_path(lib_dir)
            return
    site_dirs = ('''

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern)
    with open(path, 'w') as f:
        f.write(content)
    print("✓ Patch applied successfully.")
elif '# Patched: handle PyInstaller frozen executable' in content:
    print("- Already patched.")
else:
    print("✗ Could not find expected pattern. Manual fix may be needed.")
    sys.exit(1)
