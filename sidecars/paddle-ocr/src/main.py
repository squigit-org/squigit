#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

# ── Thread limiting (MUST be before any numerical library import) ──
# BLAS/OpenMP/MKL libraries read these at load time. Setting them after
# import has no effect. Without these, PaddlePaddle + OpenCV + NumPy
# spawn 20-40 threads that saturate all CPU cores and freeze the system.
import os
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["NUMEXPR_NUM_THREADS"] = "2"
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"

"""
OCR Engine - Command-line and IPC interface for text extraction.

This is the main entry point for the OCR engine executable.
It supports two modes:
1. CLI mode: ocr-engine <image_path>
2. IPC mode: reads JSON from stdin (for Tauri integration)

@author a7mddra
@version 2.1.0

@usage
    # CLI mode
    ocr-engine <image_path>
    
    # IPC mode (stdin JSON)
    echo '{"type":"path","data":"/path/to/image.png"}' | ocr-engine
    echo '{"type":"base64","data":"iVBORw0KGgo..."}' | ocr-engine
"""

import sys
import json
import base64
import tempfile
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from src import OCREngine, NumpyEncoder


def process_path(image_path: str) -> int:
    """
    Process an image file by path.
    
    @param image_path Path to the image file.
    @return Exit code (0 for success, 1 for error).
    """
    if not Path(image_path).exists():
        error = {"error": f"Image not found: {image_path}"}
        print(json.dumps(error))
        return 1
    
    try:
        engine = OCREngine()
        results = engine.process(image_path)
        output = [result.to_dict() for result in results]
        print(json.dumps(output, cls=NumpyEncoder))
        return 0
    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error))
        return 1


def process_base64(base64_data: str) -> int:
    """
    Process a base64-encoded image.
    
    @param base64_data Base64-encoded image data (with or without data URL prefix).
    @return Exit code (0 for success, 1 for error).
    """
    try:
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]
        
        image_bytes = base64.b64decode(base64_data)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        
        try:
            engine = OCREngine()
            results = engine.process(tmp_path)
            output = [result.to_dict() for result in results]
            print(json.dumps(output, cls=NumpyEncoder))
            return 0
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error))
        return 1


def process_stdin() -> int:
    """
    Process IPC request from stdin.
    
    Reads JSON request with format:
    - {"type": "path", "data": "/path/to/image.png"}
    - {"type": "base64", "data": "iVBORw0KGgo..."}
    
    @return Exit code (0 for success, 1 for error).
    """
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            error = {"error": "Empty stdin input"}
            print(json.dumps(error))
            return 1
        
        request = json.loads(raw_input)
        
        req_type = request.get("type", "")
        data = request.get("data", "")
        
        if not data:
            error = {"error": "Missing 'data' field in request"}
            print(json.dumps(error))
            return 1
        
        if req_type == "path":
            return process_path(data)
        elif req_type == "base64":
            return process_base64(data)
        else:
            error = {"error": f"Unknown request type: {req_type}"}
            print(json.dumps(error))
            return 1
            
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON input: {e}"}
        print(json.dumps(error))
        return 1
    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error))
        return 1


def main() -> int:
    """
    Main entry point for the OCR engine.
    
    Determines mode based on command-line arguments:
    - With args: CLI mode (process file path)
    - Without args: IPC mode (read from stdin)
    
    @return Exit code (0 for success, 1 for error).
    """
    if len(sys.argv) >= 2:
        return process_path(sys.argv[1])
    else:
        return process_stdin()


if __name__ == "__main__":
    sys.exit(main())
