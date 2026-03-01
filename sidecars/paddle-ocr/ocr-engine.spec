# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

if sys.platform == "win32":
    site_packages = "venv/Lib/site-packages"
else:
    site_packages = f"venv/lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"

paddle_lib_dir = Path(site_packages) / "paddle" / "libs"
paddle_root_binaries = []
if paddle_lib_dir.exists():
    paddle_root_binaries = [
        (str(lib_path), ".")
        for lib_path in paddle_lib_dir.iterdir()
        if lib_path.is_file()
    ]

metadata_datas = []
for dist_name in [
    "paddlepaddle",
    "paddleocr",
    "paddlex",
    "imagesize",
    "opencv-contrib-python",
    "pyclipper",
    "pypdfium2",
    "python-bidi",
    "shapely",
]:
    metadata_datas += copy_metadata(dist_name)

cython_datas = collect_data_files("Cython")

a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=paddle_root_binaries,
    datas=[
        (f'{site_packages}/paddle/libs', 'paddle/libs'),
        (f'{site_packages}/paddleocr', 'paddleocr'),
        (f'{site_packages}/paddlex', 'paddlex'),
        ('models', 'models'),
        ('src', 'src'),
    ] + metadata_datas + cython_datas,
    hiddenimports=collect_submodules('paddleocr')
    + collect_submodules('paddlex')
    + [
        'requests',
        'PIL.ImageDraw',
        'PIL.ImageFont',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'tensorflow', 'cv2.gapi', 'matplotlib', 'sklearn'],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ocr-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
