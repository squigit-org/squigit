import sys
import os

if sys.platform == "win32":
    site_packages = "venv/Lib/site-packages"
else:
    site_packages = f"venv/lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"

a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        (f'{site_packages}/paddle/libs', 'paddle/libs'),
        (f'{site_packages}/paddleocr', 'paddleocr'),
        ('models', 'models'),
        ('src', 'src'),
    ],
    hiddenimports=[
        'requests',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'shapely',
        'pyclipper',
        'imgaug',
        'lmdb',
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
