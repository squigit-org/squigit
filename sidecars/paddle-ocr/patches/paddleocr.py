# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Patch PaddleOCR for PyInstaller builds.

This script patches PaddleOCR to remove unnecessary dependencies (albumentations, docx)
that are only needed for training/document recovery features, not for inference.

@author a7mddra
@version 1.0.0

Patches applied:
    1. imaug/__init__.py - comments out latex_ocr_aug and unimernet_aug imports (require albumentations)
    2. paddleocr.py - wraps ppstructure imports in try/except (require docx)
    3. paddleocr.py - conditionally defines PPStructure class
    4. paddleocr.py - uses base init_args fallback in parse_args()
    5. __init__.py - wraps PPStructure export in try/except
    6. rec_postprocess.py - fixes regex syntax warnings
"""
import os
import sys

import pathlib
SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
PY_VERSION = f"python{sys.version_info.major}.{sys.version_info.minor}"
BASE = SCRIPT_DIR / 'venv' / 'lib' / PY_VERSION / 'site-packages' / 'paddleocr'

def check_base():
    if not os.path.exists(BASE):
        print(f"Error: {BASE} not found. Run this from project root with venv activated.")
        sys.exit(1)

def patch_imaug_init():
    """Comment out latex_ocr_aug and unimernet_aug imports."""
    filepath = BASE / 'ppocr' / 'data' / 'imaug' / '__init__.py'
    print(f"1. Patching {filepath}...")
    
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    changed = False
    for i, line in enumerate(lines):
        if 'from .latex_ocr_aug import *' in line and not line.strip().startswith('#'):
            lines[i] = '# ' + line
            print("   ✓ Commented out latex_ocr_aug import")
            changed = True
        if 'from .unimernet_aug import *' in line and not line.strip().startswith('#'):
            lines[i] = '# ' + line
            print("   ✓ Commented out unimernet_aug import")
            changed = True
    
    if changed:
        with open(filepath, 'w') as f:
            f.writelines(lines)
    else:
        print("   - Already patched")

def patch_paddleocr_py():
    """Wrap ppstructure imports, add conditional PPStructure class, and fix parse_args."""
    filepath = BASE / 'paddleocr.py'
    print(f"\n2. Patching {filepath}...")
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    changed = False

    old_imports = '''from ppstructure.utility import init_args, draw_structure_result
from ppstructure.predict_system import StructureSystem, save_structure_res, to_excel
from ppstructure.recovery.recovery_to_doc import sorted_layout_boxes, convert_info_docx
from ppstructure.recovery.recovery_to_markdown import convert_info_markdown'''

    new_imports = '''# Patched: wrap optional ppstructure imports for exe builds without docx
try:
    from ppstructure.utility import init_args, draw_structure_result
    from ppstructure.predict_system import StructureSystem, save_structure_res, to_excel
    from ppstructure.recovery.recovery_to_doc import sorted_layout_boxes, convert_info_docx
    from ppstructure.recovery.recovery_to_markdown import convert_info_markdown
    _HAS_PPSTRUCTURE = True
except ImportError:
    init_args = draw_structure_result = StructureSystem = save_structure_res = to_excel = None
    sorted_layout_boxes = convert_info_docx = convert_info_markdown = None
    _HAS_PPSTRUCTURE = False'''

    if old_imports in content:
        content = content.replace(old_imports, new_imports)
        print("   ✓ Wrapped ppstructure imports in try/except")
        changed = True
    elif '# Patched: wrap optional ppstructure imports' in content:
        print("   - Imports already patched")

    old_class = 'class PPStructure(StructureSystem):'
    new_class = '''# Patched: only define PPStructure if StructureSystem is available
if _HAS_PPSTRUCTURE:
  class PPStructure(StructureSystem):'''

    if old_class in content and 'if _HAS_PPSTRUCTURE:' not in content:
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if line.strip() == old_class:
                lines[i] = new_class
                j = i + 1
                while j < len(lines):
                    stripped = lines[j].lstrip()
                    indent = len(lines[j]) - len(stripped)
                    if stripped.startswith('class ') and indent == 0:
                        break
                    if lines[j].strip():
                        lines[j] = '  ' + lines[j]
                    j += 1
                break
        content = '\n'.join(lines)
        print("   ✓ Wrapped PPStructure class in conditional")
        changed = True
    elif 'if _HAS_PPSTRUCTURE:' in content:
        print("   - PPStructure class already wrapped")

    old_parse = '''def parse_args(mMain=True):
    import argparse

    parser = init_args()'''

    new_parse = '''def parse_args(mMain=True):
    import argparse

    # Patched: handle None init_args (when ppstructure deps unavailable)
    if init_args is not None:
        parser = init_args()
    else:
        # Fallback to base init_args from tools.infer.utility (doesn't require docx)
        from tools.infer.utility import init_args as base_init_args
        parser = base_init_args()'''

    if old_parse in content:
        content = content.replace(old_parse, new_parse)
        print("   ✓ Patched parse_args with fallback")
        changed = True
    elif '# Patched: handle None init_args' in content:
        print("   - parse_args already patched")
    
    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
        print("   ✓ File updated")

def patch_init_py():
    """Wrap PPStructure export in try/except."""
    filepath = BASE / '__init__.py'
    print(f"\n3. Patching {filepath}...")
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    old_import = '''from .paddleocr import (
    PaddleOCR,
    PPStructure,
    draw_ocr,
    draw_structure_result,
    save_structure_res,
    download_with_progressbar,
    sorted_layout_boxes,
    convert_info_docx,
    to_excel,
)'''

    new_import = '''# Patched: handle missing PPStructure when ppstructure deps are unavailable
from .paddleocr import PaddleOCR, draw_ocr, download_with_progressbar
try:
    from .paddleocr import (
        PPStructure,
        draw_structure_result,
        save_structure_res,
        sorted_layout_boxes,
        convert_info_docx,
        to_excel,
    )
except ImportError:
    PPStructure = None
    draw_structure_result = None
    save_structure_res = None
    sorted_layout_boxes = None
    convert_info_docx = None
    to_excel = None'''

    if old_import in content:
        content = content.replace(old_import, new_import)
        with open(filepath, 'w') as f:
            f.write(content)
        print("   ✓ Patched __init__.py to handle missing PPStructure")
    elif '# Patched: handle missing PPStructure' in content:
        print("   - Already patched")
    else:
        print("   ✗ Could not find expected import block")

def patch_rec_postprocess():
    """Fix regex syntax warnings by making strings raw."""
    filepath = BASE / 'ppocr' / 'postprocess' / 'rec_postprocess.py'
    print(f"\n4. Patching {filepath}...")
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    if 'noletter = "[\\W_^\\d]"' in content:
        content = content.replace('noletter = "[\\W_^\\d]"', 'noletter = r"[\\W_^\\d]"')
        with open(filepath, 'w') as f:
            f.write(content)
        print("   ✓ Fixed regex warnings (made strings raw)")
    elif 'noletter = r"[\\W_^\\d]"' in content:
        print("   - Already patched")
    else:
        print("   - Pattern not found")

def main():
    print("=" * 60)
    print("PaddleOCR Patch Script for PyInstaller Builds")
    print("=" * 60)
    print()
    
    check_base()
    patch_imaug_init()
    patch_paddleocr_py()
    patch_init_py()
    patch_rec_postprocess()
    
    print()
    print("=" * 60)
    print("✓ All patches applied!")
    print()
    print("Next steps:")
    print("  1. Build: pyinstaller --clean ocr-engine.spec")
    print("  2. Test:  ./dist/ocr-engine test_sample.png")
    print("=" * 60)

if __name__ == '__main__':
    main()
