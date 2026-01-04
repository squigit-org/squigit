# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Stub out iaa_augment.py to avoid albumentations dependency.

@author a7mddra
@version 1.0.0
"""
import pathlib

# Resolve path relative to this script's location (patches/ -> paddle-ocr/)
SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
path = SCRIPT_DIR / 'venv' / 'lib' / 'python3.12' / 'site-packages' / 'paddleocr' / 'ppocr' / 'data' / 'imaug' / 'iaa_augment.py'

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
