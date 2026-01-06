# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Stub out iaa_augment.py to avoid albumentations dependency.

@author a7mddra
@version 1.0.0
"""
import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
PY_VERSION = f"python{sys.version_info.major}.{sys.version_info.minor}"
path = SCRIPT_DIR / 'venv' / 'lib' / PY_VERSION / 'site-packages' / 'paddleocr' / 'ppocr' / 'data' / 'imaug' / 'iaa_augment.py'

content = '''class IaaAugment:
    def __init__(self, **kwargs):
        pass

    def __call__(self, data):
        return data

class ImgaugLikeResize:
    def __init__(self, **kwargs):
        pass

    def __call__(self, data):
        return data
'''

with open(path, 'w') as f:
    f.write(content)

print(f"✓ Stubbed {path}")
