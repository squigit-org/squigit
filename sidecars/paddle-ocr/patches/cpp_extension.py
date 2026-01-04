# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Stub out paddle/utils/cpp_extension/__init__.py to avoid Cython dependency.

@author a7mddra
@version 1.0.0
"""
import pathlib

# Resolve path relative to this script's location (patches/ -> paddle-ocr/)
SCRIPT_DIR = pathlib.Path(__file__).parent.parent.absolute()
path = SCRIPT_DIR / 'venv' / 'lib' / 'python3.12' / 'site-packages' / 'paddle' / 'utils' / 'cpp_extension' / '__init__.py'

stub = '''# Stubbed out for PyInstaller - avoids Cython dependency
def load(*args, **kwargs):
    raise RuntimeError("cpp_extension is not available in this build")

def setup(*args, **kwargs):
    raise RuntimeError("cpp_extension is not available in this build")

class CppExtension:
    pass

class CUDAExtension:
    pass

class BuildExtension:
    pass
'''

with open(path, 'w') as f:
    f.write(stub)

print(f"✓ Stubbed {path}")
